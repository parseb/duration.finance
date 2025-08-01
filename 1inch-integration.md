# 1inch Integration Guide

This document explains how Duration.Finance integrates with 1inch for pricing, settlement, and liquidity aggregation.

## Overview

Duration.Finance uses 1inch as the primary settlement layer for options exercise and asset swaps. The integration provides:

- **Real-time asset pricing** via 1inch price APIs
- **Optimal swap routing** through 1inch aggregation protocols
- **Settlement execution** via 1inch routers (Limit Order Protocol, UnoswapRouter, GenericRouter)
- **Revenue capture** through favorable execution and safety margins

## Architecture Components

### 1. OneInchSettlementRouter Contract

**Location**: `src/settlement/OneInchSettlementRouter.sol`

The settlement router acts as an interface layer between Duration.Finance and 1inch protocols:

```solidity
contract OneInchSettlementRouter {
    // 1inch router addresses on Base
    address public constant ONEINCH_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;
    address public constant LIMIT_ORDER_PROTOCOL = 0x111111125421cA6dc452d289314280a0f8842A65;
    
    enum SettlementMethod {
        LIMIT_ORDER,    // 1inch Limit Order Protocol
        UNOSWAP,        // 1inch UnoswapRouter
        GENERIC         // 1inch GenericRouter
    }
    
    function executeSettlement(
        SettlementParams calldata params
    ) external returns (uint256 amountOut);
}
```

**Key Features**:
- Unified interface for all 1inch settlement methods
- Safety margin enforcement (default 0.01%)
- Slippage protection with `minReturn` parameters
- Revenue capture through execution price differentials

### 2. Settlement Methods

#### **Limit Order Protocol**
- **Use Case**: Complex options settlements with specific execution conditions
- **Benefits**: Advanced order types, conditional execution, gas optimization
- **Implementation**: Structured settlement orders with deadline and slippage protection

#### **UnoswapRouter** 
- **Use Case**: Simple asset swaps for option exercise
- **Benefits**: Low gas costs, direct DEX routing
- **Implementation**: Direct token-to-token swaps with minimal overhead

#### **GenericRouter**
- **Use Case**: Multi-hop settlements requiring complex routing
- **Benefits**: Access to deepest liquidity across all DEXs
- **Implementation**: Complex routing through multiple liquidity sources

### 3. Pricing Integration

#### **getCurrentPrice() Implementation**

```solidity
function getCurrentPrice(address asset) external view returns (uint256) {
    // Integration with 1inch price API
    // For production, replace with actual 1inch oracle calls
    if (asset == WETH) {
        return 3836500000000000000000; // $3,836.50 in 18 decimals
    }
    return 0;
}
```

**Production Implementation**:
1. Call 1inch price API: `https://api.1inch.io/v5.0/8453/quote`
2. Parse response for optimal execution price
3. Apply safety margins for protocol revenue
4. Cache prices with appropriate TTL

#### **Premium Calculation with 1inch Pricing**

```solidity
function calculatePremiumForDuration(
    OptionCommitment calldata commitment, 
    uint256 durationDays
) external view returns (uint256) {
    return commitment.dailyPremiumUsdc * durationDays;
}
```

**LP Yield Metrics**:
```solidity
function getLPYieldMetrics(
    OptionCommitment calldata commitment,
    uint256 currentPrice
) external view returns (uint256 dailyYield, uint256 annualizedYield) {
    uint256 collateralValueUsdc = (commitment.amount * currentPrice) / 1e30;
    dailyYield = (commitment.dailyPremiumUsdc * 10000) / collateralValueUsdc;
    annualizedYield = dailyYield * 365;
}
```

## Settlement Flow

### 1. Option Exercise Trigger

When an option becomes profitable:

```solidity
function exerciseOption(uint256 optionId) external {
    ActiveOption memory option = options[optionId];
    uint256 currentPrice = getCurrentPrice(option.asset);
    
    // Check profitability
    bool isProfitable = (option.optionType == OptionType.CALL) 
        ? currentPrice > option.strikePrice
        : currentPrice < option.strikePrice;
    
    require(isProfitable, "Option not profitable");
    
    // Execute settlement via 1inch
    _executeSettlement(option);
}
```

### 2. 1inch Settlement Execution

```solidity
function _executeSettlement(ActiveOption memory option) internal {
    SettlementParams memory params = SettlementParams({
        method: _determineOptimalMethod(option),
        routingData: _get1inchRouting(option),
        minReturn: _calculateMinReturn(option),
        deadline: block.timestamp + 300 // 5 minute deadline
    });
    
    uint256 amountOut = settlementRouter.executeSettlement(params);
    _distributeProceeds(option, amountOut);
}
```

### 3. Revenue Distribution

```solidity
function _distributeProceeds(
    ActiveOption memory option, 
    uint256 amountOut
) internal {
    uint256 safetyMarginFee = (amountOut * safetyMargin) / 10000;
    uint256 lpPayout = option.strikePrice; // LP gets their target price
    uint256 takerProfit = amountOut - safetyMarginFee - lpPayout;
    
    // Transfer proceeds
    IERC20(USDC).transfer(option.lp, lpPayout);
    IERC20(USDC).transfer(option.taker, takerProfit);
    
    // Protocol revenue to DUR token contract
    IERC20(USDC).transfer(durTokenAddress, safetyMarginFee);
}
```

## API Integration

### 1inch Price API Integration

**Endpoint**: `https://api.1inch.io/v5.0/8453/quote`
**Network**: Base (Chain ID: 8453)

```typescript
interface OneInchQuoteParams {
  fromTokenAddress: string;    // Source token (e.g., WETH)
  toTokenAddress: string;      // Destination token (e.g., USDC)
  amount: string;              // Amount in wei
  fee?: string;                // Protocol fee (0.01% = "0.01")
  gasLimit?: string;           // Gas limit for transaction
  connectorTokens?: string;    // Connector tokens for routing
}

interface OneInchQuoteResponse {
  fromToken: Token;
  toToken: Token;
  toTokenAmount: string;       // Expected output amount
  fromTokenAmount: string;     // Input amount
  protocols: Protocol[][];     // Routing path
  estimatedGas: number;        // Gas estimation
}
```

### Frontend Integration

```typescript
// lib/1inch/pricing.ts
export async function get1inchPrice(
  fromToken: string,
  toToken: string,
  amount: bigint
): Promise<bigint> {
  const response = await fetch(
    `https://api.1inch.io/v5.0/8453/quote?` +
    `fromTokenAddress=${fromToken}&` +
    `toTokenAddress=${toToken}&` +
    `amount=${amount.toString()}&` +
    `fee=0.01` // 0.01% protocol fee
  );
  
  const data = await response.json();
  return BigInt(data.toTokenAmount);
}
```

## Contract Deployment Addresses

### Base Mainnet
- **1inch Router**: `0x111111125421cA6dc452d289314280a0f8842A65`
- **Limit Order Protocol**: `0x111111125421cA6dc452d289314280a0f8842A65`
- **WETH**: `0x4200000000000000000000000000000000000006`
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### Base Testnet (Sepolia)
- **1inch Router**: `0x111111125421cA6dc452d289314280a0f8842A65`
- **WETH**: `0x4200000000000000000000000000000000000006`
- **USDC**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Revenue Model

### 1. Safety Margin Fees
- **Default**: 0.01% on all 1inch settlements
- **Governance**: Adjustable by DUR token holders
- **Purpose**: Covers slippage risk and protocol operations

### 2. Slippage Capture
- **Mechanism**: Favorable execution price vs. quoted price
- **Example**: Quote $3,800, Execute $3,810 → $10 profit per ETH
- **Distribution**: 100% to DUR token contract

### 3. Buy-back Arbitrage
- **Scenario**: Unprofitable option exercise attempts
- **Action**: Protocol buys back asset cheaper than forward price
- **Profit**: Difference between forward price and market execution

### 4. Simple Swap Optimization
- **Trigger**: Current price better than LP target price
- **Execution**: Immediate swap at current market price
- **Revenue**: Protocol keeps (current_price - target_price) difference

## Implementation Checklist

### Smart Contracts
- [x] OneInchSettlementRouter.sol implementation
- [x] Settlement method selection logic
- [x] Safety margin enforcement
- [x] Revenue distribution mechanisms
- [ ] Production 1inch oracle integration
- [ ] Mainnet deployment and verification

### Frontend Integration
- [ ] 1inch price API integration
- [ ] Real-time pricing updates
- [ ] Settlement transaction monitoring
- [ ] Gas estimation for settlements
- [ ] User-friendly settlement confirmations

### Testing
- [x] Mock 1inch integration tests
- [x] Settlement flow unit tests
- [ ] Mainnet fork testing with real 1inch contracts
- [ ] Integration testing with live price feeds
- [ ] Gas optimization testing

### Monitoring
- [ ] Settlement success/failure tracking
- [ ] Revenue capture analytics
- [ ] 1inch API performance monitoring
- [ ] Slippage and execution price analysis

## Security Considerations

### 1. Price Manipulation Protection
- **MEV Protection**: Short settlement deadlines (5 minutes)
- **Slippage Limits**: Enforced `minReturn` parameters
- **Oracle Validation**: Cross-reference multiple price sources

### 2. Settlement Validation
- **Pre-execution Checks**: Verify option profitability
- **Post-execution Validation**: Confirm expected output amounts
- **Revert Protection**: Handle failed 1inch settlements gracefully

### 3. Access Controls
- **Settlement Authority**: Only options contract can trigger settlements
- **Emergency Pause**: Owner can pause settlement router
- **Upgrade Safety**: Timelock for critical parameter changes

## Gas Optimization

### 1. Settlement Method Selection
```solidity
function _determineOptimalMethod(
    ActiveOption memory option
) internal view returns (uint8) {
    uint256 amount = option.amount;
    
    // Large amounts: Use GenericRouter for best price
    if (amount > 10 ether) return uint8(SettlementMethod.GENERIC);
    
    // Medium amounts: Use UnoswapRouter for gas efficiency
    if (amount > 1 ether) return uint8(SettlementMethod.UNOSWAP);
    
    // Small amounts: Use Limit Order for precision
    return uint8(SettlementMethod.LIMIT_ORDER);
}
```

### 2. Batch Operations
- **Multiple Options**: Batch settle multiple options in single transaction
- **Gas Estimation**: Pre-calculate gas requirements via 1inch API
- **Priority Optimization**: Settle most profitable options first

## Future Enhancements

### 1. Advanced Order Types
- **Stop-Loss Orders**: Automatic exercise at specific price levels
- **Take-Profit Orders**: Partial exercise at target profit levels
- **Time-Weighted Execution**: Gradual exercise over time periods

### 2. Cross-Chain Settlement
- **Multi-Chain Support**: Ethereum, Arbitrum, Optimism, Polygon
- **Bridge Integration**: Automatic cross-chain asset transfers
- **Unified Liquidity**: Aggregate liquidity across all supported chains

### 3. Institutional Features
- **Private Mempool**: MEV protection for large settlements
- **Custom Routing**: Institution-specific liquidity sources
- **Risk Management**: Advanced hedging and position management

## Conclusion

The 1inch integration provides Duration.Finance with:
- **Best Execution**: Access to deepest on-chain liquidity
- **Gas Efficiency**: Optimized routing reduces transaction costs
- **Revenue Generation**: Multiple profit capture mechanisms
- **Scalability**: Support for options of all sizes and complexities

This integration ensures that Duration.Finance can offer competitive option pricing while maintaining protocol profitability and user satisfaction.