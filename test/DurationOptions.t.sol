// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
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
    DurationOptions public options;
    SettlementRouter public settlement;

    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint256 public alicePrivateKey = 0x1;
    uint256 public bobPrivateKey = 0x2;
    uint256 public genesisPrivateKey = 0x3;
    uint256 public adminPrivateKey = 0x4;
    
    address public alice = vm.addr(alicePrivateKey);
    address public bob = vm.addr(bobPrivateKey);
    address public genesis = vm.addr(genesisPrivateKey);
    address public admin = vm.addr(adminPrivateKey);

    event OptionTaken(uint256 indexed optionId, bytes32 indexed commitmentHash, address indexed taker, uint256 amount, uint256 premium);
    event OptionExercised(uint256 indexed optionId, uint256 profit, uint256 protocolFee);

    function setUp() public {
        // Deploy contracts
        settlement = new SettlementRouter(address(0));
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
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(options)),
            abi.encode(0)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector, bob),
            abi.encode(100000 * 1e6) // 100k USDC
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

    function testStoreAndRetrieveCommitment() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        // Check if commitment was stored by trying to calculate premium
        uint256 currentPrice = options.getCurrentPrice(WETH);
        uint256 premium = options.calculatePremium(commitmentHash, currentPrice);
        console.log("Premium:", premium);
        assertGt(premium, 0);
    }

    function testTakeOption() public {
        // Setup commitment
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        // Store commitment (simulating frontend flow)
        vm.prank(alice);
        options.storeCommitment(commitment);

        // Mock WETH and USDC transfers
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 10 ether),
            abi.encode(true)
        );
        
        uint256 currentPrice = options.getCurrentPrice(WETH);
        uint256 premium = options.calculatePremium(commitmentHash, currentPrice);
        
        // Mock USDC transfers for premium payment
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transferFrom.selector, bob, address(options), premium),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transfer.selector, alice, premium),
            abi.encode(true)
        );

        // Take option
        vm.startPrank(bob);
        
        console.log("Premium:", premium);
        
        vm.expectEmit(true, true, true, true);
        emit OptionTaken(1, commitmentHash, bob, 10 ether, premium);
        
        try options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL) returns (uint256 optionId) {
            assertEq(optionId, 1);
        } catch Error(string memory reason) {
            console.log("Error reason:", reason);
            revert("takeOption failed with error");
        } catch (bytes memory lowLevelData) {
            console.log("Low-level error, length:", lowLevelData.length);
            if (lowLevelData.length >= 4) {
                bytes4 selector = bytes4(lowLevelData);
                console.log("Error selector:");
                console.logBytes4(selector);
            }
            revert("takeOption failed with low-level error");
        }
        
        vm.stopPrank();
    }

    function testCalculatePremium() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        uint256 currentPrice = options.getCurrentPrice(WETH);
        uint256 premium = options.calculatePremium(commitmentHash, currentPrice);
        
        // Premium should be |current_price - target_price| * amount
        // Mock current price is 3500e18, target is 4000e18
        // Premium = (4000 - 3500) * 10 = 5000 ETH (commitment amount is 10 ether)
        assertEq(premium, 5000 ether);
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
            abi.encodeWithSelector(IERC20.transfer.selector, alice, 10 ether),
            abi.encode(true)
        );
        
        // Anyone can liquidate expired option
        vm.prank(bob);
        options.liquidateExpiredOption(optionId);
        
        // Check option state
        IDurationOptions.ActiveOption memory option = options.getOption(optionId);
        assertEq(uint256(option.state), uint256(IDurationOptions.OptionState.EXPIRED));
    }

    function testOwnershipTransfer() public {
        // Test ownership transfer
        vm.startPrank(admin);
        
        // Check initial owner
        assertEq(options.owner(), admin);
        
        // Transfer ownership to genesis
        options.transferOwnership(genesis);
        assertEq(options.owner(), genesis);
        
        vm.stopPrank();
    }

    function testSweepExcess() public {
        // Test sweeping excess ETH and tokens
        vm.startPrank(admin);
        
        // Send some ETH to contract (simulating leftover fees)
        vm.deal(address(options), 1 ether);
        
        uint256 ownerBalanceBefore = admin.balance;
        
        // Sweep excess ETH
        options.sweepExcess(address(0));
        
        // Check ETH was transferred to owner
        assertEq(address(options).balance, 0);
        assertEq(admin.balance, ownerBalanceBefore + 1 ether);
        
        vm.stopPrank();
    }

    function testTakerCommitment() public {
        // Create a taker commitment (Bob wants to buy an option)
        IDurationOptions.OptionCommitment memory takerCommitment = _createTestTakerCommitment();
        bytes32 commitmentHash = _getCommitmentHash(takerCommitment);
        
        // Store commitment
        vm.prank(bob);
        options.storeCommitment(takerCommitment);
        
        // Mock USDC and WETH transfers for LP taking taker commitment
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transferFrom.selector, bob, address(options), 500 ether),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transfer.selector, alice, 500 ether),
            abi.encode(true)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 10 ether),
            abi.encode(true)
        );
        
        // LP (alice) takes the taker commitment
        vm.startPrank(alice);
        uint256 optionId = options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL);
        vm.stopPrank();
        
        // Verify option was created correctly
        IDurationOptions.ActiveOption memory option = options.getOption(optionId);
        assertEq(option.taker, bob); // Bob is the taker
        assertEq(option.lp, alice); // Alice is the LP
        assertEq(option.premium, 500 ether); // Premium is what taker specified
        assertEq(option.targetPrice, 3500e18); // Target price = current price for taker commitments
    }

    function test_RevertWhen_InsufficientPremium() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 10 ether),
            abi.encode(true)
        );
        
        vm.startPrank(bob);
        
        // Don't mock USDC transfer - let it fail naturally when insufficient balance
        // or mock the exact calculated premium transfer to fail
        uint256 currentPrice = options.getCurrentPrice(WETH);
        uint256 requiredPremium = options.calculatePremium(commitmentHash, currentPrice);
        
        // Mock USDC transfer to fail for the required premium amount
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transferFrom.selector, bob, address(options), requiredPremium),
            abi.encode(false) // Transfer fails
        );
        
        // Try to take option with insufficient premium - should revert
        vm.expectRevert(); // SafeERC20FailedOperation will be thrown
        options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL);
        
        vm.stopPrank();
    }

    function testFailTakeOptionExpiredCommitment() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        commitment.expiry = block.timestamp - 1; // Expired
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        vm.startPrank(bob);
        options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL); // Should fail
        vm.stopPrank();
    }

    // Helper functions

    function _createTestCommitment() internal view returns (IDurationOptions.OptionCommitment memory) {
        return IDurationOptions.OptionCommitment({
            lp: alice,
            taker: address(0),
            asset: WETH,
            amount: 10 ether,
            targetPrice: 4000e18, // $4000
            premium: 0, // LP doesn't set premium
            durationDays: 1, // 1 day
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: _createValidSignature()
        });
    }

    function _createTestTakerCommitment() internal view returns (IDurationOptions.OptionCommitment memory) {
        return IDurationOptions.OptionCommitment({
            lp: address(0),
            taker: bob,
            asset: WETH,
            amount: 10 ether,
            targetPrice: 0, // Taker doesn't set target price
            premium: 500 ether, // Taker specifies premium willing to pay in USDC
            durationDays: 1, // 1 day
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: _createValidTakerSignature()
        });
    }

    function _createValidSignature() internal view returns (bytes memory) {
        // Get the typed data hash using the contract's method
        bytes32 digest = options.getCommitmentHash(
            alice,
            address(0),
            WETH,
            10 ether,
            4000e18,
            0, // premium
            1, // durationDays
            uint8(IDurationOptions.OptionType.CALL),
            block.timestamp + 1 hours,
            1
        );
        
        // Create signature using alice's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _createValidTakerSignature() internal view returns (bytes memory) {
        // Get the typed data hash using the contract's method
        bytes32 digest = options.getCommitmentHash(
            address(0),
            bob,
            WETH,
            10 ether,
            0, // targetPrice
            500 ether, // premium
            1, // durationDays
            uint8(IDurationOptions.OptionType.CALL),
            block.timestamp + 1 hours,
            1
        );
        
        // Create signature using bob's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _getCommitmentHash(IDurationOptions.OptionCommitment memory commitment) internal view returns (bytes32) {
        return options.getCommitmentHash(
            commitment.lp,
            commitment.taker,
            commitment.asset,
            commitment.amount,
            commitment.targetPrice,
            commitment.premium,
            commitment.durationDays,
            uint8(commitment.optionType),
            commitment.expiry,
            commitment.nonce
        );
    }

    function _setupAndTakeOption() internal returns (uint256 optionId) {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        
        vm.prank(alice);
        options.storeCommitment(commitment);
        
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 10 ether),
            abi.encode(true)
        );
        
        uint256 currentPrice = options.getCurrentPrice(WETH);
        uint256 premium = options.calculatePremium(commitmentHash, currentPrice);
        
        // Mock USDC transfers
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transferFrom.selector, bob, address(options), premium),
            abi.encode(true)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transfer.selector, alice, premium),
            abi.encode(true)
        );
        
        vm.startPrank(bob);
        optionId = options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL);
        vm.stopPrank();
    }
}