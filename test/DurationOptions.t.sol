// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationToken} from "../src/DurationToken.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DurationOptionsTest
 * @author Duration.Finance
 * @notice Test suite for Duration.Finance options protocol
 */
contract DurationOptionsTest is Test {
    DurationToken public durToken;
    DurationOptions public options;
    SettlementRouter public settlement;

    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public genesis = makeAddr("genesis");
    address public admin = makeAddr("admin");

    event OptionTaken(uint256 indexed optionId, bytes32 indexed commitmentHash, address indexed taker, uint256 amount, uint256 premium);
    event OptionExercised(uint256 indexed optionId, uint256 profit, uint256 protocolFee);

    function setUp() public {
        // Deploy contracts
        durToken = new DurationToken(genesis, address(0));
        settlement = new SettlementRouter(address(0));
        options = new DurationOptions(payable(address(durToken)), address(settlement), admin);

        // Setup test tokens and balances
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        
        // Mock WETH balances for testing
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector, alice),
            abi.encode(10 ether)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(options)),
            abi.encode(0)
        );
    }

    function testCreateCommitment() public {
        // Create a basic commitment
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        
        vm.startPrank(alice);
        
        // Should not revert for valid commitment
        options.createCommitment(commitment);
        
        vm.stopPrank();
    }

    function testTakeOption() public {
        // Setup commitment
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        // Store commitment (simulating frontend flow)
        vm.prank(alice);
        options.storeCommitment(commitment);

        // Mock WETH transfer
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 1 ether),
            abi.encode(true)
        );

        // Take option
        vm.startPrank(bob);
        
        uint256 premium = options.calculatePremium(commitmentHash, 1 ether);
        console.log("Premium:", premium);
        
        vm.expectEmit(true, true, true, true);
        emit OptionTaken(1, commitmentHash, bob, 1 ether, premium);
        
        uint256 optionId = options.takeOption{value: premium}(commitmentHash, 1 ether);
        
        assertEq(optionId, 1);
        
        vm.stopPrank();
    }

    function testCalculatePremium() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        uint256 premium = options.calculatePremium(commitmentHash, 1 ether);
        
        // Premium should be |current_price - target_price| * amount
        // Mock current price is 3500e18, target is 4000e18
        // Premium = (4000 - 3500) * 1 = 500 ETH
        assertEq(premium, 500 ether);
    }

    function testIsExercisable() public {
        // Setup and take option
        _setupAndTakeOption();
        
        // Option should be exercisable if profitable
        bool exercisable = options.isExercisable(1);
        
        // With mock price 3500 and target 4000, CALL option should not be exercisable
        assertEq(exercisable, false);
    }

    function testLiquidateExpiredOption() public {
        uint256 optionId = _setupAndTakeOption();
        
        // Fast forward past expiration
        vm.warp(block.timestamp + 2 days);
        
        // Mock WETH transfer back to LP
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transfer.selector, alice, 1 ether),
            abi.encode(true)
        );
        
        // Anyone can liquidate expired option
        vm.prank(bob);
        options.liquidateExpiredOption(optionId);
        
        // Check option state
        IDurationOptions.ActiveOption memory option = options.getOption(optionId);
        assertEq(uint256(option.state), uint256(IDurationOptions.OptionState.EXPIRED));
    }

    function testDurationTokenIntegration() public {
        // Test DUR token minting
        vm.startPrank(alice);
        
        uint256 mintAmount = durToken.mintFromETH{value: 1 ether}();
        assertGt(mintAmount, 0);
        
        uint256 balance = durToken.balanceOf(alice);
        assertEq(balance, mintAmount);
        
        vm.stopPrank();
    }

    function testFailTakeOptionInsufficientPremium() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 1 ether),
            abi.encode(true)
        );
        
        vm.startPrank(bob);
        
        // Try to take option with insufficient premium
        options.takeOption{value: 1 ether}(commitmentHash, 1 ether); // Should fail
        
        vm.stopPrank();
    }

    function testFailTakeOptionExpiredCommitment() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        commitment.expiry = block.timestamp - 1; // Expired
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        vm.startPrank(bob);
        options.takeOption{value: 1000 ether}(commitmentHash, 1 ether); // Should fail
        vm.stopPrank();
    }

    // Helper functions

    function _createTestCommitment() internal view returns (IDurationOptions.OptionCommitment memory) {
        return IDurationOptions.OptionCommitment({
            lp: alice,
            asset: WETH,
            amount: 10 ether,
            targetPrice: 4000e18, // $4000
            maxDuration: 1 days,
            fractionable: true,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: hex"" // Empty for testing
        });
    }

    function _getCommitmentHash(IDurationOptions.OptionCommitment memory commitment) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            commitment.lp,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.maxDuration,
            commitment.fractionable,
            commitment.expiry,
            commitment.nonce
        ));
    }

    function _setupAndTakeOption() internal returns (uint256 optionId) {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 1 ether),
            abi.encode(true)
        );
        
        vm.startPrank(bob);
        uint256 premium = options.calculatePremium(commitmentHash, 1 ether);
        optionId = options.takeOption{value: premium}(commitmentHash, 1 ether);
        vm.stopPrank();
    }
}