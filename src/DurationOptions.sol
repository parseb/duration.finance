// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IDurationOptions} from "./interfaces/IDurationOptions.sol";
import {ISettlementRouter} from "./interfaces/I1inch.sol";
import {VerifySignature} from "./utils/VerifySignature.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
     * @notice Create commitment (LP or Taker)
     * @param commitment The option commitment struct
     * @dev This function validates but doesn't store - used for verification
     */
    function createCommitment(OptionCommitment calldata commitment) external override {
        // Determine if this is LP or Taker commitment
        bool isLpCommitment = commitment.lp != address(0);
        bool isTakerCommitment = commitment.taker != address(0);
        
        // Must be either LP or Taker, but not both
        if (!((isLpCommitment && !isTakerCommitment) || (!isLpCommitment && isTakerCommitment))) revert InvalidCommitment();
        
        // Validate sender
        address expectedSender = isLpCommitment ? commitment.lp : commitment.taker;
        if (expectedSender != msg.sender) revert InvalidCommitment();
        
        // Common validations
        if (!allowedAssets[commitment.asset]) revert InvalidAsset();
        if (commitment.amount < MIN_OPTION_SIZE || commitment.amount > MAX_OPTION_SIZE) {
            revert InvalidAmount();
        }
        if (commitment.durationDays == 0 || commitment.durationDays > 365) {
            revert InvalidDuration();
        }
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        
        // LP-specific validations
        if (isLpCommitment) {
            if (commitment.targetPrice == 0) revert InvalidCommitment();
            if (commitment.premium != 0) revert InvalidCommitment(); // LP doesn't set premium
        }
        
        // Taker-specific validations  
        if (isTakerCommitment) {
            if (commitment.premium == 0) revert InvalidCommitment(); // Taker must set premium
            if (commitment.targetPrice != 0) revert InvalidCommitment(); // Taker doesn't set target price
        }

        // Verify signature
        bool isValid = verifyCommitmentSignature(
            commitment.lp,
            commitment.taker,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.premium,
            commitment.durationDays,
            uint8(commitment.optionType),
            commitment.expiry,
            commitment.nonce,
            commitment.signature
        );

        if (!isValid) revert InvalidCommitment();

        bytes32 commitmentHash = _getCommitmentHash(commitment);
        address creator = isLpCommitment ? commitment.lp : commitment.taker;
        emit CommitmentCreated(commitmentHash, creator, commitment.asset, commitment.amount);
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
        // Load commitment
        OptionCommitment memory commitment = commitments[commitmentHash];
        
        // Validate commitment exists
        bool isLpCommitment = commitment.lp != address(0);
        bool isTakerCommitment = commitment.taker != address(0);
        if (!((isLpCommitment && !isTakerCommitment) || (!isLpCommitment && isTakerCommitment))) revert CommitmentNotFound();
        
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        if (commitment.amount < MIN_OPTION_SIZE) revert InvalidAmount();

        // Get current price
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
                delete commitments[commitmentHash];
                return 0; // Simple swap executed
            }
            
            // Calculate premium for LP commitment
            premium = calculatePremium(commitmentHash, currentPrice);
            
            // Transfer USDC premium from taker to protocol
            IERC20(USDC).safeTransferFrom(msg.sender, address(this), premium);
            
            // Transfer LP asset to protocol for collateral
            IERC20(commitment.asset).safeTransferFrom(commitment.lp, address(this), commitment.amount);
            
        } else {
            // Taker commitment being taken by LP
            optionTaker = commitment.taker;
            lpAddress = msg.sender;
            finalTargetPrice = currentPrice; // Target price = current price for taker commitments
            premium = commitment.premium; // Premium already specified by taker
            
            // Transfer USDC premium from taker to protocol (taker already committed to this)
            IERC20(USDC).safeTransferFrom(commitment.taker, address(this), premium);
            
            // Transfer LP asset to protocol for collateral  
            IERC20(commitment.asset).safeTransferFrom(msg.sender, address(this), commitment.amount);
        }

        // Update locked amount
        totalLocked[commitment.asset] += commitment.amount;

        // Determine final option type
        OptionType finalOptionType = commitment.optionType;

        // Create active option
        optionId = ++optionCounter;
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
            optionType: finalOptionType,
            state: OptionState.TAKEN
        });

        // Send USDC premium to LP
        IERC20(USDC).safeTransfer(lpAddress, premium);

        // Remove commitment as it's been taken
        delete commitments[commitmentHash];

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
        ActiveOption storage option = activeOptions[optionId];
        if (option.taker != msg.sender) revert UnauthorizedCaller();
        if (!isExercisable(optionId)) revert OptionNotExercisable();
        if (params.deadline < block.timestamp) revert SettlementFailed();

        uint256 currentPrice = getCurrentPrice(option.asset);
        uint256 profit = 0;
        
        // Check if option is profitable
        if (option.optionType == OptionType.CALL && currentPrice > option.targetPrice) {
            profit = (currentPrice - option.targetPrice) * option.amount / 1e18;
        } else if (option.optionType == OptionType.PUT && currentPrice < option.targetPrice) {
            profit = (option.targetPrice - currentPrice) * option.amount / 1e18;
        } else {
            revert OptionNotExercisable();
        }

        // Execute settlement through 1inch
        _executeSettlement(option, params, profit);

        // Update option state
        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;

        // Calculate protocol fee
        uint256 protocolFee = (profit * safetyMargin) / 10000;
        
        // Send protocol fee to owner
        if (protocolFee > 0) {
            (bool success,) = payable(owner()).call{value: protocolFee}("");
            require(success, "Protocol fee transfer failed");
        }

        emit OptionExercised(optionId, profit, protocolFee);
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
     * @notice Get current price of asset (using 1inch oracle)
     * @param asset Asset address
     * @return price Current price in wei
     */
    function getCurrentPrice(address asset) public pure override returns (uint256 price) {
        // For now, return mock price - integrate with 1inch oracle
        if (asset == WETH) {
            return 3500e18; // Mock $3500 WETH price
        }
        return 1e18; // Default $1
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
     * @notice Store commitment in contract (called from frontend after validation)
     * @param commitment The commitment to store
     */
    function storeCommitment(OptionCommitment calldata commitment) external {
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        commitments[commitmentHash] = commitment;
    }

    /**
     * @notice Execute settlement through 1inch
     * @param option The option being exercised
     * @param params Settlement parameters
     */
    function _executeSettlement(
        ActiveOption memory option,
        SettlementParams calldata params,
        uint256 /* expectedProfit */
    ) internal {
        // Approve settlement router to spend asset
        IERC20(option.asset).forceApprove(address(settlementRouter), option.amount);

        // Execute settlement based on method
        ISettlementRouter.SettlementResult memory result = settlementRouter.executeSettlement(
            ISettlementRouter.SettlementMethod(params.method),
            option.asset,
            WETH, // Assume settling to WETH for now
            option.amount,
            params.minReturn,
            params.routingData
        );

        if (result.amountOut < params.minReturn) revert SettlementFailed();

        // Distribute proceeds
        uint256 lpPayout = (option.targetPrice * option.amount) / 1e18;
        uint256 takerProfit = result.amountOut - lpPayout;

        // Send LP their target price worth
        (bool success,) = payable(option.lp).call{value: lpPayout}("");
        require(success, "LP payout failed");

        // Send taker their profit
        if (takerProfit > 0) {
            (success,) = payable(option.taker).call{value: takerProfit}("");
            require(success, "Taker profit failed");
        }
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
        // Transfer LP asset to protocol
        IERC20(commitment.asset).safeTransferFrom(commitment.lp, address(this), commitment.amount);
        
        // Calculate LP payout at their target price
        uint256 lpPayout = (commitment.targetPrice * commitment.amount) / 1e18;
        
        // Send LP their target price worth in USDC (assuming 1:1 USDC:USD)
        IERC20(USDC).safeTransfer(commitment.lp, lpPayout);
        
        // Note: LP asset remains in contract as protocol revenue
        // Will be available for sweep via sweepExcess function
        
        emit OptionTaken(0, keccak256(abi.encode(commitment)), commitment.lp, commitment.amount, 0);
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