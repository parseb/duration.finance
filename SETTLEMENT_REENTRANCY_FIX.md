# Settlement Reentrancy Protection

## Current Vulnerability

In `DurationOptions._performSettlement()` (lines 407-459):

```solidity
// VULNERABLE PATTERN
function exerciseOption(uint256 optionId, SettlementParams calldata params) external {
    // State checks but no state updates yet
    if (!isExercisable(optionId)) revert OptionNotExercisable();
    
    // External call to 1inch BEFORE state update
    _performSettlement(option, params, netProfit); // ← REENTRANCY RISK
    
    // State update happens AFTER external call
    option.state = OptionState.EXERCISED; // ← TOO LATE
    totalLocked[option.asset] -= option.amount;
}
```

## Attack Vector

1. Attacker calls `exerciseOption()`
2. During `_performSettlement()` → 1inch router call
3. 1inch router maliciously calls back to `exerciseOption()` 
4. Option state still `TAKEN`, so second call succeeds
5. Double settlement of same option

## Fix: Checks-Effects-Interactions Pattern

```solidity
// SECURE IMPLEMENTATION
mapping(uint256 => bool) private _settlingOptions;

modifier noSettlementReentrancy(uint256 optionId) {
    require(!_settlingOptions[optionId], "Settlement in progress");
    _settlingOptions[optionId] = true;
    _;
    _settlingOptions[optionId] = false;
}

function exerciseOption(
    uint256 optionId, 
    SettlementParams calldata params
) external nonReentrant whenNotPaused noSettlementReentrancy(optionId) {
    ActiveOption storage option = activeOptions[optionId];
    
    // CHECKS
    if (option.taker != msg.sender) revert UnauthorizedCaller();
    if (!isExercisable(optionId)) revert OptionNotExercisable();
    if (params.deadline < block.timestamp) revert SettlementFailed();

    uint256 currentPrice = getCurrentPrice(option.asset);
    uint256 profit = _calculateProfit(option, currentPrice);
    if (profit == 0) revert OptionNotExercisable();

    // EFFECTS - UPDATE STATE BEFORE EXTERNAL CALLS
    option.state = OptionState.EXERCISED;
    totalLocked[option.asset] -= option.amount;
    
    uint256 protocolFeeAmount = (profit * protocolFee) / 10000;
    uint256 netProfit = profit - protocolFeeAmount;

    // INTERACTIONS - EXTERNAL CALLS LAST
    _performSettlement(option, params, netProfit);
    
    emit OptionExercised(optionId, netProfit, protocolFeeAmount);
}

function _performSettlement(
    ActiveOption memory option, // ← memory, not storage (state already updated)
    SettlementParams calldata params,
    uint256 expectedReturn
) internal {
    // Settlement logic remains the same
    // But now operates on memory copy after state is updated
}
```

## Additional Settlement Protections

```solidity
// 1. Settlement deadline validation
modifier validSettlementDeadline(uint256 deadline) {
    require(deadline >= block.timestamp, "Settlement deadline passed");
    require(deadline <= block.timestamp + 1 hours, "Settlement deadline too far");
    _;
}

// 2. Settlement amount validation
function _validateSettlementAmounts(
    uint256 expectedIn,
    uint256 actualOut,
    uint256 minOut
) internal pure {
    require(actualOut >= minOut, "Insufficient settlement output");
    require(actualOut <= expectedIn * 2, "Settlement output too high"); // Sanity check
}

// 3. Emergency settlement pause
bool public settlementPaused;

modifier whenSettlementNotPaused() {
    require(!settlementPaused, "Settlement paused");
    _;
}

function pauseSettlement() external onlyOwner {
    settlementPaused = true;
    emit SettlementPaused();
}
```

## Implementation Priority

**Critical (Immediate)**:
1. Add `noSettlementReentrancy` modifier
2. Move state updates before external calls
3. Use memory structs in settlement functions

**Important (Next)**:
1. Settlement deadline validation
2. Settlement amount sanity checks
3. Emergency settlement controls

This focused approach addresses the real vulnerability without unnecessary complexity.