#!/usr/bin/env node

/**
 * Single commitment test to verify the complete flow
 */

const API_BASE = 'http://localhost:3001';

async function testSingleCommitment() {
  console.log('🧪 Testing Single Commitment Creation...');
  
  try {
    // Wait a bit to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test x402 POST with payment
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Content-Type': 'application/json',
        'X-Payment-Hash': '0x1234567890123456789012345678901234567890123456789012345678901234',
        'X-Payment-Amount': '1000000' // $1 USDC in wei
      },
      body: JSON.stringify({
        creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe', // Valid checksum address
        asset: '0x4200000000000000000000000000000000000006', // WETH Base
        amount: '1000000000000000', // 0.001 ETH (minimum)
        premiumAmount: '1000000', // 1 USDC (6 decimals)
        minDurationDays: '1',
        maxDurationDays: '7',
        optionType: 0, // CALL
        commitmentType: 0, // LP_OFFER
        expiry: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
        nonce: Math.floor(Math.random() * 1000000),
        isFramentable: true,
        signature: '0x' + '1'.repeat(130) // Mock signature with 1s instead of 0s
      })
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Commitment created successfully!');
      console.log('   Commitment ID:', data.commitmentId);
      console.log('   Payment verified:', data.paidViaX402);
      
      // Check database
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Commitment creation failed:', error.error);
      return false;
    }
  } catch (error) {
    console.log('❌ Test error:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Complete Commitment Flow');
  console.log('='.repeat(40));
  
  const success = await testSingleCommitment();
  
  console.log('\n📊 Result:', success ? '✅ SUCCESS' : '❌ FAILED');
}

if (require.main === module) {
  main().catch(console.error);
}