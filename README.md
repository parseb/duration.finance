# Duration.Finance

**A duration-centric market making venue for fully-collateralized options on Base**

Duration.Finance revolutionizes options trading by transforming it into a **duration marketplace** where LPs compete on daily yield rates and takers choose optimal lock periods.

## 🎯 Core Innovation: Duration Market Making

Unlike traditional options focused on strike prices, Duration.Finance creates a **duration-first marketplace** where:

- **LPs set daily rates**: Compete on daily premium rates across duration ranges
- **Takers choose duration**: Select optimal lock periods for their strategies  
- **Market price strikes**: Strike prices set to current market when taken
- **Yield transparency**: Real-time LP yield calculations drive competition

```
Traditional Options:  Fixed strike → Variable premium by time
Duration.Finance:     Market strike → Daily rate × chosen duration
```

## 📖 User Stories

### 🏦 Liquidity Provider Story
*"As a DeFi yield farmer, I want predictable returns from providing options liquidity"*

**Sarah the LP:**
1. **Sets Daily Rate**: "I'll provide 1 ETH for $50/day premium"
2. **Duration Flexibility**: "Accept 1-30 day duration, my choice on range"
3. **Guaranteed Yield**: Gets $50 × actual days when taken
4. **Market-Price Exit**: Receives current market price on exercise
5. **Competitive Edge**: Lower daily rates attract more takers

**Example LP Offer:**
```
Asset: 1 WETH
Daily Premium: $50 USDC  
Duration Range: 1-30 days
LP Yield: ~1.74% daily / ~635% annualized
```

### 📈 Option Taker Story  
*"As a DeFi trader, I want flexible duration exposure without liquidation risk"*

**Alex the Taker:**
1. **Duration Selection**: "I want 7-day ETH exposure"
2. **Cost Transparency**: Pays $50 × 7 = $350 total premium
3. **Market Entry**: Strike price = current ETH price when taken
4. **Flexible Exercise**: Exercise anytime during 7 days if profitable
5. **No Liquidation**: 100% collateralized, can't get liquidated

**Example Trade:**
```
Takes: 7-day ETH CALL at $3800 strike
Premium: $350 ($50 × 7 days)
Breakeven: $3835 (strike + premium per ETH)
If ETH hits $4000: Profit = $165 ($200 - $35/ETH premium)
Return: 47% in 7 days
```

### 🤖 Arbitrage Bot Story
*"As an automated trader, I want programmatic access to duration markets"*

**Bot the Algorithm:**
1. **Market Scanning**: Monitors yield rates across duration ranges
2. **x402 API Access**: Pays $1 USDC per commitment for API access
3. **Yield Arbitrage**: Creates competitive LP offers at optimal rates
4. **Delta Hedging**: Takes options to hedge spot positions
5. **24/7 Operation**: Automated market making across all durations

## 🏗️ Architecture

### Duration-Centric Smart Contracts
- **DurationOptionsCorrect.sol**: Main protocol with proper PUT/CALL mechanics
- **OneInchSettlementRouter.sol**: Settlement integration with 1inch
- **Duration marketplace**: Offchain commitments, onchain settlement
- **EIP-712 Signatures**: Secure commitment verification

### Revenue Model
- **Frontend Users**: 100% free access to all features
- **API Agents**: $1 USDC per commitment creation (x402 protocol)
- **Settlement Fees**: 0.01% margin on 1inch settlements

### Base Mini App Ready
- **MiniKit Integration**: Native Farcaster auth and wallet
- **Web App Parity**: Full desktop/mobile experience
- **1inch Settlement**: Real-time pricing and execution

## 🚀 Quick Start

### For LPs (Yield Farmers)
```bash
# 1. Connect wallet to Duration.Finance
# 2. Select asset and amount (min 0.1 WETH)
# 3. Set daily premium rate ($1-100/day typical)
# 4. Choose duration range (1-365 days)
# 5. Sign commitment (free, offchain)
# 6. Earn yield when taken
```

### For Takers (Traders)
```bash
# 1. Browse available duration liquidity
# 2. Filter by cost/day, total cost, or yield
# 3. Select optimal duration for strategy
# 4. Pay premium × days
# 5. Exercise when profitable
```

### For Developers
```bash
# Clone and setup
git clone https://github.com/duration-finance/protocol
cd duration.finance
npm install

# Start development environment
npm run docker:dev

# Run tests
forge test

# Access
# App: http://localhost:3001
# API: http://localhost:3001/api/commitments (free for frontend)
# x402: http://localhost:3001/api/x402/commitments ($1 USDC)
```

## 🔧 Option Settlement Mechanics

### CALL Options (Bullish - expect price to rise)
**At Taking:**
- Contract receives WETH collateral from LP
- Strike price locked at current market price
- Premium paid to LP immediately

**At Exercise (if price rose above strike):**
- Contract sells WETH at current higher price via 1inch
- Profit (current price - strike price) × amount → Option holder
- Strike price equivalent in USDC → LP (collateral provider)

### PUT Options (Bearish - expect price to drop)
**At Taking:**
- Contract receives WETH collateral from LP
- **Contract immediately sells WETH → USDC** at strike price via 1inch
- Contract holds USDC from sale + premium already paid to LP

**At Exercise (if price dropped below strike):**
- Contract buys WETH at current lower price via 1inch
- Profit (strike price - current price) × amount → Option holder
- Purchased WETH → LP (covers protocol liability)

**At Expiry (if unprofitable - price rose/stayed same):**
- Contract returns strike price USDC from original sale → LP
- LP loses upside potential but gets premium + guaranteed USDC floor

**LP PUT Economics:** LP trades WETH upside potential for immediate premium + guaranteed USDC floor price

## 📊 Market Dynamics

### Duration Competition
LPs compete on **daily cost efficiency**:
```
LP A: $45/day (1.5% daily yield)
LP B: $50/day (1.74% daily yield)  
LP C: $55/day (1.91% daily yield)

Takers naturally choose LP A for cost efficiency
```

### Yield Transparency
```sql
-- Real-time yield calculations
SELECT 
  lp_address,
  daily_premium_usdc / (amount * eth_price) * 100 as daily_yield_percent,
  daily_yield_percent * 365 as annualized_yield
FROM commitments 
ORDER BY daily_yield_percent DESC;
```

### Market Making Benefits
- **LP Competition**: Drives down costs for takers
- **Duration Flexibility**: Optimal capital efficiency
- **Risk Management**: 100% collateralization eliminates liquidations
- **Price Discovery**: Market-driven daily rates

## 🔗 Contract Addresses

### Base Sepolia (Testnet)
```
DurationOptionsUnified:   0x445204d7A819e5e34F74c83787e7F379F29E5D8E (Legacy - basic mechanics)
DurationOptionsCorrect:   0x9FC6E5Ff91D2be55b9ee25eD5b64DFB1020eBC44 (In progress - full PUT mechanics)
OneInchRouter:           0x111111125421cA6dc452d289314280a0f8842A65
SettlementRouter:        0x35897A4DF878B290610d3dd893474C98c785b1Ed
```

### Base Mainnet
```
WETH: 0x4200000000000000000000000000000000000006
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
OneInchRouter: 0x111111125421cA6dc452d289314280a0f8842A65
```

## 📚 Documentation

Complete documentation moved to `misc-md/`:
- **Economic Model**: `misc-md/ECONOMIC_SPECIFICATION.md`
- **1inch Integration**: `misc-md/1INCH_INTEGRATION_GUIDE.md`
- **x402 API System**: `misc-md/X402-IMPLEMENTATION.md`
- **Technical Specs**: `misc-md/SPECIFICATIONS.md`

## 🔮 Duration Marketplace Vision

Duration.Finance transforms options from **strike-centric** to **duration-centric** markets:

### Traditional Options Problems:
- Complex strike price selection
- Time decay uncertainty  
- Limited duration flexibility
- Liquidation risks

### Duration.Finance Solutions:
- **Market-price strikes**: Always current market entry
- **Transparent duration costs**: Daily rate × chosen days
- **Flexible duration selection**: 1-365 day granularity
- **Zero liquidation risk**: 100% collateralized

This creates a **sustainable marketplace** where LPs earn predictable yields and takers get optimal duration exposure with full capital protection.

---

## 🚧 Current Development Status

### ✅ Completed Features
- **Duration-Centric UI**: Complete frontend with duration selection and yield display
- **EIP-712 Commitments**: Secure offchain commitment signing system
- **Database Layer**: PostgreSQL schema for duration marketplace
- **API Security**: x402 payment system for external API access
- **Settlement Logic**: Smart contracts with proper CALL/PUT mechanics
- **Base Sepolia Testing**: Deployed and tested on Base testnet

### 🔄 Active Development  
- **Contract Deployment**: Finalizing `DurationOptionsCorrect.sol` deployment with gas funding
- **1inch Integration**: Full settlement router implementation
- **Contract Verification**: BaseScan verification for transparency
- **Mainnet Preparation**: Security review and gas optimization

### 📋 Next Steps
1. **Deploy Corrected Contract**: Complete deployment with proper gas funding
2. **Contract Verification**: Verify on BaseScan for public code review
3. **Frontend Integration**: Connect UI to corrected contract
4. **Base Mainnet**: Production deployment after thorough testing
5. **Base Mini App**: Complete MiniKit integration for Farcaster ecosystem

---

**Built on Base** • **Powered by 1inch** • **Secured by Full Collateralization**

[Documentation](./misc-md/) • [GitHub](https://github.com/duration-finance) • [Base App](https://base.org/apps)