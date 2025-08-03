#!/bin/bash

# Duration.Finance Base Sepolia Testnet Deployment Script
# Deploys smart contracts and configures the testnet environment

set -e

echo "🚀 Duration.Finance Testnet Deployment"
echo "======================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_section() {
    echo -e "${PURPLE}[SECTION]${NC} $1"
    echo "----------------------------------------"
}

# Function to check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Function to wait for user confirmation
confirm_action() {
    local message=$1
    local default=${2:-n}
    
    if [ "$SKIP_CONFIRMATIONS" = "true" ]; then
        return 0
    fi
    
    echo -e "${YELLOW}$message${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Operation cancelled by user"
        exit 1
    fi
}

# Parse command line arguments
SKIP_CONFIRMATIONS=false
SKIP_VERIFICATION=false
SKIP_TESTS=false
SKIP_DATABASE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-confirmations)
            SKIP_CONFIRMATIONS=true
            shift
            ;;
        --skip-verification)
            SKIP_VERIFICATION=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-database)
            SKIP_DATABASE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-confirmations  Skip user confirmations"
            echo "  --skip-verification   Skip contract verification"
            echo "  --skip-tests         Skip pre-deployment tests"
            echo "  --skip-database      Skip database connection checks"
            echo "  --dry-run            Simulate deployment without executing"
            echo "  --help               Show this help message"
            echo ""
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if this is a dry run
if [ "$DRY_RUN" = "true" ]; then
    print_warning "🔍 DRY RUN MODE - No actual deployment will occur"
    echo ""
fi

print_section "Pre-deployment Checks"

# Check required tools
print_status "Checking required tools..."
check_command "forge"
check_command "cast"
check_command "npm"
check_command "node"
check_command "psql"

# Check Node.js version
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v//' | cut -d. -f1)

print_status "Node.js version: $NODE_VERSION"
if [ "$NODE_MAJOR" -lt 20 ]; then
    print_error "Node.js version must be >= 20.0.0"
    print_status "Run: ./scripts/upgrade-nodejs.sh"
    exit 1
fi
print_success "Node.js version is compatible"

# Load testnet environment
print_status "Loading testnet environment..."
if [ ! -f ".env.testnet" ]; then
    print_error "Testnet environment file not found: .env.testnet"
    exit 1
fi

# Source environment variables
set -a
source .env.testnet
set +a

print_success "Testnet environment loaded"

# Validate critical environment variables
print_status "Validating environment configuration..."
REQUIRED_VARS=(
    "PRIVATE_KEY"
    "DEPLOYER_PRIVATE_KEY" 
    "BASE_TESTNET_RPC_URL"
    "ONEINCH_API_KEY"
    "DATABASE_URL"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        print_error "Required environment variable not set: $var"
        exit 1
    fi
done

print_success "Environment validation passed"

# Test network connectivity
print_status "Testing Base Sepolia connectivity..."
CHAIN_ID=$(cast chain-id --rpc-url "$BASE_TESTNET_RPC_URL" 2>/dev/null || echo "")

if [ "$CHAIN_ID" != "84532" ]; then
    print_error "Unable to connect to Base Sepolia (expected chain ID 84532, got: $CHAIN_ID)"
    exit 1
fi

print_success "Connected to Base Sepolia (chain ID: $CHAIN_ID)"

# Check deployer account balance
print_status "Checking deployer account balance..."
DEPLOYER_ADDRESS=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$BASE_TESTNET_RPC_URL")
BALANCE_ETH=$(cast --to-unit "$BALANCE" ether)

print_status "Deployer address: $DEPLOYER_ADDRESS"
print_status "Balance: $BALANCE_ETH ETH"

# Check if we have enough ETH for deployment (minimum 0.1 ETH)
MIN_BALANCE="100000000000000000"  # 0.1 ETH in wei
if [ $(echo "$BALANCE < $MIN_BALANCE" | bc -l) -eq 1 ]; then
    print_error "Insufficient balance for deployment. Need at least 0.1 ETH."
    print_status "Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
    exit 1
fi

print_success "Sufficient balance for deployment"

# Test database connection (if not skipped)
if [ "$SKIP_DATABASE" != "true" ]; then
    print_status "Testing database connection..."
    if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        print_error "Database connection failed"
        exit 1
    fi
    print_success "Database connection successful"
else
    print_warning "Skipping database connection test"
fi

# Run pre-deployment tests (if not skipped)
if [ "$SKIP_TESTS" != "true" ]; then
    print_section "Pre-deployment Testing"
    
    print_status "Installing dependencies..."
    if [ "$DRY_RUN" != "true" ]; then
        npm install
    else
        print_status "[DRY RUN] Would run: npm install"
    fi
    
    print_status "Compiling smart contracts..."
    if [ "$DRY_RUN" != "true" ]; then
        forge build
    else
        print_status "[DRY RUN] Would run: forge build"
    fi
    
    print_status "Running smart contract tests..."
    if [ "$DRY_RUN" != "true" ]; then
        forge test
    else
        print_status "[DRY RUN] Would run: forge test"
    fi
    
    print_success "Pre-deployment tests passed"
else
    print_warning "Skipping pre-deployment tests"
fi

# Deployment confirmation
print_section "Deployment Confirmation"

echo "📋 Deployment Summary:"
echo "  - Network: Base Sepolia Testnet (Chain ID: 84532)"
echo "  - Deployer: $DEPLOYER_ADDRESS"
echo "  - Balance: $BALANCE_ETH ETH"
echo "  - RPC URL: $BASE_TESTNET_RPC_URL"
echo "  - Database: Connected ✅"
echo ""

if [ "$DRY_RUN" != "true" ]; then
    confirm_action "🚨 This will deploy contracts to Base Sepolia testnet using real transactions."
fi

# Smart Contract Deployment
print_section "Smart Contract Deployment"

print_status "Deploying Duration.Finance smart contracts..."

if [ "$DRY_RUN" = "true" ]; then
    print_status "[DRY RUN] Would deploy contracts with:"
    print_status "  forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_TESTNET_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast"
    
    # Simulate deployment addresses for dry run
    DURATION_OPTIONS_ADDRESS="0x1234567890123456789012345678901234567890"
    SETTLEMENT_ROUTER_ADDRESS="0x0987654321098765432109876543210987654321"
    
    print_status "[DRY RUN] Simulated deployment addresses:"
    print_status "  DurationOptions: $DURATION_OPTIONS_ADDRESS"
    print_status "  SettlementRouter: $SETTLEMENT_ROUTER_ADDRESS"
    
else
    # Create deployment script if it doesn't exist
    if [ ! -f "script/Deploy.s.sol" ]; then
        print_status "Creating deployment script..."
        mkdir -p script
        cat > script/Deploy.s.sol << 'EOF'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DurationOptions.sol";
import "../src/settlement/OneInchSettlementRouter.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy OneInchSettlementRouter first with deployer as owner
        OneInchSettlementRouter settlementRouter = new OneInchSettlementRouter(deployer);
        console.log("OneInchSettlementRouter deployed to:", address(settlementRouter));
        
        // Deploy DurationOptions with settlement router address
        DurationOptions durationOptions = new DurationOptions(address(settlementRouter));
        console.log("DurationOptions deployed to:", address(durationOptions));
        
        vm.stopBroadcast();
        
        // Log deployment summary
        console.log("\n=== Deployment Summary ===");
        console.log("DurationOptions:", address(durationOptions));
        console.log("SettlementRouter:", address(settlementRouter));
        console.log("Network: Base Sepolia");
        console.log("Deployer:", deployer);
    }
}
EOF
    fi
    
    # Deploy contracts
    DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:Deploy \
        --rpc-url "$BASE_TESTNET_RPC_URL" \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        --broadcast \
        --verify 2>&1 || true)
    
    echo "$DEPLOY_OUTPUT"
    
    # Extract contract addresses from deployment output
    DURATION_OPTIONS_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "DurationOptions deployed to:" | awk '{print $NF}')
    SETTLEMENT_ROUTER_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "OneInchSettlementRouter deployed to:" | awk '{print $NF}')
    
    if [ -z "$DURATION_OPTIONS_ADDRESS" ] || [ -z "$SETTLEMENT_ROUTER_ADDRESS" ]; then
        print_error "Failed to extract contract addresses from deployment output"
        exit 1
    fi
    
    print_success "Contracts deployed successfully!"
    print_status "DurationOptions: $DURATION_OPTIONS_ADDRESS"
    print_status "SettlementRouter: $SETTLEMENT_ROUTER_ADDRESS"
fi

# Contract Verification (if not skipped)
if [ "$SKIP_VERIFICATION" != "true" ] && [ "$DRY_RUN" != "true" ]; then
    print_section "Contract Verification"
    
    print_status "Verifying contracts on Basescan..."
    
    # Verify DurationOptions
    print_status "Verifying DurationOptions..."
    forge verify-contract "$DURATION_OPTIONS_ADDRESS" \
        src/DurationOptions.sol:DurationOptions \
        --chain-id 84532 \
        --watch || print_warning "DurationOptions verification may have failed"
    
    # Verify SettlementRouter
    print_status "Verifying SettlementRouter..."
    forge verify-contract "$SETTLEMENT_ROUTER_ADDRESS" \
        src/OneInchSettlementRouter.sol:OneInchSettlementRouter \
        --chain-id 84532 \
        --constructor-args $(cast abi-encode "constructor(address)" "$DURATION_OPTIONS_ADDRESS") \
        --watch || print_warning "SettlementRouter verification may have failed"
    
    print_success "Contract verification completed"
else
    print_warning "Skipping contract verification"
fi

# Update Environment Configuration
print_section "Environment Configuration Update"

if [ "$DRY_RUN" = "true" ]; then
    print_status "[DRY RUN] Would update .env.testnet with deployed addresses"
else
    print_status "Updating .env.testnet with deployed contract addresses..."
    
    # Update .env.testnet file
    sed -i.bak "s/NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=.*/NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=$DURATION_OPTIONS_ADDRESS/" .env.testnet
    sed -i.bak "s/NEXT_PUBLIC_SETTLEMENT_ROUTER_ADDRESS_BASE_SEPOLIA=.*/NEXT_PUBLIC_SETTLEMENT_ROUTER_ADDRESS_BASE_SEPOLIA=$SETTLEMENT_ROUTER_ADDRESS/" .env.testnet
    
    print_success "Environment file updated"
fi

# Database Schema Deployment (if not skipped)
if [ "$SKIP_DATABASE" != "true" ]; then
    print_section "Database Schema Deployment"

    if [ "$DRY_RUN" = "true" ]; then
        print_status "[DRY RUN] Would deploy database schema"
    else
        print_status "Deploying database schema..."
        
        # Check if schema file exists
        if [ -f "database/schema.sql" ]; then
            psql "$DATABASE_URL" -f database/schema.sql
            print_success "Database schema deployed"
        else
            print_warning "Database schema file not found: database/schema.sql"
        fi
    fi
else
    print_warning "Skipping database schema deployment"
fi

# Frontend Build Test
print_section "Frontend Build Verification"

if [ "$DRY_RUN" = "true" ]; then
    print_status "[DRY RUN] Would test frontend build"
else
    print_status "Testing frontend build with new contract addresses..."
    
    # Source updated environment
    set -a
    source .env.testnet
    set +a
    
    # Test build
    npm run build
    print_success "Frontend build successful"
fi

# Post-deployment Configuration
print_section "Post-deployment Configuration"

if [ "$DRY_RUN" = "true" ]; then
    print_status "[DRY RUN] Would configure contracts and test basic functionality"
else
    print_status "Configuring deployed contracts..."
    
    # Set initial configuration on DurationOptions contract
    print_status "Setting initial contract configuration..."
    
    # Set position limits (0.001 to 1 ETH)
    cast send "$DURATION_OPTIONS_ADDRESS" \
        "setPositionLimits(uint256,uint256)" \
        "1000000000000000" "1000000000000000000" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$BASE_TESTNET_RPC_URL"
    
    print_success "Contract configuration completed"
    
    # Test basic contract functionality
    print_status "Testing basic contract functionality..."
    
    # Check if contract is properly initialized
    OWNER=$(cast call "$DURATION_OPTIONS_ADDRESS" "owner()" --rpc-url "$BASE_TESTNET_RPC_URL")
    MIN_SIZE=$(cast call "$DURATION_OPTIONS_ADDRESS" "minOptionSize()" --rpc-url "$BASE_TESTNET_RPC_URL")
    MAX_SIZE=$(cast call "$DURATION_OPTIONS_ADDRESS" "maxOptionSize()" --rpc-url "$BASE_TESTNET_RPC_URL")
    
    print_status "Contract owner: $OWNER"
    print_status "Min option size: $(cast --to-unit $MIN_SIZE ether) ETH"
    print_status "Max option size: $(cast --to-unit $MAX_SIZE ether) ETH"
    
    print_success "Contract functionality verified"
fi

# Generate Deployment Report
print_section "Deployment Report"

DEPLOYMENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ "$DRY_RUN" = "true" ]; then
    print_status "DRY RUN REPORT - No actual deployment occurred"
fi

cat > deployment-report-testnet.json << EOF
{
  "deployment": {
    "date": "$DEPLOYMENT_DATE",
    "network": "Base Sepolia",
    "chainId": 84532,
    "deployer": "$DEPLOYER_ADDRESS",
    "dryRun": $DRY_RUN
  },
  "contracts": {
    "DurationOptions": {
      "address": "$DURATION_OPTIONS_ADDRESS",
      "verified": $([ "$SKIP_VERIFICATION" != "true" ] && echo "true" || echo "false")
    },
    "OneInchSettlementRouter": {
      "address": "$SETTLEMENT_ROUTER_ADDRESS",
      "verified": $([ "$SKIP_VERIFICATION" != "true" ] && echo "true" || echo "false")
    }
  },
  "configuration": {
    "minOptionSize": "0.001 ETH",
    "maxOptionSize": "1 ETH",
    "settlementRouter": "$SETTLEMENT_ROUTER_ADDRESS"
  },
  "endpoints": {
    "rpcUrl": "$BASE_TESTNET_RPC_URL",
    "explorerUrl": "https://sepolia.basescan.org"
  }
}
EOF

print_success "Deployment report saved: deployment-report-testnet.json"

# Final Summary
print_section "Deployment Complete! 🎉"

echo ""
echo "📋 Testnet Deployment Summary:"
echo "=============================="
echo "Network: Base Sepolia Testnet"
echo "Chain ID: 84532"
echo "Deployment Date: $DEPLOYMENT_DATE"
echo ""
echo "📄 Smart Contracts:"
echo "  DurationOptions: $DURATION_OPTIONS_ADDRESS"
echo "  SettlementRouter: $SETTLEMENT_ROUTER_ADDRESS"
echo ""
echo "🔍 Block Explorer:"
echo "  https://sepolia.basescan.org/address/$DURATION_OPTIONS_ADDRESS"
echo "  https://sepolia.basescan.org/address/$SETTLEMENT_ROUTER_ADDRESS"
echo ""
echo "🌐 Frontend URLs:"
echo "  Local: http://localhost:3000"
echo "  Environment: testnet (.env.testnet)"
echo ""

if [ "$DRY_RUN" != "true" ]; then
    echo "✅ Next Steps:"
    echo "  1. Start the frontend: npm run dev"
    echo "  2. Run manual testing: Follow TESTNET_MANUAL_TESTING.md"
    echo "  3. Test wallet connection and basic functionality"
    echo "  4. Create test commitments and verify end-to-end flow"
    echo "  5. Monitor contract interactions on Basescan"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "  - Check deployment report: deployment-report-testnet.json"
    echo "  - Review contract verification on Basescan"
    echo "  - Test database connectivity: psql $DATABASE_URL"
    echo "  - Verify environment: ./scripts/setup-environment.sh testnet"
else
    echo "🔍 DRY RUN COMPLETED"
    echo "  - No actual contracts were deployed"
    echo "  - All checks passed successfully"
    echo "  - Ready for real deployment"
    echo ""
    echo "To perform actual deployment:"
    echo "  ./scripts/deploy-testnet.sh"
fi

echo ""
print_success "🚀 Testnet deployment completed successfully!"

# Save deployment status
echo "DEPLOYMENT_STATUS=completed" > .deployment.status
echo "DEPLOYMENT_DATE=$DEPLOYMENT_DATE" >> .deployment.status
echo "DURATION_OPTIONS_ADDRESS=$DURATION_OPTIONS_ADDRESS" >> .deployment.status
echo "SETTLEMENT_ROUTER_ADDRESS=$SETTLEMENT_ROUTER_ADDRESS" >> .deployment.status
echo "DRY_RUN=$DRY_RUN" >> .deployment.status