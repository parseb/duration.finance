// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IDurationOptions} from "./interfaces/IDurationOptions.sol";
import {ISettlementRouter} from "./interfaces/I1inch.sol";
import {VerifySignature} from "./utils/VerifySignature.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title I1inchQuoter Interface  
 * @notice Interface for getting 1inch quotes directly
 */
interface I1inchQuoter {
    function getQuote(
        address tokenIn,
        address tokenOut, 
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 gasEstimate);
}

/**
 * @title IWETH Interface
 * @notice Interface for WETH contract with deposit/withdraw functions
 */
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/**
 * @title DurationOptions
 * @author Duration.Finance  
 * @notice Core options protocol with 1inch settlement integration
 * @dev Complete rewrite based on GHOptim timing logic, no Aave dependencies
 */
contract DurationOptions is IDurationOptions, VerifySignature, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant MIN_OPTION_SIZE = 0.1 ether; // 0.1 units minimum
    uint256 public constant MAX_OPTION_SIZE = 1000 ether; // 1000 units maximum
    address public constant WETH = 0x4200000000000000000000000000000000000006; // Base WETH
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base USDC

    // State
    ISettlementRouter public settlementRouter;
    uint256 public optionCounter;
    uint256 public safetyMargin = 100; // 0.01% in basis points

    // Storage
    mapping(bytes32 => OptionCommitment) public commitments;
    mapping(uint256 => ActiveOption) public activeOptions;
    mapping(address => uint256) public nonces;
    mapping(address => bool) public allowedAssets;
    mapping(address => uint256) public totalLocked; // Total amount locked per asset

    // Events (inherited from interface)

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



    constructor(
        address _settlementRouter,
        address _initialOwner
    ) VerifySignature() Ownable(_initialOwner) {
        settlementRouter = ISettlementRouter(_settlementRouter);
        
        // Initially allow WETH
        allowedAssets[WETH] = true;
    }


    /**
     * @notice Take a commitment (LP or Taker)
     * @param commitmentHash Hash of the commitment  
     * @param optionType CALL or PUT (used only if LP didn't specify)
     * @return optionId The created option ID (0 if simple swap executed)
     */
    function takeCommitment(
        bytes32 commitmentHash,
        OptionType optionType
    ) external override nonReentrant whenNotPaused returns (uint256 optionId) {
        // CHECKS: Load and validate commitment
        OptionCommitment memory commitment = commitments[commitmentHash];
        
        bool isLpCommitment = commitment.lp != address(0);
        bool isTakerCommitment = commitment.taker != address(0);
        if (!((isLpCommitment && !isTakerCommitment) || (!isLpCommitment && isTakerCommitment))) {
            revert CommitmentNotFound();
        }
        
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        if (commitment.amount < MIN_OPTION_SIZE) revert InvalidAmount();

        // CHECKS: Get current price and calculate parameters
        uint256 currentPrice = getCurrentPrice(commitment.asset);
        uint256 finalTargetPrice;
        uint256 premium;
        address optionTaker;
        address lpAddress;

        if (isLpCommitment) {
            // LP commitment being taken by taker
            optionTaker = msg.sender;
            lpAddress = commitment.lp;
            finalTargetPrice = commitment.targetPrice;
            
            // Check if current price is better than LP target - if so, do simple swap  
            if (currentPrice > commitment.targetPrice) {
                _executeSimpleSwap(commitment, currentPrice);
                // _executeSimpleSwap handles state updates and deletions
                return 0; // Simple swap executed
            }
            
            premium = calculatePremium(commitmentHash, currentPrice);
            
        } else {
            // Taker commitment being taken by LP
            optionTaker = commitment.taker;
            lpAddress = msg.sender;
            finalTargetPrice = currentPrice; // Target price = current price for taker commitments
            premium = commitment.premium; // Premium already specified by taker
        }

        // EFFECTS: Update state before external interactions
        optionId = ++optionCounter;
        totalLocked[commitment.asset] += commitment.amount;
        
        // Store active option
        activeOptions[optionId] = ActiveOption({
            commitmentHash: commitmentHash,
            taker: optionTaker,
            lp: lpAddress,
            asset: commitment.asset,
            amount: commitment.amount,
            targetPrice: finalTargetPrice,
            premium: premium,
            exerciseDeadline: block.timestamp + (commitment.durationDays * 1 days),
            currentPrice: currentPrice,
            optionType: commitment.optionType,
            state: OptionState.TAKEN
        });

        // Remove commitment as it's been taken
        delete commitments[commitmentHash];

        // INTERACTIONS: External calls after state updates
        if (isLpCommitment) {
            // Transfer USDC premium from taker to protocol
            IERC20(USDC).safeTransferFrom(msg.sender, address(this), premium);
            // Transfer LP asset to protocol for collateral
            IERC20(commitment.asset).safeTransferFrom(commitment.lp, address(this), commitment.amount);
        } else {
            // Transfer USDC premium from taker to protocol (taker already committed to this)
            IERC20(USDC).safeTransferFrom(commitment.taker, address(this), premium);
            // Transfer LP asset to protocol for collateral  
            IERC20(commitment.asset).safeTransferFrom(msg.sender, address(this), commitment.amount);
        }

        // Send USDC premium to LP
        IERC20(USDC).safeTransfer(lpAddress, premium);

        emit OptionTaken(optionId, commitmentHash, optionTaker, commitment.amount, premium);
    }

    /**
     * @notice Exercise an option
     * @param optionId The option to exercise
     * @param params Settlement parameters for 1inch integration
     */
    function exerciseOption(
        uint256 optionId,
        SettlementParams calldata params
    ) external override nonReentrant whenNotPaused {
        // CHECKS: Load and validate option
        ActiveOption storage option = activeOptions[optionId];
        if (option.taker != msg.sender) revert UnauthorizedCaller();
        if (!isExercisable(optionId)) revert OptionNotExercisable();
        if (params.deadline < block.timestamp) revert SettlementFailed();

        uint256 currentPrice = getCurrentPrice(option.asset);
        uint256 profit = 0;
        
        // Calculate profit in USD
        if (option.optionType == OptionType.CALL && currentPrice > option.targetPrice) {
            profit = (currentPrice - option.targetPrice) * option.amount / 1e18;
        } else if (option.optionType == OptionType.PUT && currentPrice < option.targetPrice) {
            profit = (option.targetPrice - currentPrice) * option.amount / 1e18;
        } else {
            revert OptionNotExercisable();
        }

        // EFFECTS: Update state before external interactions
        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;

        // Calculate protocol fee on profit (in USDC)
        uint256 protocolFeeUSDC = (profit * safetyMargin) / 10000 / 1e12; // Convert to USDC decimals

        // INTERACTIONS: Execute settlement through 1inch
        _executeSettlement(option, params, profit);

        // Transfer protocol fee in USDC to owner (if any)
        if (protocolFeeUSDC > 0) {
            IERC20(USDC).safeTransfer(owner(), protocolFeeUSDC);
        }

        emit OptionExercised(optionId, profit, protocolFeeUSDC);
    }

    /**
     * @notice Liquidate expired option
     * @param optionId The option to liquidate
     */
    function liquidateExpiredOption(uint256 optionId) external override nonReentrant {
        ActiveOption storage option = activeOptions[optionId];
        if (option.state != OptionState.TAKEN) revert OptionNotFound();
        if (block.timestamp <= option.exerciseDeadline) revert OptionNotExercisable();

        // Return asset to LP
        IERC20(option.asset).safeTransfer(option.lp, option.amount);
        totalLocked[option.asset] -= option.amount;

        // Update state
        option.state = OptionState.EXPIRED;

        emit OptionExpired(optionId);
    }

    /**
     * @notice Calculate premium for taking option
     * @param commitmentHash Hash of commitment
     * @param currentPrice Current asset price
     * @return premium Premium to pay in USDC
     */
    function calculatePremium(
        bytes32 commitmentHash,
        uint256 currentPrice
    ) public view override returns (uint256 premium) {
        OptionCommitment memory commitment = commitments[commitmentHash];
        
        // Premium = |Current Price - Target Price| * Amount
        if (currentPrice > commitment.targetPrice) {
            premium = ((currentPrice - commitment.targetPrice) * commitment.amount) / 1e18;
        } else {
            premium = ((commitment.targetPrice - currentPrice) * commitment.amount) / 1e18;
        }
    }

    /**
     * @notice Check if option is exercisable
     * @param optionId The option ID
     * @return exercisable True if option can be exercised
     */
    function isExercisable(uint256 optionId) public view override returns (bool exercisable) {
        ActiveOption memory option = activeOptions[optionId];
        if (option.state != OptionState.TAKEN) return false;
        if (block.timestamp > option.exerciseDeadline) return false;

        uint256 currentPrice = getCurrentPrice(option.asset);
        
        if (option.optionType == OptionType.CALL) {
            return currentPrice > option.targetPrice;
        } else {
            return currentPrice < option.targetPrice;
        }
    }

    /**
     * @notice Get current price via 1inch quote (asset -> USDC)
     * @param asset Asset address
     * @param amount Amount to quote (1 unit by default)
     * @return price Current price in USD with USDC decimals (6)
     */
    function getCurrentPrice(address asset, uint256 amount) public view returns (uint256 price) {
        if (asset == USDC) {
            return amount; // USDC to USDC is 1:1
        }
        
        // Get 1inch quote: asset -> USDC
        (uint256 amountOut,,) = settlementRouter.getSettlementQuote(asset, USDC, amount);
        return amountOut;
    }
    
    /**
     * @notice Get current price for 1 unit of asset (backward compatibility)
     * @param asset Asset address
     * @return price Current price in USD with 18 decimals (converted from USDC)
     */
    function getCurrentPrice(address asset) public view override returns (uint256 price) {
        if (asset == USDC) {
            return 1e18; // $1 USDC in 18 decimals
        }
        
        // Get price for 1 unit, result should be in USDC (6 decimals)
        uint256 usdcPrice = getCurrentPrice(asset, 1 ether);
        return usdcPrice * 1e12; // Convert 6 decimals to 18 decimals
    }

    /**
     * @notice Get commitment details
     * @param commitmentHash Hash of commitment
     * @return commitment The commitment struct
     */
    function getCommitment(bytes32 commitmentHash) external view override returns (OptionCommitment memory commitment) {
        return commitments[commitmentHash];
    }

    /**
     * @notice Get option details
     * @param optionId The option ID
     * @return option The active option struct
     */
    function getOption(uint256 optionId) external view override returns (ActiveOption memory option) {
        return activeOptions[optionId];
    }

    /**
     * @notice Create and store commitment with signature validation
     * @param commitment The commitment to create
     */
    function createCommitment(OptionCommitment calldata commitment) external override nonReentrant whenNotPaused {
        // Validate commitment structure
        bool isLpCommitment = commitment.lp != address(0);
        bool isTakerCommitment = commitment.taker != address(0);
        if (!((isLpCommitment && !isTakerCommitment) || (!isLpCommitment && isTakerCommitment))) {
            revert InvalidCommitment();
        }
        
        // Validate commitment parameters
        if (commitment.amount < MIN_OPTION_SIZE || commitment.amount > MAX_OPTION_SIZE) {
            revert InvalidAmount();
        }
        if (commitment.durationDays < 1 || commitment.durationDays > 365) {
            revert InvalidDuration();
        }
        if (!allowedAssets[commitment.asset]) {
            revert InvalidAsset();
        }
        if (commitment.expiry <= block.timestamp) {
            revert CommitmentExpired();
        }

        // Determine signer and validate nonce
        address signer = isLpCommitment ? commitment.lp : commitment.taker;
        if (commitment.nonce != nonces[signer] + 1) {
            revert InvalidCommitment();
        }

        // Verify EIP-712 signature
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        // Create typed data hash for signature verification
        bytes32 digest = getCommitmentHash(
            commitment.lp,
            commitment.taker,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.premium,
            commitment.durationDays,
            uint8(commitment.optionType),
            commitment.expiry,
            commitment.nonce
        );
        
        // Recover signer and verify
        address recoveredSigner = ECDSA.recover(digest, commitment.signature);
        if (recoveredSigner != signer) {
            revert InvalidCommitment();
        }

        // Effects: Update state before external interactions
        nonces[signer] = commitment.nonce;
        _storeCommitment(commitment, commitmentHash);

        emit CommitmentCreated(commitmentHash, signer, commitment.asset, commitment.amount);
    }

    /**
     * @notice Internal function to store validated commitment
     * @param commitment The commitment to store
     * @param commitmentHash Pre-calculated hash
     */
    function _storeCommitment(OptionCommitment calldata commitment, bytes32 commitmentHash) internal {
        commitments[commitmentHash] = commitment;
    }

    /**
     * @notice Execute settlement through 1inch with collateralization verification
     * @param option The option being exercised
     * @param params Settlement parameters
     * @param expectedProfit Expected profit for validation
     */
    function _executeSettlement(
        ActiveOption memory option,
        SettlementParams calldata params,
        uint256 expectedProfit
    ) internal {
        // Checks: Validate parameters
        if (params.deadline < block.timestamp) revert SettlementFailed();
        if (params.minReturn == 0) revert SettlementFailed();

        // Get expected LP payout in USDC (6 decimals)
        uint256 expectedLpPayoutUSDC = (option.targetPrice * option.amount) / 1e18 / 1e12;
        
        // Verify minimum return covers LP payout + some profit for taker
        if (params.minReturn < expectedLpPayoutUSDC) revert SettlementFailed();

        // Approve settlement router to spend asset
        IERC20(option.asset).forceApprove(address(settlementRouter), option.amount);

        // Execute settlement - asset -> USDC for easier calculation
        ISettlementRouter.SettlementResult memory result = settlementRouter.executeSettlement(
            ISettlementRouter.SettlementMethod(params.method),
            option.asset,
            USDC, // Settle to USDC for consistent pricing
            option.amount,
            params.minReturn,
            params.routingData
        );

        // Checks: Validate settlement result meets collateralization requirements
        if (result.amountOut < params.minReturn) revert SettlementFailed();
        if (result.amountOut < expectedLpPayoutUSDC) revert SettlementFailed(); // Ensure LP can be paid

        // Effects: Calculate payouts (all amounts in USDC 6 decimals)
        uint256 lpPayoutUSDC = expectedLpPayoutUSDC;
        uint256 takerProfitUSDC = result.amountOut > lpPayoutUSDC ? result.amountOut - lpPayoutUSDC : 0;

        // Interactions: Distribute proceeds in USDC
        if (lpPayoutUSDC > 0) {
            IERC20(USDC).safeTransfer(option.lp, lpPayoutUSDC);
        }

        if (takerProfitUSDC > 0) {
            IERC20(USDC).safeTransfer(option.taker, takerProfitUSDC);
        }

        // Any remaining USDC stays in contract as protocol revenue
    }

    /**
     * @notice Execute simple swap when current price is better than LP target
     * @param commitment The LP commitment
     * @param currentPrice Current asset price
     */
    function _executeSimpleSwap(
        OptionCommitment memory commitment,
        uint256 currentPrice
    ) internal {
        // CHECKS: Validate simple swap conditions
        require(currentPrice > commitment.targetPrice, "Price not better than target");
        
        // EFFECTS: Calculate LP payout in USDC (target price is USD, convert to USDC decimals)
        uint256 lpPayoutUSDC = (commitment.targetPrice * commitment.amount) / 1e18 / 1e12; // Convert to USDC 6 decimals
        
        // Delete commitment first (effects)
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        delete commitments[commitmentHash];

        // INTERACTIONS: External calls after state updates
        // Transfer LP asset to protocol
        IERC20(commitment.asset).safeTransferFrom(commitment.lp, address(this), commitment.amount);
        
        // Send LP their target price worth in USDC
        IERC20(USDC).safeTransfer(commitment.lp, lpPayoutUSDC);
        
        // Note: LP asset remains in contract as protocol revenue
        // Will be available for sweep via sweepExcess function
        
        emit OptionTaken(0, commitmentHash, commitment.lp, commitment.amount, 0);
    }

    /**
     * @notice Generate commitment hash
     * @param commitment The commitment struct
     * @return hash Keccak256 hash of commitment
     */
    function _getCommitmentHash(OptionCommitment memory commitment) internal view returns (bytes32 hash) {
        return getCommitmentHash(
            commitment.lp,
            commitment.taker,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.premium,
            commitment.durationDays,
            uint8(commitment.optionType),
            commitment.expiry,
            commitment.nonce
        );
    }

    // Admin Functions


    /**
     * @notice Set settlement router
     * @param router New settlement router address
     */
    function setSettlementRouter(address router) external override onlyOwner {
        settlementRouter = ISettlementRouter(router);
    }

    /**
     * @notice Add allowed asset
     * @param asset Asset to allow
     */
    function addAllowedAsset(address asset) external onlyOwner {
        allowedAssets[asset] = true;
    }

    /**
     * @notice Remove allowed asset
     * @param asset Asset to remove
     */
    function removeAllowedAsset(address asset) external onlyOwner {
        allowedAssets[asset] = false;
    }

    /**
     * @notice Get current nonce for address (needed for EIP-712 signatures)
     * @param user Address to get nonce for
     * @return nonce Current nonce value
     */
    function getNonce(address user) external view returns (uint256 nonce) {
        return nonces[user];
    }

    /**
     * @notice Emergency pause
     */
    function emergencyPause() external override onlyOwner {
        _pause();
    }

    /**
     * @notice Emergency unpause
     */
    function emergencyUnpause() external override onlyOwner {
        _unpause();
    }

    /**
     * @notice Set safety margin for protocol fees
     * @param newMargin New safety margin in basis points (max 1000 = 10%)
     */
    function setSafetyMargin(uint256 newMargin) external onlyOwner {
        if (newMargin > 1000) revert InvalidCommitment(); // Max 10%
        safetyMargin = newMargin;
    }

    // Price oracle functionality removed - using 1inch quotes directly

    /**
     * @notice Sweep excess tokens not used as collateral
     * @param asset Token address to sweep (use address(0) for ETH)
     * @dev Only sweeps amounts above what's needed for active collateral
     */
    function sweepExcess(address asset) external onlyOwner {
        if (asset == address(0)) {
            // Sweep excess ETH (protocol fees should have been sent already)
            uint256 balance = address(this).balance;
            if (balance > 0) {
                (bool success,) = payable(owner()).call{value: balance}("");
                require(success, "ETH sweep failed");
            }
        } else {
            // Sweep excess ERC20 tokens
            uint256 balance = IERC20(asset).balanceOf(address(this));
            uint256 locked = totalLocked[asset];
            
            if (balance > locked) {
                uint256 excess = balance - locked;
                IERC20(asset).safeTransfer(owner(), excess);
            }
        }
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}