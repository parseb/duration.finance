// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IDurationOptions} from "./interfaces/IDurationOptions.sol";
import {ISettlementRouter} from "./interfaces/I1inch.sol";
import {VerifySignature} from "./utils/VerifySignature.sol";
import {DurationToken} from "./DurationToken.sol";

/**
 * @title DurationOptions
 * @author Duration.Finance  
 * @notice Core options protocol with 1inch settlement integration
 * @dev Complete rewrite based on GHOptim timing logic, no Aave dependencies
 */
contract DurationOptions is IDurationOptions, VerifySignature, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant MIN_OPTION_SIZE = 0.1 ether; // 0.1 units minimum
    uint256 public constant MAX_OPTION_SIZE = 1000 ether; // 1000 units maximum
    uint256 public constant MIN_DURATION = 1 days;
    uint256 public constant MAX_DURATION = 365 days;
    address public constant WETH = 0x4200000000000000000000000000000000000006; // Base WETH

    // State
    DurationToken public immutable durToken;
    ISettlementRouter public settlementRouter;
    address public admin;
    uint256 public optionCounter;
    uint256 public safetyMargin = 100; // 0.01% in basis points

    // Storage
    mapping(bytes32 => OptionCommitment) public commitments;
    mapping(uint256 => ActiveOption) public activeOptions;
    mapping(address => uint256) public lpNonces;
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

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedCaller();
        _;
    }

    modifier onlyDurToken() {
        if (msg.sender != address(durToken)) revert UnauthorizedCaller();
        _;
    }

    constructor(
        address payable _durToken,
        address _settlementRouter,
        address _admin
    ) VerifySignature() {
        durToken = DurationToken(_durToken);
        settlementRouter = ISettlementRouter(_settlementRouter);
        admin = _admin;
        
        // Initially allow WETH
        allowedAssets[WETH] = true;
    }

    /**
     * @notice Create LP commitment (off-chain, signature only)
     * @param commitment The option commitment struct
     * @dev This function validates but doesn't store - used for verification
     */
    function createCommitment(OptionCommitment calldata commitment) external override {
        // Validate commitment parameters
        if (commitment.lp != msg.sender) revert InvalidCommitment();
        if (!allowedAssets[commitment.asset]) revert InvalidAsset();
        if (commitment.amount < MIN_OPTION_SIZE || commitment.amount > MAX_OPTION_SIZE) {
            revert InvalidAmount();
        }
        if (commitment.maxDuration < MIN_DURATION || commitment.maxDuration > MAX_DURATION) {
            revert InvalidDuration();
        }
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        if (commitment.targetPrice == 0) revert InvalidCommitment();

        // Verify signature
        bool isValid = verifyCommitmentSignature(
            commitment.lp,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.maxDuration,
            commitment.fractionable,
            commitment.expiry,
            commitment.nonce,
            commitment.signature
        );

        if (!isValid) revert InvalidCommitment();

        bytes32 commitmentHash = _getCommitmentHash(commitment);
        emit CommitmentCreated(commitmentHash, commitment.lp, commitment.asset, commitment.amount);
    }

    /**
     * @notice Take an option position
     * @param commitmentHash Hash of the LP commitment
     * @param amount Amount to take (must be <= commitment amount)
     * @return optionId The created option ID
     */
    function takeOption(
        bytes32 commitmentHash,
        uint256 amount
    ) external payable override nonReentrant whenNotPaused returns (uint256 optionId) {
        // Load commitment (should be passed from frontend)
        OptionCommitment memory commitment = commitments[commitmentHash];
        if (commitment.lp == address(0)) revert CommitmentNotFound();
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        if (amount < MIN_OPTION_SIZE) revert InvalidAmount();
        if (!commitment.fractionable && amount != commitment.amount) revert InvalidAmount();
        if (amount > commitment.amount) revert InvalidAmount();

        // Calculate premium
        uint256 premium = calculatePremium(commitmentHash, amount);
        if (msg.value < premium) revert InsufficientPremium();

        // Transfer LP asset to protocol
        IERC20(commitment.asset).safeTransferFrom(commitment.lp, address(this), amount);
        totalLocked[commitment.asset] += amount;

        // Determine option type based on current price vs target price
        uint256 currentPrice = getCurrentPrice(commitment.asset);
        OptionType optionType = currentPrice < commitment.targetPrice ? OptionType.CALL : OptionType.PUT;

        // Create active option
        optionId = ++optionCounter;
        activeOptions[optionId] = ActiveOption({
            commitmentHash: commitmentHash,
            taker: msg.sender,
            lp: commitment.lp,
            asset: commitment.asset,
            amount: amount,
            targetPrice: commitment.targetPrice,
            premium: premium,
            exerciseDeadline: block.timestamp + commitment.maxDuration,
            optionType: optionType,
            state: OptionState.TAKEN
        });

        // Send premium to LP
        (bool success,) = payable(commitment.lp).call{value: premium}("");
        require(success, "Premium transfer failed");

        // Return excess ETH to taker
        if (msg.value > premium) {
            (success,) = payable(msg.sender).call{value: msg.value - premium}("");
            require(success, "Excess refund failed");
        }

        emit OptionTaken(optionId, commitmentHash, msg.sender, amount, premium);
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
        
        // Send revenue to DUR token
        if (protocolFee > 0) {
            durToken.receiveProtocolRevenue{value: protocolFee}();
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
     * @param amount Amount to take
     * @return premium Premium to pay in ETH
     */
    function calculatePremium(
        bytes32 commitmentHash,
        uint256 amount
    ) public view override returns (uint256 premium) {
        OptionCommitment memory commitment = commitments[commitmentHash];
        uint256 currentPrice = getCurrentPrice(commitment.asset);
        
        // Premium = |Current Price - Target Price| * Amount
        if (currentPrice > commitment.targetPrice) {
            premium = ((currentPrice - commitment.targetPrice) * amount) / 1e18;
        } else {
            premium = ((commitment.targetPrice - currentPrice) * amount) / 1e18;
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
     * @notice Generate commitment hash
     * @param commitment The commitment struct
     * @return hash Keccak256 hash of commitment
     */
    function _getCommitmentHash(OptionCommitment memory commitment) internal pure returns (bytes32 hash) {
        return keccak256(abi.encode(
            commitment.lp,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.maxDuration,
            commitment.fractionable,
            commitment.expiry,
            commitment.nonce
        ));
    }

    // Admin Functions

    /**
     * @notice Set safety margin (only callable by DUR holders via governance)
     * @param newMargin New safety margin in basis points
     */
    function setSafetyMargin(uint256 newMargin) external override onlyDurToken {
        safetyMargin = newMargin;
        emit ProtocolFeeUpdated(newMargin);
    }

    /**
     * @notice Set settlement router
     * @param router New settlement router address
     */
    function setSettlementRouter(address router) external override onlyAdmin {
        settlementRouter = ISettlementRouter(router);
    }

    /**
     * @notice Add allowed asset
     * @param asset Asset to allow
     */
    function addAllowedAsset(address asset) external onlyAdmin {
        allowedAssets[asset] = true;
    }

    /**
     * @notice Remove allowed asset
     * @param asset Asset to remove
     */
    function removeAllowedAsset(address asset) external onlyAdmin {
        allowedAssets[asset] = false;
    }

    /**
     * @notice Emergency pause
     */
    function emergencyPause() external override onlyAdmin {
        _pause();
    }

    /**
     * @notice Emergency unpause
     */
    function emergencyUnpause() external override onlyAdmin {
        _unpause();
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}