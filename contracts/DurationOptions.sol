// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface I1inchRouter {
    function unoswapTo(
        address payable recipient,
        address srcToken,
        uint256 amount,
        uint256 minReturn,
        bytes calldata pools
    ) external payable returns (uint256 returnAmount);
}

/**
 * @title DurationOptions
 * @notice Unified duration-based options protocol with complete PUT/CALL mechanics
 * @dev Implements immediate WETH selling for PUT options and proper settlement
 */
contract DurationOptions is EIP712, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Events
    event CommitmentTaken(
        uint256 indexed optionId,
        address indexed taker,
        address indexed lp,
        address asset,
        uint256 amount,
        uint256 strikePrice,
        uint256 premium,
        uint256 duration,
        uint256 expiry,
        uint8 optionType
    );

    event OptionExercised(
        uint256 indexed optionId,
        address indexed taker,
        uint256 profit
    );

    event PutOptionCreated(
        uint256 indexed optionId,
        uint256 wethSold,
        uint256 usdcReceived
    );

    event ExpiredOptionSettled(
        uint256 indexed optionId,
        address indexed settler
    );

    // Commitment types
    enum CommitmentType { OFFER, DEMAND }
    
    // Structs
    struct Commitment {
        address creator;            // Address that created/signed the commitment
        address asset;              // Underlying asset (WETH)
        uint256 amount;             // Amount of asset
        uint256 dailyPremiumUsdc;   // Daily premium in USDC (6 decimals)
        uint256 minLockDays;        // Minimum lock duration
        uint256 maxDurationDays;    // Maximum option duration
        uint8 optionType;           // 0 = CALL, 1 = PUT
        CommitmentType commitmentType; // OFFER (LP provides liquidity) or DEMAND (taker seeks liquidity)
        uint256 expiry;             // Commitment expiry timestamp
        uint256 nonce;              // Unique nonce for replay protection
    }

    struct ActiveOption {
        address taker;              // Option holder
        address lp;                 // Liquidity provider
        address asset;              // Underlying asset
        uint256 amount;             // Asset amount
        uint256 strikePrice;        // Strike price at creation
        uint256 premiumPaid;        // Total premium paid in USDC
        uint256 duration;           // Option duration in days
        uint8 optionType;           // 0 = CALL, 1 = PUT
        uint256 createdAt;          // Creation timestamp
        uint256 expiryTimestamp;    // Option expiry
        bool exercised;             // Whether option has been exercised
        uint256 usdcHeldForPut;     // USDC held from selling WETH (PUT only)
    }

    struct SettlementParams {
        uint8 method;               // Settlement method (1inch router type)
        bytes routingData;          // 1inch routing data
        uint256 minReturn;          // Minimum return amount
        uint256 deadline;           // Settlement deadline
    }

    // Constants
    bytes32 private constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(address creator,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint8 commitmentType,uint256 expiry,uint256 nonce)"
    );

    // State variables
    IERC20 public immutable usdcToken;
    IERC20 public immutable wethToken;
    I1inchRouter public oneInchRouter;
    uint256 public nextOptionId = 1;
    uint256 public protocolFeeRate = 100; // 1% = 100 basis points
    
    mapping(uint256 => ActiveOption) public options;
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    
    // Protocol configuration
    uint256 public minOptionAmount = 0.001 ether; // Minimum 0.001 ETH
    uint256 public maxOptionAmount = 1000 ether; // Maximum 1000 ETH
    
    constructor(
        address _usdcToken,
        address _wethToken,
        address _oneInchRouter,
        address _owner
    ) EIP712("DurationOptions", "1.0") Ownable(_owner) {
        usdcToken = IERC20(_usdcToken);
        wethToken = IERC20(_wethToken);
        oneInchRouter = I1inchRouter(_oneInchRouter);
    }

    /**
     * @notice Take an LP commitment and create an active option
     * @param commitment The LP commitment struct
     * @param signature The EIP-712 signature from the LP
     * @param durationDays The desired option duration in days
     * @param settlementParams Parameters for 1inch settlement (used for PUT options)
     */
    function takeCommitment(
        Commitment calldata commitment,
        bytes calldata signature,
        uint256 durationDays,
        SettlementParams calldata settlementParams
    ) external nonReentrant whenNotPaused returns (uint256 optionId) {
        // Validate basic parameters
        require(durationDays >= commitment.minLockDays, "Duration too short");
        require(durationDays <= commitment.maxDurationDays, "Duration too long");
        require(commitment.amount >= minOptionAmount, "Amount too small");
        require(commitment.amount <= maxOptionAmount, "Amount too large");
        require(commitment.expiry > block.timestamp, "Commitment expired");
        require(!usedNonces[commitment.creator][commitment.nonce], "Nonce already used");

        // Determine LP and taker based on commitment type
        address lp;
        address taker;
        
        if (commitment.commitmentType == CommitmentType.OFFER) {
            // LP created offer, taker is taking it
            lp = commitment.creator;
            taker = msg.sender;
        } else {
            // Taker created demand, LP is fulfilling it
            lp = msg.sender;
            taker = commitment.creator;
        }

        // Verify EIP-712 signature from the commitment creator
        bytes32 structHash = keccak256(abi.encode(
            COMMITMENT_TYPEHASH,
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.dailyPremiumUsdc,
            commitment.minLockDays,
            commitment.maxDurationDays,
            commitment.optionType,
            uint8(commitment.commitmentType),
            commitment.expiry,
            commitment.nonce
        ));
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == commitment.creator, "Invalid signature");

        // Mark nonce as used
        usedNonces[commitment.creator][commitment.nonce] = true;

        // Calculate premium
        uint256 totalPremium = commitment.dailyPremiumUsdc * durationDays;
        require(totalPremium > 0, "Invalid premium");

        // Transfer premium from taker to LP
        usdcToken.safeTransferFrom(taker, lp, totalPremium);

        // Get current price for strike price
        uint256 currentPrice = getCurrentPrice(commitment.asset);
        require(currentPrice > 0, "Invalid price");

        // Transfer WETH from LP to contract
        wethToken.safeTransferFrom(lp, address(this), commitment.amount);

        // Create option
        optionId = nextOptionId++;
        uint256 usdcHeld = 0;

        // For PUT options, immediately sell WETH for USDC
        if (commitment.optionType == 1) {
            // Calculate expected USDC from selling WETH at strike price
            uint256 expectedUsdc = (commitment.amount * currentPrice) / 1e18;
            
            // Sell WETH via 1inch
            wethToken.approve(address(oneInchRouter), commitment.amount);
            uint256 usdcReceived = _sellWethForUsdc(
                commitment.amount,
                expectedUsdc * 99 / 100, // 1% slippage tolerance
                settlementParams
            );
            
            usdcHeld = usdcReceived;
            emit PutOptionCreated(optionId, commitment.amount, usdcReceived);
        }

        options[optionId] = ActiveOption({
            taker: taker,
            lp: lp,
            asset: commitment.asset,
            amount: commitment.amount,
            strikePrice: currentPrice,
            premiumPaid: totalPremium,
            duration: durationDays,
            optionType: commitment.optionType,
            createdAt: block.timestamp,
            expiryTimestamp: block.timestamp + (durationDays * 1 days),
            exercised: false,
            usdcHeldForPut: usdcHeld
        });

        emit CommitmentTaken(
            optionId,
            taker,
            lp,
            commitment.asset,
            commitment.amount,
            currentPrice,
            totalPremium,
            durationDays,
            options[optionId].expiryTimestamp,
            commitment.optionType
        );

        return optionId;
    }

    /**
     * @notice Exercise an active option
     * @param optionId The ID of the option to exercise
     * @param settlementParams Parameters for 1inch settlement
     */
    function exerciseOption(
        uint256 optionId,
        SettlementParams calldata settlementParams
    ) external nonReentrant whenNotPaused {
        ActiveOption storage option = options[optionId];
        require(option.taker == msg.sender, "Not option holder");
        require(!option.exercised, "Already exercised");
        require(block.timestamp <= option.expiryTimestamp, "Option expired");

        // Get current price
        uint256 currentPrice = getCurrentPrice(option.asset);
        require(currentPrice > 0, "Invalid price");

        // Check if option is profitable
        bool isProfitable = false;
        uint256 profit = 0;
        
        if (option.optionType == 0) { // CALL
            isProfitable = currentPrice > option.strikePrice;
            if (isProfitable) {
                // Calculate profit for taker
                profit = ((currentPrice - option.strikePrice) * option.amount) / 1e18;
                
                // Sell WETH at current price
                wethToken.approve(address(oneInchRouter), option.amount);
                uint256 usdcReceived = _sellWethForUsdc(
                    option.amount,
                    (option.amount * currentPrice / 1e18) * 99 / 100,
                    settlementParams
                );
                
                // Pay strike price to LP
                uint256 strikeValue = (option.amount * option.strikePrice) / 1e18;
                usdcToken.safeTransfer(option.lp, strikeValue);
                
                // Profit to taker
                if (usdcReceived > strikeValue) {
                    usdcToken.safeTransfer(msg.sender, usdcReceived - strikeValue);
                }
            }
        } else { // PUT
            isProfitable = currentPrice < option.strikePrice;
            if (isProfitable) {
                // Calculate WETH to buy at current price
                uint256 wethToBuy = option.amount;
                uint256 usdcNeeded = (wethToBuy * currentPrice) / 1e18;
                
                // Buy WETH with held USDC
                require(option.usdcHeldForPut >= usdcNeeded, "Insufficient USDC");
                usdcToken.approve(address(oneInchRouter), usdcNeeded);
                uint256 wethReceived = _buyWethWithUsdc(
                    usdcNeeded,
                    wethToBuy * 99 / 100,
                    settlementParams
                );
                
                // Send WETH to LP
                wethToken.safeTransfer(option.lp, wethReceived);
                
                // Profit to taker (remaining USDC)
                profit = option.usdcHeldForPut - usdcNeeded;
                if (profit > 0) {
                    usdcToken.safeTransfer(msg.sender, profit);
                }
            }
        }
        
        require(isProfitable, "Option not profitable");

        // Mark as exercised
        option.exercised = true;

        emit OptionExercised(optionId, msg.sender, profit);
    }

    /**
     * @notice Settle expired PUT option by returning USDC to LP
     * @param optionId The ID of the expired PUT option
     */
    function settleExpiredOption(uint256 optionId) external nonReentrant {
        ActiveOption storage option = options[optionId];
        require(!option.exercised, "Already exercised");
        require(block.timestamp > option.expiryTimestamp, "Option not expired");
        require(option.optionType == 1, "Only PUT options need settlement");
        require(option.usdcHeldForPut > 0, "No USDC to settle");

        // Mark as exercised to prevent double settlement
        option.exercised = true;

        // Return held USDC to LP
        usdcToken.safeTransfer(option.lp, option.usdcHeldForPut);

        emit ExpiredOptionSettled(optionId, msg.sender);
    }

    /**
     * @notice Sell WETH for USDC via 1inch
     */
    function _sellWethForUsdc(
        uint256 wethAmount,
        uint256 minUsdc,
        SettlementParams calldata params
    ) internal returns (uint256) {
        return oneInchRouter.unoswapTo(
            payable(address(this)),
            address(wethToken),
            wethAmount,
            minUsdc,
            params.routingData
        );
    }

    /**
     * @notice Buy WETH with USDC via 1inch
     */
    function _buyWethWithUsdc(
        uint256 usdcAmount,
        uint256 minWeth,
        SettlementParams calldata params
    ) internal returns (uint256) {
        return oneInchRouter.unoswapTo(
            payable(address(this)),
            address(usdcToken),
            usdcAmount,
            minWeth,
            params.routingData
        );
    }

    /**
     * @notice Get current price of an asset (simplified implementation)
     * @param asset The asset address
     * @return price The current price in USD (8 decimals)
     */
    function getCurrentPrice(address asset) public view returns (uint256 price) {
        // Simplified: return fixed price for WETH
        // In production, this would use Chainlink or 1inch oracle
        if (asset == address(wethToken)) {
            return 3836.50e8; // $3836.50 with 8 decimals
        }
        return 0;
    }

    /**
     * @notice Check if a commitment signature is valid
     * @param commitment The LP commitment struct
     * @param signature The EIP-712 signature
     * @return isValid Whether the signature is valid
     */
    function verifyCommitmentSignature(
        Commitment calldata commitment,
        bytes calldata signature
    ) external view returns (bool isValid) {
        bytes32 structHash = keccak256(abi.encode(
            COMMITMENT_TYPEHASH,
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.dailyPremiumUsdc,
            commitment.minLockDays,
            commitment.maxDurationDays,
            commitment.optionType,
            uint8(commitment.commitmentType),
            commitment.expiry,
            commitment.nonce
        ));
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        return signer == commitment.creator && !usedNonces[commitment.creator][commitment.nonce];
    }

    // Admin functions
    function setOneInchRouter(address _oneInchRouter) external onlyOwner {
        oneInchRouter = I1inchRouter(_oneInchRouter);
    }

    function setProtocolFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 1000, "Fee too high"); // Max 10%
        protocolFeeRate = _feeRate;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency functions
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}