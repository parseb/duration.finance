import { NextRequest, NextResponse } from 'next/server';
import { SignedLPCommitment, SignedOptionCommitment, CommitmentType } from '@/lib/eip712/verification';
import { createCommitmentStorage } from '@/lib/database/commitment-storage';
import { createPostgreSQLStorage } from '@/lib/database/postgresql-storage';
import { createCommitmentValidator } from '@/lib/database/commitment-validation';

// API Protection - Frontend Only Access
function isInternalRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const origin = request.headers.get('origin');
  
  // Block common API tools
  const apiTools = ['curl', 'wget', 'postman', 'insomnia', 'httpie', 'python-requests', 'axios', 'node-fetch'];
  const lowerAgent = userAgent.toLowerCase();
  const isApiTool = apiTools.some(tool => lowerAgent.includes(tool));
  
  if (isApiTool) {
    return false;
  }
  
  // Allow browser requests
  return true;
}

function createSecurityResponse(): NextResponse {
  return NextResponse.json({
    error: 'Access Denied',
    message: 'Automated tool detected. Use /api/x402/commitments for programmatic access',
    code: 'SECURITY_VIOLATION',
    alternativeEndpoint: '/api/x402/commitments',
    paymentRequired: 'Use /api/x402/commitments for external API access',
  }, { status: 403 });
}

// Initialize storage and validator
const storage = process.env.DATABASE_URL 
  ? createPostgreSQLStorage(process.env.DATABASE_URL)
  : createCommitmentStorage('memory');
const validator = createCommitmentValidator(
  process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS as `0x${string}` || '0x0'
);

/**
 * GET /api/commitments - Get all active commitments or commitments by LP
 * SECURITY: Frontend only access - blocks API tools
 * External API users should use /api/x402/commitments
 */
export async function GET(request: NextRequest) {
  // Security check
  if (!isInternalRequest(request)) {
    return createSecurityResponse();
  }
  
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
    const serializedCommitments = commitments.map((commitment: any) => ({
      ...commitment,
      id: commitment.id, // Include database ID for frontend operations
      amount: commitment.amount.toString(),
      dailyPremiumUsdc: commitment.dailyPremiumUsdc.toString(),
      minLockDays: commitment.minLockDays.toString(),
      maxDurationDays: commitment.maxDurationDays.toString(),
      expiry: commitment.expiry.toString(),
      nonce: commitment.nonce.toString(),
    }));

    return NextResponse.json(
      {
        success: true,
        commitments: serializedCommitments,
        count: serializedCommitments.length,
        internal: true, // Indicate this is internal API access
      },
      {
        headers: {
          'X-Internal-API': 'true',
          'X-External-Alternative': '/api/x402/commitments',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching commitments:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commitments - Create new commitment (FRONTEND ONLY)
 * SECURITY: Frontend only access - blocks API tools
 * External API users must use /api/x402/commitments with payment
 */
export async function POST(request: NextRequest) {
  // Security check
  if (!isInternalRequest(request)) {
    return createSecurityResponse();
  }
  
  try {
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
        isFramentable: commitmentData.isFramentable,
        signature: commitmentData.signature as `0x${string}`,
      };

      // Convert to legacy format for backward compatibility
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
        isFramentable: commitment.isFramentable,
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
        isFramentable: commitmentData.isFramentable,
        signature: commitmentData.signature as `0x${string}`,
      };

      commitmentId = await storage.store(commitment);
    }

    return NextResponse.json(
      {
        success: true,
        commitmentId,
        message: 'Commitment stored successfully (internal access)',
        internal: true,
      },
      {
        headers: {
          'X-Internal-API': 'true',
          'X-External-Alternative': '/api/x402/commitments',
        },
      }
    );
  } catch (error) {
    console.error('Error storing commitment:', error);
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
 * DELETE /api/commitments/[id] - Cancel/recall existing commitment (FRONTEND ONLY)
 */
export async function DELETE(request: NextRequest) {
  // Security check
  if (!isInternalRequest(request)) {
    return createSecurityResponse();
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const commitmentId = searchParams.get('id');

    if (!commitmentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Commitment ID required',
        },
        { status: 400 }
      );
    }

    // Get the commitment to verify ownership
    const commitment = await storage.get(commitmentId);
    if (!commitment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Commitment not found',
        },
        { status: 404 }
      );
    }

    // TODO: Add authentication check to ensure only the LP can cancel their commitment
    // For now, we'll trust the frontend to only show cancel buttons to the right user

    // Remove the commitment
    const removed = await storage.remove(commitmentId);

    if (removed) {
      return NextResponse.json({
        success: true,
        message: 'Commitment cancelled successfully',
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to remove commitment',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error cancelling commitment:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}