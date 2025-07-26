import { NextRequest, NextResponse } from 'next/server';

/**
 * Test endpoint to verify 1inch API integration
 * GET /api/price/test
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.ONEINCH_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'ONEINCH_API_KEY not configured',
        message: 'Please add your 1inch API key to .env file',
      }, { status: 500 });
    }

    // Test with Base WETH and USDC addresses
    const tokens = [
      '0x4200000000000000000000000000000000000006', // WETH
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    ];
    const BASE_CHAIN_ID = process.env.NODE_ENV === 'production' ? 8453 : 84532; // Base mainnet or Base testnet
    
    const url = `https://api.1inch.dev/price/v1.1/${BASE_CHAIN_ID}/${tokens.join(',')}`;
    
    console.log('Testing 1inch API with URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
      },
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `1inch API error: ${response.status}`,
        details: responseData,
        url,
        headers: {
          authorization: `Bearer ${apiKey.substring(0, 8)}...`,
        },
      }, { status: response.status });
    }

    // Convert WEI prices to human-readable USD prices
    const humanReadablePrices: Record<string, number> = {};
    Object.entries(responseData).forEach(([token, priceWei]) => {
      humanReadablePrices[token] = parseFloat(priceWei as string) / 1e18;
    });

    return NextResponse.json({
      success: true,
      message: '1inch API integration working correctly',
      rawData: responseData,
      humanReadablePrices,
      metadata: {
        chainId: BASE_CHAIN_ID,
        tokensRequested: tokens,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('1inch API test error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test 1inch API',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}