// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";

/**
 * @title Deploy
 * @author Duration.Finance
 * @notice Deployment script for Duration.Finance contracts
 */
contract Deploy is Script {
    
    // Deployment addresses will be stored here
    DurationOptions public options; 
    OneInchSettlementRouter public settlement;

    // Configuration
    address public constant OWNER = 0x1234567890123456789012345678901234567890; // Replace with actual

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying Duration.Finance contracts...");
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // Deploy SettlementRouter
        console.log("Deploying OneInchSettlementRouter...");
        settlement = new OneInchSettlementRouter(OWNER);
        console.log("OneInchSettlementRouter deployed at:", address(settlement));

        // Deploy DurationOptions  
        console.log("Deploying DurationOptions...");
        options = new DurationOptions(
            address(settlement),
            OWNER
        );
        console.log("DurationOptions deployed at:", address(options));
        
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("DurationOptions:", address(options));
        console.log("SettlementRouter:", address(settlement));
        console.log("Protocol Owner:", OWNER);
        
        console.log("\n=== POST-DEPLOYMENT SETUP ===");
        console.log("1. Update SettlementRouter options protocol address to:", address(options));
        console.log("2. Verify contracts on BaseScan");
        console.log("3. Initialize frontend with contract addresses");

        vm.stopBroadcast();
    }

    function deployTestnet() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying to Base Sepolia testnet...");
        
        // Use deployer as owner for testnet
        address deployer = vm.addr(deployerPrivateKey);
        
        settlement = new OneInchSettlementRouter(deployer);
        options = new DurationOptions(address(settlement), deployer);

        console.log("Testnet deployment complete:");
        console.log("DurationOptions:", address(options));
        console.log("SettlementRouter:", address(settlement));
        console.log("Protocol Owner:", deployer);

        vm.stopBroadcast();
    }
}