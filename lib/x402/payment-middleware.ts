// x402 Payment Required Middleware
// Implements HTTP 402 Payment Required for API operations
// Based on microtransaction model for API access

import { NextRequest, NextResponse } from 'next/server';
import { Address, parseUnits, formatUnits } from 'viem';
import { createHash } from 'crypto';

export interface X402Config {
  enabled: boolean;
  costUsdc: number;
  recipientAddress: Address;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface PaymentProof {
  txHash: string;
  amount: string;
  recipient: Address;
  sender: Address;
  timestamp: number;
  nonce: string;
}

export interface X402Headers {
  'X-Payment-Required': string;
  'X-Payment-Cost': string;
  'X-Payment-Recipient': string;
  'X-Payment-Methods': string;
  'WWW-Authenticate': string;
}

class X402PaymentSystem {
  private config: X402Config;
  private rateLimit = new Map<string, { count: number; windowStart: number }>();
  private validPayments = new Map<string, PaymentProof>();

  constructor() {
    this.config = {
      enabled: process.env.X402_PAYMENT_ENABLED === 'true',
      costUsdc: parseFloat(process.env.X402_POST_OFFER_COST_USDC || '1.0'),
      recipientAddress: (process.env.X402_PAYMENT_RECIPIENT || '0x0000000000000000000000000000000000000000') as Address,
      rateLimitWindowMs: parseInt(process.env.X402_RATE_LIMIT_WINDOW_MS || '60000'),
      rateLimitMaxRequests: parseInt(process.env.X402_RATE_LIMIT_MAX_REQUESTS || '10'),
    };
  }

  /**
   * Check if payment is required for this request
   */
  requiresPayment(method: string, pathname: string): boolean {
    if (!this.config.enabled) return false;

    // Payment required for posting LP offers
    if (method === 'POST' && pathname.includes('/api/commitments/lp')) {
      return true;
    }

    // Payment required for taking options
    if (method === 'POST' && pathname.includes('/take')) {
      return true;
    }

    return false;
  }

  /**
   * Check rate limits for IP address
   */
  checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const key = ip;
    const limit = this.rateLimit.get(key);

    if (!limit) {
      this.rateLimit.set(key, { count: 1, windowStart: now });
      return true;
    }

    // Reset window if expired
    if (now - limit.windowStart > this.config.rateLimitWindowMs) {
      this.rateLimit.set(key, { count: 1, windowStart: now });
      return true;
    }

    // Check if within rate limit
    if (limit.count >= this.config.rateLimitMaxRequests) {
      return false;
    }

    // Increment counter
    limit.count++;
    return true;
  }

  /**
   * Generate payment challenge headers
   */
  generatePaymentHeaders(): X402Headers {
    const challengeId = this.generateChallengeId();
    const costWei = parseUnits(this.config.costUsdc.toString(), 6); // USDC has 6 decimals

    return {
      'X-Payment-Required': challengeId,
      'X-Payment-Cost': `${formatUnits(costWei, 6)} USDC`,
      'X-Payment-Recipient': this.config.recipientAddress,
      'X-Payment-Methods': 'ERC20-USDC',
      'WWW-Authenticate': `Bearer realm="Duration.Finance API", cost="${formatUnits(costWei, 6)} USDC", recipient="${this.config.recipientAddress}"`,
    };
  }

  /**
   * Verify payment proof from client
   */
  async verifyPayment(paymentProof: PaymentProof): Promise<boolean> {
    try {
      // Basic validation
      if (!paymentProof.txHash || !paymentProof.amount || !paymentProof.recipient || !paymentProof.sender) {
        return false;
      }

      // Check recipient address
      if (paymentProof.recipient.toLowerCase() !== this.config.recipientAddress.toLowerCase()) {
        return false;
      }

      // Check payment amount (USDC has 6 decimals)
      const expectedAmount = parseUnits(this.config.costUsdc.toString(), 6);
      const paidAmount = BigInt(paymentProof.amount);
      
      if (paidAmount < expectedAmount) {
        return false;
      }

      // Check timestamp (payment must be recent - within 1 hour)
      const now = Date.now();
      const paymentAge = now - paymentProof.timestamp;
      if (paymentAge > 3600000) { // 1 hour
        return false;
      }

      // Check if payment already used
      const paymentKey = this.generatePaymentKey(paymentProof);
      if (this.validPayments.has(paymentKey)) {
        return false;
      }

      // In a real implementation, you would verify the transaction on-chain
      // For now, we'll trust the client's payment proof
      // TODO: Implement on-chain transaction verification

      // Store payment to prevent reuse
      this.validPayments.set(paymentKey, paymentProof);

      // Clean up old payments periodically
      this.cleanupOldPayments();

      return true;
    } catch (error) {
      console.error('Payment verification failed:', error);
      return false;
    }
  }

  /**
   * Create payment challenge response
   */
  createPaymentRequiredResponse(): NextResponse {
    const headers = this.generatePaymentHeaders();
    
    const response = NextResponse.json(
      {
        error: 'Payment Required',
        message: `This API endpoint requires a payment of ${this.config.costUsdc} USDC`,
        cost: `${this.config.costUsdc} USDC`,
        recipient: this.config.recipientAddress,
        methods: ['ERC20-USDC'],
        instructions: {
          step1: 'Send the required USDC amount to the recipient address',
          step2: 'Include the transaction hash in the X-Payment-Proof header',
          step3: 'Retry the request with the payment proof',
        },
      },
      { status: 402 } // HTTP 402 Payment Required
    );

    // Add payment headers
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  /**
   * Create rate limit exceeded response
   */
  createRateLimitResponse(): NextResponse {
    return NextResponse.json(
      {
        error: 'Rate Limit Exceeded',
        message: `Maximum ${this.config.rateLimitMaxRequests} requests per ${this.config.rateLimitWindowMs / 1000} seconds`,
        retryAfter: Math.ceil(this.config.rateLimitWindowMs / 1000),
      },
      { status: 429 } // HTTP 429 Too Many Requests
    );
  }

  /**
   * Extract payment proof from request headers
   */
  extractPaymentProof(request: NextRequest): PaymentProof | null {
    try {
      const proofHeader = request.headers.get('X-Payment-Proof');
      if (!proofHeader) return null;

      const proof = JSON.parse(proofHeader);
      
      // Validate required fields
      if (!proof.txHash || !proof.amount || !proof.recipient || !proof.sender || !proof.timestamp || !proof.nonce) {
        return null;
      }

      return proof as PaymentProof;
    } catch (error) {
      console.error('Failed to parse payment proof:', error);
      return null;
    }
  }

  /**
   * Main middleware function
   */
  async middleware(request: NextRequest): Promise<NextResponse | null> {
    const { method, pathname } = request.nextUrl;
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

    // Check if payment is required
    if (!this.requiresPayment(method, pathname)) {
      return null; // Continue to next middleware/handler
    }

    // Check rate limits
    if (!this.checkRateLimit(ip)) {
      return this.createRateLimitResponse();
    }

    // Extract payment proof
    const paymentProof = this.extractPaymentProof(request);
    
    if (!paymentProof) {
      return this.createPaymentRequiredResponse();
    }

    // Verify payment
    const isValidPayment = await this.verifyPayment(paymentProof);
    
    if (!isValidPayment) {
      return this.createPaymentRequiredResponse();
    }

    // Payment verified, continue to handler
    return null;
  }

  private generateChallengeId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  private generatePaymentKey(proof: PaymentProof): string {
    return createHash('sha256')
      .update(`${proof.txHash}-${proof.nonce}`)
      .digest('hex');
  }

  private cleanupOldPayments(): void {
    const now = Date.now();
    const oneHour = 3600000;

    for (const [key, payment] of this.validPayments.entries()) {
      if (now - payment.timestamp > oneHour) {
        this.validPayments.delete(key);
      }
    }
  }
}

// Export singleton instance
export const x402PaymentSystem = new X402PaymentSystem();

// Export middleware function for use in Next.js middleware
export function x402Middleware(request: NextRequest): Promise<NextResponse | null> {
  return x402PaymentSystem.middleware(request);
}

// Helper function to create payment proof on client side
export function createPaymentProof(
  txHash: string,
  amount: string,
  recipient: Address,
  sender: Address
): PaymentProof {
  return {
    txHash,
    amount,
    recipient,
    sender,
    timestamp: Date.now(),
    nonce: createHash('sha256').update(`${txHash}-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 16),
  };
}