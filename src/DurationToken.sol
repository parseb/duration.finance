// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title DurationToken
 * @author Duration.Finance
 * @notice Governance and revenue token for Duration.Finance options protocol
 * @dev Based on Will.sol template, stripped of superERC20 complexity
 * @dev Token is 99.99% ETH-backed with dynamic pricing and governance functions
 */
contract DurationToken is ERC20 {
    using Strings for uint256;

    bool private entered;
    uint256 public lastPrice;
    uint256 public lastPriceBlock;
    uint256 public lastBlockSupply;
    uint256 public safetyMargin = 100; // 0.01% in basis points
    address public optionsProtocol;
    address public immutable genesis;

    uint256 public constant INITIAL_PRICE = 100 gwei;
    uint256 public constant BACKING_THRESHOLD = 9999; // 99.99% in basis points

    event TokenMinted(address indexed to, uint256 amount, uint256 ethValue);
    event TokenBurned(address indexed from, uint256 amount, uint256 ethReturned);
    event PriceUpdated(uint256 newPrice);
    event SafetyMarginUpdated(uint256 newMargin);
    event ProtocolRevenueReceived(uint256 amount);

    error TransferFailedFor(address failingToken);
    error InsufficientBalance();
    error PayCallFailed();
    error Reentrant();
    error ValueMismatch();
    error BurnRefundFailed();
    error InsufficientValue(uint256 required, uint256 provided);
    error InsufficientBacking();
    error NotAuthorized();
    error InvalidSafetyMargin();

    constructor(address _genesis, address _optionsProtocol) ERC20("Duration", "DUR") {
        genesis = _genesis;
        optionsProtocol = _optionsProtocol;
        lastPriceBlock = block.number;
        lastPrice = INITIAL_PRICE;
        lastBlockSupply = 0;
    }

    modifier noReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    modifier onlyHighStakeHolders() {
        uint256 totalSupply_ = totalSupply();
        if (totalSupply_ == 0 || balanceOf(msg.sender) * 10000 < totalSupply_ * 8000) {
            revert NotAuthorized();
        }
        _;
    }

    /**
     * @notice Update price if new block
     * @dev Price is calculated as totalSupply / 1 gwei for dynamic backing
     */
    function _updatePriceIfNewBlock() internal {
        if (block.number > lastPriceBlock) {
            uint256 supply = totalSupply();
            lastPrice = supply > 0 ? supply / 1 gwei : INITIAL_PRICE;
            emit PriceUpdated(lastPrice);
            lastPriceBlock = block.number;
            lastBlockSupply = supply;
        }
    }

    /**
     * @notice Update supply tracking after transfers
     */
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
        lastBlockSupply = totalSupply();
    }

    /**
     * @notice Get current token price in wei
     * @return Current price per token
     */
    function currentPrice() public view returns (uint256) {
        if (block.number > lastPriceBlock) {
            uint256 supply = totalSupply();
            return supply > 0 ? supply / 1 gwei : INITIAL_PRICE;
        }
        return lastPrice;
    }

    /**
     * @notice Check if token maintains required backing ratio
     * @return true if backing is sufficient
     */
    function hasSufficientBacking() public view returns (bool) {
        uint256 totalSupply_ = totalSupply();
        if (totalSupply_ == 0) return true;
        
        uint256 requiredBacking = (totalSupply_ * currentPrice() * BACKING_THRESHOLD) / 10000;
        return address(this).balance >= requiredBacking;
    }

    /**
     * @notice Mint tokens by sending ETH
     * @return howMuchMinted Amount of tokens minted
     */
    function mintFromETH() public payable returns (uint256 howMuchMinted) {
        _updatePriceIfNewBlock();
        uint256 price = currentPrice();
        if (msg.value < price) revert ValueMismatch();

        howMuchMinted = (msg.value * 1e18) / price;
        _mint(msg.sender, howMuchMinted);

        emit TokenMinted(msg.sender, howMuchMinted, msg.value);
    }

    /**
     * @notice Mint specific number of tokens
     * @param howMany_ Number of tokens to mint (in full units)
     */
    function mint(uint256 howMany_) public payable {
        _updatePriceIfNewBlock();
        uint256 price = currentPrice();
        uint256 required = (howMany_ * price * 1e18) / 1e18;
        
        if (msg.value < required) {
            revert InsufficientValue({required: required, provided: msg.value});
        }

        _mint(msg.sender, howMany_ * 1e18);
        emit TokenMinted(msg.sender, howMany_ * 1e18, msg.value);
    }

    /**
     * @notice Burn tokens and receive ETH
     * @param howMany_ Amount of tokens to burn
     * @return amtValReturned Amount of ETH returned
     */
    function burn(uint256 howMany_) public noReentrant returns (uint256 amtValReturned) {
        if (balanceOf(msg.sender) < howMany_) revert InsufficientBalance();

        amtValReturned = burnReturns(howMany_);
        if (amtValReturned == 0 || amtValReturned > address(this).balance) {
            revert InsufficientBalance();
        }

        _burn(msg.sender, howMany_);

        (bool success,) = payable(msg.sender).call{value: amtValReturned}("");
        if (!success) revert BurnRefundFailed();

        emit TokenBurned(msg.sender, howMany_, amtValReturned);
    }

    /**
     * @notice Burn tokens and send ETH to specified address
     * @param howMany_ Amount of tokens to burn
     * @param to_ Address to receive ETH
     * @return amount Amount of ETH sent
     */
    function burnTo(uint256 howMany_, address to_) public noReentrant returns (uint256 amount) {
        if (balanceOf(msg.sender) < howMany_) revert InsufficientBalance();

        amount = burnReturns(howMany_);
        if (amount == 0 || amount > address(this).balance) revert InsufficientBalance();

        _burn(msg.sender, howMany_);

        (bool success,) = payable(to_).call{value: amount}("");
        if (!success) revert BurnRefundFailed();

        emit TokenBurned(msg.sender, howMany_, amount);
    }

    /**
     * @notice Calculate ETH returns for burning tokens
     * @param amt_ Amount of tokens to burn
     * @return rv ETH amount that would be returned
     */
    function burnReturns(uint256 amt_) public view returns (uint256 rv) {
        uint256 totalSupply_ = totalSupply();
        if (totalSupply_ > 0) {
            rv = (amt_ * address(this).balance) / totalSupply_;
        }
    }

    /**
     * @notice Calculate cost to mint specific amount of tokens
     * @param amt_ Amount of tokens to mint (in full 1e18 units)
     * @return Cost in wei to mint the specified amount
     */
    function mintCost(uint256 amt_) public view returns (uint256) {
        uint256 price = currentPrice();
        return (amt_ * price) / 1e18;
    }

    /**
     * @notice Set safety margin for protocol orders
     * @param newMargin New safety margin in basis points
     * @dev Only callable by 80%+ token holders and requires sufficient backing
     */
    function setSafetyMargin(uint256 newMargin) external onlyHighStakeHolders {
        if (newMargin > 1000) revert InvalidSafetyMargin(); // Max 10%
        if (!hasSufficientBacking()) revert InsufficientBacking();
        
        safetyMargin = newMargin;
        emit SafetyMarginUpdated(newMargin);
    }

    /**
     * @notice Execute multicall on options protocol
     * @param data Array of calldata to execute
     * @dev Only callable by 80%+ token holders with sufficient backing
     */
    function multicall(bytes[] calldata data) external onlyHighStakeHolders {
        if (!hasSufficientBacking()) revert InsufficientBacking();
        
        for (uint256 i = 0; i < data.length; i++) {
            (bool success,) = optionsProtocol.call(data[i]);
            require(success, "Multicall failed");
        }
    }

    /**
     * @notice Receive protocol revenue from options trading
     * @dev Called by options protocol to distribute profits
     */
    function receiveProtocolRevenue() external payable {
        if (msg.sender != optionsProtocol) revert NotAuthorized();
        emit ProtocolRevenueReceived(msg.value);
    }

    /**
     * @notice Receive ETH (allows direct ETH transfers)
     */
    receive() external payable {
        if (msg.value > 0) {
            mintFromETH();
        }
    }

    /**
     * @notice Emergency function to handle stuck tokens (governance only)
     * @param token Token address to recover
     * @param amount Amount to recover
     */
    function recoverToken(address token, uint256 amount) external onlyHighStakeHolders {
        if (!hasSufficientBacking()) revert InsufficientBacking();
        
        bool success = IERC20(token).transfer(msg.sender, amount);
        if (!success) revert TransferFailedFor(token);
    }
}