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
        
        // Deploy DurationOptions with integrated settlement
        DurationOptions durationOptions = new DurationOptions();
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
