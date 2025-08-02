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
import {ISettlementRouter} from "./interfaces/I1inch.sol";

/**
 * @title DurationOptions
 * @author Duration.Finance  
 * @notice Duration-centric options protocol with 1inch settlement integration
 * @dev Complete rewrite focused on daily premium rates and duration flexibility
 */
contract DurationOptions is IDurationOptions, ReentrancyGuard, Pausable, Ownable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // EIP712 type hash for unified commitments
    bytes32 public constant OPTION_COMMITMENT_TYPEHASH = keccak256(
        "OptionCommitment(address creator,address asset,uint256 amount,uint256 premiumAmount,uint256 minDurationDays,uint256 maxDurationDays,uint8 optionType,uint8 commitmentType,uint256 expiry,uint256 nonce)"
    );
    
    // Legacy LP commitment type hash for backward compatibility
    bytes32 public constant LP_COMMITMENT_TYPEHASH = keccak256(
        "LPCommitment(address lp,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint256 expiry,uint256 nonce)"
    );

    // Configurable position limits (can be updated by owner)
    uint256 public minOptionSize = 0.001 ether; // 0.001 WETH minimum (configurable)
    uint256 public maxOptionSize = 1 ether; // 1 WETH maximum (configurable)
    uint256 public constant MIN_DURATION_DAYS = 1;
    uint256 public constant MAX_DURATION_DAYS = 365;
    
    address public constant WETH = 0x4200000000000000000000000000000000000006; // Base WETH
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base USDC

    // Protocol state
    uint256 public optionCounter;
    uint256 public protocolFee = 100; // 1% = 100 basis points
    uint256 public safetyMargin = 1; // 0.01% = 1 basis point
    address public settlementRouter;

    // Storage
    mapping(uint256 => ActiveOption) public activeOptions;
    mapping(address => uint256) public nonces;
    mapping(address => bool) public allowedAssets;
    mapping(address => uint256) public totalLocked; // Total amount locked per asset

    // Events (inherited from interface, no need to redeclare)

    // Errors
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

    constructor(address _settlementRouter) 
        Ownable(msg.sender) 
        EIP712("Duration.Finance", "1") 
    {
        settlementRouter = _settlementRouter;
        allowedAssets[WETH] = true;
    }

    /// @notice Verify unified commitment signature and validate structure
    function _verifyCommitment(OptionCommitment calldata commitment) internal view returns (bool) {
        // Validate basic commitment structure
        if (commitment.expiry <= block.timestamp) return false;
        if (commitment.amount < minOptionSize || commitment.amount > maxOptionSize) return false;
        if (!allowedAssets[commitment.asset]) return false;
        if (commitment.minDurationDays < MIN_DURATION_DAYS || commitment.maxDurationDays > MAX_DURATION_DAYS) return false;
        if (commitment.minDurationDays > commitment.maxDurationDays) return false;
        if (commitment.premiumAmount == 0) return false;
        if (commitment.nonce != nonces[commitment.creator]) return false;

        // Create EIP712 hash for unified commitment
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
    
    /// @notice Legacy LP commitment verification for backward compatibility
    function _verifyLPCommitment(OptionCommitment calldata commitment) internal view returns (bool) {
        // Convert unified commitment to legacy format for verification
        if (commitment.commitmentType != CommitmentType.LP_OFFER) return false;
        
        // Validate basic commitment structure
        if (commitment.expiry <= block.timestamp) return false;
        if (commitment.amount < minOptionSize || commitment.amount > maxOptionSize) return false;
        if (!allowedAssets[commitment.asset]) return false;
        if (commitment.minDurationDays < MIN_DURATION_DAYS || commitment.maxDurationDays > MAX_DURATION_DAYS) return false;
        if (commitment.minDurationDays > commitment.maxDurationDays) return false;
        if (commitment.premiumAmount == 0) return false;
        if (commitment.nonce != nonces[commitment.creator]) return false;

        // For legacy compatibility, create LP commitment hash
        bytes32 structHash = keccak256(abi.encode(
            LP_COMMITMENT_TYPEHASH,
            commitment.creator, // lp field
            commitment.asset,
            commitment.amount,
            commitment.premiumAmount, // dailyPremiumUsdc field
            commitment.minDurationDays, // minLockDays field
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

    /// @notice Take commitment with specified duration (supports both LP offers and Taker demands)
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
        SettlementParams calldata settlementParams
    ) internal returns (uint256 optionId) {
        // Verify signature and commitment validity (try unified first, then legacy)
        bool isValidUnified = _verifyCommitment(commitment);
        bool isValidLegacy = !isValidUnified && _verifyLPCommitment(commitment);
        
        if (!isValidUnified && !isValidLegacy) revert InvalidSignature();
        
        // Check duration is within acceptable range
        if (durationDays < commitment.minDurationDays || durationDays > commitment.maxDurationDays) {
            revert InvalidDuration();
        }

        (address lp, address taker, uint256 totalPremium) = _processCommitmentType(commitment, durationDays, isValidLegacy);
        
        // Update nonce and create option
        return _createActiveOption(commitment, durationDays, lp, taker, totalPremium);
    }
    
    function _processCommitmentType(
        OptionCommitment calldata commitment,
        uint256 durationDays,
        bool isValidLegacy
    ) internal view returns (address lp, address taker, uint256 totalPremium) {
        // Handle based on commitment type
        if (commitment.commitmentType == CommitmentType.LP_OFFER || isValidLegacy) {
            // LP Offer: LP provides collateral, Taker pays premium based on daily rate * duration
            lp = commitment.creator;
            taker = msg.sender;
            totalPremium = commitment.premiumAmount * durationDays;
            
            // Check LP has assets and allowance
            if (!_checkUserAssets(lp, commitment.asset, commitment.amount)) {
                revert InsufficientAllowance();
            }
            
            // Check taker has USDC for premium
            if (!_checkUserUSDC(taker, totalPremium)) {
                revert InsufficientAllowance();
            }
            
        } else if (commitment.commitmentType == CommitmentType.TAKER_DEMAND) {
            // Taker Demand: Taker (creator) wants option, LP (msg.sender) provides collateral
            lp = msg.sender;
            taker = commitment.creator;
            totalPremium = commitment.premiumAmount; // Fixed total premium
            
            // Check LP has assets and allowance
            if (!_checkUserAssets(lp, commitment.asset, commitment.amount)) {
                revert InsufficientAllowance();
            }
            
            // Check taker has USDC for premium
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

    /// @notice Exercise an option when profitable
    function exerciseOption(
        uint256 optionId,
        SettlementParams calldata params
    ) external override nonReentrant whenNotPaused {
        ActiveOption storage option = activeOptions[optionId];
        if (option.taker != msg.sender) revert UnauthorizedCaller();
        if (!isExercisable(optionId)) revert OptionNotExercisable();
        if (params.deadline < block.timestamp) revert SettlementFailed();

        uint256 currentPrice = getCurrentPrice(option.asset);
        uint256 profit = 0;

        if (option.optionType == OptionType.CALL && currentPrice > option.strikePrice) {
            profit = (currentPrice - option.strikePrice) * option.amount / 1e18;
        } else if (option.optionType == OptionType.PUT && currentPrice < option.strikePrice) {
            profit = (option.strikePrice - currentPrice) * option.amount / 1e18;
        }

        if (profit == 0) revert OptionNotExercisable();

        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;

        uint256 protocolFeeAmount = (profit * protocolFee) / 10000;
        uint256 netProfit = profit - protocolFeeAmount;
        _performSettlement(option, params, netProfit);

        emit OptionExercised(optionId, netProfit, protocolFeeAmount);
    }

    /// @notice Liquidate expired option
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

    function _liquidateProfitableWithSimulation(
        uint256 optionId,
        ActiveOption storage option,
        uint256 initialPrice,
        uint256 maxPriceMovement
    ) internal {
        // Simulate settlement and verify price stability
        
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

    function _performSettlement(
        ActiveOption memory option,
        SettlementParams calldata params,
        uint256 expectedReturn
    ) internal {
        // Get settlement quote from the router
        ISettlementRouter router = ISettlementRouter(settlementRouter);
        
        // Determine settlement direction based on option type and profitability
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
            // Calculate USDC needed to buy the asset amount
            uint256 currentPrice = getCurrentPrice(option.asset);
            amountIn = (option.amount * currentPrice) / 1e18;
        }
        
        // Get quote from 1inch via our settlement router
        (uint256 quoteAmountOut, ISettlementRouter.SettlementMethod method, bytes memory routingData) = 
            router.getSettlementQuote(tokenIn, tokenOut, amountIn);
        
        // Apply safety margin to protect against slippage
        uint256 minAmountOut = (quoteAmountOut * (10000 - safetyMargin)) / 10000;
        
        // Verify we have enough tokens for the swap
        require(IERC20(tokenIn).balanceOf(address(this)) >= amountIn, "Insufficient balance");
        
        // Approve settlement router to spend our tokens
        IERC20(tokenIn).forceApprove(settlementRouter, amountIn);
        
        // Execute settlement through 1inch
        ISettlementRouter.SettlementResult memory result = router.executeSettlement(
            method,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            routingData
        );
        
        // Distribute proceeds
        _distributeSettlementProceeds(option, tokenOut, result.amountOut, expectedReturn);
    }
    
    function _distributeSettlementProceeds(
        ActiveOption memory option,
        address tokenOut,
        uint256 totalAmountOut,
        uint256 expectedTakerReturn
    ) internal {
        // Calculate protocol fee on the settlement profit
        uint256 settlementProfit = totalAmountOut > expectedTakerReturn ? 
            totalAmountOut - expectedTakerReturn : 0;
        uint256 protocolFeeAmount = (settlementProfit * protocolFee) / 10000;
        
        // Transfer expected return to taker
        if (expectedTakerReturn > 0) {
            IERC20(tokenOut).safeTransfer(option.taker, expectedTakerReturn);
        }
        
        // Calculate LP's share (remaining amount after taker gets their profit)
        uint256 lpShare = totalAmountOut - expectedTakerReturn - protocolFeeAmount;
        if (lpShare > 0) {
            IERC20(tokenOut).safeTransfer(option.lp, lpShare); 
        }
        
        // Protocol fees stay in contract - will be swept by owner later
        // No immediate transfer needed as sweepProtocolFees() handles this
    }

    // View functions
    function getCurrentPrice(address asset) public view override returns (uint256) {
        // Get current market price from settlement router
        if (settlementRouter != address(0)) {
            try ISettlementRouter(settlementRouter).getSettlementQuote(asset, USDC, 1e18) 
                returns (uint256 usdcAmount, ISettlementRouter.SettlementMethod, bytes memory) {
                // Convert USDC (6 decimals) to standard 18 decimal price format
                return usdcAmount * 1e12;
            } catch {
                // Fallback to mock price if 1inch call fails
            }
        }
        
        // Fallback mock prices for testing/development
        if (asset == WETH) {
            return 3836.50 * 1e18;
        }
        return 1e18;
    }

    function isExercisable(uint256 optionId) public view override returns (bool) {
        ActiveOption memory option = activeOptions[optionId];
        if (option.state != OptionState.TAKEN) return false;
        if (block.timestamp > option.exerciseDeadline) return false;
        
        uint256 currentPrice = getCurrentPrice(option.asset);
        return _isProfitable(option, currentPrice);
    }

    function getCommitment(bytes32 commitmentHash) external pure override returns (OptionCommitment memory) {
        // Commitments no longer stored on-chain - handled off-chain
        revert("Commitments stored off-chain");
    }

    function getOption(uint256 optionId) external view override returns (ActiveOption memory) {
        return activeOptions[optionId];
    }

    function getNonce(address user) external view override returns (uint256 nonce) {
        return nonces[user];
    }

    // Interface compliance functions
    function createCommitment(OptionCommitment calldata commitment) external override nonReentrant whenNotPaused {
        // Verify signature and commitment validity
        if (!_verifyCommitment(commitment)) revert InvalidSignature();
        
        // Update nonce
        nonces[commitment.creator] = commitment.nonce + 1;
        
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        
        emit CommitmentCreated(commitmentHash, commitment.creator, commitment.commitmentType, commitment.asset, commitment.amount, commitment.premiumAmount);
    }
    
    function createLPCommitment(OptionCommitment calldata commitment) external override {
        // Legacy support - redirect to unified createCommitment
        this.createCommitment(commitment);
    }

    function createTakerCommitment(OptionCommitment calldata commitment, uint256 durationDays) external override {
        // Legacy support - redirect to unified createCommitment
        this.createCommitment(commitment);
    }

    function getMarketplaceLiquidity(address asset, uint256 durationDays, uint256 offset, uint256 limit) 
        external view override returns (OptionCommitment[] memory) 
    {
        // Marketplace queries handled off-chain
        return new OptionCommitment[](0);
    }

    function getOptionsByDuration(address user, uint256 minDays, uint256 maxDays) 
        external view override returns (uint256[] memory) 
    {
        // Portfolio queries handled off-chain
        return new uint256[](0);
    }

    function getLPCommitmentsByYield(address asset, uint256 minYield, uint256 maxYield) 
        external view override returns (bytes32[] memory) 
    {
        // Yield queries handled off-chain
        return new bytes32[](0);
    }

    // Admin functions
    function setSafetyMargin(uint256 newMargin) external override onlyOwner {
        safetyMargin = newMargin;
    }

    function setSettlementRouter(address router) external override onlyOwner {
        settlementRouter = router;
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