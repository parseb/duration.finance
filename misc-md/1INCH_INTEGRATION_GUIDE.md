# 1inch Integration Guide for Duration.Finance

## Overview

Duration.Finance integrates with 1inch protocols for options settlement. This guide documents the specific integration patterns, encoding requirements, and implementation details for seamless settlement execution.

## Supported 1inch Components

### 1. Limit Order Protocol (Recommended)
**Use Case**: Structured settlement orders with specific execution conditions
**Contract Address (Base)**: `0x111111125421cA6dc452d289314280a0f8842A65`

```solidity
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
}
```

**Integration Pattern for Options Settlement**:
```solidity
function settleOptionViaLimitOrder(
    uint256 optionId,
    ILimitOrderProtocol.Order calldata order,
    bytes calldata signature
) external {
    Position memory position = activePositions[optionId];
    require(isExercisable(position), "Option not exercisable");
    
    // Execute limit order for settlement
    (uint256 actualMaking, uint256 actualTaking) = limitOrderProtocol.fillOrder(
        order,
        signature,
        position.amount,
        calculateMinimumReturn(position)
    );
    
    // Distribute settlement proceeds
    distributeSettlementProceeds(optionId, actualTaking);
}
```

### 2. UnoswapRouter
**Use Case**: Simple swap-based settlements with single or multi-hop routes
**Best For**: Direct WETH/USDC settlements

```solidity
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
}
```

**Integration Pattern**:
```solidity
function settleOptionViaUnoswap(
    uint256 optionId,
    address dexPool,
    uint256 minReturn
) external {
    Position memory position = activePositions[optionId];
    require(isExercisable(position), "Option not exercisable");
    
    // Approve token transfer
    IERC20(position.asset).approve(address(unoswapRouter), position.amount);
    
    // Execute swap
    uint256 returnAmount = unoswapRouter.unoswapTo(
        address(this),
        position.asset,
        position.amount,
        minReturn,
        dexPool
    );
    
    // Distribute proceeds with safety margin
    uint256 protocolFee = (returnAmount * safetyMargin) / 10000;
    distributeWithFee(optionId, returnAmount - protocolFee, protocolFee);
}
```

### 3. GenericRouter (AggregationRouterV5)
**Use Case**: Complex multi-hop settlements with optimal routing
**Best For**: Large trades requiring best execution

```solidity
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
}
```

**Integration Pattern**:
```solidity
function settleOptionViaGenericRouter(
    uint256 optionId,
    address executor,
    IAggregationRouterV5.SwapDescription calldata desc,
    bytes calldata data
) external {
    Position memory position = activePositions[optionId];
    require(isExercisable(position), "Option not exercisable");
    require(desc.srcToken == position.asset, "Asset mismatch");
    
    // Execute aggregated swap
    (uint256 returnAmount, uint256 spentAmount) = aggregationRouter.swap(
        executor,
        desc,
        "",
        data
    );
    
    // Verify execution and distribute
    require(spentAmount <= position.amount, "Excessive spending");
    distributeSettlementProceeds(optionId, returnAmount);
}
```

## Settlement Architecture

### Unified Settlement Interface

```solidity
contract DurationSettlement {
    enum SettlementMethod {
        LIMIT_ORDER,
        UNOSWAP,
        GENERIC_ROUTER
    }
    
    struct SettlementParams {
        SettlementMethod method;
        bytes routingData;
        uint256 minReturn;
        uint256 deadline;
    }
    
    /**
     * @notice Execute option settlement through optimal 1inch router
     * @param optionId The option to settle
     * @param params Settlement parameters including routing method and data
     */
    function settleOption(
        uint256 optionId,
        SettlementParams calldata params
    ) external {
        Position memory position = activePositions[optionId];
        require(isExercisable(position), "Option not exercisable");
        require(block.timestamp <= params.deadline, "Settlement expired");
        
        uint256 proceeds;
        
        if (params.method == SettlementMethod.LIMIT_ORDER) {
            proceeds = _settleLimitOrder(position, params.routingData);
        } else if (params.method == SettlementMethod.UNOSWAP) {
            proceeds = _settleUnoswap(position, params.routingData, params.minReturn);
        } else {
            proceeds = _settleGenericRouter(position, params.routingData);
        }
        
        require(proceeds >= params.minReturn, "Insufficient return");
        _distributeProceeds(optionId, proceeds);
    }
}
```

### Price Discovery Integration

```solidity
/**
 * @notice Get optimal settlement quote from 1inch
 * @param fromToken Source token address
 * @param toToken Destination token address
 * @param amount Amount to swap
 * @return quote Settlement quote with routing information
 */
function getSettlementQuote(
    address fromToken,
    address toToken,
    uint256 amount
) external view returns (SettlementQuote memory quote) {
    // Use 1inch API or on-chain oracle for price discovery
    // Return quote with optimal routing method and expected return
}
```

## Settlement Revenue Capture

### Safety Margin Implementation

```solidity
contract DurationRevenue {
    uint256 public safetyMargin = 100; // 0.01% in basis points
    address public durToken;
    
    /**
     * @notice Capture protocol revenue from settlement
     * @param settlementAmount Total amount received from 1inch
     * @param expectedAmount Expected amount based on oracle price
     */
    function captureSettlementRevenue(
        uint256 settlementAmount,
        uint256 expectedAmount
    ) internal {
        // Capture safety margin
        uint256 marginFee = (settlementAmount * safetyMargin) / 10000;
        
        // Capture favorable slippage
        uint256 slippageCapture = settlementAmount > expectedAmount ? 
            settlementAmount - expectedAmount : 0;
        
        uint256 totalRevenue = marginFee + slippageCapture;
        
        if (totalRevenue > 0) {
            // Send revenue to DUR token contract
            (bool success,) = durToken.call{value: totalRevenue}("");
            require(success, "Revenue transfer failed");
        }
    }
}
```

### Buy-back Arbitrage

```solidity
/**
 * @notice Handle unprofitable sell options by buying back asset cheaper
 * @param position The option position
 * @param currentPrice Current market price
 */
function handleUnprofitableSell(
    Position memory position,
    uint256 currentPrice
) internal {
    if (position.isCall && currentPrice <= position.strikePrice) {
        // Buy back asset at current price, return at strike price to LP
        uint256 buybackCost = currentPrice * position.amount;
        uint256 lpReturn = position.strikePrice * position.amount;
        uint256 profit = lpReturn - buybackCost;
        
        // Execute buyback through 1inch
        _executeBuyback(position.asset, position.amount, buybackCost);
        
        // Return asset to LP
        IERC20(position.asset).transfer(position.lp, position.amount);
        
        // Capture profit
        captureArbitrageProfit(profit);
    }
}
```

## Error Handling & Edge Cases

### Settlement Failures

```solidity
/**
 * @notice Handle failed settlements with fallback mechanisms
 */
function handleSettlementFailure(uint256 optionId) external {
    Position storage position = activePositions[optionId];
    
    // Try alternative settlement methods
    if (!_tryLimitOrderSettlement(position)) {
        if (!_tryUnoswapSettlement(position)) {
            if (!_tryGenericRouterSettlement(position)) {
                // Fallback: return assets to LP, refund premium to taker
                _executeFailsafeFallback(optionId);
            }
        }
    }
}
```

### Gas Optimization

```solidity
/**
 * @notice Gas-optimized settlement for small positions
 */
function settleMicro(uint256 optionId) external {
    Position memory position = activePositions[optionId];
    require(position.amount <= 0.1 ether, "Use standard settlement");
    
    // Use most gas-efficient method (usually Unoswap)
    _settleUnoswap(position, _getOptimalDex(position.asset), 0);
}
```

## Testing Framework

### Mainnet Fork Testing

```solidity
contract SettlementTest is Test {
    function testLimitOrderSettlement() public {
        // Fork mainnet at specific block
        vm.createFork("https://base-mainnet.g.alchemy.com/v2/API_KEY", 12345678);
        
        // Setup position
        Position memory position = _createTestPosition();
        
        // Execute settlement
        uint256 proceeds = settlement.settleOption(1, _getLimitOrderParams());
        
        // Verify results
        assertGt(proceeds, position.strikePrice * position.amount);
    }
}
```

## API Integration Examples

### Frontend Integration

```typescript
// Get settlement quote
const quote = await fetch('/api/settlement/quote', {
  method: 'POST',
  body: JSON.stringify({
    optionId: 1,
    method: 'LIMIT_ORDER'
  })
});

// Execute settlement
const txData = await contract.populateTransaction.settleOption(
  optionId,
  settlementParams
);
```

### Backend Quote Service

```typescript
// 1inch API integration for quotes
async function get1inchQuote(fromToken: string, toToken: string, amount: string) {
  const response = await fetch(
    `https://api.1inch.dev/swap/v6.0/8453/quote?src=${fromToken}&dst=${toToken}&amount=${amount}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return response.json();
}
```

This integration guide provides the foundation for implementing 1inch settlement in Duration.Finance options protocol. The modular design allows for optimal routing selection based on trade size, gas costs, and market conditions.