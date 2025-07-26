import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (for now using mock, would use actual DB in production)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

interface LPCommitment {
  id: string;
  lp_address: string;
  asset_address: string;
  amount: number;
  target_price: number;
  max_duration: number;
  fractionable: boolean;
  signature: string;
  created_at: string;
  taken_at?: string;
  nonce: number;
  expiry: number;
}

interface CreateCommitmentRequest {
  lpAddress: string;
  assetAddress: string;
  amount: number;
  targetPrice: number;
  maxDuration: number;
  fractionable: boolean;
  signature: string;
  nonce: number;
  expiry: number;
}

// GET /api/commitments - Fetch available commitments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get('asset');
    const minAmount = searchParams.get('minAmount');
    const maxAmount = searchParams.get('maxAmount');
    const minDuration = searchParams.get('minDuration');
    const maxDuration = searchParams.get('maxDuration');

    // Mock data for development
    const mockCommitments: LPCommitment[] = [
      {
        id: '1',
        lp_address: '0x1234567890123456789012345678901234567890',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 1.5,
        target_price: 4200,
        max_duration: 86400 * 2, // 2 days
        fractionable: true,
        signature: '0xsignature1',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 3600000, // 1 hour from now
      },
      {
        id: '2',
        lp_address: '0x2345678901234567890123456789012345678901',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 0.8,
        target_price: 3800,
        max_duration: 86400, // 1 day
        fractionable: false,
        signature: '0xsignature2',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 7200000, // 2 hours from now
      },
      {
        id: '3',
        lp_address: '0x3456789012345678901234567890123456789012',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 2.0,
        target_price: 4500,
        max_duration: 86400 * 7, // 7 days
        fractionable: true,
        signature: '0xsignature3',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 1800000, // 30 minutes from now
      },
    ];

    // Filter commitments based on query parameters
    let filteredCommitments = mockCommitments.filter(c => c.expiry > Date.now());

    if (asset) {
      filteredCommitments = filteredCommitments.filter(c => 
        c.asset_address.toLowerCase() === asset.toLowerCase()
      );
    }

    if (minAmount) {
      filteredCommitments = filteredCommitments.filter(c => c.amount >= parseFloat(minAmount));
    }

    if (maxAmount) {
      filteredCommitments = filteredCommitments.filter(c => c.amount <= parseFloat(maxAmount));
    }

    if (minDuration) {
      filteredCommitments = filteredCommitments.filter(c => c.max_duration >= parseInt(minDuration));
    }

    if (maxDuration) {
      filteredCommitments = filteredCommitments.filter(c => c.max_duration <= parseInt(maxDuration));
    }

    return NextResponse.json({
      success: true,
      commitments: filteredCommitments.map(c => ({
        ...c,
        currentPrice: 3500, // Mock current ETH price
        premium: Math.abs(3500 - c.target_price) * c.amount,
        optionType: 3500 < c.target_price ? 'CALL' : 'PUT',
      })),
    });
  } catch (error) {
    console.error('Error fetching commitments:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/commitments - Create new commitment
export async function POST(request: NextRequest) {
  try {
    const body: CreateCommitmentRequest = await request.json();

    // Validate request
    if (!body.lpAddress || !body.assetAddress || !body.signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (body.amount < 0.1 || body.amount > 1000) {
      return NextResponse.json(
        { success: false, error: 'Amount must be between 0.1 and 1000' },
        { status: 400 }
      );
    }

    if (body.maxDuration < 86400 || body.maxDuration > 86400 * 365) {
      return NextResponse.json(
        { success: false, error: 'Duration must be between 1 day and 1 year' },
        { status: 400 }
      );
    }

    // TODO: Verify signature using contract verification
    // const isValidSignature = await verifyCommitmentSignature(body);
    // if (!isValidSignature) {
    //   return NextResponse.json(
    //     { success: false, error: 'Invalid signature' },
    //     { status: 400 }
    //   );
    // }

    // Generate commitment ID
    const commitmentId = `commitment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store in database (mock for now)
    const newCommitment: LPCommitment = {
      id: commitmentId,
      lp_address: body.lpAddress,
      asset_address: body.assetAddress,
      amount: body.amount,
      target_price: body.targetPrice,
      max_duration: body.maxDuration,
      fractionable: body.fractionable,
      signature: body.signature,
      created_at: new Date().toISOString(),
      nonce: body.nonce,
      expiry: body.expiry,
    };

    // TODO: Store in actual database
    // await supabase.from('lp_commitments').insert([newCommitment]);

    console.log('Created commitment:', newCommitment);

    return NextResponse.json({
      success: true,
      commitment: newCommitment,
      commitmentHash: `0x${Buffer.from(JSON.stringify(newCommitment)).toString('hex').slice(0, 64)}`,
    });
  } catch (error) {
    console.error('Error creating commitment:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/commitments/[id] - Cancel commitment
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const commitmentId = url.pathname.split('/').pop();

    if (!commitmentId) {
      return NextResponse.json(
        { success: false, error: 'Missing commitment ID' },
        { status: 400 }
      );
    }

    // TODO: Verify that the caller is the LP who created the commitment
    // TODO: Check that commitment hasn't been taken yet
    // TODO: Remove from database

    console.log('Cancelled commitment:', commitmentId);

    return NextResponse.json({
      success: true,
      message: 'Commitment cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling commitment:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}