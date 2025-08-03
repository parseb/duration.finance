// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ExpiredOptionsTest
 * @notice Test suite for enhanced expired option liquidation logic
 */
contract ExpiredOptionsTest is Test {
    DurationOptions public options;
    OneInchSettlementRouter public settlement;

    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice"); // LP
    address public bob = makeAddr("bob");     // Taker
    address public liquidator = makeAddr("liquidator");

    function setUp() public {
        // Deploy contracts
        settlement = new OneInchSettlementRouter(admin);
        options = new DurationOptions();
        
        // Setup test tokens and balances
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(liquidator, 100 ether);
        
        // Mock token interactions
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector),
            abi.encode(10 ether)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transfer.selector),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector),
            abi.encode(100000e6)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transfer.selector),
            abi.encode(true)
        );
    }

    function testCreateLPCommitmentAndExpire() public {
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.5 ether, // Within new limits (0.001-1 WETH)
            premiumAmount: 50 * 1e6, // $50 per day
            minDurationDays: 1,
            maxDurationDays: 7,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27)) // Mock signature
        });

        // Take the commitment directly (no on-chain storage needed)
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 1, // Unoswap
            routingData: "",
            minReturn: 0,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(bob);
        uint256 optionId = options.takeCommitment(commitment, 7, params);

        // Wait for expiration
        vm.warp(block.timestamp + 8 days);

        // Liquidate expired option
        vm.prank(liquidator);
        options.liquidateExpiredOption(optionId, 1000); // 10% max price movement

        // Verify option state
        IDurationOptions.ActiveOption memory option = options.getOption(optionId);
        assertTrue(uint256(option.state) >= uint256(IDurationOptions.OptionState.EXPIRED));

        console.log("Expired option liquidation test completed");
    }

    function testCalculatePremiumForDuration() public {
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.8 ether, // Within new limits (0.001-1 WETH)
            premiumAmount: 30 * 1e6, // $30 per day
            minDurationDays: 1,
            maxDurationDays: 14,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });

        // Test premium calculation for different durations (no on-chain storage needed)
        uint256 premium1Day = options.calculatePremiumForDuration(commitment, 1);
        uint256 premium7Days = options.calculatePremiumForDuration(commitment, 7);
        uint256 premium14Days = options.calculatePremiumForDuration(commitment, 14);

        assertEq(premium1Day, 30 * 1e6); // $30
        assertEq(premium7Days, 210 * 1e6); // $210
        assertEq(premium14Days, 420 * 1e6); // $420

        console.log("Premium calculation test completed");
    }

    function testIsValidDuration() public {
        // Create LP commitment with specific duration range
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.7 ether, // Within new limits (0.001-1 WETH)
            premiumAmount: 40 * 1e6,
            minDurationDays: 3, // Minimum 3 days
            maxDurationDays: 10, // Maximum 10 days
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });

        // Test duration validation (no on-chain storage needed)
        assertFalse(options.isValidDuration(commitment, 1)); // Below minimum
        assertFalse(options.isValidDuration(commitment, 2)); // Below minimum
        assertTrue(options.isValidDuration(commitment, 3)); // At minimum
        assertTrue(options.isValidDuration(commitment, 7)); // Within range
        assertTrue(options.isValidDuration(commitment, 10)); // At maximum
        assertFalse(options.isValidDuration(commitment, 11)); // Above maximum

        console.log("Duration validation test completed");
    }

    function testGetLPYieldMetrics() public {
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.9 ether, // Within new limits (0.001-1 WETH)
            premiumAmount: 100 * 1e6, // $100 per day
            minDurationDays: 1,
            maxDurationDays: 30,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });

        uint256 currentPrice = options.getCurrentPrice(WETH); // Mock price
        
        (uint256 dailyYield, uint256 annualizedYield) = options.getLPYieldMetrics(commitment, currentPrice);

        assertGt(dailyYield, 0);
        assertGt(annualizedYield, 0);
        assertEq(annualizedYield, dailyYield * 365);

        console.log("Yield metrics test completed");
        console.log("Daily yield (basis points):", dailyYield);
        console.log("Annualized yield (basis points):", annualizedYield);
    }

    function testGetCurrentPrice() public view {
        uint256 price = options.getCurrentPrice(WETH);
        console.log("Current WETH price:", price);
        assertGt(price, 0);
    }
}