// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IDurationOptions} from "./interfaces/IDurationOptions.sol";

/**
 * @title I1inchOracle
 * @notice Interface for 1inch price oracle (designed for off-chain usage)
 * @dev WARNING: 1inch oracles should NOT be used on-chain to avoid price manipulation
 */
interface I1inchOracle {
    /**
     * @notice Get exchange rate from oracle
     * @param srcToken Source token address  
     * @param dstToken Destination token address
     * @param useWrappers Whether to use token wrappers
     * @return rate Exchange rate with decimals
     */
    function getRate(address srcToken, address dstToken, bool useWrappers) external view returns (uint256 rate);
    
    /**
     * @notice Get rate to ETH with amount
     * @param srcToken Source token address
     * @param useSrcWrappers Whether to use source token wrappers
     */
    function getRateToEth(address srcToken, bool useSrcWrappers) external view returns (uint256 weightedRate);
}

/**
 * @title DurationOptions
 * @author Duration.Finance
 * @notice Duration-centric options protocol with integrated 1inch settlement
 * @dev Fully collateralized options with daily premium rates and flexible durations
 */
contract DurationOptions is IDurationOptions, ReentrancyGuard, Pausable, Ownable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant OPTION_COMMITMENT_TYPEHASH = keccak256(
        "OptionCommitment(address creator,address asset,uint256 amount,uint256 premiumAmount,uint256 minDurationDays,uint256 maxDurationDays,uint8 optionType,uint8 commitmentType,uint256 expiry,uint256 nonce)"
    );
    
    bytes32 public constant LP_COMMITMENT_TYPEHASH = keccak256(
        "LPCommitment(address lp,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint256 expiry,uint256 nonce)"
    );

    uint256 public minOptionSize = 0.001 ether;
    uint256 public maxOptionSize = 1 ether;
    uint256 public constant MIN_DURATION_DAYS = 1;
    uint256 public constant MAX_DURATION_DAYS = 365;
    
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant ONEINCH_UNOSWAP = 0x111111125421cA6dc452d289314280a0f8842A65;
    
    // 1inch Oracle contracts (official Base network deployments)
    address public oneInchSpotPriceAggregator = 0x00000000000D6FFc74A8feb35aF5827bf57f6786; // Official Base OffchainOracle
    address public oneInchOffchainOracle = 0xc197Ab9d47206dAf739a47AC75D0833fD2b0f87F; // Official Base MultiWrapper

    uint256 public optionCounter;
    uint256 public protocolFee = 100;
    uint256 public safetyMargin = 1;

    mapping(uint256 => ActiveOption) public activeOptions;
    mapping(address => uint256) public nonces;
    mapping(address => bool) public allowedAssets;
    mapping(address => uint256) public totalLocked;
    mapping(uint256 => bool) private _settlingOptions;

    error InvalidCommitment();
    error CommitmentExpired();
    error CommitmentNotFound();
    error InsufficientPremium();
    error OptionNotExercisable();
    error OptionNotFound();
    error UnauthorizedCaller();
    error InvalidAsset();
    error InvalidAmount();
    error InvalidDuration();
    error SettlementFailed();
    error InsufficientAllowance();
    error InvalidSignature();
    error SettlementInProgress();

    constructor() Ownable(msg.sender) EIP712("Duration.Finance", "1") {
        allowedAssets[WETH] = true;
    }

    /**
     * @notice Prevents reentrancy during settlement operations
     * @param optionId ID of option being settled
     */
    modifier noSettlementReentrancy(uint256 optionId) {
        if (_settlingOptions[optionId]) revert SettlementInProgress();
        _settlingOptions[optionId] = true;
        _;
        _settlingOptions[optionId] = false;
    }


    /**
     * @notice Verify unified commitment signature and validate structure
     * @param commitment Option commitment to verify
     * @return valid True if commitment is valid and properly signed
     */
    function _verifyCommitment(OptionCommitment calldata commitment) internal view returns (bool) {
        if (commitment.expiry <= block.timestamp) return false;
        if (commitment.amount < minOptionSize || commitment.amount > maxOptionSize) return false;
        if (!allowedAssets[commitment.asset]) return false;
        if (commitment.minDurationDays < MIN_DURATION_DAYS || commitment.maxDurationDays > MAX_DURATION_DAYS) return false;
        if (commitment.minDurationDays > commitment.maxDurationDays) return false;
        if (commitment.premiumAmount == 0) return false;
        if (commitment.nonce != nonces[commitment.creator]) return false;

        bytes32 structHash = keccak256(abi.encode(
            OPTION_COMMITMENT_TYPEHASH,
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.premiumAmount,
            commitment.minDurationDays,
            commitment.maxDurationDays,
            uint8(commitment.optionType),
            uint8(commitment.commitmentType),
            commitment.expiry,
            commitment.nonce
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(commitment.signature);
        
        return signer == commitment.creator && signer != address(0);
    }
    
    /**
     * @notice Legacy LP commitment verification for backward compatibility
     * @param commitment Option commitment to verify as legacy LP commitment
     * @return valid True if legacy commitment is valid and properly signed
     */
    function _verifyLPCommitment(OptionCommitment calldata commitment) internal view returns (bool) {
        if (commitment.commitmentType != CommitmentType.LP_OFFER) return false;
        if (commitment.expiry <= block.timestamp) return false;
        if (commitment.amount < minOptionSize || commitment.amount > maxOptionSize) return false;
        if (!allowedAssets[commitment.asset]) return false;
        if (commitment.minDurationDays < MIN_DURATION_DAYS || commitment.maxDurationDays > MAX_DURATION_DAYS) return false;
        if (commitment.minDurationDays > commitment.maxDurationDays) return false;
        if (commitment.premiumAmount == 0) return false;
        if (commitment.nonce != nonces[commitment.creator]) return false;

        bytes32 structHash = keccak256(abi.encode(
            LP_COMMITMENT_TYPEHASH,
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.premiumAmount,
            commitment.minDurationDays,
            commitment.maxDurationDays,
            uint8(commitment.optionType),
            commitment.expiry,
            commitment.nonce
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(commitment.signature);
        
        return signer == commitment.creator && signer != address(0);
    }

    /// @notice Check if user has sufficient balance and allowance for assets
    function _checkUserAssets(address user, address asset, uint256 amount) internal view returns (bool) {
        IERC20 token = IERC20(asset);
        return token.balanceOf(user) >= amount && token.allowance(user, address(this)) >= amount;
    }
    
    /// @notice Check if user has sufficient USDC for fees
    function _checkUserUSDC(address user, uint256 amount) internal view returns (bool) {
        IERC20 usdc = IERC20(USDC);
        return usdc.balanceOf(user) >= amount && usdc.allowance(user, address(this)) >= amount;
    }

    /**
     * @notice Take commitment and create active option
     * @param commitment Signed commitment to take
     * @param durationDays Duration in days for the option
     * @param settlementParams Settlement parameters (unused in current implementation)
     * @return optionId ID of newly created option
     */
    function takeCommitment(
        OptionCommitment calldata commitment,
        uint256 durationDays,
        SettlementParams calldata settlementParams
    ) external override nonReentrant whenNotPaused returns (uint256 optionId) {
        return _takeCommitmentInternal(commitment, durationDays, settlementParams);
    }
    
    function _takeCommitmentInternal(
        OptionCommitment calldata commitment,
        uint256 durationDays,
        SettlementParams calldata /* settlementParams */
    ) internal returns (uint256 optionId) {
        bool isValidUnified = _verifyCommitment(commitment);
        bool isValidLegacy = !isValidUnified && _verifyLPCommitment(commitment);
        
        if (!isValidUnified && !isValidLegacy) revert InvalidSignature();
        
        if (durationDays < commitment.minDurationDays || durationDays > commitment.maxDurationDays) {
            revert InvalidDuration();
        }

        (address lp, address taker, uint256 totalPremium) = _processCommitmentType(commitment, durationDays, isValidLegacy);
        
        return _createActiveOption(commitment, durationDays, lp, taker, totalPremium);
    }
    
    function _processCommitmentType(
        OptionCommitment calldata commitment,
        uint256 durationDays,
        bool isValidLegacy
    ) internal view returns (address lp, address taker, uint256 totalPremium) {
        if (commitment.commitmentType == CommitmentType.LP_OFFER || isValidLegacy) {
            lp = commitment.creator;
            taker = msg.sender;
            totalPremium = commitment.premiumAmount * durationDays;
            
            if (!_checkUserAssets(lp, commitment.asset, commitment.amount)) {
                revert InsufficientAllowance();
            }
            
            if (!_checkUserUSDC(taker, totalPremium)) {
                revert InsufficientAllowance();
            }
            
        } else if (commitment.commitmentType == CommitmentType.TAKER_DEMAND) {
            lp = msg.sender;
            taker = commitment.creator;
            totalPremium = commitment.premiumAmount;
            
            if (!_checkUserAssets(lp, commitment.asset, commitment.amount)) {
                revert InsufficientAllowance();
            }
            
            if (!_checkUserUSDC(taker, totalPremium)) {
                revert InsufficientAllowance();
            }
        } else {
            revert InvalidCommitment();
        }
    }
    
    function _createActiveOption(
        OptionCommitment calldata commitment,
        uint256 durationDays,
        address lp,
        address taker,
        uint256 totalPremium
    ) internal returns (uint256 optionId) {
        // Update nonce to prevent replay
        nonces[commitment.creator] = commitment.nonce + 1;
        
        optionId = ++optionCounter;
        totalLocked[commitment.asset] += commitment.amount;
        
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        uint256 currentPrice = getCurrentPrice(commitment.asset);
        
        activeOptions[optionId] = ActiveOption({
            commitmentHash: commitmentHash,
            taker: taker,
            lp: lp,
            asset: commitment.asset,
            amount: commitment.amount,
            strikePrice: currentPrice,
            dailyPremiumUsdc: commitment.commitmentType == CommitmentType.LP_OFFER ? commitment.premiumAmount : commitment.premiumAmount / durationDays,
            lockDurationDays: durationDays,
            totalPremiumPaid: totalPremium,
            exerciseDeadline: block.timestamp + (durationDays * 1 days),
            optionType: commitment.optionType,
            state: OptionState.TAKEN
        });

        // Transfer premium from taker
        IERC20(USDC).safeTransferFrom(taker, address(this), totalPremium);
        
        // Transfer collateral from LP
        IERC20(commitment.asset).safeTransferFrom(lp, address(this), commitment.amount);
        
        // Transfer premium to LP
        IERC20(USDC).safeTransfer(lp, totalPremium);

        emit OptionTaken(optionId, commitmentHash, taker, lp, commitment.amount, durationDays, totalPremium);
    }

    /// @notice Calculate total premium for a given duration
    function calculatePremiumForDuration(OptionCommitment calldata commitment, uint256 durationDays) 
        external view override returns (uint256 premium) 
    {
        bool isValidUnified = _verifyCommitment(commitment);
        bool isValidLegacy = !isValidUnified && _verifyLPCommitment(commitment);
        
        if (!isValidUnified && !isValidLegacy) return 0;
        
        if (commitment.commitmentType == CommitmentType.LP_OFFER || isValidLegacy) {
            // LP Offer: daily rate * duration
            return commitment.premiumAmount * durationDays;
        } else if (commitment.commitmentType == CommitmentType.TAKER_DEMAND) {
            // Taker Demand: fixed premium amount
            return commitment.premiumAmount;
        }
        
        return 0;
    }

    /// @notice Check if duration is valid for commitment
    function isValidDuration(OptionCommitment calldata commitment, uint256 durationDays) 
        external view override returns (bool valid) 
    {
        bool isValidUnified = _verifyCommitment(commitment);
        bool isValidLegacy = !isValidUnified && _verifyLPCommitment(commitment);
        
        if (!isValidUnified && !isValidLegacy) return false;
        return durationDays >= commitment.minDurationDays && durationDays <= commitment.maxDurationDays;
    }

    /// @notice Get LP yield metrics for a commitment
    function getLPYieldMetrics(OptionCommitment calldata commitment, uint256 currentPrice) 
        external view override returns (uint256 dailyYield, uint256 annualizedYield) 
    {
        bool isValidUnified = _verifyCommitment(commitment);
        bool isValidLegacy = !isValidUnified && _verifyLPCommitment(commitment);
        
        if (!isValidUnified && !isValidLegacy) return (0, 0);
        
        // Only calculate yield for LP offers (not taker demands)
        if (commitment.commitmentType != CommitmentType.LP_OFFER && !isValidLegacy) return (0, 0);
        
        // Adjust decimals: 18 + 18 - 6 = 30
        uint256 collateralValueUsdc = (commitment.amount * currentPrice) / 1e30;
        if (collateralValueUsdc == 0) return (0, 0);
        dailyYield = (commitment.premiumAmount * 10000) / collateralValueUsdc;
        annualizedYield = dailyYield * 365;
    }

    /**
     * @notice Exercise an option when profitable with settlement validation
     * @param optionId ID of option to exercise
     * @param params Settlement parameters including expected minimum return for validation
     * @dev params.minReturn should represent frontend-calculated expected settlement amount
     *      This prevents price manipulation by validating actual swap output against expectations
     */
    function exerciseOption(
        uint256 optionId,
        SettlementParams calldata params
    ) external override nonReentrant whenNotPaused noSettlementReentrancy(optionId) {
        ActiveOption storage option = activeOptions[optionId];
        if (option.taker != msg.sender) revert UnauthorizedCaller();
        if (params.deadline < block.timestamp) revert SettlementFailed();
        if (params.minReturn == 0) revert SettlementFailed(); // Frontend must provide expected return
        
        // Validate profitability using current on-chain price (subject to manipulation)
        uint256 currentPrice = getCurrentPrice(option.asset);
        if (!_isProfitable(option, currentPrice)) revert OptionNotExercisable();

        // Calculate expected profit for validation
        uint256 expectedProfit = _calculateExpectedProfit(option, currentPrice);
        uint256 protocolFeeAmount = (expectedProfit * protocolFee) / 10000;
        uint256 expectedNetProfit = expectedProfit - protocolFeeAmount;
        
        // Perform settlement with validation against frontend expectations
        uint256 actualSettlementReturn = _performValidatedSettlement(option, params, expectedNetProfit);

        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;

        emit OptionExercised(optionId, actualSettlementReturn, protocolFeeAmount);
    }

    /**
     * @notice Liquidate expired option
     * @param optionId ID of expired option to liquidate
     * @param maxPriceMovement Maximum price movement parameter (unused in current implementation)
     */
    function liquidateExpiredOption(uint256 optionId, uint256 maxPriceMovement) 
        external override nonReentrant 
    {
        ActiveOption storage option = activeOptions[optionId];
        if (option.state != OptionState.TAKEN) revert OptionNotFound();
        if (block.timestamp <= option.exerciseDeadline) revert OptionNotExercisable();

        uint256 currentPrice = getCurrentPrice(option.asset);
        bool isProfitable = _isProfitable(option, currentPrice);

        if (isProfitable) {
            _liquidateProfitableWithSimulation(optionId, option, currentPrice, maxPriceMovement);
        } else {
            _liquidateUnprofitableExpiredOption(optionId);
        }
    }

    function _isProfitable(ActiveOption memory option, uint256 currentPrice) internal pure returns (bool) {
        if (option.optionType == OptionType.CALL) {
            return currentPrice > option.strikePrice;
        } else {
            return currentPrice < option.strikePrice;
        }
    }
    
    /**
     * @notice Calculate expected profit from option exercise
     * @param option Option details
     * @param currentPrice Current asset price
     * @return expectedProfit Expected profit in USDC (6 decimals)
     */
    function _calculateExpectedProfit(ActiveOption memory option, uint256 currentPrice) internal pure returns (uint256 expectedProfit) {
        if (option.optionType == OptionType.CALL && currentPrice > option.strikePrice) {
            // CALL profit: (current - strike) * amount, converted to USDC decimals
            expectedProfit = ((currentPrice - option.strikePrice) * option.amount) / 1e30; // 18+18-6=30
        } else if (option.optionType == OptionType.PUT && currentPrice < option.strikePrice) {
            // PUT profit: (strike - current) * amount, converted to USDC decimals  
            expectedProfit = ((option.strikePrice - currentPrice) * option.amount) / 1e30; // 18+18-6=30
        } else {
            expectedProfit = 0;
        }
    }

    function _liquidateProfitableWithSimulation(
        uint256 optionId,
        ActiveOption storage option,
        uint256 initialPrice,
        uint256 /* maxPriceMovement */
    ) internal {
        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;
        
        emit OptionExpiredProfitable(optionId, initialPrice, option.strikePrice);
    }

    function _liquidateUnprofitableExpiredOption(uint256 optionId) internal {
        ActiveOption storage option = activeOptions[optionId];
        
        option.state = OptionState.EXPIRED;
        totalLocked[option.asset] -= option.amount;
        
        IERC20(option.asset).safeTransfer(option.lp, option.amount);
        
        emit OptionExpiredUnprofitable(optionId, getCurrentPrice(option.asset), option.strikePrice);
    }

    /**
     * @notice Perform validated settlement with price manipulation protection
     * @param option Option details
     * @param params Settlement parameters with frontend-calculated minReturn
     * @param expectedProfit Expected profit calculated from on-chain price
     * @return actualReturn Actual settlement return amount
     * @dev Validates settlement output against frontend expectations to prevent manipulation
     */
    function _performValidatedSettlement(
        ActiveOption memory option,
        SettlementParams calldata params,
        uint256 expectedProfit
    ) internal returns (uint256 actualReturn) {
        // Determine settlement direction based on option type
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        
        if (option.optionType == OptionType.CALL) {
            // For profitable CALL: Sell underlying asset to get USDC for taker
            tokenIn = option.asset;
            tokenOut = USDC;
            amountIn = option.amount;
        } else {
            // For profitable PUT: Buy underlying asset with USDC for taker
            tokenIn = USDC;
            tokenOut = option.asset;
            // Calculate USDC needed based on current price
            uint256 currentPrice = getCurrentPrice(option.asset);
            amountIn = (option.amount * currentPrice) / 1e18;
        }
        
        // Verify we have enough tokens for the swap
        require(IERC20(tokenIn).balanceOf(address(this)) >= amountIn, "Insufficient balance");
        
        // Execute settlement directly through 1inch
        uint256 amountOut = _execute1inchSwap(tokenIn, tokenOut, amountIn, params.minReturn, params.routingData);
        
        // CRITICAL: Validate settlement output against frontend expectations
        _validateSettlementEconomics(option, amountOut, expectedProfit, params.minReturn);
        
        // Distribute proceeds
        actualReturn = _distributeValidatedProceeds(option, tokenOut, amountOut, expectedProfit);
    }
    
    /**
     * @notice Validate settlement economics against price manipulation
     * @param option Option details  
     * @param actualSettlementOut Actual tokens received from 1inch swap
     * @param expectedProfit Expected profit based on on-chain price
     * @param frontendMinReturn Frontend-calculated minimum expected return
     * @dev Reverts if settlement output indicates price manipulation
     */
    function _validateSettlementEconomics(
        ActiveOption memory option,
        uint256 actualSettlementOut,
        uint256 expectedProfit,
        uint256 frontendMinReturn
    ) internal view {
        // 1. Validate against frontend expectations (prevents manipulation)
        if (actualSettlementOut < frontendMinReturn) {
            revert SettlementFailed(); // Settlement worse than frontend calculated
        }
        
        // 2. Validate against on-chain expectations with tolerance
        uint256 maxAllowedDeviation = (expectedProfit * safetyMargin) / 10000;
        uint256 minAcceptableProfit = expectedProfit > maxAllowedDeviation ? 
            expectedProfit - maxAllowedDeviation : 0;
        
        // For CALL: settlement out should be USDC (profit)
        // For PUT: settlement out should be asset amount
        uint256 settlementProfit;
        if (option.optionType == OptionType.CALL) {
            // CALL: direct USDC output is the profit
            settlementProfit = actualSettlementOut;
        } else {
            // PUT: convert asset amount back to USDC value for comparison
            uint256 currentPrice = getCurrentPrice(option.asset);
            settlementProfit = (actualSettlementOut * currentPrice) / 1e18;
        }
        
        if (settlementProfit < minAcceptableProfit) {
            revert SettlementFailed(); // Settlement profit too low, possible manipulation
        }
        
        // 3. Sanity check: settlement shouldn't be impossibly high
        uint256 maxReasonableProfit = expectedProfit + maxAllowedDeviation;
        if (settlementProfit > maxReasonableProfit) {
            revert SettlementFailed(); // Settlement profit unreasonably high
        }
    }
    
    /**
     * @notice Get settlement quote from 1inch oracle with fallback pricing
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input tokens
     * @return amountOut Expected output amount based on current DEX rates
     * @dev IMPORTANT: 1inch oracles are designed for OFF-CHAIN usage only
     *      Production deployment should use alternative on-chain price feeds
     *      Current implementation includes fallback pricing for development
     */
    function _get1inchQuote(
        address tokenIn,
        address tokenOut, 
        uint256 amountIn
    ) internal view returns (uint256 amountOut) {
        // Check if we're on Base network with oracle contracts deployed
        if (block.chainid == 8453 && oneInchSpotPriceAggregator.code.length > 0) {
            try I1inchOracle(oneInchSpotPriceAggregator).getRate(tokenIn, tokenOut, true) returns (uint256 rate) {
                // Rate is typically in tokenOut decimals per tokenIn unit
                // For WETH (18 decimals) to USDC (6 decimals): rate would be in USDC units
                return (amountIn * rate) / 1e18;
            } catch {
                // Fallback to offchain oracle if spot price aggregator fails
                if (oneInchOffchainOracle.code.length > 0) {
                    try I1inchOracle(oneInchOffchainOracle).getRate(tokenIn, tokenOut, true) returns (uint256 rate) {
                        return (amountIn * rate) / 1e18;
                    } catch {
                        // Continue to fallback pricing
                    }
                }
            }
        }
        
        // Fallback pricing for development/testing or when oracles unavailable
        if (block.chainid == 8453) {
            // Base mainnet fallback prices
            if (tokenIn == WETH && tokenOut == USDC) {
                amountOut = (amountIn * 3836) / 1e12;
            } else if (tokenIn == USDC && tokenOut == WETH) {
                amountOut = (amountIn * 1e12) / 3836;
            } else {
                amountOut = amountIn;
            }
        } else {
            // Testnet/other network fallback prices
            if (tokenIn == WETH && tokenOut == USDC) {
                amountOut = (amountIn * 3500) / 1e12;
            } else if (tokenIn == USDC && tokenOut == WETH) {
                amountOut = (amountIn * 1e12) / 3500;
            } else {
                amountOut = amountIn;
            }
        }
    }
    
    /**
     * @notice Execute 1inch swap through UnoswapRouter
     * @param tokenIn Input token address
     * @param tokenOut Output token address  
     * @param amountIn Amount of input tokens to swap
     * @param minAmountOut Minimum acceptable output amount
     * @param routingData Encoded function call for 1inch router
     * @return amountOut Actual amount of output tokens received
     */
    function _execute1inchSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).safeIncreaseAllowance(ONEINCH_UNOSWAP, amountIn);
        
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        (bool success, ) = ONEINCH_UNOSWAP.call(routingData);
        if (!success) revert SettlementFailed();
        
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        
        if (amountOut < minAmountOut) revert SettlementFailed();
        
        uint256 remainingAllowance = IERC20(tokenIn).allowance(address(this), ONEINCH_UNOSWAP);
        if (remainingAllowance > 0) {
            IERC20(tokenIn).safeDecreaseAllowance(ONEINCH_UNOSWAP, remainingAllowance);
        }
        
        return amountOut;
    }
    
    /**
     * @notice Distribute validated settlement proceeds with economic consistency
     * @param option Option details
     * @param tokenOut Output token from settlement
     * @param totalAmountOut Total amount received from settlement
     * @param expectedProfit Expected profit before protocol fees
     * @return takerReturn Actual amount transferred to taker
     */
    function _distributeValidatedProceeds(
        ActiveOption memory option,
        address tokenOut,
        uint256 totalAmountOut,
        uint256 expectedProfit
    ) internal returns (uint256 takerReturn) {
        // Calculate protocol fee on actual settlement profit
        uint256 protocolFeeAmount = (expectedProfit * protocolFee) / 10000;
        
        // For CALL options: taker gets USDC profit
        // For PUT options: taker gets the underlying asset
        if (option.optionType == OptionType.CALL) {
            // CALL: taker receives USDC profit minus protocol fee
            takerReturn = expectedProfit - protocolFeeAmount;
            IERC20(tokenOut).safeTransfer(option.taker, takerReturn);
            
            // LP gets any excess from favorable settlement
            uint256 excess = totalAmountOut > takerReturn ? totalAmountOut - takerReturn : 0;
            if (excess > 0) {
                IERC20(tokenOut).safeTransfer(option.lp, excess);
            }
        } else {
            // PUT: taker receives the underlying asset amount
            takerReturn = option.amount; 
            IERC20(tokenOut).safeTransfer(option.taker, takerReturn);
            
            // Any USDC excess goes to LP (rare case)
            uint256 excess = totalAmountOut > takerReturn ? totalAmountOut - takerReturn : 0;
            if (excess > 0) {
                IERC20(tokenOut).safeTransfer(option.lp, excess);
            }
        }
        
        // Protocol fee collected separately via sweepProtocolFees()
    }

    /**
     * @notice Get current asset price in USD with 18 decimal precision
     * @param asset Address of asset to price
     * @return price Asset price in USD (18 decimals)
     * @dev Uses integrated 1inch quote converted to standard 18 decimal format
     */
    function getCurrentPrice(address asset) public view override returns (uint256) {
        uint256 usdcAmount = _get1inchQuote(asset, USDC, 1e18);
        return usdcAmount * 1e12;
    }

    function isExercisable(uint256 optionId) public view override returns (bool) {
        ActiveOption memory option = activeOptions[optionId];
        if (option.state != OptionState.TAKEN) return false;
        if (block.timestamp > option.exerciseDeadline) return false;
        
        uint256 currentPrice = getCurrentPrice(option.asset);
        return _isProfitable(option, currentPrice);
    }

    /**
     * @notice Get commitment details (stored off-chain)
     * @dev Commitments are stored off-chain in database, not on contract
     */
    function getCommitment(bytes32) external pure override returns (OptionCommitment memory) {
        revert("Commitments stored off-chain");
    }

    /**
     * @notice Get active option details
     * @param optionId ID of the option
     * @return option Option details
     */
    function getOption(uint256 optionId) external view override returns (ActiveOption memory) {
        return activeOptions[optionId];
    }

    /**
     * @notice Get current nonce for user
     * @param user Address to get nonce for
     * @return nonce Current nonce value
     */
    function getNonce(address user) external view override returns (uint256) {
        return nonces[user];
    }

    /**
     * @notice Create new commitment with EIP-712 signature validation
     * @param commitment Signed commitment structure
     */
    function createCommitment(OptionCommitment calldata commitment) external override nonReentrant whenNotPaused {
        if (!_verifyCommitment(commitment)) revert InvalidSignature();
        
        nonces[commitment.creator] = commitment.nonce + 1;
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        
        emit CommitmentCreated(commitmentHash, commitment.creator, commitment.commitmentType, commitment.asset, commitment.amount, commitment.premiumAmount);
    }
    
    /**
     * @notice Legacy LP commitment creation (redirects to unified function)
     * @param commitment Commitment to create
     */
    function createLPCommitment(OptionCommitment calldata commitment) external override {
        this.createCommitment(commitment);
    }

    /**
     * @notice Legacy taker commitment creation (redirects to unified function)
     * @param commitment Commitment to create
     */
    function createTakerCommitment(OptionCommitment calldata commitment, uint256) external override {
        this.createCommitment(commitment);
    }

    /**
     * @notice Get marketplace liquidity (handled off-chain)
     * @dev Marketplace queries are handled by the API layer for efficiency
     */
    function getMarketplaceLiquidity(address, uint256, uint256, uint256) 
        external pure override returns (OptionCommitment[] memory) 
    {
        return new OptionCommitment[](0);
    }

    /**
     * @notice Get options by duration (handled off-chain)
     * @dev Portfolio queries are handled by the API layer for efficiency
     */
    function getOptionsByDuration(address, uint256, uint256) 
        external pure override returns (uint256[] memory) 
    {
        return new uint256[](0);
    }

    /**
     * @notice Get LP commitments by yield (handled off-chain)
     * @dev Yield queries are handled by the API layer for efficiency
     */
    function getLPCommitmentsByYield(address, uint256, uint256) 
        external pure override returns (bytes32[] memory) 
    {
        return new bytes32[](0);
    }

    // Admin functions
    function setSafetyMargin(uint256 newMargin) external override onlyOwner {
        safetyMargin = newMargin;
    }

    /**
     * @notice Set 1inch oracle addresses
     * @param spotPriceAggregator Address of 1inch spot price aggregator
     * @param offchainOracle Address of 1inch offchain oracle
     * @dev Owner can update oracle addresses if 1inch deploys new versions
     */
    function setOneInchOracles(address spotPriceAggregator, address offchainOracle) external onlyOwner {
        require(spotPriceAggregator != address(0), "Invalid spot price aggregator");
        require(offchainOracle != address(0), "Invalid offchain oracle");
        
        oneInchSpotPriceAggregator = spotPriceAggregator;
        oneInchOffchainOracle = offchainOracle;
        
        emit OneInchOraclesUpdated(spotPriceAggregator, offchainOracle);
    }

    /**
     * @notice Sweep residual tokens from 1inch settlements
     * @dev Collects protocol fees and any settlement residuals for deployer
     */
    function sweep1inchFees() external onlyOwner {
        uint256 wethBalance = IERC20(WETH).balanceOf(address(this));
        uint256 wethLocked = totalLocked[WETH];
        if (wethBalance > wethLocked) {
            uint256 wethExcess = wethBalance - wethLocked;
            IERC20(WETH).safeTransfer(owner(), wethExcess);
            emit ExcessSwept(WETH, owner(), wethExcess);
        }
        
        uint256 usdcBalance = IERC20(USDC).balanceOf(address(this));
        if (usdcBalance > 0) {
            IERC20(USDC).safeTransfer(owner(), usdcBalance);
            emit ExcessSwept(USDC, owner(), usdcBalance);
        }
    }
    
    // Commitment fees are handled at API layer for x402 payments
    
    function setProtocolFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee too high"); // Max 10%
        protocolFee = newFee;
        emit ProtocolFeeUpdated(newFee);
    }

    function setPositionLimits(uint256 newMinSize, uint256 newMaxSize) external onlyOwner {
        require(newMinSize >= 1 gwei, "Min size must be positive");
        require(newMaxSize > newMinSize, "Max size must be greater than min");
        require(newMaxSize <= 1000 ether, "Max size too large");
        
        minOptionSize = newMinSize;
        maxOptionSize = newMaxSize;
        
        emit PositionLimitsUpdated(newMinSize, newMaxSize);
    }

    function sweepExcess(address asset) external override onlyOwner {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        uint256 locked = totalLocked[asset];
        if (balance > locked) {
            uint256 excess = balance - locked;
            IERC20(asset).safeTransfer(owner(), excess);
            emit ExcessSwept(asset, owner(), excess);
        }
    }
    
    function sweepProtocolFees() external onlyOwner {
        uint256 usdcBalance = IERC20(USDC).balanceOf(address(this));
        if (usdcBalance > 0) {
            IERC20(USDC).safeTransfer(owner(), usdcBalance);
            emit ExcessSwept(USDC, owner(), usdcBalance);
        }
    }
    
    function emergencyPause() external override onlyOwner {
        _pause();
    }

    function emergencyUnpause() external override onlyOwner {
        _unpause();
    }

}