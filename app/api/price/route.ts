import { NextRequest, NextResponse } from 'next/server';

interface PriceResponse {
  success: boolean;
  prices?: Record<string, {
    price: number;
    timestamp: number;
    source: string;
  }>;
  error?: string;
}

interface SettlementQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
}

interface SettlementQuoteResponse {
  success: boolean;
  quote?: {
    amountOut: number;
    optimalMethod: 'LIMIT_ORDER' | 'UNOSWAP' | 'GENERIC_ROUTER';
    routingData: string;
    gasEstimate: number;
    priceImpact: number;
  };
  error?: string;
}

// Mock price data - in production, integrate with 1inch Oracle or other price feeds
const mockPrices = {
  '0x4200000000000000000000000000000000000006': { // WETH on Base
    price: 3500,
    timestamp: Date.now(),
    source: '1inch_oracle',
  },
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': { // USDC on Base
    price: 1,
    timestamp: Date.now(),
    source: '1inch_oracle',
  },
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': { // DAI on Base
    price: 1,
    timestamp: Date.now(),
    source: '1inch_oracle',
  },
};

// GET /api/price - Get current prices for assets
export async function GET(request: NextRequest): Promise<NextResponse<PriceResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const assets = searchParams.get('assets')?.split(',') || Object.keys(mockPrices);

    const prices: Record<string, { price: number; timestamp: number; source: string }> = {};

    for (const asset of assets) {
      const normalizedAsset = asset.toLowerCase();
      
      // Check if we have mock data for this asset
      const mockData = Object.entries(mockPrices).find(
        ([address]) => address.toLowerCase() === normalizedAsset
      );

      if (mockData) {
        prices[asset] = mockData[1];
      } else {
        // In production, would call 1inch Oracle API or other price feeds
        // For now, return default price
        prices[asset] = {
          price: 1,
          timestamp: Date.now(),
          source: 'mock',
        };
      }
    }

    return NextResponse.json({
      success: true,
      prices,
    });
  } catch (error) {
    console.error('Error fetching prices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}

// POST /api/price/quote - Get settlement quote from 1inch
export async function POST(request: NextRequest): Promise<NextResponse<SettlementQuoteResponse>> {
  try {
    const body: SettlementQuoteRequest = await request.json();

    if (!body.tokenIn || !body.tokenOut || !body.amountIn) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Mock settlement quote calculation
    const tokenInPrice = mockPrices[body.tokenIn as keyof typeof mockPrices]?.price || 1;
    const tokenOutPrice = mockPrices[body.tokenOut as keyof typeof mockPrices]?.price || 1;
    
    const baseAmountOut = (body.amountIn * tokenInPrice) / tokenOutPrice;
    
    // Apply mock slippage (0.1% for Unoswap, 0.05% for limit orders, 0.15% for generic)
    const slippages = {
      LIMIT_ORDER: 0.0005,
      UNOSWAP: 0.001,
      GENERIC_ROUTER: 0.0015,
    };

    // Determine optimal method based on amount (mock logic)
    let optimalMethod: 'LIMIT_ORDER' | 'UNOSWAP' | 'GENERIC_ROUTER';
    if (body.amountIn < 1) {
      optimalMethod = 'UNOSWAP'; // Best for small amounts
    } else if (body.amountIn < 10) {
      optimalMethod = 'LIMIT_ORDER'; // Best for medium amounts
    } else {
      optimalMethod = 'GENERIC_ROUTER'; // Best for large amounts
    }

    const slippage = slippages[optimalMethod];
    const amountOut = baseAmountOut * (1 - slippage);
    const priceImpact = slippage * 100; // Convert to percentage

    // Mock routing data based on method
    let routingData: string;
    switch (optimalMethod) {
      case 'LIMIT_ORDER':
        routingData = Buffer.from(JSON.stringify({
          order: {
            makerAsset: body.tokenIn,
            takerAsset: body.tokenOut,
            makingAmount: body.amountIn.toString(),
            takingAmount: Math.floor(amountOut * 1e18).toString(),
          },
          signature: '0xmocksignature',
        })).toString('base64');
        break;
      case 'UNOSWAP':
        routingData = Buffer.from(JSON.stringify({
          dexPool: '0xd0b53D9277642d899DF5C87A3966A349A798F224', // Mock Uniswap V3 pool
        })).toString('base64');
        break;
      case 'GENERIC_ROUTER':
        routingData = Buffer.from(JSON.stringify({
          executor: '0x1111111254eeb25477b68fb85ed929f73a960582',
          swapDescription: {
            srcToken: body.tokenIn,
            dstToken: body.tokenOut,
            amount: body.amountIn.toString(),
            minReturnAmount: Math.floor(amountOut * 0.99 * 1e18).toString(),
          },
          data: '0xmockswapdata',
        })).toString('base64');
        break;
    }

    // Mock gas estimate
    const gasEstimates = {
      LIMIT_ORDER: 120000,
      UNOSWAP: 90000,
      GENERIC_ROUTER: 150000,
    };

    return NextResponse.json({
      success: true,
      quote: {
        amountOut,
        optimalMethod,
        routingData,
        gasEstimate: gasEstimates[optimalMethod],
        priceImpact,
      },
    });
  } catch (error) {
    console.error('Error getting settlement quote:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get settlement quote' },
      { status: 500 }
    );
  }
}

// GET /api/price/history - Get historical price data (for charts)
export async function getHistory(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get('asset');
    const timeframe = searchParams.get('timeframe') || '24h';

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Missing asset parameter' },
        { status: 400 }
      );
    }

    // Mock historical data
    const now = Date.now();
    const intervals = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720; // hours
    const intervalMs = 3600000; // 1 hour
    
    const basePrice = mockPrices[asset as keyof typeof mockPrices]?.price || 3500;
    
    const historicalData = Array.from({ length: intervals }, (_, i) => {
      const timestamp = now - (intervals - i - 1) * intervalMs;
      // Add some random volatility to mock price movement
      const volatility = 0.02; // 2% max change per hour
      const change = (Math.random() - 0.5) * 2 * volatility;
      const price = basePrice * (1 + change * (i / intervals)); // Slight trend over time
      
      return {
        timestamp,
        price: Math.max(price, basePrice * 0.8), // Floor at 80% of base price
        volume: Math.random() * 1000000, // Mock volume
      };
    });

    return NextResponse.json({
      success: true,
      asset,
      timeframe,
      data: historicalData,
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch price history' },
      { status: 500 }
    );
  }
}