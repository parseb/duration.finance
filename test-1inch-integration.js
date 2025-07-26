/**
 * @title Test 1inch Integration
 * @notice Test script to verify 1inch API integration works correctly
 */

const { execSync } = require('child_process');

async function testQuoteAPI() {
  console.log('🔄 Testing 1inch Quote API...');
  
  // Test Base WETH -> USDC quote
  const WETH_BASE = '0x4200000000000000000000000000000000000006';
  const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  try {
    const response = await fetch(`http://localhost:3000/api/quote?` + new URLSearchParams({
      srcToken: WETH_BASE,
      dstToken: USDC_BASE,
      amount: '1',
      srcDecimals: '18',
      chainId: '8453'
    }));
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Quote API Response:', {
      success: data.success,
      srcAmount: data.data?.srcAmount,
      dstAmount: data.data?.dstAmount,
      gas: data.data?.gas,
      cached: data.metadata?.cached
    });
    
    return true;
  } catch (error) {
    console.log('❌ Quote API Error:', error.message);
    return false;
  }
}

async function testSwapAPI() {
  console.log('🔄 Testing 1inch Swap API...');
  
  const WETH_BASE = '0x4200000000000000000000000000000000000006';
  const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
  
  try {
    const response = await fetch('http://localhost:3000/api/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        srcToken: WETH_BASE,
        dstToken: USDC_BASE,
        amount: '0.1',
        fromAddress: TEST_ADDRESS,
        slippage: 1,
        srcDecimals: 18,
        chainId: 8453
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`HTTP ${response.status}: ${errorData.error}`);
    }
    
    const data = await response.json();
    console.log('✅ Swap API Response:', {
      success: data.success,
      srcAmount: data.data?.srcAmount,
      dstAmount: data.data?.dstAmount,
      tx: {
        to: data.data?.tx?.to,
        value: data.data?.tx?.value,
        gasEstimate: data.data?.tx?.gas
      }
    });
    
    return true;
  } catch (error) {
    console.log('❌ Swap API Error:', error.message);
    return false;
  }
}

async function testContractIntegration() {
  console.log('🔄 Testing Smart Contract Integration...');
  
  try {
    // Test contract compilation
    execSync('forge build', { stdio: 'pipe' });
    console.log('✅ Contracts compile successfully');
    
    // Test basic functionality
    const testResult = execSync('forge test --match-test testCalculatePremium', { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    if (testResult.includes('ok.') && testResult.includes('1 passed')) {
      console.log('✅ Smart contract tests pass');
      return true;
    } else {
      console.log('❌ Smart contract test failed');
      console.log(testResult);
      return false;
    }
  } catch (error) {
    console.log('❌ Contract Integration Error:', error.message);
    return false;
  }
}

async function testCaching() {
  console.log('🔄 Testing API Caching (5 second TTL)...');
  
  const WETH_BASE = '0x4200000000000000000000000000000000000006';
  const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  try {
    const startTime = Date.now();
    
    // First request
    const response1 = await fetch(`http://localhost:3000/api/quote?` + new URLSearchParams({
      srcToken: WETH_BASE,
      dstToken: USDC_BASE,
      amount: '1',
      chainId: '8453'
    }));
    
    const time1 = Date.now() - startTime;
    
    // Second request (should be cached)
    const startTime2 = Date.now();
    const response2 = await fetch(`http://localhost:3000/api/quote?` + new URLSearchParams({
      srcToken: WETH_BASE,
      dstToken: USDC_BASE,
      amount: '1',
      chainId: '8453'
    }));
    
    const time2 = Date.now() - startTime2;
    
    if (response1.ok && response2.ok) {
      console.log(`✅ Caching working - First: ${time1}ms, Second (cached): ${time2}ms`);
      
      if (time2 < time1 * 0.5) {
        console.log('✅ Cache performance improvement detected');
        return true;
      } else {
        console.log('⚠️  Cache may not be working optimally');
        return false;
      }
    } else {
      console.log('❌ Cache test failed - API requests failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Cache Test Error:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Running 1inch Integration Tests\n');
  
  const results = {
    contract: await testContractIntegration(),
    quote: false, // Will test if server is running
    swap: false,  // Will test if server is running
    cache: false  // Will test if server is running
  };
  
  // Check if Next.js dev server is running
  try {
    const healthCheck = await fetch('http://localhost:3000/api/quote?srcToken=0x4200000000000000000000000000000000000006&dstToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&amount=1');
    
    if (healthCheck.ok || healthCheck.status === 400) {
      console.log('✅ Development server is running\n');
      
      results.quote = await testQuoteAPI();
      console.log('');
      
      results.swap = await testSwapAPI();
      console.log('');
      
      results.cache = await testCaching();
      console.log('');
    } else {
      console.log('❌ Development server not running. Start with: npm run dev\n');
    }
  } catch (error) {
    console.log('❌ Development server not accessible. Start with: npm run dev\n');
  }
  
  // Summary
  console.log('📊 Test Results Summary:');
  console.log(`   Contract Integration: ${results.contract ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Quote API:           ${results.quote ? '✅ PASS' : '❌ FAIL/SKIP'}`);
  console.log(`   Swap API:            ${results.swap ? '✅ PASS' : '❌ FAIL/SKIP'}`);
  console.log(`   Caching:             ${results.cache ? '✅ PASS' : '❌ FAIL/SKIP'}`);
  
  const passCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`\n🎯 Overall: ${passCount}/${totalCount} tests passed`);
  
  if (passCount === totalCount) {
    console.log('🎉 All 1inch integration tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the logs above.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});