import { NextRequest, NextResponse } from 'next/server';

// x402 Configuration
export const X402_CONFIG = {
  costUsdc: 1, // $1 USDC per commitment
  recipient: process.env.X402_RECIPIENT_ADDRESS || '0x0000000000000000000000000000000000000000',
  chainId: parseInt(process.env.X402_CHAIN_ID || '84532'), // Base Sepolia default
  enabled: process.env.X402_ENABLED !== 'false',
};

export interface X402Headers {
  'X-Payment-Required': string;
  'X-Payment-Amount': string;
  'X-Payment-Token': string;
  'X-Payment-Recipient': string;
  'X-Payment-Chain': string;
}

/**
 * Check if x402 payment is required
 */
export function isX402Required(): boolean {
  return X402_CONFIG.enabled;
}

/**
 * Create x402 Payment Required response
 */
export function createX402Response(clientIp: string): NextResponse {
  const headers: X402Headers = {
    'X-Payment-Required': 'true',
    'X-Payment-Amount': (X402_CONFIG.costUsdc * 1e6).toString(), // Convert to USDC wei (6 decimals)
    'X-Payment-Token': 'USDC',
    'X-Payment-Recipient': X402_CONFIG.recipient,
    'X-Payment-Chain': X402_CONFIG.chainId.toString(),
  };

  return NextResponse.json(
    {
      error: 'Payment Required',
      code: 402,
      message: 'This endpoint requires payment to access',
      payment: {
        amount: X402_CONFIG.costUsdc,
        token: 'USDC',
        recipient: X402_CONFIG.recipient,
        chainId: X402_CONFIG.chainId,
        description: 'Payment required for API access - $1 USDC per commitment',
      },
      instructions: 'Send payment transaction and include tx hash in X-Payment-Hash header',
    },
    { 
      status: 402,
      headers: headers as any
    }
  );
}

/**
 * Validate x402 payment (simplified - in production would verify on-chain)
 */
export async function hasValidX402Payment(request: NextRequest): Promise<boolean> {
  if (!isX402Required()) {
    return true; // Skip payment if disabled
  }

  const paymentHash = request.headers.get('x-payment-hash');
  const paymentAmount = request.headers.get('x-payment-amount');
  
  // Simplified validation - in production would:
  // 1. Verify transaction exists on-chain
  // 2. Check it's to the correct recipient
  // 3. Verify amount is correct
  // 4. Ensure transaction is recent
  // 5. Prevent double-spending
  
  if (!paymentHash || !paymentAmount) {
    return false;
  }
  
  // For demo purposes, accept any payment hash that looks valid
  const isValidHash = paymentHash.startsWith('0x') && paymentHash.length === 66;
  const isValidAmount = parseInt(paymentAmount) >= (X402_CONFIG.costUsdc * 1e6);
  
  return isValidHash && isValidAmount;
}

/**
 * Get client IP address
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const connectingIp = request.headers.get('cf-connecting-ip');
  
  return connectingIp || (forwarded ? forwarded.split(',')[0].trim() : realIp) || 'unknown';
}

/**
 * Rate limiting for x402 endpoints (simple in-memory store)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(clientIp: string, maxRequests: number = 10, windowMs: number = 60000): { allowed: boolean; resetTime: number } {
  const now = Date.now();
  const key = `x402_${clientIp}`;
  const limit = rateLimitStore.get(key);
  
  if (!limit || now > limit.resetTime) {
    const resetTime = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, resetTime };
  }
  
  if (limit.count >= maxRequests) {
    return { allowed: false, resetTime: limit.resetTime };
  }
  
  limit.count += 1;
  rateLimitStore.set(key, limit);
  return { allowed: true, resetTime: limit.resetTime };
}