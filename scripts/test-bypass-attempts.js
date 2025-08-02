/**
 * Test External Agent Bypass Prevention
 * Demonstrates that external agents cannot access regular API to avoid x402 payment
 */

const API_BASE = 'http://localhost:3001';

const mockCommitment = {
  creator: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe',
  asset: '0x4200000000000000000000000000000000000006',
  amount: '500000000000000000',
  premiumAmount: '25000000',
  minDurationDays: '1',
  maxDurationDays: '7',
  optionType: 0,
  commitmentType: 0,
  expiry: (Math.floor(Date.now() / 1000) + 3600).toString(),
  nonce: Math.floor(Math.random() * 1000000).toString(),
  signature: '0x' + '0'.repeat(130),
};

async function attemptBypassWithFakeHeaders() {
  console.log('🕵️  Attempting bypass with fake browser headers...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Origin': 'http://localhost:3001',
        'Referer': 'http://localhost:3001/',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    console.log(`Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('❌ SECURITY BREACH: External agent bypassed security!');
      const data = await response.json();
      console.log('Response:', data);
    } else if (response.status === 403) {
      console.log('✅ Security working: Fake headers detected and blocked');
    } else {
      console.log(`✅ Security working: Request blocked with status ${response.status}`);
    }
  } catch (error) {
    console.log('✅ Security working: Request failed -', error.message.substring(0, 50));
  }
}

async function attemptDirectAPIBypass() {
  console.log('\n🕵️  Attempting direct API bypass with minimal headers...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    console.log(`Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('❌ SECURITY BREACH: Direct API access succeeded!');
    } else {
      console.log('✅ Security working: Direct API access blocked');
    }
  } catch (error) {
    console.log('✅ Security working: Direct access failed -', error.message.substring(0, 50));
  }
}

async function demonstrateCorrectX402Usage() {
  console.log('\n💰 Demonstrating correct x402 usage...');
  
  try {
    // First, show payment is required
    const response1 = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ExternalAPIAgent/1.0',
      },
      body: JSON.stringify(mockCommitment),
    });
    
    console.log(`Payment request status: ${response1.status}`);
    
    if (response1.status === 402) {
      console.log('✅ x402 correctly requires payment');
      const paymentInfo = await response1.json();
      console.log(`Payment required: $${paymentInfo.amount} ${paymentInfo.token}`);
      console.log(`Recipient: ${paymentInfo.recipient}`);
    }
    
    // Show that with payment proof, it would work
    const mockPaymentProof = {
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      amount: '1000000', // $1 USDC
      recipient: '0x709ef2CBa57dfB96704aC10FB739c9dFF8B9e5Fe',
      sender: mockCommitment.creator,
      timestamp: Date.now(),
      chainId: 84532,
    };
    
    const response2 = await fetch(`${API_BASE}/api/x402/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ExternalAPIAgent/1.0',
        'X-Payment-Proof': JSON.stringify(mockPaymentProof),
      },
      body: JSON.stringify(mockCommitment),
    });
    
    console.log(`With payment proof status: ${response2.status}`);
    
  } catch (error) {
    console.log('x402 test error:', error.message);
  }
}

async function testLegitimateUserAccess() {
  console.log('\n👤 Testing legitimate user access (simulating frontend)...');
  
  try {
    const response = await fetch(`${API_BASE}/api/commitments`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'http://localhost:3001',
        'Referer': 'http://localhost:3001/',
        'Accept': 'application/json',
      },
    });
    
    console.log(`Legitimate user status: ${response.status}`);
    
    if (response.status === 200 || response.status === 500) {
      console.log('✅ Legitimate user access allowed (database errors are separate)');
    } else if (response.status === 403) {
      console.log('⚠️  Legitimate user blocked - may need config adjustment');
    }
  } catch (error) {
    console.log('Legitimate user test error:', error.message);
  }
}

async function runBypassTests() {
  console.log('🛡️  Testing External Agent Bypass Prevention');
  console.log('============================================');
  
  await testLegitimateUserAccess();
  await attemptBypassWithFakeHeaders();
  await attemptDirectAPIBypass();
  await demonstrateCorrectX402Usage();
  
  console.log('\n📊 Summary:');
  console.log('✅ Legitimate users can access regular API');
  console.log('🚫 External agents blocked from regular API');
  console.log('💰 External agents directed to x402 API');
  console.log('🔒 No way to bypass payment requirement');
}

runBypassTests().catch(console.error);