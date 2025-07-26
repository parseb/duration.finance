// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title I1inch
 * @author Duration.Finance
 * @notice Interfaces for 1inch protocol integration
 */

interface ILimitOrderProtocol {
    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;
        uint256 makingAmount;
        uint256 takingAmount;
        bytes makerAssetData;
        bytes takerAssetData;
        bytes getMakingAmount;
        bytes getTakingAmount;
        bytes predicate;
        bytes interaction;
    }
    
    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external payable returns (uint256 actualMakingAmount, uint256 actualTakingAmount);
    
    function cancelOrder(Order calldata order) external;
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

interface IUnoswapRouter {
    function unoswap(
        address token,
        uint256 amount,
        uint256 minReturn,
        address dex
    ) external returns (uint256 returnAmount);
    
    function unoswapTo(
        address to,
        address token,
        uint256 amount,
        uint256 minReturn,
        address dex
    ) external returns (uint256 returnAmount);
    
    function ethUnoswap(
        uint256 minReturn,
        address dex
    ) external payable returns (uint256 returnAmount);
    
    function ethUnoswapTo(
        address to,
        uint256 minReturn,
        address dex
    ) external payable returns (uint256 returnAmount);
}

interface IAggregationRouterV5 {
    struct SwapDescription {
        address srcToken;
        address dstToken;
        address srcReceiver;
        address dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
        bytes permit;
    }
    
    function swap(
        address executor,
        SwapDescription calldata desc,
        bytes calldata permit,
        bytes calldata data
    ) external payable returns (uint256 returnAmount, uint256 spentAmount);
    
    function unoswap(
        address srcToken,
        uint256 amount,
        uint256 minReturn,
        address dex
    ) external returns (uint256 returnAmount);
}

interface I1inchOracle {
    function getRateToEth(address srcToken, bool useSrcWrappers) external view returns (uint256 weightedRate);
    function getRate(address srcToken, address dstToken, bool useWrappers) external view returns (uint256 weightedRate);
}

/**
 * @title Settlement Router Interface
 * @notice Unified interface for all 1inch settlement methods
 */
interface ISettlementRouter {
    enum SettlementMethod {
        LIMIT_ORDER,
        UNOSWAP, 
        GENERIC_ROUTER
    }
    
    struct SettlementResult {
        uint256 amountIn;
        uint256 amountOut;
        uint256 protocolFee;
        uint256 gasUsed;
    }
    
    function executeSettlement(
        SettlementMethod method,
        address tokenIn,
        address tokenOut,  
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) external returns (SettlementResult memory result);
    
    function getSettlementQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut, SettlementMethod optimalMethod, bytes memory routingData);
}