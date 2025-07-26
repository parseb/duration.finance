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

interface OneInchPriceResponse {
  [tokenAddress: string]: string; // Price in WEI
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

// In-memory cache for 1inch prices
interface PriceCache {
  prices: Record<string, {
    price: number;
    timestamp: number;
    source: string;
  }>;
  lastUpdate: number;
  isRefreshing: boolean;
}

const priceCache: PriceCache = {
  prices: {},
  lastUpdate: 0,
  isRefreshing: false,
};

const CACHE_DURATION = 3000; // 3 seconds
const BASE_CHAIN_ID = process.env.NODE_ENV === 'production' ? 8453 : 84532; // Base mainnet or Base testnet

// Base token addresses we support
const SUPPORTED_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
};

// Fallback prices in case 1inch API fails
const fallbackPrices = {
  [SUPPORTED_TOKENS.WETH]: 3500, // ETH price in USD
  [SUPPORTED_TOKENS.USDC]: 1, // USDC is pegged to USD
  [SUPPORTED_TOKENS.DAI]: 1, // DAI is pegged to USD
};

/**
 * Fetch prices from 1inch API with proper error handling
 */
async function fetchPricesFrom1inch(tokens: string[]): Promise<Record<string, number>> {
  const apiKey = process.env.ONEINCH_API_KEY;
  
  if (!apiKey) {
    console.warn('1inch API key not found, using fallback prices');
    const fallbackResult: Record<string, number> = {};
    tokens.forEach(token => {
      fallbackResult[token] = fallbackPrices[token as keyof typeof fallbackPrices] || 1;
    });
    return fallbackResult;
  }

  try {
    // Use the GET endpoint for multiple addresses
    const tokensParam = tokens.join(',');
    const url = `https://api.1inch.dev/price/v1.1/${BASE_CHAIN_ID}/${tokensParam}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`1inch API error: ${response.status} ${response.statusText}`);
    }

    const data: OneInchPriceResponse = await response.json();
    
    // Convert WEI prices to USD prices (1inch returns prices in WEI relative to USD)
    const result: Record<string, number> = {};
    Object.entries(data).forEach(([token, priceWei]) => {
      // Convert from WEI to USD (divide by 1e18)
      result[token] = parseFloat(priceWei) / 1e18;
    });

    return result;
  } catch (error) {
    console.error('Error fetching prices from 1inch:', error);
    
    // Return fallback prices on error
    const fallbackResult: Record<string, number> = {};
    tokens.forEach(token => {
      fallbackResult[token] = fallbackPrices[token as keyof typeof fallbackPrices] || 1;
    });
    return fallbackResult;
  }
}

/**
 * Update price cache if needed
 */
async function updatePriceCache(): Promise<void> {
  const now = Date.now();
  
  // Check if cache is still valid
  if (now - priceCache.lastUpdate < CACHE_DURATION) {
    return;
  }

  // Prevent multiple simultaneous updates
  if (priceCache.isRefreshing) {
    return;
  }

  priceCache.isRefreshing = true;

  try {
    const tokens = Object.values(SUPPORTED_TOKENS);
    const prices = await fetchPricesFrom1inch(tokens);
    
    // Update cache
    Object.entries(prices).forEach(([token, price]) => {
      priceCache.prices[token] = {
        price,
        timestamp: now,
        source: '1inch_api',
      };
    });
    
    priceCache.lastUpdate = now;
    console.log('Price cache updated successfully');
  } catch (error) {
    console.error('Failed to update price cache:', error);
  } finally {
    priceCache.isRefreshing = false;
  }
}

// GET /api/price - Get current prices for assets
export async function GET(request: NextRequest): Promise<NextResponse<PriceResponse>> {
  try {
    // Trigger cache update (non-blocking if cache is fresh)
    updatePriceCache().catch(error => 
      console.error('Background cache update failed:', error)
    );

    const { searchParams } = new URL(request.url);
    const requestedAssets = searchParams.get('assets')?.split(',') || Object.values(SUPPORTED_TOKENS);

    const prices: Record<string, { price: number; timestamp: number; source: string }> = {};

    for (const asset of requestedAssets) {
      const normalizedAsset = asset.toLowerCase();
      
      // Check cache first
      const cachedPrice = Object.entries(priceCache.prices).find(
        ([address]) => address.toLowerCase() === normalizedAsset
      );

      if (cachedPrice) {
        prices[asset] = cachedPrice[1];
      } else {
        // Use fallback price if not in cache
        const fallbackPrice = fallbackPrices[asset as keyof typeof fallbackPrices] || 1;
        prices[asset] = {
          price: fallbackPrice,
          timestamp: Date.now(),
          source: 'fallback',
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

    // Use cached prices for settlement quote calculation
    const tokenInPrice = priceCache.prices[body.tokenIn]?.price || fallbackPrices[body.tokenIn as keyof typeof fallbackPrices] || 1;
    const tokenOutPrice = priceCache.prices[body.tokenOut]?.price || fallbackPrices[body.tokenOut as keyof typeof fallbackPrices] || 1;
    
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
    
    const basePrice = priceCache.prices[asset]?.price || fallbackPrices[asset as keyof typeof fallbackPrices] || 3500;
    
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