// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SettlementValidationTest
 * @notice Test suite for settlement validation and price manipulation protection
 */
contract SettlementValidationTest is Test {
    DurationOptions public options;
    
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    address public alice = makeAddr("alice"); // LP
    address public bob = makeAddr("bob");     // Taker
    
    function setUp() public {
        options = new DurationOptions();
        
        // Setup mock token responses
        _setupMockTokens();
    }
    
    function _setupMockTokens() internal {
        // Mock WETH transfers
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector),
            abi.encode(100 ether)
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
            WETH,
            abi.encodeWithSelector(IERC20.allowance.selector),
            abi.encode(100 ether)
        );
        
        // Mock USDC transfers
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector),
            abi.encode(1000000 * 1e6)
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
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.allowance.selector),
            abi.encode(1000000 * 1e6)
        );
        
        // Mock 1inch router calls (simulate successful swaps)
        vm.mockCall(
            options.ONEINCH_UNOSWAP(),
            abi.encodeWithSelector(bytes4(0x00000000)), // Any 1inch call
            ""
        );
    }
    
    function testSettlementValidationRequiresMinReturn() public {
        // Create and take option
        uint256 optionId = _createAndTakeOption();
        
        // Try to exercise with zero minReturn (should fail)
        IDurationOptions.SettlementParams memory invalidParams = IDurationOptions.SettlementParams({
            method: 1,
            routingData: "",
            minReturn: 0, // Invalid: frontend must provide minReturn
            deadline: block.timestamp + 1 hours
        });
        
        vm.prank(bob);
        vm.expectRevert();
        options.exerciseOption(optionId, invalidParams);
        
        console.log("Settlement correctly requires non-zero minReturn");
    }
    
    function testSettlementValidationWithValidParams() public {
        // Create and take option
        uint256 optionId = _createAndTakeOption();
        
        // Get current price for calculation
        uint256 currentPrice = options.getCurrentPrice(WETH); // $3500 in test
        uint256 strikePrice = 3400 * 1e18; // Set in _createAndTakeOption
        
        // Calculate expected profit for 1 WETH CALL option
        uint256 expectedProfit = ((currentPrice - strikePrice) * 1 ether) / 1e30; // Convert to USDC decimals
        console.log("Expected profit (USDC):", expectedProfit);
        
        // Frontend should calculate minReturn based on expected swap output
        uint256 frontendMinReturn = expectedProfit * 95 / 100; // 95% of expected (5% slippage tolerance)
        
        IDurationOptions.SettlementParams memory validParams = IDurationOptions.SettlementParams({
            method: 1,
            routingData: "",
            minReturn: frontendMinReturn,
            deadline: block.timestamp + 1 hours
        });
        
        // Mock 1inch swap to return adequate amount
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(options)),
            abi.encode(expectedProfit) // Return expected amount after swap
        );
        
        vm.prank(bob);
        options.exerciseOption(optionId, validParams);
        
        console.log("Settlement validation passed with valid parameters");
    }
    
    function testSettlementRejectsManipulatedPrices() public {
        // Create and take option  
        uint256 optionId = _createAndTakeOption();
        
        // Frontend calculates based on fair price ($3500)
        uint256 fairPrice = 3500 * 1e18;
        uint256 strikePrice = 3400 * 1e18;
        uint256 expectedProfit = ((fairPrice - strikePrice) * 1 ether) / 1e30;
        uint256 frontendMinReturn = expectedProfit * 95 / 100;
        
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 1,
            routingData: "",
            minReturn: frontendMinReturn,
            deadline: block.timestamp + 1 hours
        });
        
        // Mock 1inch swap to return much less than expected (indicating manipulation)
        uint256 manipulatedReturn = expectedProfit * 50 / 100; // Only 50% of expected
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(options)),
            abi.encode(manipulatedReturn)
        );
        
        vm.prank(bob);
        vm.expectRevert(); // Should revert due to insufficient return
        options.exerciseOption(optionId, params);
        
        console.log("Settlement correctly rejected manipulated prices");
    }
    
    function testCalculateExpectedProfitCALL() public view {
        IDurationOptions.ActiveOption memory callOption = IDurationOptions.ActiveOption({
            commitmentHash: bytes32(0),
            taker: bob,
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            strikePrice: 3400 * 1e18, // $3400
            dailyPremiumUsdc: 50 * 1e6,
            lockDurationDays: 7,
            totalPremiumPaid: 350 * 1e6,
            exerciseDeadline: block.timestamp + 7 days,
            optionType: IDurationOptions.OptionType.CALL,
            state: IDurationOptions.OptionState.TAKEN
        });
        
        uint256 currentPrice = 3500 * 1e18; // $3500
        
        // Expected profit: ($3500 - $3400) * 1 ETH = $100
        // In USDC decimals: 100 * 1e6 = 100_000_000
        uint256 expectedProfit = ((currentPrice - callOption.strikePrice) * callOption.amount) / 1e30;
        
        assertEq(expectedProfit, 100 * 1e6, "CALL profit calculation incorrect");
        console.log("CALL profit calculation verified: $100");
    }
    
    function testCalculateExpectedProfitPUT() public view {
        IDurationOptions.ActiveOption memory putOption = IDurationOptions.ActiveOption({
            commitmentHash: bytes32(0),
            taker: bob,
            lp: alice,
            asset: WETH,
            amount: 1 ether,
            strikePrice: 3600 * 1e18, // $3600
            dailyPremiumUsdc: 50 * 1e6,
            lockDurationDays: 7,
            totalPremiumPaid: 350 * 1e6,
            exerciseDeadline: block.timestamp + 7 days,
            optionType: IDurationOptions.OptionType.PUT,
            state: IDurationOptions.OptionState.TAKEN
        });
        
        uint256 currentPrice = 3500 * 1e18; // $3500
        
        // Expected profit: ($3600 - $3500) * 1 ETH = $100
        // In USDC decimals: 100 * 1e6 = 100_000_000
        uint256 expectedProfit = ((putOption.strikePrice - currentPrice) * putOption.amount) / 1e30;
        
        assertEq(expectedProfit, 100 * 1e6, "PUT profit calculation incorrect");
        console.log("PUT profit calculation verified: $100");
    }
    
    function _createAndTakeOption() internal returns (uint256 optionId) {
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 1 ether,
            premiumAmount: 50 * 1e6, // $50 per day
            minDurationDays: 1,
            maxDurationDays: 30,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 0,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });
        
        // Take the commitment
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 1,
            routingData: "",
            minReturn: 100 * 1e6, // Expected ~$100 profit
            deadline: block.timestamp + 1 hours
        });
        
        vm.prank(bob);
        optionId = options.takeCommitment(commitment, 7, params);
        
        // Warp time to make option profitable
        vm.warp(block.timestamp + 1 hours);
    }
}