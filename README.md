# Duration.Finance

A fully-collateralized, duration-centric options protocol for Base mini apps using 1inch for settlement.

## Overview

Duration.Finance revolutionizes options trading by making **duration the primary pricing factor**. Unlike traditional options that focus on strike prices, our protocol allows LPs to set daily premium rates and duration ranges, while takers choose how long they want to lock the collateral.

### Core Innovation: Duration-Centric Pricing

**Traditional Options**: Fixed strike price, premium varies by duration  
**Duration.Finance**: LP sets daily premium, taker selects duration

```
LP Offers: "I'll provide 1 ETH for $50/day, 1-30 days"
Taker Chooses: "I want it for 7 days = $350 total premium"
Strike Price: Current market price when option is taken
```

### Key Features

- **Duration-Centric Model**: LPs set daily premiums, takers choose duration
- **Dual Commitment System**: Both LP and Taker can create off-chain commitments
- **Off-chain Commitment Storage**: Gas-efficient with on-chain verification only when taken
- **100% Collateralization**: Every option fully backed by LP assets
- **1inch Integration**: Real-time pricing and optimal settlement execution
- **EIP-712 Signatures**: Secure off-chain commitment signing
- **Simple Swap Optimization**: Immediate execution when price is better than expected
- **Base Mini App Ready**: MiniKit integration with standard web app parity

## API Access & Security

### Frontend Access (Free)
The frontend application provides free access to all commitment creation and taking features for users interacting through the web interface.

### API Access (x402 Payment Required)
External API agents must use the x402 payment protocol to access commitment creation endpoints:

- **External API Endpoint**: `/api/x402/commitments` (requires $1 USDC payment)
- **Internal API Endpoint**: `/api/commitments` (frontend only, blocked for external access)
- **Payment Protocol**: HTTP 402 Payment Required with USDC settlement
- **Security**: Multi-layered protection prevents bypass attempts

#### x402 API Usage
```bash
# External agents must use x402 endpoint with payment
curl -X POST http://localhost:3001/api/x402/commitments \
  -H "Content-Type: application/json" \
  -H "X-Payment-Token: USDC" \
  -H "X-Payment-Amount: 1000000" \
  -d '{"commitment": "...", "signature": "..."}'

# Reading commitments is free
curl http://localhost:3001/api/x402/commitments
```

#### Security Features
- **User-Agent Detection**: Blocks common API tools (curl, postman, python-requests, etc.)
- **Origin Validation**: Verifies requests come from allowed domains
- **Rate Limiting**: Prevents abuse of internal endpoints
- **IP Filtering**: Allowlist for internal access
- **Payment Verification**: x402 protocol validation for external access

## Quick Start

### Prerequisites

- Node.js 18+ 
- Docker & Docker Compose
- Foundry (for smart contracts)

### Container Management

The project includes convenient npm scripts for managing Docker containers:

#### Development Environment
```bash
# Start all dev containers (app, database, redis)
npm run docker:dev

# Start with rebuild (if you changed code)
npm run docker:dev:build

# Stop containers (keeps data)
npm run docker:dev:stop

# Restart containers (stop + start)
npm run docker:dev:restart

# View live logs
npm run docker:dev:logs

# Check container status
npm run docker:dev:status

# Completely remove containers (destroys data)
npm run docker:dev:down
```

#### Production Environment
```bash
# Start production setup
npm run docker:prod

# Production with rebuild
npm run docker:prod:build

# Stop/restart production
npm run docker:prod:stop
npm run docker:prod:restart
```

#### Infrastructure Only
```bash
# Start just database + redis (useful for local development)
npm run docker:infra

# Stop just infrastructure
npm run docker:infra:stop
```

#### Clean Everything
```bash
# Remove all containers and volumes (fresh start)
npm run containers:clean
```

### Container Differences

| Command | Effect | Data |
|---------|--------|------|
| `stop` | Pauses containers | ✅ Keeps all data |
| `restart` | Stop + Start | ✅ Keeps all data |
| `down` | Removes containers | ❌ Destroys data |
| `down -v` | Removes + volumes | ❌ Destroys everything |

**Recommendation**: Use `stop`/`start` for daily use, `down` only when you want a fresh database.

### Access Points

- **Development App**: http://localhost:3001
- **Production App**: http://localhost:3000  
- **Database**: localhost:5433 (dev) / localhost:5432 (prod)
- **Redis**: localhost:6380 (dev) / localhost:6379 (prod)

## Smart Contract Development

### Build Contracts
```bash
forge build
```

### Run Tests
```bash
forge test
```

### Format Code
```bash
forge fmt
```

### Deploy Contracts
```bash
forge script script/DeployDurationFinance.s.sol:DeployDurationFinance \
  --rpc-url $BASE_TESTNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

### Test Integration
```bash
# Test complete liquidation functionality
./test-liquidation.sh

# Test real 1inch integration
./test-1inch-integration.sh
```

## Economic Model

### LP Revenue Streams
1. **USDC Premium**: Received when taker takes commitment
2. **Target Price Execution**: Get desired price on profitable exercise
3. **Asset Return**: Get collateral back if option expires worthless
4. **Simple Swap Benefit**: Better-than-expected execution at market price

### Taker Benefits
1. **Duration Flexibility**: Choose exact duration needed (1-365 days)
2. **Market Strike Price**: Strike set at current price when commitment taken
3. **Predictable Costs**: Lock in premium cost upfront via daily rate × duration
4. **Standard Exercise Rights**: Exercise when profitable

### Protocol Revenue (DUR Token)
1. **x402 API Fees**: $1 USDC per commitment created via external API endpoints
2. **Safety Margin Fees**: 0.01% on all 1inch settlements (governance adjustable)
3. **Slippage Capture**: Favorable execution vs quoted prices
4. **Simple Swap Profits**: Current price - LP target price differential
5. **Buy-back Arbitrage**: Profit from buying assets cheaper than forward price

**Important**: Frontend users pay NO fees for commitment creation or taking. The $1 fee applies ONLY to external API agents using the `/api/x402/commitments` endpoint.

### DUR Governance Token
- **Backing**: 99.99% ETH-backed at all times (Will.sol mechanics)
- **Price Discovery**: Based on ETH backing ratio
- **Governance**: Safety margin setting, multicall authority (80%+ holders)
- **Revenue Distribution**: All protocol profits automatically flow to token contract

## Deployed Contracts

### Base Sepolia (Testnet)
- **DurationOptions**: `0xae24A63598182C0fa52583e443D8A9828AB1FA81`
- **OneInchSettlementRouter**: `0x5cAF691351bD7989b681228aF3DEB82F2a562DBC`

### Base Mainnet
- **1inch Router**: `0x111111125421cA6dc452d289314280a0f8842A65`
- **WETH**: `0x4200000000000000000000000000000000000006`
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Protocol Architecture

### Core Contracts
- **DurationOptions.sol**: Main options protocol with duration-centric logic
- **OneInchSettlementRouter.sol**: 1inch settlement integration layer
- **IDurationOptions.sol**: Interface definitions and structs
- **DurationToken.sol**: DUR governance token (Will.sol based)

### Key Innovation: Off-Chain Commitments
- **Off-Chain Storage**: LP commitments stored in database with EIP-712 signatures
- **On-Chain Verification**: Signature and asset validation only when commitment is taken
- **Asset Checking**: Real-time validation of LP balance and allowances
- **Database Cleanup**: Automated removal of invalid/expired commitments
- **Commitment Cancellation**: LPs can cancel their own commitments before being taken

### Settlement & Revenue
- **1inch Integration**: Optimal execution via Limit Order Protocol, UnoswapRouter, GenericRouter
- **Simple Swap Mechanism**: Immediate execution when current price > LP target price
- **Revenue Capture**: Safety margins, slippage differentials, buy-back arbitrage
- **DUR Token Distribution**: All protocol profits flow to governance token holders

## Frontend Development

### Start Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm start
```

### Lint Code
```bash
npm run lint
```

## Wallet Integration

Duration.Finance supports multiple wallet options through OnchainKit and Wagmi:

### Supported Wallets

| Wallet | Type | Description |
|--------|------|-------------|
| **Coinbase Wallet** | Built-in | Recommended for Base chain |
| **MetaMask** | Browser Extension | Most popular Ethereum wallet |
| **WalletConnect** | Protocol | Connect 100+ mobile wallets |
| **Injected Wallets** | Browser Extensions | Rainbow, Trust Wallet, etc. |

### Wallet UI Behavior

- **Mini App Environment**: Shows single ConnectWallet button (OnchainKit default)
- **Web Environment**: Shows all 4 wallet options in a grid layout
- **Auto-detection**: Automatically detects available browser extension wallets

### Configuration

1. **Default Setup**: Works out-of-the-box with all major wallets
2. **WalletConnect**: Add project ID to enable mobile wallet support:
   ```env
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id
   ```
   Get your project ID from [WalletConnect Cloud](https://cloud.walletconnect.com)

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Smart Contract Deployment
DEPLOYER_PRIVATE_KEY=0x...
BASE_TESTNET_RPC_URL=https://...
BASE_RPC_URL=https://mainnet.base.org

# 1inch Integration
ONEINCH_API_KEY=...
ONEINCH_API_URL=https://api.1inch.dev

# Database
DATABASE_URL=postgresql://...

# Contract Addresses
NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS=0x...
NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=0xae24A63598182C0fa52583e443D8A9828AB1FA81

# API Security
ADMIN_API_KEY=your-admin-key-for-cleanup-endpoints
INTERNAL_API_KEY=your-internal-api-key-for-frontend
SECURITY_STRICT_MODE=true
ENABLE_IP_VALIDATION=true
ENABLE_ORIGIN_VALIDATION=true
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://duration.finance
ALLOWED_IPS=127.0.0.1,::1,localhost

# x402 Payment Configuration
X402_ENABLED=true
X402_COST_USDC=1
X402_RECIPIENT_ADDRESS=0x...
X402_CHAIN_ID=84532

# Wallet Integration (optional)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```

## Testing

### Smart Contract Tests
```bash
# Run all tests
forge test

# Run specific test file
forge test --match-path test/DurationOptions.t.sol

# Run specific test function
forge test --match-test testTakeCommitment

# Run with verbosity
forge test -vvv

# Test with gas reporting
forge test --gas-report
```

### Test Coverage
- **DurationOptions.sol**: Complete option lifecycle (commitment → taking → exercise)
- **OneInchIntegration**: Pricing, premium calculation, yield metrics
- **ExpiredOptions**: Liquidation and cleanup mechanisms
- **SettlementVerification**: Collateralization and owner functions

### API Testing

#### Frontend API (Internal Access)
```bash
# Test with browser-like headers (works)
curl -X GET http://localhost:3001/api/commitments \
  -H "User-Agent: Mozilla/5.0" \
  -H "Origin: http://localhost:3001"

# Test with API tool (blocked)
curl -X GET http://localhost:3001/api/commitments
# Returns: {"error":"Access Denied","alternativeEndpoint":"/api/x402/commitments"}
```

#### x402 API (External Access)
```bash
# Create commitment with payment (requires actual USDC payment)
curl -X POST http://localhost:3001/api/x402/commitments \
  -H "Content-Type: application/json" \
  -d '{"lp":"0x...","signature":"0x..."}'

# Read commitments (free)
curl -X GET http://localhost:3001/api/x402/commitments

# Test commitment cleanup
curl -X POST http://localhost:3001/api/commitments/cleanup \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
```

## Project Structure

```
duration.finance/
├── src/                          # Solidity contracts
│   ├── DurationOptions.sol       # Main options protocol
│   ├── settlement/               # 1inch integration
│   └── interfaces/               # Contract interfaces
├── app/                          # Next.js frontend
│   ├── components/               # React components
│   │   ├── LPCommitmentForm.tsx  # Create LP commitments
│   │   ├── LPCommitmentList.tsx  # View/cancel commitments
│   │   └── WalletConnection.tsx  # Multi-wallet support
│   └── api/                      # API routes
│       ├── commitments/          # Internal API (frontend only)
│       └── x402/                 # External API (payment required)
│           └── commitments/      # x402 protected endpoints
├── lib/                          # Shared utilities
│   ├── eip712/                   # EIP-712 signature verification
│   └── database/                 # Commitment storage & validation
├── test/                         # Solidity tests
└── 1inch-integration.md          # 1inch integration guide
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `forge test && npm test`
5. Update documentation if needed
6. Submit a pull request

### Development Guidelines
- **Smart Contracts**: Follow NatSpec documentation standards
- **Frontend**: Use TypeScript with strict mode
- **API**: Implement proper error handling and validation
- **Testing**: Maintain test coverage for all new features

## Key Files Reference

- **CLAUDE.md**: Complete project documentation and development guidelines
- **1inch-integration.md**: Detailed 1inch integration specification
- **farcaster.json**: Mini app manifest for Base integration
- **.env.example**: Environment configuration template

## Links

- **Documentation**: https://docs.duration.finance
- **Mini App**: Available in Base App directory
- **GitHub**: https://github.com/duration-finance/protocol
- **Discord**: https://discord.gg/duration-finance

## License

MIT License - see LICENSE file for details.

---

## Foundry Documentation

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

### Documentation

https://book.getfoundry.sh/

### Additional Foundry Commands

```shell
# Generate gas snapshots
forge snapshot

# Start local node
anvil

# Deploy with script
forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>

# Cast utilities
cast <subcommand>

# Help
forge --help
anvil --help
cast --help
```