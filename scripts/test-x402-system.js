#!/usr/bin/env node

/**
 * Test script for x402 Payment System
 * Tests the dual API system: free frontend access vs paid x402 access
 */

const API_BASE = 'http://localhost:3001';

async function testFreeInternalAPI() {
  console.log('\n🧪 Testing Free Internal API...');
  
  try {
    // Test with browser-like headers (should work)
    const response = await fetch(`${API_BASE}/api/commitments`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Internal API accessible to browsers:', data.success);
    } else {
      console.log('❌ Internal API failed:', response.status, await response.text());
    }
  } catch (error) {
    console.log('❌ Internal API error:', error.message);
  }
  
  try {
    // Test with API tool (should be blocked)
    const response = await fetch(`${API_BASE}/api/commitments`, {
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Accept': 'application/json'
      }
    });
    
    if (response.status === 403) {
      const data = await response.json();
      console.log('✅ Internal API correctly blocks API tools:', data.message);
    } else {
      console.log('❌ Internal API should block API tools but didn\'t');
    }
  } catch (error) {
    console.log('❌ API tool test error:', error.message);
  }
}

async function testX402API() {
  console.log('\n💰 Testing x402 Payment API...');
  
  try {
    // Test x402 GET (should work without payment)
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ x402 GET works without payment:', data.success);
      console.log('   x402 Enabled:', data.x402Enabled);
    } else {
      console.log('❌ x402 GET failed:', response.status);
    }
  } catch (error) {
    console.log('❌ x402 GET error:', error.message);
  }
  
  try {
    // Test x402 POST without payment (should return 402)
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe', // Valid test address
        asset: '0x4200000000000000000000000000000000000006',
        amount: '1000000000000000000',
        premiumAmount: '50000000',
        minDurationDays: '1',
        maxDurationDays: '7',
        optionType: 0,
        commitmentType: 0,
        expiry: '99999999999',
        nonce: '123',
        isFramentable: true,
        signature: '0x' + '0'.repeat(130)
      })
    });
    
    if (response.status === 402) {
      const data = await response.json();
      console.log('✅ x402 POST correctly requires payment:', data.code);
      console.log('   Payment amount:', data.payment.amount, data.payment.token);
      console.log('   Recipient:', data.payment.recipient);
    } else {
      console.log('❌ x402 POST should return 402 but returned:', response.status);
    }
  } catch (error) {
    console.log('❌ x402 POST error:', error.message);
  }
  
  try {
    // Test x402 POST with mock payment (should work)
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Content-Type': 'application/json',
        'X-Payment-Hash': '0x1234567890123456789012345678901234567890123456789012345678901234',
        'X-Payment-Amount': '1000000' // $1 USDC in wei
      },
      body: JSON.stringify({
        creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe', // Valid test address
        asset: '0x4200000000000000000000000000000000000006',
        amount: '1000000000000000000',
        premiumAmount: '50000000',
        minDurationDays: '1',
        maxDurationDays: '7',
        optionType: 0,
        commitmentType: 0,
        expiry: '99999999999',
        nonce: '123',
        isFramentable: true,
        signature: '0x' + '0'.repeat(130)
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ x402 POST works with payment:', data.success);
      console.log('   Payment verified:', data.paidViaX402);
    } else {
      const error = await response.json();
      console.log('❌ x402 POST with payment failed:', error.error);
    }
  } catch (error) {
    console.log('❌ x402 POST with payment error:', error.message);
  }
}

async function testRateLimiting() {
  console.log('\n⏱️  Testing Rate Limiting...');
  
  try {
    // Make multiple requests quickly
    const promises = [];
    for (let i = 0; i < 8; i++) {
      promises.push(
        fetch(`${API_BASE}/api/x402/commitments`, {
          method: 'POST',
          headers: {
            'User-Agent': 'test-client',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ test: 'data' })
        })
      );
    }
    
    const responses = await Promise.all(promises);
    const statusCodes = responses.map(r => r.status);
    const rateLimited = statusCodes.filter(s => s === 429).length;
    
    console.log('✅ Rate limiting test completed');
    console.log(`   Status codes: ${statusCodes.join(', ')}`);
    console.log(`   Rate limited responses: ${rateLimited}`);
    
  } catch (error) {
    console.log('❌ Rate limiting test error:', error.message);
  }
}

async function main() {
  console.log('🚀 Testing Duration.Finance Dual API System');
  console.log('='.repeat(50));
  
  await testFreeInternalAPI();
  await testX402API();
  await testRateLimiting();
  
  console.log('\n✨ Test completed!');
  console.log('\n📝 Summary:');
  console.log('   • Internal API: Free for browsers, blocked for API tools');
  console.log('   • x402 API: $1 USDC payment required for POST requests');
  console.log('   • Rate limiting: Prevents abuse');
  console.log('   • Reading: Always free on both APIs');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testFreeInternalAPI, testX402API, testRateLimiting };