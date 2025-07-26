import { NextRequest, NextResponse } from 'next/server';
import { getSwapQuote, toMinimalUnits } from '@/lib/1inch-api';
import { isAddress } from 'viem';

/**
 * @title 1inch Quote API Route
 * @notice Provides cached 1inch quotes for the frontend
 */

interface QuoteRequest {
  srcToken: string;
  dstToken: string;
  amount: string;
  srcDecimals?: number;
  chainId?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const srcToken = searchParams.get('srcToken');
    const dstToken = searchParams.get('dstToken');
    const amount = searchParams.get('amount');
    const srcDecimals = parseInt(searchParams.get('srcDecimals') || '18');
    const chainId = parseInt(searchParams.get('chainId') || '8453'); // Default to Base

    // Validate required parameters
    if (!srcToken || !dstToken || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: srcToken, dstToken, amount' },
        { status: 400 }
      );
    }

    // Validate token addresses
    if (!isAddress(srcToken) || !isAddress(dstToken)) {
      return NextResponse.json(
        { error: 'Invalid token addresses' },
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

    // Convert amount to minimal units
    const minimalAmount = toMinimalUnits(amount, srcDecimals);

    // Get quote from 1inch API (with caching)
    const quote = await getSwapQuote(srcToken, dstToken, minimalAmount, chainId);

    // Return formatted response
    return NextResponse.json({
      success: true,
      data: {
        srcToken,
        dstToken,
        srcAmount: quote.srcAmount,
        dstAmount: quote.dstAmount,
        gas: quote.gas,
        gasPrice: quote.gasPrice,
        estimatedGas: quote.estimatedGas,
        protocols: quote.protocols,
      },
      metadata: {
        chainId,
        timestamp: Date.now(),
        cached: true, // Assume cached due to our 5s TTL
      },
    });

  } catch (error) {
    console.error('Quote API error:', error);
    
    // Return specific error messages for known issues
    if (error instanceof Error) {
      if (error.message.includes('1inch API error')) {
        return NextResponse.json(
          { error: 'Unable to get quote from 1inch', details: error.message },
          { status: 502 }
        );
      }
      
      if (error.message.includes('ONEINCH_API_KEY')) {
        return NextResponse.json(
          { error: 'API configuration error' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: QuoteRequest = await request.json();
    
    const { srcToken, dstToken, amount, srcDecimals = 18, chainId = 8453 } = body;

    // Validate required parameters
    if (!srcToken || !dstToken || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: srcToken, dstToken, amount' },
        { status: 400 }
      );
    }

    // Validate token addresses
    if (!isAddress(srcToken) || !isAddress(dstToken)) {
      return NextResponse.json(
        { error: 'Invalid token addresses' },
        { status: 400 }
      );
    }

    // Convert amount to minimal units
    const minimalAmount = toMinimalUnits(amount, srcDecimals);

    // Get quote from 1inch API (with caching)
    const quote = await getSwapQuote(srcToken, dstToken, minimalAmount, chainId);

    return NextResponse.json({
      success: true,
      data: {
        srcToken,
        dstToken,
        srcAmount: quote.srcAmount,
        dstAmount: quote.dstAmount,
        gas: quote.gas,
        gasPrice: quote.gasPrice,
        estimatedGas: quote.estimatedGas,
        protocols: quote.protocols,
      },
      metadata: {
        chainId,
        timestamp: Date.now(),
        cached: true,
      },
    });

  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}