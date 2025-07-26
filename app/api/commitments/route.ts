import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (for now using mock, would use actual DB in production)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

interface Commitment {
  id: string;
  lp_address?: string; // For LP commitments
  taker_address?: string; // For taker commitments
  asset_address: string;
  amount: number;
  target_price: number; // 0 for taker commitments
  premium: number; // 0 for LP commitments, USDC amount for taker commitments
  duration_days: number;
  option_type: number; // 0=CALL, 1=PUT
  signature: string;
  created_at: string;
  taken_at?: string;
  nonce: number;
  expiry: number;
}

interface CreateCommitmentRequest {
  lpAddress?: string; // For LP commitments
  takerAddress?: string; // For taker commitments
  assetAddress: string;
  amount: number;
  targetPrice?: number; // Required for LP, not used for taker
  premium?: number; // Required for taker, not used for LP
  durationDays: number;
  optionType: number; // 0=CALL, 1=PUT
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

    // Mock data for development (mix of LP and Taker commitments)
    const mockCommitments: Commitment[] = [
      // LP Commitment
      {
        id: '1',
        lp_address: '0x1234567890123456789012345678901234567890',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 1.5,
        target_price: 4200,
        premium: 0, // LP doesn't set premium
        duration_days: 2,
        option_type: 0, // CALL
        signature: '0xsignature1',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 3600000, // 1 hour from now
      },
      // Taker Commitment
      {
        id: '2',
        taker_address: '0x2345678901234567890123456789012345678901',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 0.8,
        target_price: 0, // Taker doesn't set target price
        premium: 150, // Taker willing to pay 150 USDC premium
        duration_days: 1,
        option_type: 1, // PUT
        signature: '0xsignature2',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 7200000, // 2 hours from now
      },
      // LP Commitment
      {
        id: '3',
        lp_address: '0x3456789012345678901234567890123456789012',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 2.0,
        target_price: 4500,
        premium: 0,
        duration_days: 7,
        option_type: 0, // CALL
        signature: '0xsignature3',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 1800000, // 30 minutes from now
      },
      // Taker Commitment
      {
        id: '4',
        taker_address: '0x4567890123456789012345678901234567890123',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 1.0,
        target_price: 0,
        premium: 300, // Taker willing to pay 300 USDC premium
        duration_days: 3,
        option_type: 0, // CALL
        signature: '0xsignature4',
        created_at: new Date().toISOString(),
        nonce: 1,
        expiry: Date.now() + 5400000, // 1.5 hours from now
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
      filteredCommitments = filteredCommitments.filter(c => c.duration_days >= parseInt(minDuration));
    }

    if (maxDuration) {
      filteredCommitments = filteredCommitments.filter(c => c.duration_days <= parseInt(maxDuration));
    }

    // Fetch current prices for premium calculations
    let currentPrices: Record<string, number> = {};
    try {
      const priceResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/price`);
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        if (priceData.success && priceData.prices) {
          Object.entries(priceData.prices).forEach(([asset, data]: [string, any]) => {
            currentPrices[asset] = data.price;
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch current prices, using fallbacks:', err);
    }

    // Fallback prices if API call fails
    const fallbackPrices: Record<string, number> = {
      '0x4200000000000000000000000000000000000006': 3500, // WETH
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 1,    // USDC
    };

    return NextResponse.json({
      success: true,
      commitments: filteredCommitments.map(c => {
        const currentPrice = currentPrices[c.asset_address] || fallbackPrices[c.asset_address] || 3500;
        const isLpCommitment = c.lp_address !== undefined;
        
        return {
          ...c,
          type: isLpCommitment ? 'LP' : 'TAKER',
          currentPrice,
          calculatedPremium: isLpCommitment 
            ? Math.abs(currentPrice - c.target_price) * c.amount
            : c.premium,
          optionType: c.option_type === 0 ? 'CALL' : 'PUT',
          creator: isLpCommitment ? c.lp_address : c.taker_address,
        };
      }),
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

    // Determine if this is LP or Taker commitment
    const isLpCommitment = body.lpAddress !== undefined;
    const isTakerCommitment = body.takerAddress !== undefined;
    
    // Must be either LP or Taker, but not both
    if (!(isLpCommitment !== isTakerCommitment)) {
      return NextResponse.json(
        { success: false, error: 'Must specify either lpAddress or takerAddress, but not both' },
        { status: 400 }
      );
    }

    // Common validations
    if (!body.assetAddress || !body.signature) {
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

    if (body.durationDays < 1 || body.durationDays > 365) {
      return NextResponse.json(
        { success: false, error: 'Duration must be between 1 and 365 days' },
        { status: 400 }
      );
    }

    // LP-specific validations
    if (isLpCommitment) {
      if (!body.targetPrice || body.targetPrice <= 0) {
        return NextResponse.json(
          { success: false, error: 'LP must specify target price' },
          { status: 400 }
        );
      }
    }

    // Taker-specific validations
    if (isTakerCommitment) {
      if (!body.premium || body.premium <= 0) {
        return NextResponse.json(
          { success: false, error: 'Taker must specify premium' },
          { status: 400 }
        );
      }
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
    const newCommitment: Commitment = {
      id: commitmentId,
      lp_address: body.lpAddress,
      taker_address: body.takerAddress,
      asset_address: body.assetAddress,
      amount: body.amount,
      target_price: body.targetPrice || 0,
      premium: body.premium || 0,
      duration_days: body.durationDays,
      option_type: body.optionType,
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