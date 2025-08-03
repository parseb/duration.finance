// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DurationOptionsTest
 * @author Duration.Finance
 * @notice Test suite for Duration.Finance options protocol
 */
contract DurationOptionsTest is Test {
    DurationOptions public options;
    OneInchSettlementRouter public settlement;

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

    function setUp() public {
        // Deploy contracts
        settlement = new OneInchSettlementRouter(admin);
        options = new DurationOptions();

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

    function testCreateLPCommitment() public {
        // LP commitments are now handled off-chain only
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        
        vm.startPrank(alice);
        
        // Mock USDC balance and allowance for commitment fee
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.balanceOf.selector, alice),
            abi.encode(10000 * 1e6) // 10k USDC
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.allowance.selector, alice, address(options)),
            abi.encode(10000 * 1e6)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 1000000),
            abi.encode(true)
        );
        
        // Should work with unified createCommitment
        options.createCommitment(commitment);
        
        vm.stopPrank();
    }

    function testCalculatePremiumForDuration() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        
        uint256 premium = options.calculatePremiumForDuration(commitment, 7);
        
        // Premium should be premiumAmount * duration for LP_OFFER
        // 25 USDC/day * 7 days = 175 USDC
        assertEq(premium, 175 * 1e6);
    }

    function testIsValidDuration() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        
        // Test valid durations (1-7 days based on commitment)
        assertTrue(options.isValidDuration(commitment, 1));
        assertTrue(options.isValidDuration(commitment, 7));
        
        // Test invalid durations
        assertFalse(options.isValidDuration(commitment, 0));
        assertFalse(options.isValidDuration(commitment, 8));
    }

    function testGetLPYieldMetrics() public {
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();
        
        uint256 currentPrice = options.getCurrentPrice(WETH);
        (uint256 dailyYield, uint256 annualizedYield) = options.getLPYieldMetrics(commitment, currentPrice);
        
        // Calculate expected values using the new decimal-adjusted method
        uint256 expectedCollateralValueUsdc = (commitment.amount * currentPrice) / 1e30; // Same as contract
        uint256 expectedDailyYield = (commitment.premiumAmount * 10000) / expectedCollateralValueUsdc;
        
        // Should calculate yield based on daily premium vs collateral value
        assertEq(dailyYield, expectedDailyYield);
        assertEq(annualizedYield, expectedDailyYield * 365);
        assertGt(dailyYield, 0);
        assertGt(annualizedYield, 0);
    }

    function testTakeCommitment() public {
        // Setup commitment
        IDurationOptions.OptionCommitment memory commitment = _createTestCommitment();

        // Mock WETH and USDC transfers
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transferFrom.selector, alice, address(options), 0.5 ether),
            abi.encode(true)
        );
        
        uint256 premium = options.calculatePremiumForDuration(commitment, 7);
        
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

        // Take option
        vm.startPrank(bob);
        
        IDurationOptions.SettlementParams memory params = IDurationOptions.SettlementParams({
            method: 1, // Unoswap
            routingData: "",
            minReturn: 0,
            deadline: block.timestamp + 1 hours
        });
        
        try options.takeCommitment(commitment, 7, params) returns (uint256 optionId) {
            assertEq(optionId, 1);
        } catch Error(string memory reason) {
            console.log("Error reason:", reason);
            revert("takeCommitment failed with error");
        } catch (bytes memory lowLevelData) {
            console.log("Low-level error, length:", lowLevelData.length);
            if (lowLevelData.length >= 4) {
                bytes4 selector = bytes4(lowLevelData);
                console.log("Error selector:");
                console.logBytes4(selector);
            }
            revert("takeCommitment failed with low-level error");
        }
        
        vm.stopPrank();
    }

    function testGetCurrentPrice() public view {
        uint256 price = options.getCurrentPrice(WETH);
        assertGt(price, 0);
    }

    function testSweepExcess() public {
        // Test sweeping excess WETH
        vm.startPrank(options.owner());
        
        // Mock WETH balance and transfer
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(options)),
            abi.encode(5 ether)
        );
        vm.mockCall(
            WETH,
            abi.encodeWithSelector(IERC20.transfer.selector, options.owner(), 5 ether),
            abi.encode(true)
        );
        
        // Should not revert
        options.sweepExcess(WETH);
        
        vm.stopPrank();
    }

    function testEmergencyPause() public {
        vm.startPrank(options.owner());
        
        // Pause the contract
        options.emergencyPause();
        
        // Unpause the contract
        options.emergencyUnpause();
        
        vm.stopPrank();
    }

    // Helper functions

    function _createTestCommitment() internal view returns (IDurationOptions.OptionCommitment memory) {
        return IDurationOptions.OptionCommitment({
            creator: alice,
            asset: WETH,
            amount: 0.5 ether, // Reduced to fit new limits
            premiumAmount: 25 * 1e6, // $25 per day in USDC for LP_OFFER
            minDurationDays: 1,
            maxDurationDays: 7,
            optionType: IDurationOptions.OptionType.CALL,
            commitmentType: IDurationOptions.CommitmentType.LP_OFFER,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: _createValidSignature()
        });
    }

    function _createValidSignature() internal pure returns (bytes memory) {
        // Mock signature - in production would use proper EIP-712 signing
        return abi.encodePacked(bytes32(0), bytes32(0), uint8(27));
    }

    function _getCommitmentHash(IDurationOptions.OptionCommitment memory commitment) internal pure returns (bytes32) {
        return keccak256(abi.encode(commitment));
    }
}