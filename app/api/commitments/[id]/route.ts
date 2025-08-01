import { NextRequest, NextResponse } from 'next/server';
import { createCommitmentStorage } from '@/lib/database/commitment-storage';
import { createPostgreSQLStorage } from '@/lib/database/postgresql-storage';

// API Protection - Frontend Only Access
function isInternalRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const apiTools = ['curl', 'wget', 'postman', 'insomnia', 'httpie', 'python-requests', 'axios', 'node-fetch'];
  const lowerAgent = userAgent.toLowerCase();
  return !apiTools.some(tool => lowerAgent.includes(tool));
}

function createSecurityResponse(): NextResponse {
  return NextResponse.json({
    error: 'Access Denied',
    message: 'Frontend access only',
    code: 'SECURITY_VIOLATION',
  }, { status: 403 });
}

// Initialize storage
const storage = process.env.DATABASE_URL 
  ? createPostgreSQLStorage(process.env.DATABASE_URL)
  : createCommitmentStorage('memory');

/**
 * GET /api/commitments/[id] - Get specific commitment by ID (FRONTEND ONLY)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Security check
  if (!isInternalRequest(request)) {
    return createSecurityResponse();
  }
  
  try {
    const { id } = params;

    const commitment = await storage.get(id);

    if (!commitment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Commitment not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      commitment,
    });
  } catch (error) {
    console.error('Error fetching commitment:', error);
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
 * DELETE /api/commitments/[id] - Cancel/recall specific commitment (FRONTEND ONLY)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Security check
  if (!isInternalRequest(request)) {
    return createSecurityResponse();
  }
  
  try {
    const { id } = params;

    // Get the commitment to verify it exists
    const commitment = await storage.get(id);
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
    // Extract LP address from request headers or JWT token
    // const userAddress = getUserAddressFromRequest(request);
    // if (commitment.lp.toLowerCase() !== userAddress.toLowerCase()) {
    //   return NextResponse.json({
    //     success: false,
    //     error: 'Unauthorized - can only cancel your own commitments',
    //   }, { status: 403 });
    // }

    // Remove the commitment
    const removed = await storage.remove(id);

    if (removed) {
      return NextResponse.json({
        success: true,
        message: 'Commitment cancelled successfully',
        commitmentId: id,
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