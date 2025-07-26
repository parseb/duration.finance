// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ISettlementRouter, ILimitOrderProtocol, IUnoswapRouter, IAggregationRouterV5, I1inchOracle} from "./interfaces/I1inch.sol";

/**
 * @title SettlementRouter
 * @author Duration.Finance
 * @notice Unified router for 1inch settlement methods
 * @dev Routes options settlement through optimal 1inch protocol
 */
contract SettlementRouter is ISettlementRouter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 1inch Contract Addresses (Base)
    address public constant LIMIT_ORDER_PROTOCOL = 0x111111125421cA6dc452d289314280a0f8842A65;
    address public constant UNOSWAP_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;
    address public constant AGGREGATION_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;
    address public constant ORACLE = 0x0AdDd25a91563696D8567Df78D5A01C9a991F9B8;

    // Protocol parameters
    address public immutable optionsProtocol;
    uint256 public protocolFee = 100; // 0.01% in basis points

    error UnauthorizedCaller();
    error SettlementFailed();
    error InvalidMethod();
    error InsufficientOutput();
    error InvalidTokens();

    modifier onlyOptionsProtocol() {
        if (msg.sender != optionsProtocol) revert UnauthorizedCaller();
        _;
    }

    constructor(address _optionsProtocol) {
        optionsProtocol = _optionsProtocol;
    }

    /**
     * @notice Execute settlement through optimal 1inch method
     * @param method Settlement method to use
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input tokens
     * @param minAmountOut Minimum output amount
     * @param routingData Encoded routing parameters
     * @return result Settlement result with amounts and fees
     */
    function executeSettlement(
        SettlementMethod method,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) external override onlyOptionsProtocol nonReentrant returns (SettlementResult memory result) {
        if (tokenIn == address(0) || tokenOut == address(0)) revert InvalidTokens();
        
        uint256 initialBalance = IERC20(tokenOut).balanceOf(address(this));
        uint256 gasStart = gasleft();

        if (method == SettlementMethod.LIMIT_ORDER) {
            result.amountOut = _executeLimitOrder(tokenIn, tokenOut, amountIn, routingData);
        } else if (method == SettlementMethod.UNOSWAP) {
            result.amountOut = _executeUnoswap(tokenIn, tokenOut, amountIn, minAmountOut, routingData);
        } else if (method == SettlementMethod.GENERIC_ROUTER) {
            result.amountOut = _executeGenericRouter(tokenIn, tokenOut, amountIn, minAmountOut, routingData);
        } else {
            revert InvalidMethod();
        }

        if (result.amountOut < minAmountOut) revert InsufficientOutput();

        // Calculate protocol fee
        result.protocolFee = (result.amountOut * protocolFee) / 10000;
        result.amountIn = amountIn;
        result.gasUsed = gasStart - gasleft();

        // Transfer tokens back to options protocol
        IERC20(tokenOut).safeTransfer(optionsProtocol, result.amountOut);
    }

    /**
     * @notice Get settlement quote for given parameters
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input tokens
     * @return amountOut Expected output amount
     * @return optimalMethod Recommended settlement method
     * @return routingData Encoded routing data for optimal method
     */
    function getSettlementQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view override returns (
        uint256 amountOut,
        SettlementMethod optimalMethod,
        bytes memory routingData
    ) {
        // Get oracle price for baseline
        uint256 oracleRate = I1inchOracle(ORACLE).getRate(tokenIn, tokenOut, true);
        amountOut = (amountIn * oracleRate) / 1e18;

        // For MVP, default to UNOSWAP for simplicity
        optimalMethod = SettlementMethod.UNOSWAP;
        
        // Encode default Uniswap V3 pool for WETH/USDC
        routingData = abi.encode(
            0x4200000000000000000000000000000000000006, // WETH
            uint24(500) // 0.05% fee tier
        );
    }

    /**
     * @notice Execute settlement via Limit Order Protocol
     * @param tokenIn Input token
     * @param tokenOut Output token  
     * @param amountIn Input amount
     * @param routingData Encoded order and signature
     * @return amountOut Output amount received
     */
    function _executeLimitOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        (ILimitOrderProtocol.Order memory order, bytes memory signature) = 
            abi.decode(routingData, (ILimitOrderProtocol.Order, bytes));

        // Validate order matches our requirements
        require(order.makerAsset == tokenIn, "Invalid maker asset");
        require(order.takerAsset == tokenOut, "Invalid taker asset");

        // Approve and execute order
        IERC20(tokenIn).forceApprove(LIMIT_ORDER_PROTOCOL, amountIn);
        
        (, uint256 actualTakingAmount) = ILimitOrderProtocol(LIMIT_ORDER_PROTOCOL).fillOrder(
            order,
            signature,
            amountIn,
            0 // Let protocol determine taking amount
        );

        amountOut = actualTakingAmount;
    }

    /**
     * @notice Execute settlement via Unoswap Router
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param amountIn Input amount
     * @param minAmountOut Minimum output
     * @param routingData Encoded DEX pool address
     * @return amountOut Output amount received
     */
    function _executeUnoswap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        address dexPool = abi.decode(routingData, (address));
        
        // Approve tokens
        IERC20(tokenIn).forceApprove(UNOSWAP_ROUTER, amountIn);

        // Execute swap
        amountOut = IUnoswapRouter(UNOSWAP_ROUTER).unoswapTo(
            address(this),
            tokenIn,
            amountIn,
            minAmountOut,
            dexPool
        );
    }

    /**
     * @notice Execute settlement via Generic Aggregation Router
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param amountIn Input amount
     * @param minAmountOut Minimum output
     * @param routingData Encoded swap description and execution data
     * @return amountOut Output amount received
     */
    function _executeGenericRouter(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        (
            address executor,
            IAggregationRouterV5.SwapDescription memory desc,
            bytes memory data
        ) = abi.decode(routingData, (address, IAggregationRouterV5.SwapDescription, bytes));

        // Validate swap description
        require(desc.srcToken == tokenIn, "Invalid source token");
        require(desc.dstToken == tokenOut, "Invalid destination token");
        require(desc.amount == amountIn, "Invalid amount");

        // Approve tokens
        IERC20(tokenIn).forceApprove(AGGREGATION_ROUTER, amountIn);

        // Execute swap
        (uint256 returnAmount,) = IAggregationRouterV5(AGGREGATION_ROUTER).swap(
            executor,
            desc,
            "",
            data
        );

        amountOut = returnAmount;
    }

    /**
     * @notice Get optimal DEX pool for Unoswap routing
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @return poolAddress Address of optimal pool
     */
    function getOptimalPool(address tokenIn, address tokenOut) external pure returns (address poolAddress) {
        // For MVP, return Uniswap V3 WETH/USDC pool
        // In production, this would query multiple DEXes for best rates
        if ((tokenIn == 0x4200000000000000000000000000000000000006 && // WETH
             tokenOut == 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) || // USDC
            (tokenIn == 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 && // USDC
             tokenOut == 0x4200000000000000000000000000000000000006)) { // WETH
            return 0xd0b53D9277642d899DF5C87A3966A349A798F224; // Base Uniswap V3 WETH/USDC 0.05%
        }
        
        return address(0); // Fallback - would need proper pool discovery
    }

    /**
     * @notice Emergency token recovery
     * @param token Token to recover
     * @param amount Amount to recover
     */
    function emergencyRecoverToken(address token, uint256 amount) external {
        require(msg.sender == optionsProtocol, "Only options protocol");
        IERC20(token).safeTransfer(optionsProtocol, amount);
    }

    /**
     * @notice Update protocol fee
     * @param newFee New fee in basis points
     */
    function updateProtocolFee(uint256 newFee) external {
        require(msg.sender == optionsProtocol, "Only options protocol");
        require(newFee <= 1000, "Fee too high"); // Max 10%
        protocolFee = newFee;
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}