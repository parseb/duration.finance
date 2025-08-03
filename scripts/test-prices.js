#!/usr/bin/env node

/**
 * Test script for the pricing API
 * Usage: node scripts/test-prices.js
 */

const BASE_URL = 'http://localhost:3000';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

async function testSinglePrice() {
  console.log('🔍 Testing single price fetch...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/prices?asset=${WETH_ADDRESS}`);
    const data = await response.json();
    
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.price) {
      console.log(`✅ WETH Price: $${data.price.price} (source: ${data.price.source})`);
    } else {
      console.log('❌ Failed to get price:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testBatchPrices() {
  console.log('\n🔍 Testing batch price fetch...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/prices?assets=${WETH_ADDRESS}`);
    const data = await response.json();
    
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.prices) {
      Object.entries(data.prices).forEach(([address, priceData]) => {
        console.log(`✅ ${address}: $${priceData.price} (source: ${priceData.source})`);
      });
    } else {
      console.log('❌ Failed to get prices:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testHealthCheck() {
  console.log('\n🔍 Testing health check...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'health_check' })
    });
    
    const data = await response.json();
    
    console.log('Health Check Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ API is healthy!');
      console.log(`   API Key Configured: ${data.config.api_key_configured}`);
      console.log(`   Cache Size: ${data.cache_stats.size}`);
    }
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Duration.Finance Price API Test\n');
  
  // Wait a moment for server to be ready
  console.log('⏳ Waiting for server to start...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await testHealthCheck();
  await testSinglePrice();
  await testBatchPrices();
  
  console.log('\n✨ Tests completed!');
}

main().catch(console.error);