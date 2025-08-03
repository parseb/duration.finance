#!/bin/bash

# Duration.Finance Node.js Upgrade Script
# Upgrades Node.js to version 20+ for Next.js compatibility

set -e

echo "🔄 Duration.Finance Node.js Upgrade Script"
echo "=========================================="

# Check current Node.js version
CURRENT_NODE_VERSION=$(node --version)
echo "📊 Current Node.js version: $CURRENT_NODE_VERSION"

# Check if we need to upgrade
REQUIRED_VERSION="20.0.0"
echo "📋 Required Node.js version: >= $REQUIRED_VERSION"

# Extract major version number
CURRENT_MAJOR=$(echo $CURRENT_NODE_VERSION | sed 's/v//' | cut -d. -f1)
REQUIRED_MAJOR=$(echo $REQUIRED_VERSION | cut -d. -f1)

if [ "$CURRENT_MAJOR" -ge "$REQUIRED_MAJOR" ]; then
    echo "✅ Node.js version is compatible. No upgrade needed."
    exit 0
fi

echo "⚠️  Node.js upgrade required!"
echo ""

# Detect the operating system
OS="$(uname)"
case $OS in
    'Linux')
        echo "🐧 Detected Linux system"
        
        # Check if nvm is installed
        if command -v nvm &> /dev/null; then
            echo "📦 Using NVM to upgrade Node.js..."
            
            # Source nvm
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            
            # Install and use Node.js 20
            nvm install 20
            nvm use 20
            nvm alias default 20
            
            echo "✅ Node.js upgraded via NVM"
            
        elif command -v snap &> /dev/null; then
            echo "📦 Using Snap to upgrade Node.js..."
            sudo snap install node --classic --channel=20/stable
            echo "✅ Node.js upgraded via Snap"
            
        elif command -v apt &> /dev/null; then
            echo "📦 Using APT to upgrade Node.js..."
            
            # Add NodeSource repository
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            
            echo "✅ Node.js upgraded via APT"
            
        elif command -v yum &> /dev/null; then
            echo "📦 Using YUM to upgrade Node.js..."
            
            # Add NodeSource repository
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs npm
            
            echo "✅ Node.js upgraded via YUM"
        else
            echo "❌ No supported package manager found."
            echo "Please install Node.js 20+ manually from: https://nodejs.org/"
            exit 1
        fi
        ;;
        
    'Darwin')
        echo "🍎 Detected macOS system"
        
        if command -v nvm &> /dev/null; then
            echo "📦 Using NVM to upgrade Node.js..."
            
            # Source nvm
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            
            # Install and use Node.js 20
            nvm install 20
            nvm use 20
            nvm alias default 20
            
            echo "✅ Node.js upgraded via NVM"
            
        elif command -v brew &> /dev/null; then
            echo "📦 Using Homebrew to upgrade Node.js..."
            brew install node@20
            brew link node@20
            echo "✅ Node.js upgraded via Homebrew"
        else
            echo "❌ Neither NVM nor Homebrew found."
            echo "Please install Node.js 20+ manually from: https://nodejs.org/"
            exit 1
        fi
        ;;
        
    *)
        echo "❌ Unsupported operating system: $OS"
        echo "Please install Node.js 20+ manually from: https://nodejs.org/"
        exit 1
        ;;
esac

# Verify the upgrade
echo ""
echo "🔍 Verifying Node.js upgrade..."
NEW_NODE_VERSION=$(node --version)
NEW_NPM_VERSION=$(npm --version)

echo "✅ New Node.js version: $NEW_NODE_VERSION"
echo "✅ NPM version: $NEW_NPM_VERSION"

# Check if the version meets requirements
NEW_MAJOR=$(echo $NEW_NODE_VERSION | sed 's/v//' | cut -d. -f1)
if [ "$NEW_MAJOR" -ge "$REQUIRED_MAJOR" ]; then
    echo "🎉 Node.js upgrade successful!"
    
    # Update npm to latest
    echo "📦 Updating npm to latest version..."
    npm install -g npm@latest
    
    # Clean install dependencies
    echo "🧹 Cleaning and reinstalling dependencies..."
    rm -rf node_modules package-lock.json
    npm install
    
    echo "✅ Dependencies reinstalled successfully"
    
    # Test the build
    echo "🔨 Testing Next.js build..."
    if npm run build; then
        echo "🎉 Build successful! Node.js upgrade complete."
    else
        echo "❌ Build failed. Please check for any compatibility issues."
        exit 1
    fi
    
else
    echo "❌ Upgrade failed. Current version still: $NEW_NODE_VERSION"
    exit 1
fi

echo ""
echo "🚀 Node.js upgrade completed successfully!"
echo "📋 Summary:"
echo "   - Previous version: $CURRENT_NODE_VERSION"
echo "   - Current version: $NEW_NODE_VERSION"
echo "   - Next.js compatibility: ✅"
echo ""
echo "💡 Next steps:"
echo "   1. Run 'npm run dev' to start development server"
echo "   2. Run 'npm run build' to test production build"
echo "   3. Update your IDE/editor Node.js version if needed"