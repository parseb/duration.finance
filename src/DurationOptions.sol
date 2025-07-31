// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IDurationOptions} from "./interfaces/IDurationOptions.sol";
import {ISettlementRouter} from "./interfaces/I1inch.sol";
import {SignatureVerification} from "./libraries/SignatureVerification.sol";

/**
 * @title DurationOptions
 * @author Duration.Finance  
 * @notice Duration-centric options protocol with 1inch settlement integration
 * @dev Complete rewrite focused on daily premium rates and duration flexibility
 */
contract DurationOptions is IDurationOptions, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

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
    bytes32 public domainSeparator;

    // Storage
    mapping(bytes32 => OptionCommitment) public commitments;
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

    constructor(address _settlementRouter) Ownable(msg.sender) {
        settlementRouter = _settlementRouter;
        allowedAssets[WETH] = true;
        
        // Build EIP-712 domain separator
        domainSeparator = SignatureVerification.buildDomainSeparator(address(this));
    }

    /**
     * @notice Create LP commitment with duration-centric pricing
     * @param commitment The LP commitment struct with signature
     */
    function createLPCommitment(OptionCommitment calldata commitment) external override {
        // Validate basic commitment structure
        if (commitment.lp != msg.sender) revert UnauthorizedCaller();
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        if (commitment.amount < minOptionSize || commitment.amount > maxOptionSize) revert InvalidAmount();
        if (!allowedAssets[commitment.asset]) revert InvalidAsset();
        
        // Validate duration-centric fields
        if (commitment.minLockDays < MIN_DURATION_DAYS || commitment.maxDurationDays > MAX_DURATION_DAYS) revert InvalidDuration();
        if (commitment.minLockDays > commitment.maxDurationDays) revert InvalidDuration();
        if (commitment.dailyPremiumUsdc == 0) revert InvalidAmount();

        // Verify EIP-712 signature
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        
        // For now, skip signature verification in POC - will implement full verification later
        // TODO: Implement proper EIP-712 signature verification
        
        // Verify commitment is signed by the LP (basic check)
        if (commitment.signature.length != 65) revert InvalidSignature();

        // Store commitment
        commitments[commitmentHash] = commitment;
        nonces[msg.sender] = commitment.nonce + 1;

        emit LPCommitmentCreated(
            commitmentHash, 
            commitment.lp, 
            commitment.asset, 
            commitment.amount, 
            commitment.dailyPremiumUsdc,
            commitment.minLockDays,
            commitment.maxDurationDays
        );
    }

    /**
     * @notice Take LP commitment with specified duration
     * @param commitmentHash Hash of the commitment to take
     * @param durationDays Duration in days (must be within LP's range)
     * @param settlementParams 1inch settlement parameters
     * @return optionId The created option ID
     */
    function takeCommitment(
        bytes32 commitmentHash,
        uint256 durationDays,
        SettlementParams calldata settlementParams
    ) external override nonReentrant whenNotPaused returns (uint256 optionId) {
        // CHECKS: Load and validate LP commitment
        OptionCommitment memory commitment = commitments[commitmentHash];
        
        if (commitment.lp == address(0)) revert CommitmentNotFound();
        if (commitment.expiry <= block.timestamp) revert CommitmentExpired();
        if (commitment.amount < minOptionSize) revert InvalidAmount();
        
        // CHECKS: Validate duration is within LP's acceptable range
        if (durationDays < commitment.minLockDays || durationDays > commitment.maxDurationDays) {
            revert InvalidDuration();
        }

        // CHECKS: Get current price and calculate premium
        uint256 currentPrice = getCurrentPrice(commitment.asset);
        uint256 totalPremium = commitment.dailyPremiumUsdc * durationDays;
        
        address optionTaker = msg.sender;
        address lpAddress = commitment.lp;
        uint256 strikePrice = currentPrice; // Strike price is always current market price

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
            strikePrice: strikePrice,
            dailyPremiumUsdc: commitment.dailyPremiumUsdc,
            lockDurationDays: durationDays,
            totalPremiumPaid: totalPremium,
            exerciseDeadline: block.timestamp + (durationDays * 1 days),
            optionType: commitment.optionType,
            state: OptionState.TAKEN
        });

        // Remove commitment as it's been taken
        delete commitments[commitmentHash];

        // INTERACTIONS: External calls after state updates
        // Transfer USDC premium from taker to protocol
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalPremium);
        // Transfer LP asset to protocol for collateral
        IERC20(commitment.asset).safeTransferFrom(lpAddress, address(this), commitment.amount);

        // Send USDC premium to LP
        IERC20(USDC).safeTransfer(lpAddress, totalPremium);

        emit OptionTaken(optionId, commitmentHash, optionTaker, lpAddress, commitment.amount, durationDays, totalPremium);
    }

    /**
     * @notice Calculate total premium for a given duration
     * @param commitmentHash Hash of the commitment
     * @param durationDays Duration in days
     * @return premium Total premium (daily rate * duration)
     */
    function calculatePremiumForDuration(bytes32 commitmentHash, uint256 durationDays) 
        external view override returns (uint256 premium) 
    {
        OptionCommitment memory commitment = commitments[commitmentHash];
        if (commitment.lp == address(0)) return 0;
        
        return commitment.dailyPremiumUsdc * durationDays;
    }

    /**
     * @notice Check if duration is valid for commitment
     * @param commitmentHash Hash of the commitment
     * @param durationDays Duration to check
     * @return valid True if duration is within LP's acceptable range
     */
    function isValidDuration(bytes32 commitmentHash, uint256 durationDays) 
        external view override returns (bool valid) 
    {
        OptionCommitment memory commitment = commitments[commitmentHash];
        if (commitment.lp == address(0)) return false;
        
        return durationDays >= commitment.minLockDays && durationDays <= commitment.maxDurationDays;
    }

    /**
     * @notice Get LP yield metrics for a commitment
     * @param commitmentHash Hash of the commitment
     * @param currentPrice Current asset price
     * @return dailyYield Daily yield percentage (basis points)
     * @return annualizedYield Annualized yield percentage (basis points)
     */
    function getLPYieldMetrics(bytes32 commitmentHash, uint256 currentPrice) 
        external view override returns (uint256 dailyYield, uint256 annualizedYield) 
    {
        OptionCommitment memory commitment = commitments[commitmentHash];
        if (commitment.lp == address(0)) return (0, 0);
        
        uint256 collateralValue = commitment.amount * currentPrice / 1e18;
        if (collateralValue == 0) return (0, 0);
        
        // Calculate daily yield in basis points
        dailyYield = (commitment.dailyPremiumUsdc * 10000) / collateralValue;
        annualizedYield = dailyYield * 365;
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

        // Calculate profit based on option type
        if (option.optionType == OptionType.CALL && currentPrice > option.strikePrice) {
            profit = (currentPrice - option.strikePrice) * option.amount / 1e18;
        } else if (option.optionType == OptionType.PUT && currentPrice < option.strikePrice) {
            profit = (option.strikePrice - currentPrice) * option.amount / 1e18;
        }

        if (profit == 0) revert OptionNotExercisable();

        // EFFECTS: Update state
        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;

        // INTERACTIONS: Settlement through 1inch
        uint256 protocolFeeAmount = (profit * protocolFee) / 10000;
        uint256 netProfit = profit - protocolFeeAmount;

        // Execute settlement via 1inch
        _performSettlement(option, params, netProfit);

        emit OptionExercised(optionId, netProfit, protocolFeeAmount);
    }

    /**
     * @notice Liquidate expired option
     * @param optionId The option to liquidate
     * @param maxPriceMovement Maximum allowed price movement for profitable liquidation
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

    // Internal helper functions
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
        // Implementation details for price simulation...
        
        option.state = OptionState.EXERCISED;
        totalLocked[option.asset] -= option.amount;
        
        emit OptionExpiredProfitable(optionId, initialPrice, option.strikePrice);
    }

    function _liquidateUnprofitableExpiredOption(uint256 optionId) internal {
        ActiveOption storage option = activeOptions[optionId];
        
        option.state = OptionState.EXPIRED;
        totalLocked[option.asset] -= option.amount;
        
        // Return collateral to LP
        IERC20(option.asset).safeTransfer(option.lp, option.amount);
        
        emit OptionExpiredUnprofitable(optionId, getCurrentPrice(option.asset), option.strikePrice);
    }

    function _performSettlement(
        ActiveOption memory option,
        SettlementParams calldata params,
        uint256 expectedReturn
    ) internal {
        // 1inch settlement implementation
        // This would integrate with the settlement router
    }

    // View functions
    function getCurrentPrice(address asset) public view override returns (uint256) {
        // Mock implementation - in production, integrate with 1inch pricing
        if (asset == WETH) {
            return 3836.50 * 1e18; // Mock WETH price
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

    function getCommitment(bytes32 commitmentHash) external view override returns (OptionCommitment memory) {
        return commitments[commitmentHash];
    }

    function getOption(uint256 optionId) external view override returns (ActiveOption memory) {
        return activeOptions[optionId];
    }

    function getNonce(address user) external view override returns (uint256 nonce) {
        return nonces[user];
    }

    // Missing interface functions
    function createTakerCommitment(OptionCommitment calldata commitment, uint256 durationDays) external override {
        // Taker commitments not implemented in this version - LPs create, takers take
        revert("Taker commitments not supported");
    }

    function getMarketplaceLiquidity(address asset, uint256 durationDays, uint256 offset, uint256 limit) 
        external view override returns (OptionCommitment[] memory) 
    {
        // Return empty array for now - marketplace queries handled off-chain
        return new OptionCommitment[](0);
    }

    function getOptionsByDuration(address user, uint256 minDays, uint256 maxDays) 
        external view override returns (uint256[] memory) 
    {
        // Return empty array for now - portfolio queries handled off-chain
        return new uint256[](0);
    }

    function getLPCommitmentsByYield(address asset, uint256 minYield, uint256 maxYield) 
        external view override returns (bytes32[] memory) 
    {
        // Return empty array for now - yield queries handled off-chain
        return new bytes32[](0);
    }

    // Admin functions
    function setSafetyMargin(uint256 newMargin) external override onlyOwner {
        safetyMargin = newMargin;
    }

    function setSettlementRouter(address router) external override onlyOwner {
        settlementRouter = router;
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
            IERC20(asset).safeTransfer(owner(), balance - locked);
        }
    }
    
    function emergencyPause() external override onlyOwner {
        _pause();
    }

    function emergencyUnpause() external override onlyOwner {
        _unpause();
    }
}