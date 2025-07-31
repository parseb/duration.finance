// POST /api/commitments/[id]/take - Take LP Commitment (x402 Protected)
// Requires payment of the calculated premium

import { NextRequest, NextResponse } from 'next/server';
import { Address, parseUnits, formatUnits, parseEther } from 'viem';
import { x402PaymentSystem } from '../../../../../lib/x402/payment-middleware';

// Mock database - replace with real database
const lpCommitments = new Map<string, any>();
const activeOptions = new Map<string, any>();

interface TakeCommitmentRequest {
  durationDays: number;
  takerAddress: Address;
  signature: string;
  settlementParams?: {
    method: number;
    routingData: string;
    minReturn: string;
    deadline: number;
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply x402 payment middleware for premium payment
    const paymentResponse = await x402PaymentSystem.middleware(request);
    if (paymentResponse) {
      return paymentResponse; // Return 402 or 429 response
    }

    const commitmentId = params.id;
    const body: TakeCommitmentRequest = await request.json();

    // Validate request
    const validation = validateTakeRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid take request', details: validation.errors },
        { status: 400 }
      );
    }

    // Get commitment from database
    const commitment = lpCommitments.get(commitmentId);
    if (!commitment) {
      return NextResponse.json(
        { error: 'Commitment not found' },
        { status: 404 }
      );
    }

    if (commitment.status !== 'active') {
      return NextResponse.json(
        { error: 'Commitment no longer active' },
        { status: 400 }
      );
    }

    // Validate duration is within acceptable range
    if (body.durationDays < commitment.minLockDays || body.durationDays > commitment.maxDurationDays) {
      return NextResponse.json(
        { error: `Duration must be between ${commitment.minLockDays} and ${commitment.maxDurationDays} days` },
        { status: 400 }
      );
    }

    // Calculate premium
    const dailyPremium = parseFloat(commitment.dailyPremiumUsdc);
    const totalPremium = dailyPremium * body.durationDays;
    const totalPremiumWei = parseUnits(totalPremium.toString(), 6); // USDC has 6 decimals

    // Get current price (mock - replace with 1inch integration)
    const currentPrice = 3836.50; // Mock WETH price
    const strikePrice = parseEther(currentPrice.toString());

    // Create option
    const optionId = generateOptionId();
    const exerciseDeadline = Date.now() + (body.durationDays * 24 * 60 * 60 * 1000);

    const option = {
      optionId,
      commitmentId,
      takerAddress: body.takerAddress,
      lpAddress: commitment.lp,
      asset: commitment.asset,
      amount: commitment.amount,
      strikePrice: strikePrice.toString(),
      dailyPremiumUsdc: commitment.dailyPremiumUsdc,
      lockDurationDays: body.durationDays,
      totalPremiumPaid: totalPremiumWei.toString(),
      exerciseDeadline: new Date(exerciseDeadline).toISOString(),
      optionType: commitment.optionType === 0 ? 'CALL' : 'PUT',
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    // Store option
    activeOptions.set(optionId.toString(), option);

    // Mark commitment as taken
    commitment.status = 'taken';
    commitment.takenAt = new Date().toISOString();

    // Return success response
    return NextResponse.json(
      {
        optionId,
        message: 'Option created successfully',
        option,
        premium: {
          dailyRate: formatUnits(parseUnits(dailyPremium.toString(), 6), 6),
          totalPremium: formatUnits(totalPremiumWei, 6),
          currency: 'USDC',
        },
        exerciseInfo: {
          deadline: new Date(exerciseDeadline).toISOString(),
          strikePrice: formatUnits(strikePrice, 18),
          currentPrice: currentPrice.toString(),
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Failed to take commitment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const commitmentId = params.id;
    const { searchParams } = new URL(request.url);
    const duration = parseInt(searchParams.get('duration') || '7');

    // Get commitment
    const commitment = lpCommitments.get(commitmentId);
    if (!commitment) {
      return NextResponse.json(
        { error: 'Commitment not found' },
        { status: 404 }
      );
    }

    // Calculate premium for requested duration
    const dailyPremium = parseFloat(commitment.dailyPremiumUsdc);
    const totalPremium = dailyPremium * duration;
    const isValidDuration = duration >= commitment.minLockDays && duration <= commitment.maxDurationDays;

    // Get current price for yield calculation
    const currentPrice = 3836.50; // Mock price
    const collateralValue = parseFloat(commitment.amount) * currentPrice;
    const dailyYield = (dailyPremium / collateralValue) * 100;

    return NextResponse.json({
      commitmentId,
      commitment,
      pricing: {
        duration,
        dailyPremium: dailyPremium.toFixed(2),
        totalPremium: totalPremium.toFixed(2),
        currency: 'USDC',
        isValidDuration,
      },
      yield: {
        dailyYield: dailyYield.toFixed(4),
        annualizedYield: (dailyYield * 365).toFixed(2),
      },
      collateral: {
        amount: commitment.amount,
        asset: commitment.asset,
        valueUsd: collateralValue.toFixed(2),
      },
    });

  } catch (error) {
    console.error('Failed to get commitment pricing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function validateTakeRequest(request: TakeCommitmentRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate duration
  if (!request.durationDays || request.durationDays < 1 || request.durationDays > 365) {
    errors.push('Duration must be between 1 and 365 days');
  }

  // Validate taker address
  if (!request.takerAddress || !request.takerAddress.startsWith('0x') || request.takerAddress.length !== 42) {
    errors.push('Invalid taker address');
  }

  // Validate signature
  if (!request.signature || request.signature.length < 10) {
    errors.push('Invalid signature');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function generateOptionId(): number {
  return Math.floor(Math.random() * 1000000) + 1;
}