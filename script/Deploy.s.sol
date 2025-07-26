// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {DurationToken} from "../src/DurationToken.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";

/**
 * @title Deploy
 * @author Duration.Finance
 * @notice Deployment script for Duration.Finance contracts
 */
contract Deploy is Script {
    
    // Deployment addresses will be stored here
    DurationToken public durToken;
    DurationOptions public options; 
    SettlementRouter public settlement;

    // Configuration
    address public constant GENESIS = 0x1234567890123456789012345678901234567890; // Replace with actual
    address public constant ADMIN = 0x1234567890123456789012345678901234567890; // Replace with actual

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying Duration.Finance contracts...");
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // Deploy DurationToken first (needs to be deployed before options protocol)
        console.log("Deploying DurationToken...");
        durToken = new DurationToken(GENESIS, address(0)); // Will update options address after deployment
        console.log("DurationToken deployed at:", address(durToken));

        // Deploy SettlementRouter
        console.log("Deploying SettlementRouter...");
        settlement = new SettlementRouter(address(0)); // Will update options address after deployment
        console.log("SettlementRouter deployed at:", address(settlement));

        // Deploy DurationOptions
        console.log("Deploying DurationOptions...");
        options = new DurationOptions(
            payable(address(durToken)),
            address(settlement),
            ADMIN
        );
        console.log("DurationOptions deployed at:", address(options));

        // Update cross-references
        console.log("Updating cross-references...");
        
        // Note: These would need to be done via governance/admin functions in production
        // For now, we'll log the addresses for manual setup
        
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("DurationToken:", address(durToken));
        console.log("DurationOptions:", address(options));
        console.log("SettlementRouter:", address(settlement));
        
        console.log("\n=== POST-DEPLOYMENT SETUP ===");
        console.log("1. Update DurationToken options protocol address to:", address(options));
        console.log("2. Update SettlementRouter options protocol address to:", address(options));
        console.log("3. Verify contracts on BaseScan");
        console.log("4. Initialize frontend with contract addresses");

        vm.stopBroadcast();
    }

    function deployTestnet() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying to Base Sepolia testnet...");
        
        // Use deployer as genesis and admin for testnet
        address deployer = vm.addr(deployerPrivateKey);
        
        durToken = new DurationToken(deployer, address(0));
        settlement = new SettlementRouter(address(0));
        options = new DurationOptions(payable(address(durToken)), address(settlement), deployer);

        console.log("Testnet deployment complete:");
        console.log("DurationToken:", address(durToken));
        console.log("DurationOptions:", address(options));
        console.log("SettlementRouter:", address(settlement));

        vm.stopBroadcast();
    }
}