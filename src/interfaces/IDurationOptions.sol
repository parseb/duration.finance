// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title IDurationOptions
 * @author Duration.Finance
 * @notice Interface for Duration.Finance options protocol
 */
interface IDurationOptions {
    
    enum OptionType { CALL, PUT }
    enum OptionState { CREATED, TAKEN, EXERCISED, EXPIRED }
    enum CommitmentType { LP_OFFER, TAKER_DEMAND }

    struct OptionCommitment {
        address creator;               // Commitment creator (LP or Taker)
        address asset;                 // Underlying asset address (initially WETH)
        uint256 amount;                // Amount of asset (full amount, no fractions)
        uint256 premiumAmount;         // Premium amount in USDC (daily rate for LP, total for Taker)
        uint256 minDurationDays;       // Minimum duration in days
        uint256 maxDurationDays;       // Maximum duration in days
        OptionType optionType;         // CALL or PUT
        CommitmentType commitmentType; // LP_OFFER or TAKER_DEMAND
        uint256 expiry;                // Commitment expiration timestamp  
        uint256 nonce;                 // Nonce for signature uniqueness
        bool isFramentable;            // Allow partial taking
        bytes signature;               // EIP-712 signature
    }

    struct ActiveOption {
        bytes32 commitmentHash;        // Hash of original commitment
        address taker;                 // Option taker address
        address lp;                    // Liquidity provider address
        address asset;                 // Underlying asset address
        uint256 amount;                // Full amount (no fractions)
        uint256 strikePrice;           // Market price when option was taken
        uint256 dailyPremiumUsdc;      // Daily premium rate in USDC
        uint256 lockDurationDays;      // Actual lock duration in days
        uint256 totalPremiumPaid;      // Total premium paid (daily * duration)
        uint256 exerciseDeadline;      // When option expires
        OptionType optionType;         // CALL or PUT
        OptionState state;             // Current option state
    }

    struct SettlementParams {
        uint8 method;               // Settlement method (0=LimitOrder, 1=Unoswap, 2=Generic)
        bytes routingData;          // Encoded routing parameters
        uint256 minReturn;          // Minimum return expected
        uint256 deadline;           // Settlement deadline
    }

    // Events - Duration-Centric Model
    event CommitmentCreated(bytes32 indexed commitmentHash, address indexed creator, CommitmentType commitmentType, address asset, uint256 amount, uint256 premium);
    event LPCommitmentCreated(bytes32 indexed commitmentHash, address indexed lp, address asset, uint256 amount, uint256 dailyPremiumUsdc, uint256 minLockDays, uint256 maxDurationDays);
    event OptionTaken(uint256 indexed optionId, bytes32 indexed commitmentHash, address indexed taker, address lp, uint256 amount, uint256 durationDays, uint256 totalPremium);
    event OptionExercised(uint256 indexed optionId, uint256 profit, uint256 protocolFee);
    event OptionExpired(uint256 indexed optionId);
    event OptionExpiredProfitable(uint256 indexed optionId, uint256 currentPrice, uint256 strikePrice);
    event OptionExpiredUnprofitable(uint256 indexed optionId, uint256 currentPrice, uint256 strikePrice);
    event ExcessSwept(address indexed asset, address indexed to, uint256 amount);
    event ETHSwept(address indexed to, uint256 amount);
    event ProtocolFeeUpdated(uint256 newFee);
    // CommitmentFeeUpdated event removed - fees handled at API layer
    event PositionLimitsUpdated(uint256 minSize, uint256 maxSize);

    // Core Functions - Duration-Centric
    function createCommitment(OptionCommitment calldata commitment) external;
    function createLPCommitment(OptionCommitment calldata commitment) external; // Legacy support
    function createTakerCommitment(OptionCommitment calldata commitment, uint256 durationDays) external; // Legacy support
    function takeCommitment(OptionCommitment calldata commitment, uint256 durationDays, SettlementParams calldata settlementParams) external returns (uint256 optionId);
    function exerciseOption(uint256 optionId, SettlementParams calldata params) external;
    function liquidateExpiredOption(uint256 optionId, uint256 maxPriceMovement) external;

    // View Functions - Duration-Centric
    function getCommitment(bytes32 commitmentHash) external view returns (OptionCommitment memory);
    function getOption(uint256 optionId) external view returns (ActiveOption memory);
    function calculatePremiumForDuration(OptionCommitment calldata commitment, uint256 durationDays) external view returns (uint256 premium);
    function isValidDuration(OptionCommitment calldata commitment, uint256 durationDays) external view returns (bool);
    function isExercisable(uint256 optionId) external view returns (bool);
    function getCurrentPrice(address asset) external view returns (uint256);
    function getNonce(address user) external view returns (uint256 nonce);
    
    // Marketplace Functions
    function getMarketplaceLiquidity(address asset, uint256 durationDays, uint256 offset, uint256 limit) external view returns (OptionCommitment[] memory);
    function getLPYieldMetrics(OptionCommitment calldata commitment, uint256 currentPrice) external view returns (uint256 dailyYield, uint256 annualizedYield);
    function getOptionsByDuration(address user, uint256 minDays, uint256 maxDays) external view returns (uint256[] memory);
    function getLPCommitmentsByYield(address asset, uint256 minYield, uint256 maxYield) external view returns (bytes32[] memory);

    // Admin Functions
    function setSafetyMargin(uint256 newMargin) external;
    function setSettlementRouter(address router) external;
    // setCommitmentFee function removed - fees handled at API layer
    function setProtocolFee(uint256 newFee) external;
    function sweepExcess(address asset) external;
    function sweepProtocolFees() external;
    function emergencyPause() external;
    function emergencyUnpause() external;
}