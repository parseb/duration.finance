# Duration.Finance Testnet Manual Testing Scenarios

**Version**: 1.0  
**Target Network**: Base Sepolia Testnet  
**Date**: January 2025  
**Tester**: [Name]  
**Environment**: Staging/Testnet  

---

## Pre-Testing Setup Checklist

### 1. Environment Configuration
- [ ] Node.js version >= 20.0.0 installed
- [ ] Base Sepolia testnet added to wallet
- [ ] Testnet ETH acquired from faucet
- [ ] Environment variables configured:
  ```bash
  NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA=<deployed_address>
  NEXT_PUBLIC_SETTLEMENT_ROUTER_ADDRESS_BASE_SEPOLIA=<router_address>
  BASE_TESTNET_RPC_URL=https://sepolia.base.org
  ONEINCH_API_KEY=<your_key>
  DATABASE_URL=<testnet_db_url>
  ```

### 2. Smart Contract Deployment Status
- [ ] DurationOptions.sol deployed and verified
- [ ] OneInchSettlementRouter.sol deployed and verified
- [ ] Contract addresses updated in environment
- [ ] Initial configuration completed (fees, limits, etc.)

### 3. Infrastructure Status
- [ ] Testnet database deployed and migrated
- [ ] API endpoints accessible
- [ ] 1inch API integration configured for Base testnet
- [ ] Docker containers running (if applicable)

---

## Test Scenario 1: Wallet Connection & Authentication

### **Objective**: Verify wallet integration works across different providers

### **Pre-conditions**:
- Browser with wallet extensions installed
- Base Sepolia network configured
- Testnet ETH in wallet (minimum 0.1 ETH)

### **Test Steps**:

#### 1.1 Initial Connection
1. **Navigate** to `http://localhost:3000`
2. **Verify** Duration logo displays correctly (no "D uration" spacing)
3. **Click** wallet connection area
4. **Test** each wallet option:
   - [ ] Coinbase Wallet connection
   - [ ] MetaMask connection
   - [ ] WalletConnect option
   - [ ] Browser wallet detection

#### 1.2 Connection Status Display
5. **Verify** connected wallet shows:
   - [ ] Correct address truncation (0xAbcd...1234)
   - [ ] "Connected" status indicator
   - [ ] ETH balance display (if implemented)

#### 1.3 Wallet Management
6. **Click** connected wallet dropdown
7. **Verify** dropdown contains:
   - [ ] Full wallet address display
   - [ ] "Copy Address" functionality
   - [ ] "Disconnect Wallet" option
8. **Test** copy address functionality
9. **Test** disconnect and reconnect flow

**Expected Results**:
- ✅ Smooth wallet connection without errors
- ✅ Proper address display and truncation
- ✅ Functional dropdown with all options working
- ✅ Clean disconnect/reconnect cycle

**Failure Scenarios to Test**:
- [ ] Wallet rejection handling
- [ ] Wrong network detection
- [ ] Connection timeout handling

---

## Test Scenario 2: Real-Time Price Integration

### **Objective**: Verify 1inch API integration provides accurate pricing

### **Pre-conditions**:
- Wallet connected to Base Sepolia
- 1inch API key configured
- Internet connection stable

### **Test Steps**:

#### 2.1 Price Display Verification
1. **Navigate** to main page
2. **Observe** price display in top-right corner
3. **Record** current price: `$_______`
4. **Verify** price source indicator:
   - [ ] Green dot = Live from 1inch ✅
   - [ ] Orange dot = Cached price ⚠️
   - [ ] Red dot = Price error ❌

#### 2.2 Price Hover Information
5. **Hover** over price display
6. **Verify** tooltip shows:
   - [ ] Price source ("Live from 1inch" or "Cached price")
   - [ ] Last update timestamp
   - [ ] Properly formatted tooltip

#### 2.3 Price Updates
7. **Wait** 30-60 seconds for price refresh
8. **Verify** price updates automatically
9. **Note** any price changes: `$_______ → $_______`

#### 2.4 Price Accuracy Cross-Check
10. **Open** external price source (CoinGecko, CoinMarketCap)
11. **Compare** WETH price with displayed price
12. **Verify** prices are within 1-2% tolerance

**Expected Results**:
- ✅ Price displays with appropriate status indicator
- ✅ Automatic updates every 30 seconds
- ✅ Prices match external sources within tolerance
- ✅ Smooth fallback to cached prices if API fails

---

## Test Scenario 3: Create LP Offer Commitment

### **Objective**: Test end-to-end LP offer creation with EIP-712 signing

### **Pre-conditions**:
- Wallet connected with sufficient testnet ETH
- Real-time prices loading successfully
- "Offer" tab selected

### **Test Steps**:

#### 3.1 Form Validation
1. **Navigate** to "Offer" tab
2. **Verify** form displays:
   - [ ] "Create a offer for others to take" description
   - [ ] Current WETH price section with live/cached indicator
   - [ ] Strike price shows "Market Price @ Taking"

#### 3.2 Input Validation Testing
3. **Test** invalid inputs:
   - [ ] Amount: `0` (should show error)
   - [ ] Amount: `1000` (exceeds max, should show error)
   - [ ] Premium: `0` (should show error)
   - [ ] Premium: negative number (should show error)
   - [ ] Duration: min > max (should show error)

#### 3.3 Valid LP Offer Creation
4. **Enter** valid test data:
   ```
   Commitment Type: OFFER ✅
   Option Type: CALL
   Amount: 0.1 WETH
   Daily Premium: 5.00 USDC
   Min Duration: 1 days
   Max Duration: 7 days
   ```

5. **Verify** calculations display correctly:
   - [ ] Total collateral: `$_____ USD` (amount × current price)
   - [ ] Min premium earned: `$5.00` (daily × min duration)
   - [ ] Max premium earned: `$35.00` (daily × max duration)
   - [ ] Daily yield percentage calculated

#### 3.4 EIP-712 Signature Flow
6. **Click** "Create OFFER Commitment" button
7. **Verify** wallet prompts for signature:
   - [ ] EIP-712 structured data visible
   - [ ] Domain shows "Duration.Finance"
   - [ ] Message contains correct commitment data
8. **Sign** the transaction in wallet
9. **Wait** for commitment creation confirmation

#### 3.5 Commitment Storage Verification
10. **Verify** success feedback:
    - [ ] Success message displayed
    - [ ] Form resets after successful creation
    - [ ] No error messages shown

**Expected Results**:
- ✅ Form validation prevents invalid submissions
- ✅ Calculations display correctly with real-time prices
- ✅ EIP-712 signing flow works smoothly
- ✅ Commitment stored successfully in database

**Test Data to Record**:
- Commitment creation timestamp: `_____________`
- Transaction signature: `_____________`
- Calculated yield rates: `_____________`

---

## Test Scenario 4: Browse and Take Commitments

### **Objective**: Test commitment discovery and taking functionality

### **Pre-conditions**:
- At least one LP offer commitment created (from Scenario 3)
- Different wallet address for taking (simulate different user)
- Sufficient USDC for premium payment

### **Test Steps**:

#### 4.1 Commitment Discovery
1. **Navigate** to "Take" tab
2. **Verify** commitment list displays:
   - [ ] Available commitments shown
   - [ ] Proper formatting of amounts and prices
   - [ ] Yield calculations visible
   - [ ] Expiry times displayed

#### 4.2 Commitment Details Review
3. **Select** a commitment to examine
4. **Verify** details show:
   - [ ] LP address (truncated properly)
   - [ ] Asset: WETH
   - [ ] Amount and collateral value
   - [ ] Daily premium and duration range
   - [ ] Option type (CALL/PUT)
   - [ ] Current market price vs strike price explanation

#### 4.3 Duration Selection
5. **Test** duration selection:
   - [ ] Minimum duration: `1 day`
   - [ ] Maximum duration: `7 days`
   - [ ] Duration slider/input functional
   - [ ] Premium calculation updates with duration choice

#### 4.4 Taking Commitment Flow
6. **Select** duration: `3 days`
7. **Verify** calculated premium: `$15.00` (5.00 × 3)
8. **Click** "Take Commitment" button
9. **Complete** transaction signing:
   - [ ] USDC approval transaction (if needed)
   - [ ] Option creation transaction
   - [ ] Both transactions confirm successfully

#### 4.5 Active Option Verification
10. **Navigate** to "Portfolio" tab
11. **Verify** new active option appears:
    - [ ] Correct option details
    - [ ] Expiry date calculation
    - [ ] Current profitability status
    - [ ] Exercise button availability

**Expected Results**:
- ✅ Commitments display with accurate information
- ✅ Duration selection works correctly
- ✅ Premium calculations update dynamically
- ✅ Taking process completes successfully
- ✅ Active option appears in portfolio

---

## Test Scenario 5: Portfolio Management & Option Exercise

### **Objective**: Test portfolio tracking and option exercise functionality

### **Pre-conditions**:
- Active option position from Scenario 4
- Market price movement to make option profitable/unprofitable
- 1inch settlement integration configured

### **Test Steps**:

#### 5.1 Portfolio Display
1. **Navigate** to "Portfolio" tab
2. **Verify** dashboard shows:
   - [ ] Total positions count
   - [ ] Total value locked
   - [ ] Active commitments count
   - [ ] Portfolio statistics

#### 5.2 Active Options Review
3. **Examine** active option details:
   - [ ] Option type and direction
   - [ ] Strike price recorded
   - [ ] Current market price
   - [ ] Profitability calculation
   - [ ] Time to expiry
   - [ ] Premium paid

#### 5.3 Exercise Conditions Testing
4. **For CALL option** (if current price > strike):
   - [ ] "Exercise" button enabled
   - [ ] Profitability indicator green
   - [ ] Expected profit calculation shown
5. **For PUT option** (if current price < strike):
   - [ ] Similar exercise conditions
6. **If unprofitable**:
   - [ ] Exercise button disabled or warning shown
   - [ ] Clear explanation of unprofitability

#### 5.4 Option Exercise Flow (if profitable)
7. **Click** "Exercise Option" button
8. **Review** exercise confirmation:
   - [ ] Settlement details preview
   - [ ] Gas cost estimation
   - [ ] Expected return calculation
9. **Confirm** exercise transaction
10. **Wait** for settlement completion

#### 5.5 Settlement Verification
11. **After** settlement completes:
    - [ ] Option removed from active positions
    - [ ] Settlement transaction confirmed
    - [ ] Wallet balance updated correctly
    - [ ] LP receives appropriate settlement

**Expected Results**:
- ✅ Portfolio accurately tracks all positions
- ✅ Profitability calculations are correct
- ✅ Exercise process works smoothly
- ✅ 1inch settlement executes properly
- ✅ All parties receive correct amounts

---

## Test Scenario 6: Error Handling & Edge Cases

### **Objective**: Verify system handles errors gracefully

### **Test Steps**:

#### 6.1 Network Disconnection
1. **Disconnect** internet connection
2. **Verify** error states:
   - [ ] Price displays show cached/error state
   - [ ] Form submissions handle network errors
   - [ ] Appropriate error messages shown

#### 6.2 Wallet Disconnection
3. **Disconnect** wallet mid-transaction
4. **Verify** error handling:
   - [ ] Transaction cancellation handled
   - [ ] User prompted to reconnect
   - [ ] No data corruption occurs

#### 6.3 Invalid Transaction Data
5. **Test** with modified/corrupted data:
   - [ ] Invalid signatures rejected
   - [ ] Malformed requests handled
   - [ ] SQL injection attempts blocked

#### 6.4 1inch API Failure
6. **Simulate** 1inch API downtime
7. **Verify** fallback behavior:
   - [ ] Cached prices used
   - [ ] Clear indication of data staleness
   - [ ] No application crashes

#### 6.5 Smart Contract Errors
8. **Test** contract error conditions:
   - [ ] Insufficient balance handling
   - [ ] Expired commitment handling
   - [ ] Reentrancy protection active
   - [ ] Proper error messages displayed

**Expected Results**:
- ✅ All error conditions handled gracefully
- ✅ Clear error messages for users
- ✅ No data loss or corruption
- ✅ System recovers when conditions improve

---

## Test Scenario 7: Security & Access Control

### **Objective**: Verify security measures are properly implemented

### **Test Steps**:

#### 7.1 API Security Testing
1. **Test** direct API access:
   ```bash
   # Should be blocked by security middleware
   curl -X POST http://localhost:3000/api/commitments \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```
2. **Verify** request blocked with 403/401 error

#### 7.2 x402 Payment System
3. **Test** x402 endpoint without payment:
   ```bash
   curl -X POST http://localhost:3000/api/x402/commitments \
     -H "Content-Type: application/json" \
     -d '{"commitment": "data"}'
   ```
4. **Verify** 402 Payment Required response

#### 7.3 Rate Limiting
5. **Send** multiple rapid requests
6. **Verify** rate limiting kicks in
7. **Test** recovery after cooldown period

#### 7.4 Input Validation
8. **Test** various malicious inputs:
   - [ ] SQL injection attempts
   - [ ] XSS payload attempts
   - [ ] Buffer overflow attempts
   - [ ] Invalid signature formats

**Expected Results**:
- ✅ All security measures active
- ✅ Unauthorized access blocked
- ✅ Rate limiting functional
- ✅ Input validation prevents attacks

---

## Performance & Load Testing

### **Objective**: Verify system performance under various loads

### **Test Steps**:

#### Performance Baseline
1. **Measure** page load times:
   - [ ] Initial page load: `_____ms`
   - [ ] Wallet connection time: `_____ms`
   - [ ] Price data fetch: `_____ms`
   - [ ] Form submission time: `_____ms`

#### Database Performance
2. **Test** with multiple commitments:
   - [ ] Create 10+ commitments
   - [ ] Measure list loading time
   - [ ] Test filtering and sorting

#### Concurrent User Simulation
3. **Open** multiple browser tabs
4. **Perform** simultaneous actions
5. **Verify** no race conditions or conflicts

**Expected Results**:
- ✅ Page loads under 3 seconds
- ✅ No performance degradation with multiple users
- ✅ Database queries remain fast

---

## Final Verification Checklist

### System Stability
- [ ] No console errors in browser
- [ ] No unhandled promise rejections
- [ ] Clean error logs in backend
- [ ] Memory usage remains stable

### User Experience
- [ ] All user flows work end-to-end
- [ ] Error messages are user-friendly
- [ ] Loading states are informative
- [ ] Mobile responsiveness (if applicable)

### Data Integrity
- [ ] All calculations are mathematically correct
- [ ] Database transactions are atomic
- [ ] No orphaned data records
- [ ] Backup and recovery tested

### Security Compliance
- [ ] No sensitive data exposed in logs
- [ ] All user inputs validated
- [ ] Authentication working properly
- [ ] HTTPS enforced (in production)

---

## Bug Report Template

When issues are found, use this format:

**Bug ID**: DURATION-TEST-001  
**Severity**: High/Medium/Low  
**Component**: Frontend/Backend/Smart Contract  
**Environment**: Base Sepolia Testnet  

**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected Result**: 
What should happen

**Actual Result**: 
What actually happened

**Additional Information**:
- Browser/wallet used
- Transaction hashes (if applicable)
- Console error messages
- Screenshots (if helpful)

---

## Post-Testing Report

**Testing Completed By**: [Name]  
**Date**: [Date]  
**Duration**: [Hours]  
**Test Environment**: Base Sepolia  

### Summary Statistics
- **Total Test Cases**: 7 scenarios, ~50 individual tests
- **Passed**: ___/50
- **Failed**: ___/50
- **Blocked**: ___/50

### Critical Issues Found
1. [Issue description]
2. [Issue description]
3. [Issue description]

### Recommendations
- [ ] Ready for mainnet deployment
- [ ] Requires additional fixes before mainnet
- [ ] Needs further testing in specific areas

### Next Steps
1. [Immediate actions needed]
2. [Medium-term improvements]
3. [Long-term enhancements]

---

**✅ TESTNET TESTING COMPLETE**  
**📋 Report Filed**: [Date]  
**🚀 Mainnet Readiness**: [Ready/Not Ready]