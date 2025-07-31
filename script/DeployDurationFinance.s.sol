// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";

/**
 * @title DeployDurationFinance
 * @notice Comprehensive deployment script for Duration.Finance protocol
 * @dev Deploys all contracts and sets up initial configuration
 */
contract DeployDurationFinance is Script {
    
    // Deployment addresses will be stored here
    address public settlementRouter;
    address public durationOptions;
    
    // Configuration
    address public constant WETH_BASE = 0x4200000000000000000000000000000000000006;
    address public constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    function run() external virtual {
        // Get deployer private key
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== Duration.Finance Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy Settlement Router
        settlementRouter = _deploySettlementRouter(deployer);
        
        // 2. Deploy DurationOptions (main contract)
        durationOptions = _deployDurationOptions(deployer, settlementRouter);
        
        // 4. Setup initial configuration
        _setupConfiguration();
        
        vm.stopBroadcast();
        
        // 5. Display deployment summary
        _displayDeploymentSummary();
    }
    
    
    /**
     * @notice Deploy OneInchSettlementRouter
     */
    function _deploySettlementRouter(address deployer) internal returns (address) {
        console.log("\n2. Deploying OneInchSettlementRouter...");
        
        OneInchSettlementRouter router = new OneInchSettlementRouter(deployer);
        
        console.log("   OneInchSettlementRouter deployed:", address(router));
        return address(router);
    }
    
    /**
     * @notice Deploy DurationOptions main contract
     */
    function _deployDurationOptions(
        address deployer,
        address _settlementRouter
    ) internal returns (address) {
        console.log("\n2. Deploying DurationOptions...");
        
        DurationOptions options = new DurationOptions(_settlementRouter);
        
        console.log("   DurationOptions deployed:", address(options));
        return address(options);
    }
    
    /**
     * @notice Setup initial configuration
     */
    function _setupConfiguration() internal {
        console.log("\n3. Setting up initial configuration...");
        
        DurationOptions options = DurationOptions(payable(durationOptions));
        
        // USDC is automatically added in constructor
        // WETH is also automatically added as allowed asset
        console.log("   WETH and USDC configured as allowed assets");
        
        console.log("   Configuration completed!");
    }
    
    /**
     * @notice Display deployment summary
     */
    function _displayDeploymentSummary() internal view {
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Chain ID:", block.chainid);
        console.log("");
        console.log("OneInchSettlementRouter:");
        console.log("   Address:", settlementRouter);
        console.log("");
        console.log("DurationOptions (Main Contract):");
        console.log("   Address:", durationOptions);
        console.log("");
        console.log("Supported Assets:");
        console.log("   WETH:", WETH_BASE);
        console.log("   USDC:", USDC_BASE);
        console.log("");
        console.log("Deployment completed successfully!");
        console.log("");
        console.log("Next Steps:");
        console.log("1. Update frontend environment variables:");
        console.log("   NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=", durationOptions);
        console.log("2. Test 1inch quote integration");
        console.log("3. Test contract functionality with real swaps");
        console.log("");
    }
}

/**
 * @title DeployTestnet
 * @notice Specialized testnet deployment with additional test utilities
 */
contract DeployTestnet is DeployDurationFinance {
    
    function run() external override {
        console.log("=== TESTNET DEPLOYMENT ===");
        // Call parent deployment logic manually since super.run() doesn't work here
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy Settlement Router
        settlementRouter = _deploySettlementRouter(deployer);
        
        // 2. Deploy DurationOptions (main contract)
        durationOptions = _deployDurationOptions(deployer, settlementRouter);
        
        // 4. Setup initial configuration
        _setupConfiguration();
        
        vm.stopBroadcast();
        
        // 5. Display deployment summary
        _displayDeploymentSummary();
        
        // Note: _setupTestnetExtras() commented out - requires external call to updatePrice
        // _setupTestnetExtras(); // Commented out - done externally
    }
    
    /**
     * @notice Setup testnet-specific configurations
     */
    function _setupTestnetExtras() internal {
        console.log("\n4. Setting up testnet extras...");
        
        console.log("   Prices now sourced directly from 1inch quotes");
        console.log("   No price oracle setup needed");
        console.log("   Settlement router ready for 1inch integration");
    }
}