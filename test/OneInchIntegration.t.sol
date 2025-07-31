// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title OneInchIntegration Test
 * @notice Tests Duration.Finance integration with 1inch pricing and settlement
 */
contract OneInchIntegrationTest is Test {
    
    DurationOptions public options;
    OneInchSettlementRouter public settlementRouter;
    
    // Base addresses
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    // Test addresses
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address admin = makeAddr("admin");
    
    function setUp() public {
        // Deploy contracts
        vm.startPrank(admin);
        
        // Deploy settlement router
        settlementRouter = new OneInchSettlementRouter(admin);
        
        // Deploy main options contract
        options = new DurationOptions(address(settlementRouter));
        
        vm.stopPrank();
        
        // Give test accounts some tokens for testing
        deal(WETH, alice, 100 ether);
        deal(USDC, alice, 100000e6); // 100k USDC
        deal(WETH, bob, 100 ether);
        deal(USDC, bob, 100000e6);
        
        console.log("Contracts deployed and setup completed");
    }
    
    function testGetCurrentPrice() public view {
        uint256 wethPrice = options.getCurrentPrice(WETH);
        
        // Should return mock price from contract
        assertGt(wethPrice, 0);
        
        console.log("WETH mock price:", wethPrice / 1e18);
    }
    
    function testLPCommitmentWithDurationPricing() public {
        vm.startPrank(alice);
        
        // Approve tokens (mock the approval)
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.approve.selector, address(options), 10 ether),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.approve.selector, address(options), 100000e6),
            abi.encode(true)
        );
        
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            dailyPremiumUsdc: 50 * 1e6, // $50 per day
            minLockDays: 1,
            maxDurationDays: 14,
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            isFramentable: true,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27)) // Mock signature
        });
        
        // Store commitment
        options.createLPCommitment(commitment);
        
        vm.stopPrank();
        
        // Verify commitment was stored
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        IDurationOptions.OptionCommitment memory stored = options.getCommitment(commitmentHash);
        
        assertEq(stored.lp, alice);
        assertEq(stored.dailyPremiumUsdc, 50 * 1e6);
        
        console.log("LP commitment created with daily premium: $50");
    }
    
    function testPremiumCalculationForDuration() public {
        // Create commitment
        vm.startPrank(alice);
        
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            dailyPremiumUsdc: 30 * 1e6, // $30 per day
            minLockDays: 1,
            maxDurationDays: 21,
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            isFramentable: true,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });
        
        options.createLPCommitment(commitment);
        
        vm.stopPrank();
        
        // Calculate premium for different durations
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        uint256 premium7Days = options.calculatePremiumForDuration(commitmentHash, 7);
        uint256 premium14Days = options.calculatePremiumForDuration(commitmentHash, 14);
        uint256 premium21Days = options.calculatePremiumForDuration(commitmentHash, 21);
        
        // Premium should be dailyPremium * duration
        assertEq(premium7Days, 30 * 1e6 * 7);   // $210
        assertEq(premium14Days, 30 * 1e6 * 14); // $420
        assertEq(premium21Days, 30 * 1e6 * 21); // $630
        
        console.log("Premium for 7 days: $", premium7Days / 1e6);
        console.log("Premium for 14 days: $", premium14Days / 1e6);
        console.log("Premium for 21 days: $", premium21Days / 1e6);
    }

    function testDurationValidation() public {
        vm.startPrank(alice);
        
        // Create commitment with specific duration range
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            dailyPremiumUsdc: 40 * 1e6,
            minLockDays: 5,  // Minimum 5 days
            maxDurationDays: 15, // Maximum 15 days
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            isFramentable: true,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });
        
        options.createLPCommitment(commitment);
        
        vm.stopPrank();
        
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        
        // Test duration validation
        assertFalse(options.isValidDuration(commitmentHash, 3));  // Below minimum
        assertFalse(options.isValidDuration(commitmentHash, 4));  // Below minimum
        assertTrue(options.isValidDuration(commitmentHash, 5));   // At minimum
        assertTrue(options.isValidDuration(commitmentHash, 10));  // Within range
        assertTrue(options.isValidDuration(commitmentHash, 15));  // At maximum
        assertFalse(options.isValidDuration(commitmentHash, 16)); // Above maximum
        
        console.log("Duration validation test completed");
    }

    function testYieldMetrics() public {
        vm.startPrank(alice);
        
        // Create commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            lp: alice,
            asset: WETH,
            amount: 2 ether, // 2 WETH
            dailyPremiumUsdc: 80 * 1e6, // $80 per day
            minLockDays: 1,
            maxDurationDays: 30,
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            isFramentable: true,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });
        
        options.createLPCommitment(commitment);
        
        vm.stopPrank();
        
        bytes32 commitmentHash = keccak256(abi.encode(commitment));
        uint256 currentPrice = options.getCurrentPrice(WETH);
        
        (uint256 dailyYield, uint256 annualizedYield) = options.getLPYieldMetrics(commitmentHash, currentPrice);
        
        assertGt(dailyYield, 0);
        assertGt(annualizedYield, 0);
        assertEq(annualizedYield, dailyYield * 365);
        
        console.log("Daily yield (basis points):", dailyYield);
        console.log("Annualized yield (basis points):", annualizedYield);
    }
}