#!/bin/bash

# Duration.Finance Environment Setup Script
# Configures environment variables and validates configuration

set -e

echo "🔧 Duration.Finance Environment Setup"
echo "====================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Function to check if a variable is set and not empty
check_env_var() {
    local var_name=$1
    local var_value=${!var_name}
    local is_optional=${2:-false}
    
    if [ -z "$var_value" ]; then
        if [ "$is_optional" = true ]; then
            print_warning "$var_name is not set (optional)"
            return 1
        else
            print_error "$var_name is required but not set"
            return 1
        fi
    else
        print_success "$var_name is configured"
        return 0
    fi
}

# Function to validate Ethereum address format
validate_address() {
    local address=$1
    local name=$2
    
    if [[ $address =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        print_success "$name address format is valid: $address"
        return 0
    else
        print_error "$name address format is invalid: $address"
        return 1
    fi
}

# Function to validate private key format
validate_private_key() {
    local key=$1
    local name=$2
    
    if [[ $key =~ ^0x[a-fA-F0-9]{64}$ ]]; then
        print_success "$name private key format is valid"
        return 0
    else
        print_error "$name private key format is invalid"
        return 1
    fi
}

# Function to test API endpoint
test_api_endpoint() {
    local url=$1
    local name=$2
    
    print_status "Testing $name endpoint..."
    
    if curl -s --connect-timeout 5 --max-time 10 "$url" > /dev/null 2>&1; then
        print_success "$name endpoint is accessible"
        return 0
    else
        print_error "$name endpoint is not accessible: $url"
        return 1
    fi
}

# Check if environment argument is provided
ENVIRONMENT=${1:-""}

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 <environment>"
    echo ""
    echo "Available environments:"
    echo "  testnet     - Base Sepolia testnet configuration"
    echo "  production  - Production configuration (requires secure setup)"
    echo "  development - Local development configuration"
    echo ""
    exit 1
fi

# Load the appropriate environment file
case $ENVIRONMENT in
    "testnet")
        ENV_FILE=".env.testnet"
        print_status "Setting up Base Sepolia testnet environment"
        ;;
    "production")
        ENV_FILE=".env.production"
        print_status "Setting up production environment"
        ;;
    "development")
        ENV_FILE=".env"
        print_status "Setting up development environment"
        ;;
    *)
        print_error "Unknown environment: $ENVIRONMENT"
        exit 1
        ;;
esac

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    print_error "Environment file not found: $ENV_FILE"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        print_warning "For production, copy .env.production.template to .env.production and fill in actual values"
    fi
    
    exit 1
fi

print_success "Found environment file: $ENV_FILE"

# Load environment variables
print_status "Loading environment variables from $ENV_FILE"
set -a
source $ENV_FILE
set +a

echo ""
echo "🔍 Environment Validation"
echo "========================"

# Track validation results
VALIDATION_ERRORS=0

# Core Application Configuration
print_status "Validating core application configuration..."
check_env_var "NODE_ENV" || ((VALIDATION_ERRORS++))
check_env_var "NEXT_PUBLIC_APP_ENV" || ((VALIDATION_ERRORS++))

# Blockchain Configuration
print_status "Validating blockchain configuration..."

if [ "$ENVIRONMENT" = "testnet" ]; then
    check_env_var "BASE_TESTNET_RPC_URL" || ((VALIDATION_ERRORS++))
    check_env_var "NEXT_PUBLIC_WETH_ADDRESS_BASE_SEPOLIA" || ((VALIDATION_ERRORS++))
    check_env_var "NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA" || ((VALIDATION_ERRORS++))
else
    check_env_var "BASE_RPC_URL" || ((VALIDATION_ERRORS++))
fi

check_env_var "PRIVATE_KEY" || ((VALIDATION_ERRORS++))
check_env_var "DEPLOYER_PRIVATE_KEY" || ((VALIDATION_ERRORS++))

# Validate private key formats
if [ ! -z "$PRIVATE_KEY" ]; then
    validate_private_key "$PRIVATE_KEY" "PRIVATE_KEY" || ((VALIDATION_ERRORS++))
fi

if [ ! -z "$DEPLOYER_PRIVATE_KEY" ]; then
    validate_private_key "$DEPLOYER_PRIVATE_KEY" "DEPLOYER_PRIVATE_KEY" || ((VALIDATION_ERRORS++))
fi

# API Configuration
print_status "Validating API configuration..."
check_env_var "ONEINCH_API_KEY" || ((VALIDATION_ERRORS++))
check_env_var "ONEINCH_API_URL" || ((VALIDATION_ERRORS++))
check_env_var "NEXT_PUBLIC_ONCHAINKIT_API_KEY" || ((VALIDATION_ERRORS++))

# Database Configuration
print_status "Validating database configuration..."
check_env_var "DATABASE_URL" || ((VALIDATION_ERRORS++))

# Security Configuration
print_status "Validating security configuration..."
check_env_var "JWT_SECRET" || ((VALIDATION_ERRORS++))
check_env_var "ENCRYPTION_KEY" || ((VALIDATION_ERRORS++))
check_env_var "INTERNAL_API_KEY" || ((VALIDATION_ERRORS++))

# x402 Payment System
print_status "Validating x402 payment configuration..."
check_env_var "X402_PAYMENT_RECIPIENT" || ((VALIDATION_ERRORS++))
check_env_var "X402_CHAIN_ID" || ((VALIDATION_ERRORS++))

if [ ! -z "$X402_PAYMENT_RECIPIENT" ]; then
    validate_address "$X402_PAYMENT_RECIPIENT" "X402_PAYMENT_RECIPIENT" || ((VALIDATION_ERRORS++))
fi

echo ""
echo "🌐 Network Connectivity Tests"
echo "============================="

# Test RPC endpoints
if [ "$ENVIRONMENT" = "testnet" ] && [ ! -z "$BASE_TESTNET_RPC_URL" ]; then
    test_api_endpoint "$BASE_TESTNET_RPC_URL" "Base Sepolia RPC" || ((VALIDATION_ERRORS++))
elif [ ! -z "$BASE_RPC_URL" ]; then
    test_api_endpoint "$BASE_RPC_URL" "Base RPC" || ((VALIDATION_ERRORS++))
fi

# Test 1inch API
if [ ! -z "$ONEINCH_API_URL" ]; then
    test_api_endpoint "${ONEINCH_API_URL}/healthcheck" "1inch API" || print_warning "1inch API health check failed (may be normal)"
fi

# Test database connection
print_status "Testing database connection..."
if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
    if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        print_success "Database connection successful"
    else
        print_error "Database connection failed"
        ((VALIDATION_ERRORS++))
    fi
else
    print_warning "psql not available or DATABASE_URL not set - skipping database test"
fi

echo ""
echo "📋 Environment Summary"
echo "====================="

print_status "Environment: $ENVIRONMENT"
print_status "Configuration file: $ENV_FILE"

if [ "$ENVIRONMENT" = "testnet" ]; then
    echo ""
    print_status "Testnet Configuration:"
    echo "  - Chain ID: ${X402_CHAIN_ID:-84532}"
    echo "  - RPC URL: ${BASE_TESTNET_RPC_URL}"
    echo "  - WETH: ${NEXT_PUBLIC_WETH_ADDRESS_BASE_SEPOLIA}"
    echo "  - USDC: ${NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA}"
    echo "  - Payment Recipient: ${X402_PAYMENT_RECIPIENT}"
fi

echo ""
if [ $VALIDATION_ERRORS -eq 0 ]; then
    print_success "✅ All validations passed! Environment is properly configured."
    
    # Create a status file
    echo "ENVIRONMENT_STATUS=ready" > .env.status
    echo "ENVIRONMENT_TYPE=$ENVIRONMENT" >> .env.status
    echo "VALIDATION_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .env.status
    
    print_success "Environment status saved to .env.status"
    
    echo ""
    echo "🚀 Next Steps:"
    case $ENVIRONMENT in
        "testnet")
            echo "  1. Run: npm install (if not done already)"
            echo "  2. Run: npm run dev (to start development server)"
            echo "  3. Run: ./scripts/deploy-testnet.sh (to deploy contracts)"
            echo "  4. Follow TESTNET_MANUAL_TESTING.md for validation"
            ;;
        "production")
            echo "  1. Ensure all secrets are stored in secure vault"
            echo "  2. Run security audit: npm run security:audit"
            echo "  3. Deploy to staging first for final validation"
            echo "  4. Follow production deployment checklist"
            ;;
        "development")
            echo "  1. Run: npm install"
            echo "  2. Run: npm run dev"
            echo "  3. Start local blockchain if needed"
            ;;
    esac
    
else
    print_error "❌ Environment validation failed with $VALIDATION_ERRORS error(s)."
    echo ""
    echo "🔧 Troubleshooting:"
    echo "  1. Check the environment file: $ENV_FILE"
    echo "  2. Ensure all required variables are set"
    echo "  3. Verify API keys and endpoints are correct"
    echo "  4. Test network connectivity"
    echo ""
    exit 1
fi

echo ""
print_success "🎉 Environment setup completed successfully!"