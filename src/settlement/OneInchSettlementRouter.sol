// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISettlementRouter} from "../interfaces/I1inch.sol";

/**
 * @title OneInchSettlementRouter
 * @notice Settlement router that integrates with 1inch protocols for asset swaps
 * @dev Implements settlement through 1inch UnoswapRouter for optimal execution
 */
contract OneInchSettlementRouter is ISettlementRouter, Ownable {
    using SafeERC20 for IERC20;

    // 1inch contract addresses on Base
    address public constant ONEINCH_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65; // 1inch Router v5
    address public constant ONEINCH_UNOSWAP = 0x111111125421cA6dc452d289314280a0f8842A65; // UnoswapRouter
    
    // Events
    event SettlementExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        SettlementMethod method
    );

    error SettlementFailed();
    error InsufficientOutput();
    error InvalidRouter();

    constructor(address _initialOwner) Ownable(_initialOwner) {}

    /**
     * @notice Execute settlement through 1inch
     * @param method Settlement method to use
     * @param tokenIn Input token address
     * @param tokenOut Output token address  
     * @param amountIn Amount of input token
     * @param minAmountOut Minimum acceptable output amount
     * @param routingData Encoded routing data for 1inch
     * @return result Settlement result with amount received
     */
    function executeSettlement(
        SettlementMethod method,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) external override returns (SettlementResult memory result) {
        
        // Transfer tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        
        uint256 amountOut;
        
        if (method == SettlementMethod.UNOSWAP) {
            amountOut = _executeUnoswap(tokenIn, tokenOut, amountIn, minAmountOut, routingData);
        } else if (method == SettlementMethod.LIMIT_ORDER) {
            amountOut = _executeLimitOrder(tokenIn, tokenOut, amountIn, minAmountOut, routingData);
        } else if (method == SettlementMethod.GENERIC_ROUTER) {
            amountOut = _executeGenericRouter(tokenIn, tokenOut, amountIn, minAmountOut, routingData);
        } else {
            revert SettlementFailed();
        }

        if (amountOut < minAmountOut) {
            revert InsufficientOutput();
        }

        // Transfer output tokens back to caller
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        result = SettlementResult({
            amountIn: amountIn,
            amountOut: amountOut,
            protocolFee: 0,
            gasUsed: 0 // Can be calculated if needed
        });

        emit SettlementExecuted(tokenIn, tokenOut, amountIn, amountOut, method);
    }

    /**
     * @notice Execute swap through 1inch UnoswapRouter
     */
    function _executeUnoswap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        
        // Approve 1inch router to spend our tokens
        IERC20(tokenIn).forceApprove(ONEINCH_UNOSWAP, amountIn);
        
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // Execute the swap through 1inch UnoswapRouter
        // The routingData contains the encoded function call for unoswap
        (bool success, ) = ONEINCH_UNOSWAP.call(routingData);
        if (!success) revert SettlementFailed();
        
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        
        if (amountOut < minAmountOut) {
            revert InsufficientOutput();
        }
        
        return amountOut;
    }

    /**
     * @notice Execute through 1inch Limit Order Protocol
     */
    function _executeLimitOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        
        // Approve 1inch router
        IERC20(tokenIn).forceApprove(ONEINCH_ROUTER, amountIn);
        
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // Execute limit order through 1inch
        (bool success, ) = ONEINCH_ROUTER.call(routingData);
        if (!success) revert SettlementFailed();
        
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        
        return amountOut;
    }

    /**
     * @notice Execute through 1inch Generic Router
     */
    function _executeGenericRouter(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routingData
    ) internal returns (uint256 amountOut) {
        
        // Approve 1inch router
        IERC20(tokenIn).forceApprove(ONEINCH_ROUTER, amountIn);
        
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // Execute swap through 1inch router
        (bool success, ) = ONEINCH_ROUTER.call(routingData);
        if (!success) revert SettlementFailed();
        
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        
        return amountOut;
    }

    /**
     * @notice Get settlement quote from 1inch (implements interface requirement)
     * @dev This would typically call 1inch API for quotes
     */
    function getSettlementQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view override returns (uint256 amountOut, SettlementMethod optimalMethod, bytes memory routingData) {
        // This is a placeholder - in practice this would:
        // 1. Call 1inch API to get the best quote
        // 2. Return the expected output and optimal method
        
        // For now, return realistic mock data for testing
        // Real implementation would integrate with 1inch API
        
        // Base addresses for testing
        address WETH = 0x4200000000000000000000000000000000000006;
        address USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        
        if (tokenIn == WETH && tokenOut == USDC) {
            // WETH -> USDC: $3500 per ETH, USDC has 6 decimals
            amountOut = (amountIn * 3500) / 1e12; // Convert from 18 to 6 decimals and apply price
        } else if (tokenIn == USDC && tokenOut == WETH) {
            // USDC -> WETH: 1/3500 ETH per USDC
            amountOut = (amountIn * 1e12) / 3500; // Convert from 6 to 18 decimals and apply price
        } else {
            // Default 1:1 for other pairs
            amountOut = amountIn;
        }
        
        optimalMethod = SettlementMethod.UNOSWAP; // Default to unoswap
        routingData = ""; // Empty routing data
    }

    /**
     * @notice Emergency function to recover stuck tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}