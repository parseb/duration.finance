# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Duration.Finance** is a fully-collateralized options protocol for Base mini apps using 1inch for settlement. This is a **complete rewrite** that adopts GHOptim's timing logic and ERC-712 signature patterns but replaces all Aave functionality with 1inch integration.

### Architecture Direction
- **Complete Migration**: No Aave dependencies - full 1inch integration
- **Preserved Logic**: GHOptim timing, ERC-712 signatures, and core options flow
- **Enhanced Settlement**: 1inch Limit Order Protocol, UnoswapRouter, or GenericRouter integration
- **Target Platform**: Base mini app ecosystem with standard web app parity
## Core Protocol Economics

### Duration-Centric Marketplace

**Duration.Finance operates as a duration-yield marketplace where LPs compete on daily rates:**

#### LP Commitments (Duration-Yield Focused)
LPs create signed ERC-712 commitments specifying:
- **Asset & Amount**: Initially WETH only (0.1-1000 units, expandable to other tokens)
- **Daily Premium Rate**: Fixed USDC amount charged per day of option duration
- **Duration Range**: Minimum lock period (1+ days) to maximum duration (365 days)
- **Yield Competition**: LPs compete on daily yield rates, not strike prices
- **Option Type**: LP specifies CALL or PUT
- **Strike Price**: Always current market price when option is taken

**LP Revenue Model**:
1. Receives `Daily Premium × Lock Duration` in USDC when option is taken
2. Provides WETH collateral at current market price (strike price)
3. Earns yield for duration of collateral lock
4. **Duration Flexibility**: Takers choose duration within LP's acceptable range
5. **Settlement**: Depends on option type and profitability (see settlement mechanics below)

#### Taker Experience (Duration-First Selection)
Takers interact with the duration marketplace by:
- **Duration Selection**: Choose desired lock duration (1-365 days)
- **Liquidity Filtering**: Filter by daily cost, total cost, or LP yield rates
- **Cost Transparency**: `Daily Premium × Duration = Total Premium` calculation
- **Strike Price**: Always current market price when taking option
- **Marketplace Sorting**: Sort by cost-effectiveness or yield metrics

**Taker Benefits**:
1. **Transparent Pricing**: Clear daily cost × duration = total premium
2. **Duration Control**: Choose optimal lock period for strategy
3. **Cost Competition**: LPs compete on daily rates, reducing costs
4. **Market Entry**: Strike price reflects real market conditions

### Duration-Centric Taking Flow
- **Duration-Aware Function**: `takeCommitment(commitmentHash, durationDays, settlementParams)`
- **Duration Validation**: System checks if requested duration fits LP's min/max range
- **Premium Calculation**: `LP Daily Rate × Taker Duration = Total Premium`
- **Strike Price Setting**: Current market price becomes option strike price
- **Yield-Based Selection**: Takers can sort and filter by LP yield rates

### Option Settlement Mechanics

#### **CALL Options** (Bullish - expect price to rise):
**At Taking:**
- Contract receives WETH collateral from LP
- Strike price locked at current market price
- Premium paid to LP immediately

**At Exercise (if price rose above strike):**
- Contract sells WETH at current higher price via 1inch
- Profit (current price - strike price) × amount → Option holder
- Strike price equivalent in USDC → LP (collateral provider)
- LP gets premium + guaranteed strike price, loses upside potential

**Example:** Strike $3800, Current $4000, 1 WETH
- Sell 1 WETH for $4000 USDC via 1inch
- $200 profit → Option holder
- $3800 USDC → LP

#### **PUT Options** (Bearish - expect price to drop):
**At Taking:**
- Contract receives WETH collateral from LP
- **Contract immediately sells WETH → USDC** at strike price via 1inch
- Contract holds USDC from sale + premium already paid to LP

**At Exercise (if price dropped below strike):**
- Contract buys WETH at current lower price via 1inch
- Profit (strike price - current price) × amount → Option holder  
- Purchased WETH → LP (covers protocol liability)

**At Expiry (if unprofitable - price rose/stayed same):**
- Contract cannot profitably buy WETH (would lose money)
- Strike price USDC from original sale → LP (guaranteed floor price)
- LP loses upside potential but gets premium + guaranteed USDC floor

**Example:** Strike $3800, Current $3500, 1 WETH
- Original sale: 1 WETH → $3800 USDC (at taking)
- Exercise: Buy 1 WETH for $3500 USDC via 1inch
- $300 profit → Option holder
- 1 WETH → LP

**LP PUT Economics:** LP trades WETH upside potential for immediate premium + guaranteed USDC floor price

### Settlement via 1inch
- **Exercise Trigger**: When option becomes profitable for holder
- **1inch Integration**: All WETH↔USDC swaps via 1inch routers for optimal prices
- **Liquidity Source**: 1inch aggregates DEX liquidity for settlement
- **Revenue Generation**: Protocol captures safety margins and slippage differentials

### Duration-Yield Competition (New)
LPs compete in a duration marketplace optimized for yield efficiency:
1. **Daily Rate Competition**: LPs set competitive daily premium rates in USDC
2. **Duration Flexibility**: LPs specify min/max duration ranges they accept
3. **Yield Transparency**: System calculates and displays daily/annualized yield rates
4. **Market Efficiency**: Takers sort by cost-per-day, total cost, or LP yield
5. **Real-time Pricing**: Strike prices reflect actual market conditions at execution





### Protocol Revenue Model - Direct Deployer Collection

**Fee Collection**:
- **x402 API Fees**: $1 USDC per commitment created via external API endpoints
- **Protocol Profits**: All settlement margins and slippage profits collected by deployer wallet
- **Safety Margin Fees**: 0.01% on all 1inch trades sent to deployer
- **Profit Capture**: Settlement profits from price improvements sent to deployer
- **Residual Collection**: Any USDC/ETH residuals from operations sent to deployer

**Important**: Frontend users pay NO fees for any operations. The $1 fee applies ONLY to external API agents using `/api/x402/commitments`.

**Implementation**:
- **Direct Transfer**: All fees transferred immediately to deployer address (contract owner)
- **No Governance**: Simple owner-based admin functions for protocol management
- **Fee Sweeping**: `sweepProtocolFees()` and `sweepExcess()` functions collect revenue
- **Owner Control**: All admin functions protected by `onlyOwner` modifier

 
## Smart Contract Architecture

### Core Contract Stack (Solidity 0.8.20+)
- **DurationOptions.sol**: Main options protocol contract with deployer fee collection
- **OneInchSettlementRouter.sol**: 1inch settlement interface layer
- **IDurationOptions.sol**: Interface definitions and structs
- **VerifySignature.sol**: EIP-712 signature verification (preserved from GHOptim)

### 1inch Integration Layer
**Supported 1inch Components**:
- **Limit Order Protocol**: For structured settlement orders
- **UnoswapRouter**: For simple swap-based settlements  
- **GenericRouter**: For complex multi-hop settlements

**Integration Strategy**:
1. Determine optimal 1inch component based on settlement requirements
2. Implement unified interface for all 1inch routers
3. Add comprehensive NatSpec documentation for encoding and execution patterns
4. Handle confirmation waiting for order execution

## Application Architecture

### Frontend (Next.js 14 + TypeScript + MiniKit)
**Target Deployment**: Base mini app with standard web app parity

**Core Pages**:
- **LP Interface**: Create and manage liquidity provider offers
- **Taker Interface**: Browse and take available options
- **Portfolio**: Track active positions and P&L

**Integration Stack**:
- **MiniKit**: Primary frontend framework for Base mini app
- **Wallet**: ConnectKit, MiniKit, wagmi, viem for seamless Base wallet integration
- **Networks**: Base mainnet focus, Base testnet for development
- **UI**: Tailwind CSS with Duration.Finance design system (Duration Blue #1E40AF theme)

### Database Architecture (PostgreSQL)
**Offchain Data Storage**:
- **LP Commitments**: Store signed ERC-712 option offers with signatures
- **Position Tracking**: Track option states and settlement status  
- **User Sessions**: Mini app authentication and notification tokens

**Database Schema (Duration-Centric)**:
```sql
-- Duration-Centric Commitments (LP commitments only, offchain until taken)
CREATE TABLE commitments (
    id UUID PRIMARY KEY,
    lp_address ADDRESS NOT NULL,        -- LP who provides liquidity
    asset_address ADDRESS NOT NULL,     -- Underlying asset (WETH initially)
    amount NUMERIC NOT NULL,            -- Amount of asset
    daily_premium_usdc NUMERIC NOT NULL, -- Daily premium rate in USDC
    min_lock_days INTEGER NOT NULL,     -- Minimum acceptable duration
    max_duration_days INTEGER NOT NULL, -- Maximum acceptable duration
    is_fractionable BOOLEAN DEFAULT false, -- Allow partial taking
    option_type SMALLINT NOT NULL,      -- 0=CALL, 1=PUT
    signature TEXT NOT NULL,            -- EIP-712 signature
    created_at TIMESTAMP DEFAULT NOW(),
    taken_at TIMESTAMP NULL,            -- When commitment was taken
    taken_duration_days INTEGER,        -- Actual duration when taken
    nonce INTEGER NOT NULL,
    expiry TIMESTAMP NOT NULL,
    
    -- Calculated yield fields (updated by backend)
    lp_yield_daily NUMERIC,             -- Daily yield percentage
    lp_yield_annualized NUMERIC,        -- Annualized yield percentage
    
    -- Constraints
    CONSTRAINT check_duration_range CHECK (min_lock_days <= max_duration_days),
    CONSTRAINT check_positive_premium CHECK (daily_premium_usdc > 0),
    CONSTRAINT check_valid_duration CHECK (min_lock_days >= 1 AND max_duration_days <= 365)
);

-- Active Options (onchain positions with duration tracking)
CREATE TABLE active_options (
    option_id INTEGER PRIMARY KEY,      -- Onchain option ID
    commitment_id UUID REFERENCES commitments(id),
    taker_address ADDRESS NOT NULL,     -- Option holder
    lp_address ADDRESS NOT NULL,        -- Collateral provider
    asset_address ADDRESS NOT NULL,     -- Underlying asset
    amount NUMERIC NOT NULL,            -- Asset amount
    strike_price NUMERIC NOT NULL,      -- Market price when taken
    daily_premium_usdc NUMERIC NOT NULL, -- Daily premium rate
    lock_duration_days INTEGER NOT NULL, -- Actual lock duration
    total_premium_paid NUMERIC NOT NULL, -- Total premium (daily * duration)
    option_type SMALLINT NOT NULL,      -- 0=CALL, 1=PUT
    created_at TIMESTAMP DEFAULT NOW(),
    expiry_timestamp TIMESTAMP NOT NULL,
    exercise_status VARCHAR(20) DEFAULT 'active', -- active, exercised, expired
    
    -- LP yield tracking
    lp_daily_yield NUMERIC             -- LP's yield rate for this position
);

-- Marketplace view for efficient querying
CREATE VIEW marketplace_liquidity AS
SELECT 
    c.*,
    -- Calculate collateral value (updated with real prices)
    c.amount * 3836.50 as estimated_collateral_value_usd,
    -- Calculate yield metrics
    CASE WHEN c.amount > 0 AND c.daily_premium_usdc > 0 
         THEN (c.daily_premium_usdc / (c.amount * 3836.50)) * 100
         ELSE 0 END as daily_yield_percent,
    CASE WHEN c.amount > 0 AND c.daily_premium_usdc > 0 
         THEN (c.daily_premium_usdc / (c.amount * 3836.50)) * 365 * 100
         ELSE 0 END as annualized_yield_percent
FROM commitments c
WHERE c.taken_at IS NULL AND c.expiry > NOW();
```  

## Development Commands

### Smart Contract Development (Foundry)

```bash
# Build contracts
forge build

# Run tests
forge test

# Format code
forge fmt

# Generate gas snapshots
forge snapshot

# Deploy with custom script
forge script script/DurationFinanceDeploy.sol --rpc-url http://127.0.0.1:8545 -vvvv --broadcast
```

### Frontend Development

```bash
# Development server
npm run dev

# Build production
npm run build

# Production server
npm start

# Lint code
npm run lint
```

## Protocol Flow & Settlement

### Core Protocol Flow (Unified System)
1. **Commitment Creation**: Either LP or Taker creates off-chain ERC-712 signed commitment
2. **Commitment Taking**: Counter-party takes commitment via `takeCommitment()` function
3. **Option Creation**: LP provides collateral, taker becomes option holder, premium paid in USDC
4. **Settlement Trigger**: Option exercise when profitable for taker
5. **1inch Execution**: Protocol uses 1inch for immediate asset swaps
6. **Profit Distribution**: LP gets target price, taker gets excess, protocol keeps margins

### Settlement Mechanics

**Option Exercise Process**:
1. **Profitability Check**: Current price vs LP target price comparison
2. **1inch Quote**: Get optimal execution route for required swap
3. **Asset Swap**: Execute trade through chosen 1inch router (Limit Order/Unoswap/Generic)
4. **Settlement**: Distribute proceeds according to profit sharing rules
5. **Position Cleanup**: Remove from active positions, update database

**Settlement Revenue Capture**:
- **Safety Margins**: 0.01% fee on all 1inch settlements
- **Slippage Capture**: Favorable execution price differences
- **Buy-back Arbitrage**: For unprofitable sells, buy asset back cheaper, return original amount to LP

### Critical Protocol Requirements (Duration-Centric)
- **100% Collateralization**: Every option fully backed by LP assets
- **Free Frontend Access**: NO fees for users creating/taking commitments via web interface
- **x402 API Security**: $1 USDC fee ONLY for external API agents creating commitments
- **API Protection**: Multi-layered middleware blocks unauthorized access to internal endpoints
- **Duration-First Design**: All pricing based on daily rates × duration
- **ERC-712 Signatures**: LP commitments signed offchain with duration-aware schema
- **Minimum Position Size**: 0.1 units minimum for all commitments
- **USDC Premium Payments**: All premiums calculated as daily rate × duration in USDC
- **Duration Ranges**: LPs specify min/max acceptable durations (1-365 days)
- **Market-Price Strikes**: Strike prices always set to current market price at taking
- **Yield Transparency**: Real-time calculation and display of LP yield metrics
- **Duration Validation**: System ensures taker duration fits within LP's acceptable range
- **Marketplace Sorting**: Liquidity sortable by daily cost, total cost, and yield rates
- **Mobile-Friendly Filtering**: Range sliders and interactive charts for duration selection
- **1inch Integration**: All settlements use 1inch infrastructure for real pricing

### API Architecture & Security
- **Internal API**: `/api/commitments` - Frontend only, protected by Next.js middleware
- **External API**: `/api/x402/commitments` - Requires $1 USDC payment for commitment creation
- **Security Middleware**: Automatically blocks API tools (curl, postman, python-requests, etc.)
- **Origin Validation**: Verifies requests come from allowed domains (localhost, duration.finance)
- **User-Agent Detection**: Identifies and blocks automated tools and bots
- **Rate Limiting**: Prevents abuse of internal API endpoints
- **IP Filtering**: CIDR-based allowlisting for internal access
- **Payment Verification**: On-chain USDC payment validation for x402 endpoints

## Base Mini App Integration Points

Based on `misc/MINBASE_APP.md` and `misc/BASE_MINI_QUICKSTART.md`:

### MiniKit Integration
- **Authentication**: Sign In with Farcaster, wallet auth, context data
- **Wallet Provider**: EIP-1193 Ethereum Provider via MiniKit
- **SDK Actions**: Use official SDK functions, avoid Farcaster-specific deeplinks
- **Notifications**: User re-engagement through Base App

### Supported Chains for 1inch
From `misc/1INCH_CONTRACT_ADDRESSES.md`:
- **Base**: Primary target (contract: `0x111111125421cA6dc452d289314280a0f8842A65`)
- **Ethereum**, **Arbitrum**, **Optimism**, **Polygon** (multi-chain support)

## Development Priorities & Implementation

### MVP Scope (Phase 1)
1. **DurationOptions.sol**: Core options protocol with 1inch integration and deployer fee collection
2. **LP Commitment System**: ERC-712 signatures and database storage
3. **Option Taking**: Premium payment and collateral locking
4. **1inch Settlement**: Exercise mechanism using optimal 1inch router
5. **Base Mini App**: MiniKit-based frontend with full functionality
6. **Standard Web App**: Desktop/mobile web interface matching mini app features
7. **Revenue Collection**: All fees sent directly to deployer wallet

### Implementation Strategy

**Complete Rewrite Approach**:
- **No Aave Dependencies**: Remove all Aave oracle, aToken, and GHO functionality
- **Preserve Core Logic**: Adapt GHOptim timing, signature verification, and position management patterns
- **Enhance with 1inch**: Implement settlement through 1inch infrastructure
- **Simplify Complexity**: Remove fractionalization for cleaner, more secure operations
- **USDC Integration**: Move from ETH to USDC-based premium system

### Configuration Files
- **foundry.toml**: Foundry configuration with filesystem permissions
- **next.config.js**: Next.js configuration for mini app
- **farcaster.json**: Mini app manifest (required for Base App integration)

### Security Considerations
- **Signature Verification**: EIP-712 typed data signatures required
- **Reentrancy Protection**: All state-changing functions must be protected
- **Slippage Protection**: Exchange trades need minimum output amounts
- **No Leverage**: 100% collateralization always maintained

## Development Workflow

### Testing Strategy
- **1inch Integration Testing**: Use mainnet forks to test with real 1inch contracts
- **Unit Tests**: Comprehensive testing of options logic and settlement mechanics
- **Integration Tests**: End-to-end testing of LP commitment → option taking → exercise flow
- **Mini App Testing**: Use ngrok/Vercel deployment for Farcaster integration testing

### Deployment Strategy
1. **Phase 1**: Base testnet deployment with basic WETH options
2. **Phase 2**: Base mainnet deployment after audit and testing
3. **Phase 3**: Multi-asset support and cross-chain expansion
4. **Phase 4**: Advanced strategies and institutional features

### Development Phases
1. **Smart Contracts**: DurationToken.sol and DurationOptions.sol implementation
2. **1inch Integration**: Settlement layer with comprehensive router support
3. **Database Layer**: PostgreSQL schema and API endpoints
4. **Mini App Frontend**: MiniKit-based UI with complete options functionality
5. **Web App Parity**: Standard web interface matching mini app features
6. **Testing & Audit**: Comprehensive testing and security review
