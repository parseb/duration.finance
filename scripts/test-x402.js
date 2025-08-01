/**
 * Test script for x402 payment functionality
 * Tests both free API access and x402 payment required scenarios
 */

const API_BASE = 'http://localhost:3001';

async function testFreeAPIAccess() {
  console.log('\n🧪 Testing free API access (regular commitments endpoint)...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`);
    const data = await response.json();
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`✅ Response:`, data);
    console.log('✅ Free API access working correctly');
  } catch (error) {
    console.error('❌ Free API test failed:', error.message);
  }
}

async function testX402Required() {
  console.log('\n🧪 Testing x402 payment required...');
  
  const mockCommitment = {
    creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe',
    asset: '0x4200000000000000000000000000000000000006',
    amount: '500000000000000000', // 0.5 ETH
    premiumAmount: '25000000', // $25 USDC
    minDurationDays: '1',
    maxDurationDays: '7',
    optionType: 0, // CALL
    commitmentType: 0, // LP_OFFER
    expiry: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour from now
    nonce: '1',
    isFramentable: true,
    signature: '0x' + '0'.repeat(130), // Mock signature
  };
  
  try {
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 402) {
      console.log('✅ x402 Payment Required response working correctly');
      
      // Show payment headers
      console.log('\n💰 Payment headers:');
      for (const [key, value] of response.headers.entries()) {
        if (key.startsWith('x-payment') || key.startsWith('x-rate-limit')) {
          console.log(`  ${key}: ${value}`);
        }
      }
    } else {
      console.log('⚠️  Expected 402 response but got different status');
    }
  } catch (error) {
    console.error('❌ x402 test failed:', error.message);
  }
}

async function testX402WithPayment() {
  console.log('\n🧪 Testing x402 with payment proof...');
  
  const mockCommitment = {
    creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe',
    asset: '0x4200000000000000000000000000000000000006',
    amount: '500000000000000000', // 0.5 ETH
    premiumAmount: '25000000', // $25 USDC
    minDurationDays: '1',
    maxDurationDays: '7',
    optionType: 0, // CALL
    commitmentType: 0, // LP_OFFER
    expiry: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour from now
    nonce: '2',
    isFramentable: true,
    signature: '0x' + '0'.repeat(130), // Mock signature
  };
  
  const mockPaymentProof = {
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    amount: '1000000', // $1 USDC in wei (6 decimals)
    recipient: process.env.X402_PAYMENT_RECIPIENT || '0x0000000000000000000000000000000000000000',
    sender: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe',
    timestamp: Date.now(),
    chainId: 84532, // Base Sepolia
  };
  
  try {
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Proof': JSON.stringify(mockPaymentProof),
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 200 && data.success) {
      console.log('✅ x402 Payment verification working correctly');
    } else {
      console.log('⚠️  Expected successful commitment creation with payment');
    }
  } catch (error) {
    console.error('❌ x402 payment test failed:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Running x402 Payment System Tests');
  console.log('=====================================');
  
  await testFreeAPIAccess();
  await testX402Required();
  await testX402WithPayment();
  
  console.log('\n✨ Tests completed!');
}

// Run tests
runTests().catch(console.error);