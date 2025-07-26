// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OneInchPriceOracle
 * @notice Price oracle that fetches prices from 1inch API via trusted updater
 * @dev Uses a trusted price updater to set prices from 1inch API
 */
contract OneInchPriceOracle is Ownable {
    
    struct PriceData {
        uint256 price;      // Price in USD with 18 decimals
        uint256 timestamp;  // Last update timestamp
        bool isValid;       // Whether the price is valid
    }
    
    // Asset address => Price data
    mapping(address => PriceData) public prices;
    
    // Trusted price updater (backend service)
    address public priceUpdater;
    
    // Maximum age for price data (5 minutes)
    uint256 public constant MAX_PRICE_AGE = 5 minutes;
    
    // Events
    event PriceUpdated(address indexed asset, uint256 price, uint256 timestamp);
    event PriceUpdaterChanged(address indexed oldUpdater, address indexed newUpdater);
    
    // Errors
    error InvalidPriceUpdater();
    error StalePrice();
    error PriceNotAvailable();
    error UnauthorizedUpdater();
    
    constructor(address _initialOwner, address _priceUpdater) Ownable(_initialOwner) {
        if (_priceUpdater == address(0)) revert InvalidPriceUpdater();
        priceUpdater = _priceUpdater;
        emit PriceUpdaterChanged(address(0), _priceUpdater);
    }
    
    /**
     * @notice Update price for an asset (called by trusted updater)
     * @param asset Asset address
     * @param price Price in USD with 18 decimals
     */
    function updatePrice(address asset, uint256 price) external {
        if (msg.sender != priceUpdater) revert UnauthorizedUpdater();
        
        prices[asset] = PriceData({
            price: price,
            timestamp: block.timestamp,
            isValid: true
        });
        
        emit PriceUpdated(asset, price, block.timestamp);
    }
    
    /**
     * @notice Update multiple prices in one transaction
     * @param assets Array of asset addresses
     * @param priceValues Array of prices (must match assets length)
     */
    function updatePrices(address[] calldata assets, uint256[] calldata priceValues) external {
        if (msg.sender != priceUpdater) revert UnauthorizedUpdater();
        if (assets.length != priceValues.length) revert("Array length mismatch");
        
        for (uint256 i = 0; i < assets.length; i++) {
            prices[assets[i]] = PriceData({
                price: priceValues[i],
                timestamp: block.timestamp,
                isValid: true
            });
            
            emit PriceUpdated(assets[i], priceValues[i], block.timestamp);
        }
    }
    
    /**
     * @notice Get current price for an asset
     * @param asset Asset address
     * @return price Current price in USD with 18 decimals
     */
    function getPrice(address asset) external view returns (uint256 price) {
        PriceData memory priceData = prices[asset];
        
        if (!priceData.isValid) revert PriceNotAvailable();
        if (block.timestamp > priceData.timestamp + MAX_PRICE_AGE) revert StalePrice();
        
        return priceData.price;
    }
    
    /**
     * @notice Get price with age check disabled (for testing)
     * @param asset Asset address
     * @return price Price in USD with 18 decimals
     * @return timestamp Last update timestamp
     * @return isStale Whether the price is stale
     */
    function getPriceWithAge(address asset) external view returns (uint256 price, uint256 timestamp, bool isStale) {
        PriceData memory priceData = prices[asset];
        
        if (!priceData.isValid) revert PriceNotAvailable();
        
        bool stale = block.timestamp > priceData.timestamp + MAX_PRICE_AGE;
        return (priceData.price, priceData.timestamp, stale);
    }
    
    /**
     * @notice Set new price updater
     * @param newUpdater New price updater address
     */
    function setPriceUpdater(address newUpdater) external onlyOwner {
        if (newUpdater == address(0)) revert InvalidPriceUpdater();
        
        address oldUpdater = priceUpdater;
        priceUpdater = newUpdater;
        
        emit PriceUpdaterChanged(oldUpdater, newUpdater);
    }
    
    /**
     * @notice Emergency function to mark price as invalid
     * @param asset Asset address
     */
    function invalidatePrice(address asset) external onlyOwner {
        prices[asset].isValid = false;
    }
}