# Duration.Finance

A fully-collateralized options protocol for Base mini apps using 1inch for settlement.

## Overview

Duration.Finance is a complete rewrite that adopts timing logic and ERC-712 signature patterns while integrating with 1inch for settlement. The protocol supports both LP and Taker commitments, creating a unified marketplace for options trading.

### Key Features

- **Dual Commitment System**: Both LP and Taker can create commitments
- **100% Collateralization**: Every option fully backed by LP assets  
- **1inch Integration**: Real-time pricing and settlement via 1inch aggregator
- **Price Simulation Protection**: Enhanced liquidation with manipulation detection
- **Multi-Wallet Support**: MetaMask, Coinbase Wallet, WalletConnect, and more
- **Base Mini App Ready**: MiniKit integration with standard web app parity

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

## Deployed Contracts

### Base Sepolia (Testnet)
- **DurationOptions**: `0xae24A63598182C0fa52583e443D8A9828AB1FA81`
- **OneInchSettlementRouter**: `0x5cAF691351bD7989b681228aF3DEB82F2a562DBC`

## Protocol Architecture

### Core Contracts
- **DurationOptions.sol**: Main options protocol with enhanced liquidation
- **OneInchSettlementRouter.sol**: 1inch settlement integration layer  
- **VerifySignature.sol**: EIP-712 signature verification

### Key Features
- **Enhanced Liquidation**: Price simulation protection prevents manipulation
- **Dual Commitments**: LP and Taker commitment support
- **Real 1inch Pricing**: Live market data from 1inch aggregator
- **Revenue Protection**: Protocol captures profit from expired options

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

### Configuration

1. **Default Setup**: Works out-of-the-box with MetaMask and Coinbase Wallet
2. **WalletConnect**: Add project ID to enable mobile wallet support:
   ```env
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id
   ```
   Get your project ID from [WalletConnect Cloud](https://cloud.walletconnect.com)

### Usage in App

The app automatically detects available wallets and shows connection options:

- **Primary Button**: OnchainKit's default connect button
- **"Show all wallet options"**: Reveals all available wallets
- **Auto-detection**: Automatically finds browser extension wallets

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Smart Contract Deployment
DEPLOYER_PRIVATE_KEY=0x...
BASE_TESTNET_RPC_URL=https://...

# 1inch Integration
ONEINCH_API_KEY=...
ONEINCH_API_URL=https://api.1inch.dev

# Database
DATABASE_URL=postgresql://...

# Contract Addresses
NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=0xae24A63598182C0fa52583e443D8A9828AB1FA81

# Wallet Integration (optional)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```

## Testing

### Smart Contract Tests
```bash
# Run all tests
forge test

# Run specific test
forge test --match-test testLiquidateExpiredOption

# Run with verbosity
forge test -vvv
```

### Integration Tests
```bash
# Test deployed contracts
./test-liquidation.sh

# Test 1inch API integration  
./test-1inch-integration.sh
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `forge test`
5. Submit a pull request

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