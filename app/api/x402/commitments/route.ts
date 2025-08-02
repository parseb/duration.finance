import { NextRequest, NextResponse } from 'next/server';
import { SignedLPCommitment, SignedOptionCommitment, CommitmentType } from '@/lib/eip712/verification';
import { createCommitmentStorage } from '@/lib/database/commitment-storage';
import { createPostgreSQLStorage } from '@/lib/database/postgresql-storage';
import { createCommitmentValidator } from '@/lib/database/commitment-validation';
import { 
  isX402Required, 
  createX402Response, 
  hasValidX402Payment, 
  getClientIp,
  checkRateLimit 
} from '@/lib/x402/payment-handler';

// Initialize storage and validator
const storage = process.env.DATABASE_URL 
  ? createPostgreSQLStorage(process.env.DATABASE_URL)
  : createCommitmentStorage('memory');
const validator = createCommitmentValidator(
  process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS as `0x${string}` || '0x0'
);

/**
 * POST /api/x402/commitments - Create commitment with x402 payment required
 * This endpoint requires $1 USDC payment for commitment creation
 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    
    // Rate limiting
    const rateLimit = checkRateLimit(clientIp, 5, 60000); // 5 requests per minute
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Try again later.',
        resetTime: rateLimit.resetTime,
      }, { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimit.resetTime.toString(),
          'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
        }
      });
    }
    
    // Check if x402 payment is required and valid
    if (isX402Required()) {
      const hasValidPayment = await hasValidX402Payment(request);
      if (!hasValidPayment) {
        return createX402Response(clientIp);
      }
    }

    // Payment validated, proceed with commitment creation
    const commitmentData = await request.json();

    // Check if this is a unified commitment or legacy LP commitment
    const isUnifiedCommitment = 'commitmentType' in commitmentData;

    let commitmentId: string;

    if (isUnifiedCommitment) {
      // Handle unified commitment
      const commitment: SignedOptionCommitment = {
        creator: commitmentData.creator as `0x${string}`,
        asset: commitmentData.asset as `0x${string}`,
        amount: BigInt(commitmentData.amount),
        premiumAmount: BigInt(commitmentData.premiumAmount),
        minDurationDays: BigInt(commitmentData.minDurationDays),
        maxDurationDays: BigInt(commitmentData.maxDurationDays),
        optionType: commitmentData.optionType,
        commitmentType: commitmentData.commitmentType,
        expiry: BigInt(commitmentData.expiry),
        nonce: BigInt(commitmentData.nonce),
        signature: commitmentData.signature as `0x${string}`,
      };

      // Convert to legacy format for storage compatibility
      const legacyCommitment: SignedLPCommitment = {
        lp: commitment.creator,
        asset: commitment.asset,
        amount: commitment.amount,
        dailyPremiumUsdc: commitment.premiumAmount,
        minLockDays: commitment.minDurationDays,
        maxDurationDays: commitment.maxDurationDays,
        optionType: commitment.optionType,
        expiry: commitment.expiry,
        nonce: commitment.nonce,
        signature: commitment.signature,
      };
      commitmentId = await storage.store(legacyCommitment);
    } else {
      // Handle legacy LP commitment
      const commitment: SignedLPCommitment = {
        lp: commitmentData.lp as `0x${string}`,
        asset: commitmentData.asset as `0x${string}`,
        amount: BigInt(commitmentData.amount),
        dailyPremiumUsdc: BigInt(commitmentData.dailyPremiumUsdc),
        minLockDays: BigInt(commitmentData.minLockDays),
        maxDurationDays: BigInt(commitmentData.maxDurationDays),
        optionType: commitmentData.optionType,
        expiry: BigInt(commitmentData.expiry),
        nonce: BigInt(commitmentData.nonce),
        signature: commitmentData.signature as `0x${string}`,
      };

      commitmentId = await storage.store(commitment);
    }

    return NextResponse.json({
      success: true,
      commitmentId,
      message: 'Commitment stored successfully (x402 payment verified)',
      paidViaX402: isX402Required(),
      payment: {
        amount: 1,
        token: 'USDC',
        status: 'verified'
      }
    });
  } catch (error) {
    console.error('Error storing commitment (x402):', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 400 }
    );
  }
}

/**
 * GET /api/x402/commitments - Get all active commitments (no payment required for reading)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const creatorAddress = searchParams.get('creator');
    const commitmentType = searchParams.get('type'); // 'offer' or 'demand'
    const lpAddress = searchParams.get('lp'); // Legacy support

    let commitments: any[];

    if (creatorAddress) {
      // Get commitments for specific creator (fallback to LP method)
      commitments = await storage.getByLP(creatorAddress);
    } else if (lpAddress) {
      // Legacy support - get commitments by LP
      commitments = await storage.getByLP(lpAddress);
    } else {
      // Get all active commitments
      commitments = await storage.getAllActive();
    }

    // Convert BigInt values to strings for JSON serialization
    const serializedCommitments = commitments.map(commitment => ({
      ...commitment,
      id: commitment.id, // Include database ID for frontend operations
      amount: commitment.amount.toString(),
      dailyPremiumUsdc: commitment.dailyPremiumUsdc.toString(),
      minLockDays: commitment.minLockDays.toString(),
      maxDurationDays: commitment.maxDurationDays.toString(),
      expiry: commitment.expiry.toString(),
      nonce: commitment.nonce.toString(),
    }));

    return NextResponse.json({
      success: true,
      commitments: serializedCommitments,
      count: serializedCommitments.length,
      x402Enabled: isX402Required(),
      message: 'Reading commitments is free - payment only required for creation'
    });
  } catch (error) {
    console.error('Error fetching commitments (x402):', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}