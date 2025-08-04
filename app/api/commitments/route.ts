import { NextRequest, NextResponse } from 'next/server';
import { SignedLPCommitment, SignedOptionCommitment, CommitmentType } from '@/lib/eip712/verification';
import { createCommitmentStorage } from '@/lib/database/commitment-storage';
import { createPostgreSQLStorage } from '@/lib/database/postgresql-storage';
import { createCommitmentValidator } from '@/lib/database/commitment-validation';
import { verifyCommitment } from '@/lib/eip712/lp-commitment';

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
    const excludeCreator = searchParams.get('excludeCreator');
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

    // Filter out commitments from excluded creator (for Take tab)
    if (excludeCreator) {
      commitments = commitments.filter(commitment => 
        commitment.lp_address?.toLowerCase() !== excludeCreator.toLowerCase()
      );
    }

    // Filter by commitment type if specified
    if (commitmentType === 'offer') {
      // For LP offers, we want all commitments since they are offers by LPs
      // No additional filtering needed as all stored commitments are LP offers
    } else if (commitmentType === 'demand') {
      // Filter for taker demands (not currently stored in this table)
      commitments = [];
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

    // Validate required fields for new commitment structure
    const requiredFields = ['creator', 'asset', 'amount', 'dailyPremiumUsdc', 'minLockDays', 'maxDurationDays', 'optionType', 'commitmentType', 'expiry', 'nonce', 'signature'];
    const missingFields = requiredFields.filter(field => !(field in commitmentData));
    
    if (missingFields.length > 0) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        missingFields 
      }, { status: 400 });
    }

    // Create commitment object for validation
    const commitment = {
      creator: commitmentData.creator,
      asset: commitmentData.asset,
      amount: commitmentData.amount,
      dailyPremiumUsdc: commitmentData.dailyPremiumUsdc,
      minLockDays: parseInt(commitmentData.minLockDays),
      maxDurationDays: parseInt(commitmentData.maxDurationDays),
      optionType: commitmentData.optionType,
      commitmentType: commitmentData.commitmentType,
      expiry: commitmentData.expiry,
      nonce: commitmentData.nonce,
      signature: commitmentData.signature,
    };

    // Validate EIP-712 signature before saving
    console.log('Validating signature for commitment from:', commitment.creator);
    const contractAddress = process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA as `0x${string}`;
    
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ 
        error: 'Contract not configured', 
        message: 'Duration Options contract address not set' 
      }, { status: 500 });
    }

    try {
      const isValidSignature = await verifyCommitment(commitment, contractAddress, 84532);
      
      if (!isValidSignature) {
        console.log('Invalid signature for commitment:', {
          creator: commitment.creator,
          nonce: commitment.nonce,
          signature: commitment.signature
        });
        return NextResponse.json({ 
          error: 'Invalid signature', 
          message: 'EIP-712 signature verification failed' 
        }, { status: 400 });
      }
      
      console.log('Signature validated successfully for:', commitment.creator);
    } catch (signatureError) {
      console.error('Signature validation error:', signatureError);
      return NextResponse.json({ 
        error: 'Signature validation failed', 
        message: signatureError instanceof Error ? signatureError.message : 'Unknown error' 
      }, { status: 400 });
    }

    // Convert to legacy format for storage compatibility
    const legacyCommitment: SignedLPCommitment = {
      lp: commitment.creator,
      asset: commitment.asset,
      amount: BigInt(commitment.amount),
      dailyPremiumUsdc: BigInt(commitment.dailyPremiumUsdc),
      minLockDays: BigInt(commitment.minLockDays),
      maxDurationDays: BigInt(commitment.maxDurationDays),
      optionType: commitment.optionType,
      expiry: BigInt(commitment.expiry),
      nonce: BigInt(commitment.nonce),
      signature: commitment.signature,
    };

    const commitmentId = await storage.store(legacyCommitment);

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