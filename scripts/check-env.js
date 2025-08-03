#!/usr/bin/env node

/**
 * Check environment configuration
 */

require('dotenv').config();

console.log('🔧 Environment Configuration Check\n');

console.log('1inch API Configuration:');
console.log('  ONEINCH_API_KEY:', process.env.ONEINCH_API_KEY ? '✅ Set' : '❌ Missing');
console.log('  ONEINCH_API_URL:', process.env.ONEINCH_API_URL || 'https://api.1inch.dev (default)');

console.log('\nDatabase Configuration:');
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');

console.log('\nContract Addresses:');
console.log('  Base Sepolia:', process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA || '❌ Missing');
console.log('  Base Mainnet:', process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE || '❌ Missing');

console.log('\nSecurity Configuration:');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing');
console.log('  INTERNAL_API_KEY:', process.env.INTERNAL_API_KEY ? '✅ Set' : '❌ Missing');

console.log('\nx402 Configuration:');
console.log('  X402_ENABLED:', process.env.X402_ENABLED);
console.log('  X402_RECIPIENT_ADDRESS:', process.env.X402_RECIPIENT_ADDRESS || '❌ Missing');

if (process.env.ONEINCH_API_KEY) {
  console.log('\n🔑 1inch API Key (first 10 chars):', process.env.ONEINCH_API_KEY.substring(0, 10) + '...');
} else {
  console.log('\n⚠️  1inch API Key is missing! This will cause authorization errors.');
  console.log('   Get your API key from: https://portal.1inch.dev/');
  console.log('   Add it to your .env file as: ONEINCH_API_KEY=your_key_here');
}