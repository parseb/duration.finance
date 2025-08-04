# Duration.Finance Options Protocol Specifications

## Project Overview

Duration.Finance is a comprehensive options protocol designed for the Base mini app ecosystem, integrating 1inch Limit Order Protocol for efficient on-chain settlement. The project transitions from a legacy GHO-denominated Aave-based system to a modern, fully-collateralized options protocol targeting Base mini apps.

## Architecture Overview

### Core Components

1. **Options Protocol Contracts** - Smart contracts managing options lifecycle
2. **Duration Token (DUR)** - Protocol governance and utility token
3. **1inch Integration Layer** - Exchange interface for settlement
4. **Base Mini App Frontend** - MiniKit-based user interface
5. **Liquidity Provider System** - Signature-based commitments

## Smart Contract Specifications

### Duration Token (DUR)

Based on the Will.sol template, the Duration token provides:

**Key Features:**
- Initial price: 100 gwei
- Total supply: 0 (starts empty)
- Dynamic pricing based on ETH backing
- Safety margin function (default 0.01%)
- Multicall admin role for 80%+ token holders
- Full ETH backing requirement (99.99% backed)

**Functions:**
```solidity
contract DurationToken {
    uint256 public constant INITIAL_PRICE = 100 gwei;
    uint256 public safetyMargin = 1; // 0.01%
    
    function setSafetyMargin(uint256 _margin) external; // hardcoded permission
    function multicall(bytes[] calldata data) external; // 80%+ holder only
    function currentPrice() public view returns (uint256);
    function mintFromETH() public payable returns (uint256);
    function burn(uint256 amount) public returns (uint256);
}
```

### Options Protocol Contract

Migrated from GHOptim.sol, adapted for 1inch integration:

**Core Structures:**
```solidity
struct OptionCommitment {
    address asset;           // Underlying asset (initially WETH only)
    uint256 maxDuration;     // Maximum option lifetime
    uint256 premiumPerUnit;  // Premium cost per unit
    bool fractionable;       // Can be partially taken
    uint256 totalSize;       // Total commitment size (0.1-1000 units)
    uint256 strikePrice;     // Exercise price
    bool isCall;            // Call (true) or Put (false)
    uint256 expiry;         // Commitment expiration
    bytes signature;        // LP's EIP-712 signature
}

struct ActiveOption {
    bytes32 commitmentHash;
    address taker;
    uint256 amount;
    uint256 exerciseTime;
    uint256 premium;
    bool exercised;
}
```

**Key Functions:**
```solidity
function createOptionCommitment(OptionCommitment calldata commitment) external;
function takeOption(bytes32 commitmentHash, uint256 amount, address taker) external payable;
function exerciseOption(uint256 optionId) external;
function liquidateExpiredOption(uint256 optionId) external;
```

### 1inch Integration Interface

```solidity
interface IOneInchSettlement {
    function executeTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapData
    ) external returns (uint256 amountOut);
    
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) external view returns (uint256 returnAmount);
}
```

## Liquidity Provider System

### LP Commitment Flow

1. **Off-chain Signature**: LP creates signed commitment with parameters
2. **Parameter Specification**:
   - Asset: Initially WETH only (min 0.1, max 1000 units)
   - Premium: Price difference between current and wanted price
   - Fractionable: Whether position can be split
   - Max Duration: Maximum time before liquidity return

3. **Premium Calculation**:
   - Premium = |Current Price - Wanted Price|
   - LP gets: Wanted Price (fixed target)
   - Taker pays: Premium initially, takes profit on exercise

### LP Data Structure

```typescript
interface LPCommitment {
    asset: string;          // Token address
    amount: number;         // 0.1 to 1000 units
    wantedPrice: number;    // Target price for LP
    premium: number;        // Calculated premium
    maxDuration: number;    // Seconds
    fractionable: boolean;  // Can split position
    signature: string;      // EIP-712 signature
}
```

## Base Mini App Integration

### MiniKit Integration

**Core Features:**
- **Authentication**: Sign In with Farcaster, wallet auth, context data
- **Wallet Provider**: EIP-1193 Ethereum Provider via MiniKit
- **SDK Actions**: Official SDK functions, no Farcaster deeplinks
- **Notifications**: User re-engagement through Base App

**Required Environment Variables:**
```bash
NEXT_PUBLIC_ONCHAINKIT_API_KEY=
NEXT_PUBLIC_URL=
FARCASTER_HEADER=
FARCASTER_PAYLOAD=
FARCASTER_SIGNATURE=
REDIS_URL=
REDIS_TOKEN=
```

### Supported Chains (1inch Integration)

- **Base** (Primary): `0x111111125421cA6dc452d289314280a0f8842A65`
- **Ethereum**: Multi-chain support available
- **Arbitrum**: Extended support
- **Optimism**: Extended support
- **Polygon**: Extended support

## User Interface Specifications

### Design System

**Color Palette:**
- Duration Blue: `#1E40AF` (stability, time)
- Temporal Gradient: `#3B82F6` to `#1E40AF`
- Accent Gold: `#F59E0B` (value, opportunity)
- Profit Green: `#10B981`
- Loss Red: `#EF4444`

**Key Components:**
- Options trading interface with strike prices and expiration
- Portfolio dashboard with P&L summary
- Real-time pricing with minimal latency
- Risk metrics with hourglass-themed visualizations

### User Flows

1. **LP Flow**:
   - Connect wallet → Specify parameters → Sign commitment → Await takers

2. **Taker Flow**:
   - Browse available options → Filter by duration/size/premium → Take position → Monitor/Exercise

3. **Exercise Flow**:
   - Monitor profitability → Execute via 1inch → Settle positions

## Protocol Economics

### Fee Structure

- **Protocol Fees**: Sent to Duration token holders
- **1inch Integration**: No additional fees beyond standard 1inch rates
- **Safety Margin**: 0.01% default for orders

### Collateral Management

- **Full Collateralization**: 100% backing always required
- **No Leverage**: Maintains security and transparency
- **Automatic Locking**: Collateral locked when option taken
- **Settlement-Only Movement**: Collateral only moves during exercise/expiration

## Security Considerations

### Smart Contract Security

- **Signature Verification**: EIP-712 typed data signatures
- **Reentrancy Protection**: All state-changing functions protected
- **Slippage Protection**: Exchange trades with minimum output amounts
- **Access Control**: Authorized addresses for exchange interaction

### Operational Security

- **Multi-signature**: For protocol upgrades and critical functions
- **Time locks**: For parameter changes
- **Circuit breakers**: For emergency situations
- **Audit Requirements**: Full audit before mainnet deployment

## Development Workflow

### Smart Contract Development

```bash
# Build contracts
forge build

# Run tests
forge test

# Deploy script
forge script script/DurationFinanceDeploy.sol --rpc-url base --broadcast
```

### Frontend Development

```bash
# Development server
npm run dev

# Build production
npm run build

# Lint code
npm run lint
```

### Deployment Strategy

1. **Contract Migration**: Adapt GHOptim contracts to 1inch integration
2. **Frontend Updates**: Update UI for 1inch and Base mini app requirements
3. **Testing**: Comprehensive testing with 1inch Limit Order Protocol
4. **Mini App Setup**: Configure farcaster.json manifest and MiniKit
5. **Mainnet Deployment**: Deploy to Base with contract verification

## Technical Requirements

### Minimum Viable Product (MVP)

- [ ] Duration token contract deployment
- [ ] Options protocol with 1inch integration
- [ ] Basic LP commitment system
- [ ] Option taking mechanism
- [ ] Exercise and settlement via 1inch
- [ ] Base mini app with MiniKit integration
- [ ] Farcaster manifest configuration

### Advanced Features

- [ ] Multi-asset support (beyond WETH)
- [ ] Advanced option strategies
- [ ] Automated market making
- [ ] Cross-chain expansion
- [ ] Governance implementation
- [ ] Advanced analytics dashboard

## Risk Management

### Protocol Risks

- **Smart Contract Risk**: Mitigated through audits and testing
- **Oracle Risk**: 1inch price feeds provide reliable pricing
- **Liquidity Risk**: LP commitment system ensures available liquidity
- **Slippage Risk**: Built-in slippage protection for settlements

### Operational Risks

- **Frontend Risk**: Decentralized hosting and IPFS backup
- **Key Management**: Multi-sig and hardware wallet requirements
- **Upgrade Risk**: Transparent governance and time locks

## Compliance and Legal

### Regulatory Considerations

- **Decentralized Protocol**: No central authority or control
- **User Responsibility**: Self-custody and decision-making
- **Geographic Restrictions**: Users responsible for local compliance
- **Risk Disclosure**: Clear documentation of protocol risks

## Future Roadmap

### Phase 1 (Q1 2025)
- MVP deployment on Base
- Basic WETH options
- Mini app launch

### Phase 2 (Q2 2025)
- Multi-asset support
- Advanced strategies
- Improved UI/UX

### Phase 3 (Q3 2025)
- Cross-chain expansion
- Governance token launch
- Advanced analytics

### Phase 4 (Q4 2025)
- Institutional features
- API development
- Partnership integrations

## Conclusion

Duration.Finance represents a modern approach to decentralized options trading, combining the reliability of full collateralization with the efficiency of 1inch settlement and the accessibility of Base mini apps. The protocol's design prioritizes security, transparency, and user experience while maintaining the decentralized ethos of DeFi.

The migration from Aave-based architecture to 1inch integration provides better capital efficiency and broader market access, while the Base mini app integration ensures native social features and seamless user onboarding through Farcaster.

This specification serves as the foundational document for development, ensuring all stakeholders understand the protocol's architecture, economics, and implementation strategy.