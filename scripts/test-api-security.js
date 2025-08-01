/**
 * Comprehensive API Security Test Suite
 * Tests all security measures to prevent x402 bypass
 */

const API_BASE = 'http://localhost:3001';

// Mock commitment data
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

async function testLegitimateInternalAccess() {
  console.log('\n🧪 Testing legitimate internal access (browser-like request)...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'http://localhost:3001',
        'Referer': 'http://localhost:3001/',
        'Accept': 'application/json',
      },
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 200) {
      console.log('✅ Legitimate internal access working correctly');
    } else {
      console.log('⚠️  Legitimate access may be blocked');
    }
  } catch (error) {
    console.error('❌ Internal access test failed:', error.message);
  }
}

async function testBlockedCurlAccess() {
  console.log('\n🧪 Testing blocked external access (curl simulation)...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 403) {
      console.log('✅ External curl access blocked correctly');
    } else {
      console.log('❌ External access not properly blocked');
    }
  } catch (error) {
    console.error('❌ Curl block test failed:', error.message);
  }
}

async function testBlockedPostmanAccess() {
  console.log('\n🧪 Testing blocked API tool access (Postman simulation)...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'PostmanRuntime/7.29.0',
        'Content-Type': 'application/json',
        'Accept': '*/*',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 403 && data.alternativeEndpoint) {
      console.log('✅ Postman access blocked with proper redirect to x402');
    } else {
      console.log('❌ API tool access not properly blocked');
    }
  } catch (error) {
    console.error('❌ Postman block test failed:', error.message);
  }
}

async function testBlockedPythonRequestsAccess() {
  console.log('\n🧪 Testing blocked Python requests access...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'python-requests/2.28.1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 403) {
      console.log('✅ Python requests access blocked correctly');
    } else {
      console.log('❌ Python requests access not properly blocked');
    }
  } catch (error) {
    console.error('❌ Python requests block test failed:', error.message);
  }
}

async function testBlockedExternalOrigin() {
  console.log('\n🧪 Testing blocked external origin...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible)',
        'Origin': 'https://malicious-site.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 403) {
      console.log('✅ External origin blocked correctly');
    } else {
      console.log('❌ External origin not properly blocked');
    }
  } catch (error) {
    console.error('❌ External origin block test failed:', error.message);
  }
}

async function testRateLimiting() {
  console.log('\n🧪 Testing rate limiting on internal API...');
  
  const requests = [];
  const startTime = Date.now();
  
  // Send 10 rapid requests
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch(`${API_BASE}/api/commitments`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (test)',
          'Origin': 'http://localhost:3001',
        },
      })
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    console.log(`📋 Sent 10 requests in ${endTime - startTime}ms`);
    
    let successCount = 0;
    let rateLimitedCount = 0;
    
    for (const response of responses) {
      if (response.status === 200) successCount++;
      if (response.status === 429) rateLimitedCount++;
    }
    
    console.log(`📋 Successful: ${successCount}, Rate limited: ${rateLimitedCount}`);
    
    if (successCount > 0) {
      console.log('✅ Some requests succeeded (normal behavior)');
    }
    if (rateLimitedCount > 0) {
      console.log('✅ Rate limiting is working');
    }
  } catch (error) {
    console.error('❌ Rate limiting test failed:', error.message);
  }
}

async function testX402StillWorks() {
  console.log('\n🧪 Testing x402 endpoint still accepts external requests...');
  
  try {
    const response = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'python-requests/2.28.1', // Simulate external API tool
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, data);
    
    if (response.status === 402) {
      console.log('✅ x402 endpoint correctly requires payment from external tools');
    } else {
      console.log('⚠️  x402 endpoint may have issues');
    }
  } catch (error) {
    console.error('❌ x402 test failed:', error.message);
  }
}

async function runSecurityTests() {
  console.log('🛡️  Running API Security Test Suite');
  console.log('=====================================');
  
  await testLegitimateInternalAccess();
  await testBlockedCurlAccess();
  await testBlockedPostmanAccess(); 
  await testBlockedPythonRequestsAccess();
  await testBlockedExternalOrigin();
  await testRateLimiting();
  await testX402StillWorks();
  
  console.log('\n🏁 Security tests completed!');
  console.log('\n📊 Summary:');
  console.log('✅ Legitimate browser access should work');
  console.log('🚫 External API tools should be blocked');
  console.log('🚫 External origins should be blocked');
  console.log('⚡ Rate limiting should prevent abuse');
  console.log('💰 x402 endpoint should still require payment');
}

// Run tests
runSecurityTests().catch(console.error);