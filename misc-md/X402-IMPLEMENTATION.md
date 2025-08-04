# x402 Payment System Implementation

## Overview

Duration.Finance now implements an HTTP 402 Payment Required system for API operations to prevent spam and generate protocol revenue. This system requires micropayments in USDC for specific API operations.

## Implementation Details

### 🔧 Configuration (Environment Variables)

```env
# Position Sizing Limits (configurable)
MIN_POSITION_SIZE_WETH=0.001
MAX_POSITION_SIZE_WETH=1.0

# x402 Payment System Configuration
X402_PAYMENT_ENABLED=true
X402_POST_OFFER_COST_USDC=1.0
X402_PAYMENT_RECIPIENT=0x...  # Admin/multisig address for x402 payments
X402_RATE_LIMIT_WINDOW_MS=60000  # 1 minute
X402_RATE_LIMIT_MAX_REQUESTS=10
```

### 💰 Payment Requirements

| Operation | Cost | Description |
|-----------|------|-------------|
| **POST /api/commitments/lp** | 1 USDC | Creating LP offers (prevents spam) |
| **POST /api/commitments/[id]/take** | Premium Amount | Taking options (paying the calculated premium) |
| **GET /api/marketplace/\*** | FREE | Reading marketplace data |

### 🏗️ Architecture Components

#### 1. x402 Payment Middleware (`lib/x402/payment-middleware.ts`)
- **HTTP 402 Response Generation**: Creates proper payment required responses
- **Rate Limiting**: Prevents abuse with configurable limits
- **Payment Verification**: Validates USDC transaction proofs
- **Nonce System**: Prevents payment reuse

#### 2. API Endpoints with x402 Integration

**LP Commitment Creation** (`app/api/commitments/lp/route.ts`):
```typescript
// POST requires 1 USDC payment
// GET (filtering) is free
export async function POST(request: NextRequest) {
  // Apply x402 payment middleware
  const paymentResponse = await x402PaymentSystem.middleware(request);
  if (paymentResponse) {
    return paymentResponse; // Return 402 or 429 response
  }
  // ... handle LP commitment creation
}
```

**Option Taking** (`app/api/commitments/[id]/take/route.ts`):
```typescript
// Requires payment of calculated premium
export async function POST(request: NextRequest, { params }) {
  const paymentResponse = await x402PaymentSystem.middleware(request);
  // ... premium calculation and option creation
}
```

**Marketplace Data** (`app/api/marketplace/liquidity/route.ts`):
```typescript
// Free - no payment required for reading
export async function GET(request: NextRequest) {
  // No x402 middleware applied
  // ... return filtered LP offers
}
```

#### 3. Client-Side Integration (`lib/x402/client.ts`)

**Automatic Payment Handling**:
```typescript
const { createLPCommitmentWithPayment } = useX402API();

// Automatically handles payment requirements
const result = await createLPCommitmentWithPayment(
  commitment,
  (paymentInfo) => {
    // Show payment UI to user
    console.log(`Payment required: ${paymentInfo.cost}`);
  }
);
```

**Manual Payment Flow**:
```typescript
try {
  await x402Client.createLPCommitment(commitment);
} catch (error) {
  if (x402Client.isX402Error(error)) {
    // Handle payment requirement
    const { cost, recipient } = error.paymentInfo;
    // Execute USDC transfer
    // Retry with payment proof
  }
}
```

### 🔒 Smart Contract Changes

#### Position Limits Update
```solidity
// Configurable position limits (can be updated by owner)
uint256 public minOptionSize = 0.001 ether; // 0.001 WETH minimum
uint256 public maxOptionSize = 1 ether; // 1 WETH maximum

function setPositionLimits(uint256 newMinSize, uint256 newMaxSize) external onlyOwner {
    require(newMinSize > 0, "Min size must be positive");
    require(newMaxSize > newMinSize, "Max size must be greater than min");
    require(newMaxSize <= 1000 ether, "Max size too large");
    
    minOptionSize = newMinSize;
    maxOptionSize = newMaxSize;
    
    emit PositionLimitsUpdated(newMinSize, newMaxSize);
}
```

#### Updated Validation
- **Minimum**: 0.001 WETH (was 0.1 WETH)
- **Maximum**: 1 WETH (was 1000 WETH)
- **Configurable**: Admin can update limits via `setPositionLimits()`

### 📱 Frontend Integration

#### Payment Required UI
```typescript
{paymentInfo && (
  <div className="p-4 bg-yellow-600/20 border border-yellow-500 rounded-lg">
    <h4 className="text-yellow-400 font-medium mb-2">Payment Required</h4>
    <p className="text-yellow-300 text-sm mb-3">
      Creating an LP offer requires a payment of <strong>{paymentInfo.cost}</strong> to prevent spam.
    </p>
    <div className="text-xs text-yellow-300/80 space-y-1">
      <p><strong>Step 1:</strong> {paymentInfo.instructions.step1}</p>
      <p><strong>Step 2:</strong> {paymentInfo.instructions.step2}</p>
      <p><strong>Step 3:</strong> {paymentInfo.instructions.step3}</p>
    </div>
  </div>
)}
```

#### Updated Form Validation
```typescript
const isValid = 
  amountNum >= POSITION_LIMITS.MIN_WETH && amountNum <= POSITION_LIMITS.MAX_WETH &&
  // ... other validation
```

### 🔄 API Flow Examples

#### 1. Creating LP Offer (Requires Payment)

**Request**:
```http
POST /api/commitments/lp
Content-Type: application/json

{
  "lp": "0x...",
  "asset": "0x4200000000000000000000000000000000000006",
  "amount": "0.5",
  "dailyPremiumUsdc": "25.00",
  // ... other fields
}
```

**First Response (402 Payment Required)**:
```http
HTTP/1.1 402 Payment Required
X-Payment-Required: abc123def456
X-Payment-Cost: 1.0 USDC
X-Payment-Recipient: 0x...
X-Payment-Methods: ERC20-USDC

{
  "error": "Payment Required",
  "message": "This API endpoint requires a payment of 1.0 USDC",
  "cost": "1.0 USDC",
  "recipient": "0x...",
  "instructions": {
    "step1": "Send the required USDC amount to the recipient address",
    "step2": "Include the transaction hash in the X-Payment-Proof header",
    "step3": "Retry the request with the payment proof"
  }
}
```

**Retry with Payment**:
```http
POST /api/commitments/lp
Content-Type: application/json
X-Payment-Proof: {"txHash":"0x...","amount":"1000000","recipient":"0x...","sender":"0x...","timestamp":1234567890,"nonce":"abc123"}

{
  // ... same body
}
```

**Success Response**:
```http
HTTP/1.1 201 Created

{
  "id": "commitment-abc123",
  "message": "LP commitment created successfully",
  "commitment": { /* ... */ }
}
```

#### 2. Getting Marketplace Data (Free)

**Request**:
```http
GET /api/marketplace/liquidity?asset=0x4200000000000000000000000000000000000006&sortBy=dailyPremium
```

**Response**:
```http
HTTP/1.1 200 OK

{
  "offers": [
    {
      "id": "mock-1",
      "lp": "0x...",
      "amount": "0.5",
      "dailyPremiumUsdc": "25.00",
      "dailyYieldPercent": "0.1742",
      "sampleDurations": [
        {"days": 1, "totalCost": "25.00", "canTake": true},
        {"days": 7, "totalCost": "175.00", "canTake": true}
      ]
    }
  ],
  "total": 1,
  "marketStats": {
    "totalOffers": 1,
    "totalLiquidity": "1918.25",
    "averageDailyPremium": "25.00"
  }
}
```

### 🎯 Benefits

1. **Spam Prevention**: 1 USDC cost prevents spam LP offers
2. **Protocol Revenue**: All payments go to admin/multisig address
3. **Rate Limiting**: Prevents API abuse
4. **User Experience**: Free reading, paid writing
5. **Configurable**: Easily adjust costs and limits
6. **Secure**: Payment verification and nonce system

### 🚀 Next Steps

1. **Deploy** with x402 configuration
2. **Test** payment flows on testnet
3. **Monitor** payment success rates
4. **Adjust** costs based on usage patterns
5. **Expand** to other premium features

## Usage Examples

### Environment Setup
```env
X402_PAYMENT_ENABLED=true
X402_POST_OFFER_COST_USDC=1.0
X402_PAYMENT_RECIPIENT=0x1234567890123456789012345678901234567890
MIN_POSITION_SIZE_WETH=0.001
MAX_POSITION_SIZE_WETH=1.0
```

### Client Usage
```typescript
import { useX402API } from '../lib/x402/client';

const { createLPCommitmentWithPayment } = useX402API();

// Automatic payment handling
const result = await createLPCommitmentWithPayment(commitment, (info) => {
  alert(`Payment required: ${info.cost}`);
});
```

This implementation provides a complete x402 payment system that balances user experience with spam prevention and protocol revenue generation.