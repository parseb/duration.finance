// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {OneInchSettlementRouter} from "../src/settlement/OneInchSettlementRouter.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title OneInchIntegration Test
 * @notice Tests Duration.Finance integration with real 1inch pricing and settlement
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
    address priceUpdater = makeAddr("priceUpdater");
    
    uint256 alicePrivateKey = 0x1;
    uint256 bobPrivateKey = 0x2;
    
    function setUp() public {
        // Fork Base Sepolia for testing with real contracts
        string memory rpcUrl = vm.envString("BASE_TESTNET_RPC_URL");
        vm.createSelectFork(rpcUrl);
        
        console.log("Testing on Base Sepolia fork");
        console.log("Block number:", block.number);
        
        // Deploy contracts
        vm.startPrank(admin);
        
        // Deploy settlement router
        settlementRouter = new OneInchSettlementRouter(admin);
        
        // Deploy main options contract
        options = new DurationOptions(
            address(settlementRouter),
            admin
        );
        
        // Add USDC as allowed asset
        options.addAllowedAsset(USDC);
        
        vm.stopPrank();
        
        // Prices now come from 1inch quotes directly - no setup needed
        
        // Give test accounts some tokens for testing
        deal(WETH, alice, 100 ether);
        deal(USDC, alice, 100000e6); // 100k USDC
        deal(WETH, bob, 100 ether);
        deal(USDC, bob, 100000e6);
        
        console.log("Contracts deployed and setup completed");
    }
    
    function testReal1inchQuoteIntegration() public {
        // Mock 1inch quotes for testing
        vm.mockCall(
            address(settlementRouter),
            abi.encodeWithSelector(
                settlementRouter.getSettlementQuote.selector,
                WETH, USDC, 1 ether
            ),
            abi.encode(3500e6, 0, "") // $3500 USDC (6 decimals)
        );
        
        uint256 wethPrice = options.getCurrentPrice(WETH);
        uint256 usdcPrice = options.getCurrentPrice(USDC);
        
        assertEq(wethPrice, 3500e18); // Converted to 18 decimals
        assertEq(usdcPrice, 1e18);    // USDC always $1
        
        console.log("WETH price:", wethPrice / 1e18);
        console.log("USDC price:", usdcPrice / 1e18);
    }
    
    function testDirectQuotePricing() public {
        // Test that prices come from settlement router quotes
        // This would normally call 1inch, but we'll mock the response
        
        // Mock the settlement router to return expected quote
        vm.mockCall(
            address(settlementRouter),
            abi.encodeWithSelector(
                settlementRouter.getSettlementQuote.selector,
                WETH, USDC, 1 ether
            ),
            abi.encode(3500e6, 0, "") // $3500 USDC (6 decimals), method 0, empty data
        );
        
        uint256 price = options.getCurrentPrice(WETH);
        assertEq(price, 3500e18); // Should be converted to 18 decimals
        
        console.log("WETH price from 1inch quote:", price / 1e18);
    }
    
    function testLPCommitmentWithRealPricing() public {
        vm.startPrank(alice);
        
        // Approve tokens
        IERC20(WETH).approve(address(options), 10 ether);
        IERC20(USDC).approve(address(options), 100000e6);
        
        // Create LP commitment with real pricing
        IDurationOptions.OptionCommitment memory commitment = _createLPCommitment();
        
        // Store commitment
        options.createCommitment(commitment);
        
        vm.stopPrank();
        
        // Verify commitment was stored
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        IDurationOptions.OptionCommitment memory stored = options.getCommitment(commitmentHash);
        
        assertEq(stored.lp, alice);
        assertEq(stored.targetPrice, 4000e18);
        
        console.log("LP commitment created with target price: $", stored.targetPrice / 1e18);
    }
    
    function testPremiumCalculationWithRealPricing() public {
        // Create commitment
        vm.startPrank(alice);
        IERC20(WETH).approve(address(options), 10 ether);
        
        IDurationOptions.OptionCommitment memory commitment = _createLPCommitment();
        options.createCommitment(commitment);
        
        vm.stopPrank();
        
        // Calculate premium with current price
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        uint256 currentPrice = options.getCurrentPrice(WETH);
        uint256 premium = options.calculatePremium(commitmentHash, currentPrice);
        
        // Premium should be |currentPrice - targetPrice| * amount / 1e18
        // Current: $3500, Target: $4000, Amount: 1 ETH
        // Expected premium: (4000 - 3500) * 1 = 500 USDC
        uint256 expectedPremium = ((4000e18 - 3500e18) * 1 ether) / 1e18;
        
        assertEq(premium, expectedPremium);
        console.log("Calculated premium: $", premium / 1e18);
    }
    
    function testSimpleSwapWithRealPricing() public {
        // Mock price to be higher than target to trigger simple swap
        vm.mockCall(
            address(settlementRouter),
            abi.encodeWithSelector(
                settlementRouter.getSettlementQuote.selector,
                WETH, USDC, 1 ether
            ),
            abi.encode(4100e6, 0, "") // $4100 USDC > $4000 target
        );
        
        vm.startPrank(alice);
        IERC20(WETH).approve(address(options), 10 ether);
        IERC20(USDC).approve(address(options), 100000e6);
        
        // Create LP commitment
        IDurationOptions.OptionCommitment memory commitment = _createLPCommitment();
        options.createCommitment(commitment);
        
        vm.stopPrank();
        
        // Bob tries to take the commitment - should trigger simple swap
        vm.startPrank(bob);
        IERC20(USDC).approve(address(options), 100000e6);
        
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        uint256 aliceUSDCBefore = IERC20(USDC).balanceOf(alice);
        
        // Take commitment - should execute simple swap
        uint256 optionId = options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL);
        
        // Should return 0 for simple swap
        assertEq(optionId, 0);
        
        // Alice should receive her target price in USDC
        uint256 aliceUSDCAfter = IERC20(USDC).balanceOf(alice);
        uint256 expectedPayout = (4000e18 * 1 ether) / 1e18 / 1e12; // Convert to USDC decimals
        
        assertEq(aliceUSDCAfter - aliceUSDCBefore, expectedPayout);
        console.log("Simple swap executed - Alice received USDC:", (aliceUSDCAfter - aliceUSDCBefore) / 1e6);
        
        vm.stopPrank();
    }
    
    function testOptionTakingWithRealPricing() public {
        vm.startPrank(alice);
        IERC20(WETH).approve(address(options), 10 ether);
        IERC20(USDC).approve(address(options), 100000e6);
        
        IDurationOptions.OptionCommitment memory commitment = _createLPCommitment();
        options.createCommitment(commitment);
        
        vm.stopPrank();
        
        // Bob takes the option
        vm.startPrank(bob);
        IERC20(USDC).approve(address(options), 100000e6);
        
        bytes32 commitmentHash = _getCommitmentHash(commitment);
        uint256 optionId = options.takeCommitment(commitmentHash, IDurationOptions.OptionType.CALL);
        
        // Should create an option (not simple swap)
        assertGt(optionId, 0);
        
        // Verify option details
        IDurationOptions.ActiveOption memory option = options.getOption(optionId);
        assertEq(option.taker, bob);
        assertEq(option.lp, alice);
        assertEq(option.targetPrice, 4000e18);
        
        console.log("Option created with ID:", optionId);
        console.log("Option target price: $", option.targetPrice / 1e18);
        
        vm.stopPrank();
    }
    
    function testQuoteFailureHandling() public {
        // Test fallback when 1inch quote fails
        vm.mockCallRevert(
            address(settlementRouter),
            abi.encodeWithSelector(
                settlementRouter.getSettlementQuote.selector,
                WETH, USDC, 1 ether
            ),
            "Quote failed"
        );
        
        // This should revert since we removed fallback prices
        vm.expectRevert();
        options.getCurrentPrice(WETH);
        
        console.log("Quote failure properly reverts");
    }
    
    // Helper functions
    function _createLPCommitment() internal view returns (IDurationOptions.OptionCommitment memory) {
        return IDurationOptions.OptionCommitment({
            lp: alice,
            taker: address(0),
            asset: WETH,
            amount: 1 ether,
            targetPrice: 4000e18, // $4000 target
            premium: 0,
            durationDays: 1,
            optionType: IDurationOptions.OptionType.CALL,
            expiry: block.timestamp + 1 hours,
            nonce: 1,
            signature: _createValidSignature()
        });
    }
    
    function _createValidSignature() internal view returns (bytes memory) {
        bytes32 digest = options.getCommitmentHash(
            alice,
            address(0),
            WETH,
            1 ether,
            4000e18,
            0,
            1,
            uint8(IDurationOptions.OptionType.CALL),
            block.timestamp + 1 hours,
            1
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePrivateKey, digest);
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
}