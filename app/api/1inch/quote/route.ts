/**
 * @title 1inch Quote API Route
 * @notice Secure server-side 1inch integration
 * @dev Uses environment variables safely without exposing to frontend
 */

import { NextRequest, NextResponse } from 'next/server';
import { ENV, validateEnv } from '../../../../lib/env';
import { oneInchClient, QuoteParams } from '../../../../lib/1inch-client';

interface QuoteRequest {
  fromToken: string;
  toToken: string;
  amount: string;
  slippage?: number;
}

interface QuoteResponse {
  success: boolean;
  quote?: {
    toTokenAmount: string;
    estimatedGas: string;
    priceImpact: number;
    protocols: any[];
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<QuoteResponse>> {
  try {
    // Validate environment on startup
    validateEnv();

    // Check if 1inch API is configured
    if (!ENV.ONEINCH_API_KEY) {
      return NextResponse.json(
        { success: false, error: '1inch API not configured' },
        { status: 503 }
      );
    }

    const body: QuoteRequest = await request.json();

    // Validate request parameters
    if (!body.fromToken || !body.toToken || !body.amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: fromToken, toToken, amount' },
        { status: 400 }
      );
    }

    // Validate token addresses (basic format check)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(body.fromToken) || !addressRegex.test(body.toToken)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token address format' },
        { status: 400 }
      );
    }

    // Prepare quote parameters
    const quoteParams: QuoteParams = {
      fromTokenAddress: body.fromToken,
      toTokenAddress: body.toToken,
      amount: body.amount,
      slippage: body.slippage || 1, // Default 1% slippage
    };

    // Call 1inch API using our secure client
    const quote = await oneInchClient.getQuote(quoteParams);

    // Calculate price impact (simplified)
    const fromAmount = parseFloat(body.amount);
    const toAmount = parseFloat(quote.toTokenAmount);
    const priceImpact = Math.abs((fromAmount - toAmount) / fromAmount) * 100;

    return NextResponse.json({
      success: true,
      quote: {
        toTokenAmount: quote.toTokenAmount,
        estimatedGas: quote.estimatedGas,
        priceImpact,
        protocols: quote.protocols,
      },
    });

  } catch (error) {
    console.error('Error getting 1inch quote:', error);
    
    // Don't expose internal error details to client
    const errorMessage = error instanceof Error 
      ? (error.message.includes('API key') ? '1inch API authentication failed' : 'Failed to get quote')
      : 'Internal server error';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(): Promise<NextResponse<{ success: boolean; status: string }>> {
  try {
    validateEnv();

    if (!ENV.ONEINCH_API_KEY) {
      return NextResponse.json(
        { success: false, status: '1inch API key not configured' },
        { status: 503 }
      );
    }

    const isHealthy = await oneInchClient.healthCheck();
    
    return NextResponse.json({
      success: isHealthy,
      status: isHealthy ? '1inch API is operational' : '1inch API is down',
    });

  } catch (error) {
    console.error('1inch health check failed:', error);
    return NextResponse.json(
      { success: false, status: 'Health check failed' },
      { status: 500 }
    );
  }
}