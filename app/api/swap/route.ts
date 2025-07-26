import { NextRequest, NextResponse } from 'next/server';
import { getSwapTransaction, toMinimalUnits } from '@/lib/1inch-api';
import { isAddress } from 'viem';

/**
 * @title 1inch Swap API Route
 * @notice Provides 1inch swap transaction data for execution
 */

interface SwapRequest {
  srcToken: string;
  dstToken: string;
  amount: string;
  fromAddress: string;
  slippage?: number;
  srcDecimals?: number;
  chainId?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SwapRequest = await request.json();
    
    const { 
      srcToken, 
      dstToken, 
      amount, 
      fromAddress,
      slippage = 1,
      srcDecimals = 18,
      chainId = 8453 
    } = body;

    // Validate required parameters
    if (!srcToken || !dstToken || !amount || !fromAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: srcToken, dstToken, amount, fromAddress' },
        { status: 400 }
      );
    }

    // Validate addresses
    if (!isAddress(srcToken) || !isAddress(dstToken) || !isAddress(fromAddress)) {
      return NextResponse.json(
        { error: 'Invalid addresses' },
        { status: 400 }
      );
    }

    // Validate amount
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Validate slippage
    if (slippage < 0.1 || slippage > 50) {
      return NextResponse.json(
        { error: 'Slippage must be between 0.1% and 50%' },
        { status: 400 }
      );
    }

    // Convert amount to minimal units
    const minimalAmount = toMinimalUnits(amount, srcDecimals);

    // Get swap transaction from 1inch API
    const swapData = await getSwapTransaction(
      srcToken, 
      dstToken, 
      minimalAmount, 
      fromAddress, 
      slippage, 
      chainId
    );

    // Return formatted response
    return NextResponse.json({
      success: true,
      data: {
        srcToken,
        dstToken,
        srcAmount: swapData.srcAmount,
        dstAmount: swapData.dstAmount,
        tx: {
          from: swapData.tx.from,
          to: swapData.tx.to,
          data: swapData.tx.data,
          value: swapData.tx.value,
          gas: swapData.tx.gas,
          gasPrice: swapData.tx.gasPrice,
        },
      },
      metadata: {
        chainId,
        timestamp: Date.now(),
        slippage,
      },
    });

  } catch (error) {
    console.error('Swap API error:', error);
    
    // Return specific error messages for known issues
    if (error instanceof Error) {
      if (error.message.includes('1inch API error')) {
        return NextResponse.json(
          { error: 'Unable to get swap data from 1inch', details: error.message },
          { status: 502 }
        );
      }
      
      if (error.message.includes('ONEINCH_API_KEY')) {
        return NextResponse.json(
          { error: 'API configuration error' },
          { status: 500 }
        );
      }

      if (error.message.includes('insufficient liquidity')) {
        return NextResponse.json(
          { error: 'Insufficient liquidity for this trade' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET method not supported for swap (each swap is unique)
export async function GET() {
  return NextResponse.json(
    { error: 'GET method not supported. Use POST to get swap transaction data.' },
    { status: 405 }
  );
}