# Duration.Finance Economic Specification

## Overview

Duration.Finance is a fully-collateralized options protocol using 1inch for settlement, where liquidity providers (LPs) create signed commitments and option takers pay premiums for directional exposure.

**Fee Structure**: Frontend users have free access to all features. External API agents pay $1 USDC per commitment creation via the x402 payment protocol.

## Core Economic Model

### Liquidity Provider (LP) Economics

#### LP Offer Structure
- **Asset Provision**: LP specifies amount of underlying asset (initially WETH only, 0.1-1000 units)
- **Target Price**: LP sets desired exit price for their asset
- **Premium Calculation**: `Premium = |Current Price - LP Target Price|`
- **Duration**: LP sets maximum time before liquidity must be returned
- **Fractionability**: LP chooses if position can be split into smaller options

#### LP Revenue Streams
1. **Premium Collection**: Receives premium when option is taken
2. **Target Price Fulfillment**: Gets specified target price on profitable exercise
3. **Asset Return**: Gets asset back if option expires worthless or unprofitable

#### Example LP Flow
```
LP offers: 1 ETH at target price $4,000
Current ETH price: $3,900
Premium: $100 per ETH
When taken: LP receives $100 premium immediately
If ETH goes to $4,200: LP receives $4,000, taker gets $200 profit
If ETH stays at $3,900: LP gets 1 ETH back
```

### Option Taker Economics

#### Cost Structure
- **Premium Payment**: Pays upfront premium in USDC/ETH
- **No Additional Fees**: Full collateralization means no liquidation risk

#### Profit Mechanism
- **Call Options**: Profit when asset price > LP target price
- **Put Options**: Profit when asset price < LP target price
- **Maximum Profit**: Unlimited (calls) or LP target price minus current price (puts)
- **Maximum Loss**: Limited to premium paid

#### Example Taker Flow
```
Takes LP offer: 1 ETH option, pays $100 premium
LP target: $4,000, Current: $3,900
If ETH hits $4,200: Taker profit = $4,200 - $4,000 = $200
Total return: $200 - $100 = $100 net profit (100% return)
If ETH stays below $4,000: Loses $100 premium
```

### Settlement Economics

#### Exercise Scenarios

**Profitable Exercise (Call)**:
1. Current price > LP target price
2. Protocol uses 1inch to buy asset at market price
3. Taker receives: `(Current Price - LP Target Price) × Amount`
4. LP receives: `LP Target Price × Amount`
5. Protocol keeps: Safety margin residuals

**Profitable Exercise (Put)**:
1. Current price < LP target price
2. Protocol uses 1inch to sell asset at market price
3. Taker receives: `(LP Target Price - Current Price) × Amount`
4. LP receives: `LP Target Price × Amount` in USDC
5. Protocol keeps: Safety margin residuals

**Unprofitable Exercise**:
1. Option expires out-of-the-money
2. LP receives original asset back
3. Taker loses premium
4. No settlement needed

#### Settlement Revenue
- **Safety Margin**: 0.01% default margin on all 1inch trades
- **Slippage Capture**: Difference between expected and actual execution price

### Protocol Revenue Model

#### Revenue Sources

1. **x402 API Fees** (Primary Revenue)
   - $1 USDC per commitment created via `/api/x402/commitments`
   - Only applies to external API agents (bots, trading algorithms, etc.)
   - Prevents spam and generates sustainable revenue from automated users
   - Frontend users pay ZERO fees

2. **Safety Margin Fees**
   - 0.01% on all 1inch settlement trades  
   - Adjustable by protocol owner

3. **Slippage Arbitrage**
   - Capture favorable slippage on 1inch trades
   - Residual between quoted and executed prices

#### Revenue Distribution
- **100% to Protocol Owner**: All protocol profits sent directly to owner address
- **Owner Transfer**: Two-step ownership transfer allows migration to multisig/DAO
- **Simple Model**: No token complexity, direct revenue distribution

#### API Access Economics

**Frontend Users (Free Tier)**:
- Create unlimited LP commitments: $0
- Take unlimited options: $0 (only premium to LP)
- Access all marketplace features: $0
- Target: Retail users and manual trading

**External API Agents (Paid Tier)**:
- Create LP commitment: $1 USDC per commitment
- Take options: $0 (only premium to LP)
- Read data: $0
- Target: Automated trading systems, MEV bots, algorithmic strategies

**Security & Bypass Prevention**:
- Multi-layered middleware blocks common API tools
- Origin validation prevents unauthorized access
- User-agent detection identifies automated tools
- Rate limiting and IP filtering for additional security

### x402 Payment Protocol

#### Implementation Details
- **Payment Method**: HTTP 402 Payment Required
- **Settlement**: USDC on Base chain
- **Verification**: On-chain payment validation
- **Integration**: Seamless for API clients

#### Payment Flow
1. External agent attempts to create commitment
2. API returns 402 Payment Required with payment details
3. Agent submits USDC payment transaction
4. Payment verified on-chain
5. Commitment creation proceeds

#### Economic Impact
- **Revenue Generation**: Sustainable income from automated users
- **Spam Prevention**: $1 fee eliminates low-value spam commitments
- **Market Quality**: Higher-quality commitments from serious market makers
- **User Experience**: Frontend users unaffected by payment requirements

### Economic Security Model

#### Collateralization
- **100% Backing**: Every option fully collateralized by LP asset
- **No Leverage**: Zero liquidation risk for takers
- **Asset Custody**: Protocol holds all assets until settlement

#### Risk Management
- **LP Asset Lock**: Assets locked from option taking until settlement/expiry
- **Settlement Guarantees**: 1inch provides execution guarantees
- **Oracle Independence**: Prices from 1inch spot price aggregator
- **Slippage Protection**: Built-in minimum output amounts

#### Incentive Alignment
- **LP Incentives**: Earn premium + target price achievement
- **Taker Incentives**: Limited risk, unlimited upside potential
- **Protocol Incentives**: Revenue from efficient settlement
- **DUR Holder Incentives**: Token appreciation from protocol success

### Market Dynamics

#### Price Discovery
- **Premium Setting**: Market-driven based on current vs target price spread
- **Duration Pricing**: Longer duration = higher premium potential
- **Volatility Response**: Higher volatility increases premium demand

#### Liquidity Bootstrapping
- **LP Attraction**: Zero-cost provision, premium collection
- **Taker Attraction**: No liquidation risk, clear profit mechanism
- **Network Effects**: More LPs = more options = more takers

#### Scaling Economics
- **Fixed Costs**: Smart contract deployment and maintenance
- **Variable Costs**: 1inch integration fees, gas costs
- **Revenue Scaling**: Linear with option volume
- **Margin Expansion**: Higher volumes reduce per-unit costs

### Competitive Advantages

#### vs Traditional Options
- **No Expiry Decay**: Premium paid upfront, not time-decaying
- **Full Collateralization**: Zero counterparty risk
- **Instant Settlement**: 1inch provides immediate liquidity

#### vs Other DeFi Options
- **Simplified UX**: LP sets price, taker pays premium
- **No Liquidations**: Full collateral eliminates liquidation events
- **Direct Settlement**: No synthetic tokens or complex mechanics

### Risk Factors

#### Protocol Risks
- **1inch Dependency**: Settlement relies on 1inch infrastructure
- **Smart Contract Risk**: Bug risk in settlement logic
- **Oracle Manipulation**: Potential 1inch price feed manipulation

#### Economic Risks
- **Low Liquidity**: Insufficient LP participation
- **Gas Cost Impact**: High Ethereum fees affecting small options
- **Regulatory Risk**: Potential options trading restrictions

#### Mitigation Strategies
- **Diversified Settlement**: Multiple 1inch routers available
- **Comprehensive Testing**: Extensive testing of settlement logic
- **Insurance Fund**: DUR token reserves for emergency situations
- **Cross-chain Expansion**: Reduce single-chain dependency

## Implementation Economics

### MVP Scope
1. **Single Asset**: WETH options only
2. **Basic Settlement**: 1inch integration for exercise
3. **DUR Token**: Governance and revenue distribution
4. **Mini App**: Base ecosystem integration

### Phase 2 Expansion
1. **Multi-Asset**: USDC, WBTC, major ERC20s
2. **Advanced Strategies**: Complex option combinations
3. **Cross-Chain**: Optimism, Arbitrum expansion
4. **Institutional Features**: Larger size limits, API access

### Economic Viability Thresholds
- **Break-even Volume**: $1M monthly option volume
- **Sustainable Revenue**: $10M+ monthly for significant DUR appreciation
- **LP Attraction**: 1%+ monthly yields from premium collection
- **Taker Attraction**: 10%+ monthly return opportunities

This economic model creates a sustainable flywheel where LP premium collection attracts liquidity, diverse options attract takers, trading volume generates protocol revenue, and DUR token appreciation incentivizes ecosystem growth.