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

    struct OptionCommitment {
        address lp;                 // Liquidity provider address (0x0 for taker commitments)
        address taker;              // Taker address (0x0 for LP commitments)
        address asset;              // Underlying asset address (initially WETH)
        uint256 amount;             // Amount of asset (full amount, no fractions)
        uint256 targetPrice;        // LP's desired price (0 for taker commitments - set at execution)
        uint256 premium;            // Taker's offered premium in USDC (0 for LP commitments)
        uint256 durationDays;       // Option lifetime in days
        OptionType optionType;      // CALL or PUT
        uint256 expiry;             // Commitment expiration timestamp  
        uint256 nonce;              // Nonce for signature uniqueness
        bytes signature;            // EIP-712 signature
    }

    struct ActiveOption {
        bytes32 commitmentHash;     // Hash of original commitment
        address taker;              // Option taker address
        address lp;                 // Liquidity provider address
        address asset;              // Underlying asset address
        uint256 amount;             // Full amount (no fractions)
        uint256 targetPrice;        // LP target price
        uint256 premium;            // Premium paid in USDC
        uint256 exerciseDeadline;   // When option expires
        uint256 currentPrice;       // Price when option was taken
        OptionType optionType;      // CALL or PUT
        OptionState state;          // Current option state
    }

    struct SettlementParams {
        uint8 method;               // Settlement method (0=LimitOrder, 1=Unoswap, 2=Generic)
        bytes routingData;          // Encoded routing parameters
        uint256 minReturn;          // Minimum return expected
        uint256 deadline;           // Settlement deadline
    }

    // Events
    event CommitmentCreated(bytes32 indexed commitmentHash, address indexed creator, address asset, uint256 amount);
    event OptionTaken(uint256 indexed optionId, bytes32 indexed commitmentHash, address indexed taker, uint256 amount, uint256 premium);
    event OptionExercised(uint256 indexed optionId, uint256 profit, uint256 protocolFee);
    event OptionExpired(uint256 indexed optionId);
    event ExcessSwept(address indexed asset, address indexed to, uint256 amount);
    event ETHSwept(address indexed to, uint256 amount);
    event ProtocolFeeUpdated(uint256 newFee);

    // Core Functions
    function createCommitment(OptionCommitment calldata commitment) external;
    function takeCommitment(bytes32 commitmentHash, OptionType optionType) external returns (uint256 optionId);
    function exerciseOption(uint256 optionId, SettlementParams calldata params) external;
    function liquidateExpiredOption(uint256 optionId) external;

    // View Functions
    function getCommitment(bytes32 commitmentHash) external view returns (OptionCommitment memory);
    function getOption(uint256 optionId) external view returns (ActiveOption memory);
    function calculatePremium(bytes32 commitmentHash, uint256 currentPrice) external view returns (uint256 premium);
    function isExercisable(uint256 optionId) external view returns (bool);
    function getCurrentPrice(address asset) external view returns (uint256);

    // Admin Functions
    function setSafetyMargin(uint256 newMargin) external;
    function setSettlementRouter(address router) external;
    function sweepExcess(address asset) external;
    function emergencyPause() external;
    function emergencyUnpause() external;
}