// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/DurationOptions.sol";

contract DeployDurationOptions is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DURATION_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== DurationOptions Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);
        
        // Contract addresses
        address usdcToken;
        address wethToken;
        address oneInchRouter;
        
        // Set addresses based on chain ID
        if (block.chainid == 84532) {
            // Base Sepolia
            usdcToken = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
            wethToken = 0x4200000000000000000000000000000000000006;
            oneInchRouter = 0x111111125421cA6dc452d289314280a0f8842A65;
            console.log("USDC Address:", usdcToken);
            console.log("WETH Address:", wethToken);
            console.log("1inch Router:", oneInchRouter);
        } else if (block.chainid == 8453) {
            // Base Mainnet
            usdcToken = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
            wethToken = 0x4200000000000000000000000000000000000006;
            oneInchRouter = 0x111111125421cA6dc452d289314280a0f8842A65;
            console.log("USDC Address:", usdcToken);
            console.log("WETH Address:", wethToken);
            console.log("1inch Router:", oneInchRouter);
        } else {
            revert("Unsupported chain ID");
        }
        
        // Check balance
        if (deployer.balance < 0.01 ether) {
            console.log("WARNING: Low balance for deployment. Current balance:", deployer.balance);
            console.log("Consider using an address with more ETH for gas fees.");
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the unified contract
        DurationOptions durationOptions = new DurationOptions(
            usdcToken,
            wethToken,
            oneInchRouter,
            deployer
        );
        
        console.log("\n=== DEPLOYMENT COMPLETED ===");
        console.log("DurationOptions deployed at:", address(durationOptions));
        console.log("");
        console.log("Contract Features:");
        console.log("- Complete PUT/CALL option mechanics");
        console.log("- Immediate WETH selling for PUT options");
        console.log("- EIP-712 signature verification");
        console.log("- 1inch integration for settlement");
        console.log("- Expired PUT option settlement");
        console.log("");
        console.log("Update your environment:");
        if (block.chainid == 84532) {
            console.log("NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=", address(durationOptions));
        } else if (block.chainid == 8453) {
            console.log("NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE=", address(durationOptions));
        }
        console.log("");
        console.log("Verify contract on BaseScan:");
        console.log("forge verify-contract", address(durationOptions), "contracts/DurationOptions.sol:DurationOptions --chain", block.chainid);
        
        vm.stopBroadcast();
    }
}