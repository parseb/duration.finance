/**
 * @title Environment Configuration
 * @notice Centralized environment variable management with security controls
 * @dev This file ensures sensitive variables are only accessible on the server-side
 */

// ⚠️ SECURITY: These variables are NEVER sent to the frontend
// They are only available in API routes and server-side functions

export const ENV = {
  // Smart Contract & Blockchain
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  BASE_RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  BASE_TESTNET_RPC_URL: process.env.BASE_TESTNET_RPC_URL || 'https://sepolia.base.org',
  BASESCAN_API_KEY: process.env.BASESCAN_API_KEY || '',
  
  // 1inch Integration
  ONEINCH_API_KEY: process.env.ONEINCH_API_KEY || '',
  ONEINCH_API_URL: process.env.ONEINCH_API_URL || 'https://api.1inch.dev',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET || '',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || '',
  REDIS_TOKEN: process.env.REDIS_TOKEN || '',
  
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
} as const;

// Validation function to ensure required variables are set
export function validateEnv() {
  const required = [
    'BASE_RPC_URL',
    'BASE_TESTNET_RPC_URL',
  ] as const;
  
  const missing = required.filter(key => !ENV[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Warn about missing optional but important variables
  const important = [
    'PRIVATE_KEY',
    'ONEINCH_API_KEY',
    'DATABASE_URL',
    'JWT_SECRET',
  ] as const;
  
  const missingImportant = important.filter(key => !ENV[key]);
  
  if (missingImportant.length > 0 && ENV.IS_PRODUCTION) {
    console.warn(`⚠️ Missing important environment variables: ${missingImportant.join(', ')}`);
  }
}

// Ensure this module can only be imported on the server-side
if (typeof window !== 'undefined') {
  throw new Error('❌ SECURITY VIOLATION: env.ts can only be imported on the server-side!');
}

// Type-safe environment access
export type EnvKey = keyof typeof ENV;