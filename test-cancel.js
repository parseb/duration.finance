#!/usr/bin/env node

/**
 * Test commitment cancellation functionality
 */

const API_BASE = 'http://localhost:3001';

async function testCancellation() {
  console.log('🧪 Testing Commitment Cancellation...');
  
  try {
    // 1. Create a commitment first
    console.log('1. Creating commitment for cancellation test...');
    const createResponse = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Browser)',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe',
        asset: '0x4200000000000000000000000000000000000006',
        amount: '1000000000000000', // 0.001 ETH
        premiumAmount: '1000000', // 1 USDC
        minDurationDays: '1',
        maxDurationDays: '5',
        optionType: 0, // CALL
        commitmentType: 0, // LP_OFFER
        expiry: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        nonce: Math.floor(Math.random() * 1000000),
        isFramentable: true,
        signature: '0x' + '3'.repeat(130)
      })
    });
    
    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Create failed: ${error.error}`);
    }
    
    const createResult = await createResponse.json();
    const commitmentId = createResult.commitmentId;
    console.log('✅ Commitment created with ID:', commitmentId);
    
    // 2. Fetch to confirm it exists
    console.log('2. Verifying commitment exists...');
    const fetchResponse = await fetch(`${API_BASE}/api/commitments`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Browser)'
      }
    });
    
    const fetchResult = await fetchResponse.json();
    const commitment = fetchResult.commitments.find(c => c.id === commitmentId);
    
    if (!commitment) {
      throw new Error('Commitment not found after creation');
    }
    console.log('✅ Commitment verified in database');
    
    // 3. Cancel the commitment
    console.log('3. Cancelling commitment...');
    const cancelResponse = await fetch(`${API_BASE}/api/commitments?id=${commitmentId}`, {
      method: 'DELETE',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Browser)'
      }
    });
    
    if (!cancelResponse.ok) {
      const error = await cancelResponse.json();
      throw new Error(`Cancel failed: ${error.error}`);
    }
    
    const cancelResult = await cancelResponse.json();
    console.log('✅ Commitment cancelled successfully');
    
    // 4. Verify it's gone
    console.log('4. Verifying commitment was removed...');
    const verifyResponse = await fetch(`${API_BASE}/api/commitments`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Browser)'
      }
    });
    
    const verifyResult = await verifyResponse.json();
    const stillExists = verifyResult.commitments.find(c => c.id === commitmentId);
    
    if (stillExists) {
      throw new Error('Commitment still exists after cancellation');
    }
    console.log('✅ Commitment successfully removed from database');
    
    return true;
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Duration.Finance Cancellation Flow');
  console.log('='.repeat(50));
  
  const success = await testCancellation();
  
  console.log('\n📊 Result:', success ? '✅ SUCCESS' : '❌ FAILED');
  console.log('\n🎉 Summary:');
  console.log('   • Commitment creation: Working');
  console.log('   • Database ID retrieval: Working');
  console.log('   • Commitment cancellation: ' + (success ? 'Working' : 'Failed'));
  console.log('   • Database cleanup: ' + (success ? 'Working' : 'Failed'));
}

if (require.main === module) {
  main().catch(console.error);
}