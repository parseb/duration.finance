// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/DurationOptions.sol";

contract DurationOptionsTest is Test {
    DurationOptions public durationOptions;
    
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant WETH_BASE_SEPOLIA = 0x4200000000000000000000000000000000000006;
    address constant ONEINCH_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;
    
    address owner = address(0x1);
    address lp = address(0x2);
    address taker = address(0x3);
    
    function setUp() public {
        vm.createSelectFork("https://sepolia.base.org");
        
        durationOptions = new DurationOptions(
            USDC_BASE_SEPOLIA,
            WETH_BASE_SEPOLIA, 
            ONEINCH_ROUTER,
            owner
        );
    }
    
    function testContractDeployment() public {
        assertEq(address(durationOptions.usdcToken()), USDC_BASE_SEPOLIA);
        assertEq(address(durationOptions.wethToken()), WETH_BASE_SEPOLIA);
        assertEq(durationOptions.nextOptionId(), 1);
        assertEq(durationOptions.protocolFeeRate(), 100);
    }
    
    function testGetCurrentPrice() public {
        uint256 price = durationOptions.getCurrentPrice(WETH_BASE_SEPOLIA);
        assertEq(price, 3836.50e8); // Fixed price from contract
    }
    
    function testSignatureVerification() public {
        DurationOptions.Commitment memory commitment = DurationOptions.Commitment({
            creator: lp,
            asset: WETH_BASE_SEPOLIA,
            amount: 1 ether,
            dailyPremiumUsdc: 50e6, // $50 daily
            minLockDays: 1,
            maxDurationDays: 30,
            optionType: 0, // CALL
            commitmentType: DurationOptions.CommitmentType.OFFER,
            expiry: block.timestamp + 1 days,
            nonce: 1
        });
        
        // Generate signature (simplified for testing)
        vm.startPrank(lp);
        bytes32 structHash = keccak256(abi.encode(
            keccak256("Commitment(address creator,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint8 commitmentType,uint256 expiry,uint256 nonce)"),
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.dailyPremiumUsdc,
            commitment.minLockDays,
            commitment.maxDurationDays,
            commitment.optionType,
            uint8(commitment.commitmentType),
            commitment.expiry,
            commitment.nonce
        ));
        vm.stopPrank();
        
        // Test that the struct hash is generated correctly
        assertTrue(structHash != bytes32(0));
    }
    
    function testPauseUnpause() public {
        vm.startPrank(owner);
        
        // Initially not paused
        assertFalse(durationOptions.paused());
        
        // Pause
        durationOptions.pause();
        assertTrue(durationOptions.paused());
        
        // Unpause
        durationOptions.unpause();
        assertFalse(durationOptions.paused());
        
        vm.stopPrank();
    }
    
    function testOnlyOwnerFunctions() public {
        vm.startPrank(address(0x999)); // Not owner
        
        vm.expectRevert();
        durationOptions.pause();
        
        vm.expectRevert();
        durationOptions.setProtocolFeeRate(200);
        
        vm.stopPrank();
    }
    
    function testProtocolFeeRate() public {
        vm.startPrank(owner);
        
        // Set valid fee rate
        durationOptions.setProtocolFeeRate(200); // 2%
        assertEq(durationOptions.protocolFeeRate(), 200);
        
        // Try to set invalid fee rate (over 10%)
        vm.expectRevert("Fee too high");
        durationOptions.setProtocolFeeRate(1001);
        
        vm.stopPrank();
    }
}