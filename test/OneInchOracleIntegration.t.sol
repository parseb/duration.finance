// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {DurationOptions} from "../src/DurationOptions.sol";
import {IDurationOptions} from "../src/interfaces/IDurationOptions.sol";

/**
 * @title OneInchOracleIntegrationTest
 * @notice Test suite for 1inch oracle integration and pricing
 */
contract OneInchOracleIntegrationTest is Test {
    DurationOptions public options;
    
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    function setUp() public {
        options = new DurationOptions();
    }
    
    function testOracleAddressConfiguration() public view {
        // Verify oracle addresses are properly configured
        address spotPriceAgg = options.oneInchSpotPriceAggregator();
        address offchainOracle = options.oneInchOffchainOracle();
        
        // Official Base network addresses
        assertEq(spotPriceAgg, 0x00000000000D6FFc74A8feb35aF5827bf57f6786);
        assertEq(offchainOracle, 0xc197Ab9d47206dAf739a47AC75D0833fD2b0f87F);
        
        console.log("1inch Spot Price Aggregator:", spotPriceAgg);
        console.log("1inch Offchain Oracle:", offchainOracle);
        console.log("Oracle addresses properly configured for Base network");
    }
    
    function testGetCurrentPrice() public {
        // Test price fetching with fallback logic
        uint256 wethPrice = options.getCurrentPrice(WETH);
        
        assertGt(wethPrice, 0, "WETH price should be greater than 0");
        
        console.log("WETH price (18 decimals):", wethPrice);
        console.log("WETH price in USD:", wethPrice / 1e18);
        
        // Verify price is within reasonable bounds (assuming ETH is between $1000-$10000)
        assertGt(wethPrice, 1000 * 1e18, "ETH price should be > $1000");
        assertLt(wethPrice, 10000 * 1e18, "ETH price should be < $10000");
    }
    
    function testSetOneInchOracles() public {
        address owner = options.owner();
        
        vm.startPrank(owner);
        
        // Test setting new oracle addresses
        address newSpotPrice = makeAddr("newSpotPrice");
        address newOffchain = makeAddr("newOffchain");
        
        vm.expectEmit(true, true, false, true);
        emit IDurationOptions.OneInchOraclesUpdated(newSpotPrice, newOffchain);
        
        options.setOneInchOracles(newSpotPrice, newOffchain);
        
        // Verify addresses were updated
        assertEq(options.oneInchSpotPriceAggregator(), newSpotPrice);
        assertEq(options.oneInchOffchainOracle(), newOffchain);
        
        vm.stopPrank();
        
        console.log("Oracle address update functionality verified");
    }
    
    function testSetOneInchOraclesOnlyOwner() public {
        address nonOwner = makeAddr("nonOwner");
        
        vm.startPrank(nonOwner);
        
        vm.expectRevert();
        options.setOneInchOracles(makeAddr("invalid1"), makeAddr("invalid2"));
        
        vm.stopPrank();
        
        console.log("Oracle address protection verified - only owner can update");
    }
    
    function testSetOneInchOraclesZeroAddress() public {
        address owner = options.owner();
        
        vm.startPrank(owner);
        
        // Test zero address validation
        vm.expectRevert("Invalid spot price aggregator");
        options.setOneInchOracles(address(0), makeAddr("validOffchain"));
        
        vm.expectRevert("Invalid offchain oracle");
        options.setOneInchOracles(makeAddr("validSpotPrice"), address(0));
        
        vm.stopPrank();
        
        console.log("Zero address validation verified");
    }
    
    function testOracleFallbackLogic() public view {
        // Since we're not on Base mainnet, the oracle calls will fail and fallback to hardcoded prices
        uint256 price = options.getCurrentPrice(WETH);
        
        // On non-Base networks, should fallback to $3500
        if (block.chainid != 8453) {
            uint256 expectedPrice = 3500 * 1e18; // $3500 fallback price
            assertEq(price, expectedPrice, "Should use fallback price on non-Base networks");
            console.log("Fallback pricing logic verified for non-Base networks");
        } else {
            console.log("Running on Base network - oracle integration active");
        }
    }
}