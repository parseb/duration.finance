// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SettlementVerificationTest
 * @notice Test suite for enhanced settlement verification and collateralization
 */
contract SettlementVerificationTest is Test {
    DurationOptions public options;
    OneInchSettlementRouter public settlement;

    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        // Deploy contracts
        settlement = new OneInchSettlementRouter(admin);
        options = new DurationOptions(address(settlement), admin);
        
        // Setup test tokens and balances
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        
        // Mock WETH and USDC balances for testing
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector, alice),
            abi.encode(10 ether)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector, alice),
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
        
        // Add USDC as allowed asset
        vm.prank(admin);
        options.addAllowedAsset(USDC);
    }

    function testValidateSettlement() public {
        // Create a test option
        IDurationOptions.ActiveOption memory option = IDurationOptions.ActiveOption({
            commitmentHash: keccak256("test"),
            taker: bob,
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            targetPrice: 3500e18, // $3500
            premium: 100e6, // $100 USDC
            exerciseDeadline: block.timestamp + 1 days,
            currentPrice: 3500e18,
            optionType: IDurationOptions.OptionType.CALL,
            state: IDurationOptions.OptionState.TAKEN
        });
        
        // Create settlement params
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 0, // UNOSWAP
            minReturn: 3600e6, // $3600 USDC (profitable)
            deadline: block.timestamp + 1 hours,
            routingData: ""
        });
        
        // Test validation
        (bool isValid, uint256 expectedPayout, uint256 minimumRequired) = 
            options.validateSettlement(option, params);
        
        console.log("Settlement validation:");
        console.log("  Is Valid:", isValid);
        console.log("  Expected Payout:", expectedPayout);
        console.log("  Minimum Required:", minimumRequired);
        console.log("  Provided minReturn:", params.minReturn);
        
        // Should be valid since current price ($3500) > target price ($3500) for CALL
        // and minReturn ($3600) > expected LP payout ($3500)
        assertTrue(isValid, "Settlement should be valid");
        assertEq(expectedPayout, 3500e6, "Expected payout should be $3500 USDC");
        assertTrue(minimumRequired > expectedPayout, "Minimum required should include safety margin");
    }
    
    function testValidateSettlement_InsufficientReturn() public {
        IDurationOptions.ActiveOption memory option = IDurationOptions.ActiveOption({
            commitmentHash: keccak256("test2"),
            taker: bob,
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            targetPrice: 3500e18,
            premium: 100e6,
            exerciseDeadline: block.timestamp + 1 days,
            currentPrice: 3500e18,
            optionType: IDurationOptions.OptionType.CALL,
            state: IDurationOptions.OptionState.TAKEN
        });
        
        // Insufficient return - below expected LP payout
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 0,
            minReturn: 3000e6, // Below $3500 target
            deadline: block.timestamp + 1 hours,
            routingData: ""
        });
        
        (bool isValid,,) = options.validateSettlement(option, params);
        
        assertFalse(isValid, "Settlement should be invalid due to insufficient return");
    }
    
    function testValidateSettlement_Unprofitable() public {
        IDurationOptions.ActiveOption memory option = IDurationOptions.ActiveOption({
            commitmentHash: keccak256("test3"),
            taker: bob,
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            targetPrice: 4000e18, // $4000 (higher than current $3500)
            premium: 100e6,
            exerciseDeadline: block.timestamp + 1 days,
            currentPrice: 3500e18,
            optionType: IDurationOptions.OptionType.CALL,
            state: IDurationOptions.OptionState.TAKEN
        });
        
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 0,
            minReturn: 4100e6,
            deadline: block.timestamp + 1 hours,
            routingData: ""
        });
        
        (bool isValid,,) = options.validateSettlement(option, params);
        
        assertFalse(isValid, "Settlement should be invalid - option not profitable");
    }
    
    function testGetQuote() public {
        (uint256 amountOut, bool isValid) = options.getQuote(WETH, USDC, 1 ether);
        
        console.log("Quote test:");
        console.log("  Amount Out:", amountOut);
        console.log("  Is Valid:", isValid);
        
        assertTrue(isValid, "Quote should be valid");
        assertTrue(amountOut > 0, "Should return non-zero amount");
        assertEq(amountOut, 3500e6, "Should return $3500 USDC for 1 ETH");
    }
    
    function testGetQuote_InvalidPair() public {
        // Test with zero address (should fail)
        (uint256 amountOut, bool isValid) = options.getQuote(address(0), USDC, 1 ether);
        
        assertFalse(isValid, "Quote should be invalid for zero address");
        assertEq(amountOut, 0, "Should return zero amount for invalid quote");
    }
    
    function testSafetyMarginCalculation() public {
        // Test that safety margin is properly calculated
        uint256 expectedPayout = 3500e6; // $3500 USDC
        uint256 safetyMargin = options.safetyMargin(); // Should be 100 (0.01%)
        uint256 expectedMargin = (expectedPayout * safetyMargin) / 10000;
        uint256 minimumRequired = expectedPayout + expectedMargin;
        
        console.log("Safety margin test:");
        console.log("  Expected Payout:", expectedPayout);
        console.log("  Safety Margin:", safetyMargin);
        console.log("  Expected Margin Amount:", expectedMargin);
        console.log("  Minimum Required:", minimumRequired);
        
        assertEq(safetyMargin, 100, "Safety margin should be 0.01%");
        assertEq(expectedMargin, 35000000, "Margin should be $35 USDC"); // 3500e6 * 100 / 10000
        assertEq(minimumRequired, 3500350000, "Minimum should include safety margin");
    }
}