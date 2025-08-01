import { NextRequest, NextResponse } from 'next/server';
import { createCommitmentStorage } from '@/lib/database/commitment-storage';
import { createPostgreSQLStorage } from '@/lib/database/postgresql-storage';
import { createCommitmentValidator } from '@/lib/database/commitment-validation';

// Initialize storage and validator
const storage = process.env.DATABASE_URL 
  ? createPostgreSQLStorage(process.env.DATABASE_URL)
  : createCommitmentStorage('memory');
const validator = createCommitmentValidator(
  process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS as `0x${string}` || '0x0'
);

/**
 * POST /api/commitments/cleanup - Clean up invalid commitments
 * This endpoint should be called periodically (e.g., by a cron job)
 */
export async function POST(request: NextRequest) {
  try {
    // Optional authentication check for admin endpoints
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY;
    
    if (adminKey && authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    // Perform cleanup
    const result = await storage.cleanup(validator);

    return NextResponse.json({
      success: true,
      removed: result.removed,
      reasons: result.reasons,
      message: `Cleaned up ${result.removed} invalid commitments`,
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
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
 * GET /api/commitments/cleanup - Get cleanup status/stats
 */
export async function GET(request: NextRequest) {
  try {
    // Get all active commitments
    const activeCommitments = await storage.getAllActive();
    
    // Check how many would be cleaned up
    let wouldCleanup = 0;
    const reasons: string[] = [];
    
    for (const commitment of activeCommitments) {
      const validation = await validator.validateCommitment(commitment);
      if (validation.shouldCleanup) {
        wouldCleanup++;
        if (validation.reason) {
          reasons.push(validation.reason);
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalActive: activeCommitments.length,
      wouldCleanup,
      cleanupReasons: reasons,
      needsCleanup: wouldCleanup > 0,
    });
  } catch (error) {
    console.error('Error checking cleanup status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}