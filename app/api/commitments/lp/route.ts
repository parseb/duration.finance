// POST /api/commitments/lp - Create LP Commitment (x402 Protected)
// Requires 1 USDC payment to post LP offer to database

import { NextRequest, NextResponse } from 'next/server';
import { Address, isAddress } from 'viem';
import { x402PaymentSystem } from '../../../../lib/x402/payment-middleware';
import { LPCommitmentStruct } from '../../../../lib/api/duration-options';

// Mock database - replace with real database
const lpCommitments = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    // Apply x402 payment middleware
    const paymentResponse = await x402PaymentSystem.middleware(request);
    if (paymentResponse) {
      return paymentResponse; // Return 402 or 429 response
    }

    // Parse request body
    const body = await request.json();
    const commitment: LPCommitmentStruct = body;

    // Validate commitment structure
    const validation = validateLPCommitment(commitment);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid commitment', details: validation.errors },
        { status: 400 }
      );
    }

    // Generate commitment ID
    const commitmentId = generateCommitmentId(commitment);

    // Store commitment in database
    const storedCommitment = {
      id: commitmentId,
      ...commitment,
      createdAt: new Date().toISOString(),
      status: 'active',
      takenAt: null,
    };

    lpCommitments.set(commitmentId, storedCommitment);

    // Return success response
    return NextResponse.json(
      {
        id: commitmentId,
        message: 'LP commitment created successfully',
        commitment: storedCommitment,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Failed to create LP commitment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get('asset') as Address;
    const minDuration = parseInt(searchParams.get('minDuration') || '0');
    const maxDuration = parseInt(searchParams.get('maxDuration') || '365');
    const minYield = parseFloat(searchParams.get('minYield') || '0');
    const maxYield = parseFloat(searchParams.get('maxYield') || '100');
    const sortBy = searchParams.get('sortBy') || 'dailyPremium';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Filter commitments
    let filteredCommitments = Array.from(lpCommitments.values()).filter(commitment => {
      if (asset && commitment.asset.toLowerCase() !== asset.toLowerCase()) return false;
      if (commitment.maxDurationDays < minDuration) return false;
      if (commitment.minLockDays > maxDuration) return false;
      // Add yield filtering logic here
      return commitment.status === 'active';
    });

    // Sort commitments
    filteredCommitments.sort((a, b) => {
      switch (sortBy) {
        case 'dailyPremium':
          return parseFloat(a.dailyPremiumUsdc) - parseFloat(b.dailyPremiumUsdc);
        case 'amount':
          return parseFloat(a.amount) - parseFloat(b.amount);
        case 'yield':
          // Calculate yield and sort
          return 0; // Implement yield calculation
        default:
          return 0;
      }
    });

    // Apply pagination
    const paginatedCommitments = filteredCommitments.slice(offset, offset + limit);

    return NextResponse.json({
      commitments: paginatedCommitments,
      total: filteredCommitments.length,
      hasMore: offset + limit < filteredCommitments.length,
      filters: {
        asset,
        minDuration,
        maxDuration,
        minYield,
        maxYield,
        sortBy,
        limit,
        offset,
      },
    });

  } catch (error) {
    console.error('Failed to fetch LP commitments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function validateLPCommitment(commitment: LPCommitmentStruct): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate addresses
  if (!isAddress(commitment.lp)) {
    errors.push('Invalid LP address');
  }

  if (!isAddress(commitment.asset)) {
    errors.push('Invalid asset address');
  }

  // Validate amounts
  const amount = parseFloat(commitment.amount);
  if (isNaN(amount) || amount <= 0) {
    errors.push('Invalid amount');
  }

  const dailyPremium = parseFloat(commitment.dailyPremiumUsdc);
  if (isNaN(dailyPremium) || dailyPremium < 0.01) {
    errors.push('Daily premium must be at least $0.01');
  }

  // Validate durations
  if (commitment.minLockDays < 1 || commitment.minLockDays > 365) {
    errors.push('Min lock days must be between 1 and 365');
  }

  if (commitment.maxDurationDays < commitment.minLockDays || commitment.maxDurationDays > 365) {
    errors.push('Max duration days invalid');
  }

  // Validate option type
  if (commitment.optionType !== 0 && commitment.optionType !== 1) {
    errors.push('Invalid option type');
  }

  // Validate expiry
  const expiry = parseInt(commitment.expiry);
  if (isNaN(expiry) || expiry <= Date.now() / 1000) {
    errors.push('Expiry must be in the future');
  }

  // Validate signature
  if (!commitment.signature || commitment.signature.length < 10) {
    errors.push('Invalid signature');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function generateCommitmentId(commitment: LPCommitmentStruct): string {
  // Generate deterministic ID based on commitment data
  const hash = require('crypto').createHash('sha256');
  hash.update(JSON.stringify({
    lp: commitment.lp,
    asset: commitment.asset,
    amount: commitment.amount,
    nonce: commitment.nonce,
  }));
  return hash.digest('hex').substring(0, 16);
}