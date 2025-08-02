// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SettlementVerificationTest
 * @notice Test suite for settlement verification and collateralization
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
        options = new DurationOptions(address(settlement));
        
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
        
        // USDC is automatically added as allowed asset
    }

    function testBasicSettlementSetup() public view {
        // Test that settlement router is properly configured
        address settlementAddr = options.settlementRouter();
        assertEq(settlementAddr, address(settlement));
        
        console.log("Settlement router properly configured");
    }

    function testCollateralizationCheck() public {
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.8 ether, // Within limits (0.001-1 WETH)
            premiumAmount: 60 * 1e6, // $60 per day
            minDurationDays: 1,
            maxDurationDays: 10,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });

        // Take the option directly (no on-chain storage needed)
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 1, // Unoswap
            routingData: "",
            minReturn: 0,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(bob);
        uint256 optionId = options.takeCommitment(commitment, 7, params);

        // Verify collateral is locked
        uint256 totalLocked = options.totalLocked(WETH);
        assertEq(totalLocked, 0.8 ether);
        
        // Verify option details
        IDurationOptions.ActiveOption memory option = options.getOption(optionId);
        assertEq(option.amount, 0.8 ether);
        assertEq(option.lp, alice);
        assertEq(option.taker, bob);
        
        console.log("Collateralization verification completed");
    }

    function testOwnerFunctions() public {
        address owner = options.owner();
        
        vm.startPrank(owner);
        
        // Test safety margin setting
        options.setSafetyMargin(5); // 0.05%
        
        // Test settlement router setting
        address newRouter = makeAddr("newRouter");
        options.setSettlementRouter(newRouter);
        assertEq(options.settlementRouter(), newRouter);
        
        // Test emergency pause/unpause
        options.emergencyPause();
        options.emergencyUnpause();
        
        vm.stopPrank();
        
        console.log("Owner functions test completed");
    }

    function testGetCurrentPrice() public view {
        uint256 price = options.getCurrentPrice(WETH);
        assertGt(price, 0);
        
        console.log("Current WETH price (mock):", price / 1e18);
    }

    function testNonceManagement() public {
        uint256 initialNonce = options.getNonce(alice);
        
        // Create commitment for nonce test
        IDurationOptions.OptionCommitment memory commitment = IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.6 ether, // Within limits (0.001-1 WETH)
            premiumAmount: 40 * 1e6,
            minDurationDays: 1,
            maxDurationDays: 5,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: initialNonce,
            signature: abi.encodePacked(bytes32(0), bytes32(0), uint8(27))
        });

        // Mock LP balance and allowance checks
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector, alice),
            abi.encode(10 ether)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.allowance.selector, alice, address(options)),
            abi.encode(10 ether)
        );

        // Mock transfers
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
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

        // Take commitment (this increments nonce)
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 1,
            routingData: "",
            minReturn: 0,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(bob);
        options.takeCommitment(commitment, 3, params);

        uint256 newNonce = options.getNonce(alice);
        assertEq(newNonce, initialNonce + 1); // Should increment by 1
        
        console.log("Nonce management test completed");
    }
}