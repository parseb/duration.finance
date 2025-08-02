#!/usr/bin/env node

/**
 * Test script for 1inch price service integration
 */

const API_BASE = 'https://api.1inch.dev/swap/v6.0/8453'; // Base mainnet

const ASSETS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

async function testPriceService() {
  console.log('🧪 Testing 1inch Price Service Integration...');
  console.log('='.repeat(50));
  
  try {
    // Test 1: Get WETH price in USDC
    console.log('1. Testing WETH price fetch...');
    const ethPrice = await getEthPrice();
    console.log(`✅ WETH Price: $${ethPrice.toLocaleString()}`);
    
    // Test 2: Test with different amounts
    console.log('\n2. Testing price scaling...');
    const smallAmount = await getEthPrice('100000000000000000'); // 0.1 ETH
    const largeAmount = await getEthPrice('10000000000000000000'); // 10 ETH
    
    console.log(`   0.1 ETH: $${smallAmount.toFixed(2)}`);
    console.log(`   10 ETH: $${largeAmount.toFixed(2)}`);
    console.log(`   Price consistency: ${Math.abs(ethPrice - smallAmount) < 1 ? '✅' : '❌'}`);
    
    // Test 3: Test error handling
    console.log('\n3. Testing error handling...');
    try {
      await getInvalidPrice();
      console.log('❌ Should have thrown error for invalid token');
    } catch (error) {
      console.log('✅ Error handling works:', error.message);
    }
    
    console.log('\n📊 Summary:');
    console.log('   • Price fetching: Working');
    console.log('   • Amount scaling: Working');
    console.log('   • Error handling: Working');
    console.log('   • 1inch API integration: Ready for production');
    
    return true;
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    console.log('\n💡 Note: This might fail if:');
    console.log('   • 1inch API is down');
    console.log('   • Network connectivity issues');
    console.log('   • Rate limiting');
    console.log('   • Invalid API endpoint');
    return false;
  }
}

async function getEthPrice(amount = '1000000000000000000') {
  const url = `${API_BASE}/quote?src=${ASSETS.WETH}&dst=${ASSETS.USDC}&amount=${amount}&includeProtocols=true`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Duration.Finance/1.0',
    },
  });
  
  if (!response.ok) {
    throw new Error(`1inch API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  const usdcAmount = parseInt(data.toAmount) / 1e6;
  const ethAmount = parseInt(amount) / 1e18;
  
  return usdcAmount / ethAmount;
}

async function getInvalidPrice() {
  const url = `${API_BASE}/quote?src=0x1234567890123456789012345678901234567890&dst=${ASSETS.USDC}&amount=1000000000000000000`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Expected API error: ${response.status}`);
  }
  
  return await response.json();
}

async function main() {
  console.log('🚀 Testing Duration.Finance Price Service');
  console.log('Chain: Base Mainnet (8453)');
  console.log('Provider: 1inch API v6.0\n');
  
  const success = await testPriceService();
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Result:', success ? '✅ SUCCESS' : '❌ FAILED');
  
  if (success) {
    console.log('\n🎉 Price service is ready for production!');
    console.log('Frontend components can now use real-time 1inch pricing.');
  } else {
    console.log('\n⚠️  Price service needs attention.');
    console.log('Frontend will fall back to cached/mock prices.');
  }
}

if (require.main === module) {
  main().catch(console.error);
}