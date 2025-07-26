import { NextRequest, NextResponse } from 'next/server';

interface ActiveOption {
  id: number;
  commitment_hash: string;
  commitment_id: string;
  taker_address: string;
  lp_address: string;
  asset_address: string;
  amount: number;
  target_price: number;
  premium_paid: number;
  expiry_timestamp: number;
  option_type: 'CALL' | 'PUT';
  exercise_status: 'active' | 'exercised' | 'expired';
  created_at: string;
}

interface TakeCommitmentRequest {
  commitmentHash: string;
  takerAddress: string; // Address taking the commitment
  optionType: 0 | 1; // 0=CALL, 1=PUT (only used if LP didn't specify)
  txHash?: string;
}

interface ExerciseOptionRequest {
  optionId: number;
  settlementMethod: 'LIMIT_ORDER' | 'UNOSWAP' | 'GENERIC_ROUTER';
  minReturn: number;
  routingData: string;
  txHash?: string;
}

// GET /api/options - Fetch user's active options
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');
    const status = searchParams.get('status') || 'active';

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing user address' },
        { status: 400 }
      );
    }

    // Mock active options data
    const mockOptions: ActiveOption[] = [
      {
        id: 1,
        commitment_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        commitment_id: 'commitment_1',
        taker_address: userAddress,
        lp_address: '0x1234567890123456789012345678901234567890',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 1.0,
        target_price: 4000,
        premium_paid: 0.2,
        expiry_timestamp: Date.now() + 86400000, // 1 day from now
        option_type: 'CALL',
        exercise_status: 'active',
        created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      },
      {
        id: 2,
        commitment_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        commitment_id: 'commitment_2',
        taker_address: userAddress,
        lp_address: '0x2345678901234567890123456789012345678901',
        asset_address: '0x4200000000000000000000000000000000000006', // WETH
        amount: 0.5,
        target_price: 3800,
        premium_paid: 0.1,
        expiry_timestamp: Date.now() + 43200000, // 12 hours from now
        option_type: 'PUT',
        exercise_status: 'active',
        created_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      },
    ];

    // Filter by status
    const filteredOptions = mockOptions.filter(option => {
      if (status === 'active') {
        return option.exercise_status === 'active' && option.expiry_timestamp > Date.now();
      }
      return option.exercise_status === status;
    });

    // Add calculated fields
    const enrichedOptions = filteredOptions.map(option => {
      const currentPrice = 3500; // Mock current price
      const timeToExpiry = Math.max(0, option.expiry_timestamp - Date.now());
      const isExercisable = timeToExpiry > 0 && (
        (option.option_type === 'CALL' && currentPrice > option.target_price) ||
        (option.option_type === 'PUT' && currentPrice < option.target_price)
      );
      
      let unrealizedPnL = 0;
      if (isExercisable) {
        if (option.option_type === 'CALL') {
          unrealizedPnL = (currentPrice - option.target_price) * option.amount - option.premium_paid;
        } else {
          unrealizedPnL = (option.target_price - currentPrice) * option.amount - option.premium_paid;
        }
      } else {
        unrealizedPnL = -option.premium_paid; // Loss of premium if not exercisable
      }

      return {
        ...option,
        currentPrice,
        timeToExpiry: Math.floor(timeToExpiry / 1000), // Convert to seconds
        isExercisable,
        unrealizedPnL,
        breakEvenPrice: option.option_type === 'CALL' 
          ? option.target_price + option.premium_paid / option.amount
          : option.target_price - option.premium_paid / option.amount,
      };
    });

    return NextResponse.json({
      success: true,
      options: enrichedOptions,
    });
  } catch (error) {
    console.error('Error fetching options:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/options - Take a commitment (called after on-chain transaction)
export async function POST(request: NextRequest) {
  try {
    const body: TakeCommitmentRequest = await request.json();

    // Validate request
    if (!body.commitmentHash || !body.takerAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (body.optionType !== 0 && body.optionType !== 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid option type' },
        { status: 400 }
      );
    }

    // TODO: Verify on-chain transaction if txHash provided
    // if (body.txHash) {
    //   const receipt = await verifyTransaction(body.txHash);
    //   if (!receipt || !receipt.logs.some(log => log.topics[0] === OPTION_TAKEN_EVENT)) {
    //     return NextResponse.json(
    //       { success: false, error: 'Invalid transaction' },
    //       { status: 400 }
    //     );
    //   }
    // }

    // Generate option ID
    const optionId = Math.floor(Math.random() * 1000000);

    // Create active option record
    // Note: In real implementation, this data should come from the commitment lookup
    const newOption: ActiveOption = {
      id: optionId,
      commitment_hash: body.commitmentHash,
      commitment_id: `commitment_${Date.now()}`, // Should come from commitment lookup
      taker_address: body.takerAddress,
      lp_address: '0x1234567890123456789012345678901234567890', // Should come from commitment
      asset_address: '0x4200000000000000000000000000000000000006', // WETH
      amount: 1.0, // Should come from commitment
      target_price: 3500, // Should be current price for taker commitments, target price for LP commitments
      premium_paid: 300, // Should come from commitment (taker's premium or calculated premium)
      expiry_timestamp: Date.now() + 86400000, // Should come from commitment duration
      option_type: body.optionType === 0 ? 'CALL' : 'PUT',
      exercise_status: 'active',
      created_at: new Date().toISOString(),
    };

    // TODO: Store in database
    // await supabase.from('active_options').insert([newOption]);

    console.log('Created option:', newOption);

    return NextResponse.json({
      success: true,
      option: newOption,
      optionId,
    });
  } catch (error) {
    console.error('Error taking option:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/options/[id] - Exercise an option
export async function PUT(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const optionId = url.pathname.split('/').pop();
    const body: ExerciseOptionRequest = await request.json();

    if (!optionId) {
      return NextResponse.json(
        { success: false, error: 'Missing option ID' },
        { status: 400 }
      );
    }

    // Validate request
    if (!body.settlementMethod || !body.minReturn) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // TODO: Verify option exists and is exercisable
    // TODO: Verify on-chain exercise transaction if txHash provided
    // TODO: Update option status to 'exercised'

    console.log('Exercised option:', optionId, body);

    return NextResponse.json({
      success: true,
      message: 'Option exercised successfully',
      optionId: parseInt(optionId),
      profit: 0.5, // Mock profit calculation
      protocolFee: 0.005, // Mock protocol fee
    });
  } catch (error) {
    console.error('Error exercising option:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/options/[id] - Get specific option details
export async function getOption(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const optionId = parseInt(params.id);

    if (isNaN(optionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid option ID' },
        { status: 400 }
      );
    }

    // TODO: Fetch from database
    // const option = await supabase.from('active_options').select('*').eq('id', optionId).single();

    // Mock option data
    const mockOption: ActiveOption = {
      id: optionId,
      commitment_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      commitment_id: 'commitment_1',
      taker_address: '0x1234567890123456789012345678901234567890',
      lp_address: '0x2345678901234567890123456789012345678901',
      asset_address: '0x4200000000000000000000000000000000000006',
      amount: 1.0,
      target_price: 4000,
      premium_paid: 0.2,
      expiry_timestamp: Date.now() + 86400000,
      option_type: 'CALL',
      exercise_status: 'active',
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      option: mockOption,
    });
  } catch (error) {
    console.error('Error fetching option:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}