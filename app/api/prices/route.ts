import { NextRequest, NextResponse } from 'next/server';

// 1inch API configuration
const ONEINCH_API_KEY = process.env.ONEINCH_API_KEY;
const ONEINCH_API_URL = process.env.ONEINCH_API_URL || 'https://api.1inch.dev';

interface PriceData {
  price: number;
  timestamp: number;
  asset: string;
  source: '1inch' | 'fallback';
}

interface OneInchQuoteResponse {
  dstAmount: string;
  toAmount?: string; // Legacy field
  protocols?: any[];
  gas?: string;
  estimatedGas?: string;
}

// Asset addresses on Base
const ASSETS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const FALLBACK_PRICES = {
  WETH: 3836.50,
  USDC: 1.00,
};

const BASE_CHAIN_ID = 8453; // Base mainnet
const CACHE_DURATION = 30000; // 30 seconds

// Simple in-memory cache
const priceCache = new Map<string, PriceData>();

function getAssetKey(address: string): string {
  const normalized = address.toLowerCase();
  if (normalized === ASSETS.WETH.toLowerCase()) return 'WETH';
  if (normalized === ASSETS.USDC.toLowerCase()) return 'USDC';
  return address;
}

async function fetchPriceFromOneInch(assetAddress: string): Promise<PriceData> {
  const assetKey = getAssetKey(assetAddress);
  
  if (assetKey === 'USDC') {
    return {
      price: 1.0,
      timestamp: Date.now(),
      asset: 'USDC',
      source: '1inch',
    };
  }

  // 1inch uses 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native ETH
  const fromToken = assetKey === 'WETH' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : assetAddress;
  const toToken = ASSETS.USDC;
  const amount = '1000000000000000000'; // 1 ETH in wei

  const url = `${ONEINCH_API_URL}/swap/v6.0/${BASE_CHAIN_ID}/quote?` +
    `src=${fromToken}&dst=${toToken}&amount=${amount}&includeProtocols=true&includeGas=true`;

  console.log('🔗 Fetching price from 1inch:', url);

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'Duration.Finance/1.0',
  };

  // Add API key if available - 1inch uses Authorization: Bearer format
  if (ONEINCH_API_KEY) {
    headers['Authorization'] = `Bearer ${ONEINCH_API_KEY}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ 1inch API error:', response.status, errorText);
    throw new Error(`1inch API error: ${response.status} - ${errorText}`);
  }

  const data: OneInchQuoteResponse = await response.json();
  console.log('🔍 1inch API response:', JSON.stringify(data, null, 2));
  
  const amountStr = data.dstAmount || data.toAmount;
  if (!amountStr) {
    console.error('❌ Invalid 1inch response - missing dstAmount/toAmount:', data);
    throw new Error('Invalid response from 1inch API - missing amount data');
  }
  
  // Convert USDC amount (6 decimals) to USD price
  const usdcAmount = parseInt(amountStr) / 1e6;
  console.log('💰 Calculated price:', usdcAmount);
  
  return {
    price: usdcAmount,
    timestamp: Date.now(),
    asset: assetKey,
    source: '1inch',
  };
}

async function getCurrentPrice(assetAddress: string): Promise<PriceData> {
  const assetKey = getAssetKey(assetAddress);
  
  // Check cache first
  const cached = priceCache.get(assetKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('📦 Using cached price for', assetKey);
    return cached;
  }

  try {
    console.log('🔄 Fetching fresh price for', assetKey);
    const priceData = await fetchPriceFromOneInch(assetAddress);
    priceCache.set(assetKey, priceData);
    console.log('✅ Got 1inch price:', assetKey, '$' + priceData.price);
    return priceData;
  } catch (error) {
    console.warn('⚠️ Failed to fetch price from 1inch, using fallback:', error);
    
    // Return cached data if available (even if stale)
    if (cached) {
      console.log('📦 Using stale cached price for', assetKey);
      return { ...cached, source: 'fallback' as const };
    }
    
    // Use fallback price
    const fallbackPrice = FALLBACK_PRICES[assetKey as keyof typeof FALLBACK_PRICES] || 1.0;
    const fallbackData: PriceData = {
      price: fallbackPrice,
      timestamp: Date.now(),
      asset: assetKey,
      source: 'fallback',
    };
    
    console.log('🔄 Using fallback price for', assetKey, '$' + fallbackPrice);
    priceCache.set(assetKey, fallbackData);
    return fallbackData;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assets = searchParams.get('assets');
    const singleAsset = searchParams.get('asset');

    // Handle single asset request
    if (singleAsset) {
      const priceData = await getCurrentPrice(singleAsset);
      return NextResponse.json({
        success: true,
        price: priceData,
        timestamp: Date.now(),
      });
    }

    // Handle multiple assets request
    const assetList = assets ? assets.split(',') : [ASSETS.WETH];
    const pricePromises = assetList.map(async (address) => {
      try {
        const price = await getCurrentPrice(address.trim());
        return [address.trim(), price] as const;
      } catch (error) {
        console.error('Error fetching price for', address, error);
        // Return fallback for failed requests
        const assetKey = getAssetKey(address.trim());
        const fallbackPrice = FALLBACK_PRICES[assetKey as keyof typeof FALLBACK_PRICES] || 1.0;
        return [address.trim(), {
          price: fallbackPrice,
          timestamp: Date.now(),
          asset: assetKey,
          source: 'fallback' as const,
        }] as const;
      }
    });

    const results = await Promise.allSettled(pricePromises);
    const prices: Record<string, PriceData> = {};

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        prices[assetList[index]] = result.value[1];
      }
    });

    return NextResponse.json({
      success: true,
      prices,
      timestamp: Date.now(),
      cache_info: {
        api_key_configured: !!ONEINCH_API_KEY,
        cache_size: priceCache.size,
      },
    });

  } catch (error) {
    console.error('❌ Price API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback_prices: FALLBACK_PRICES,
    }, { status: 500 });
  }
}

// Health check endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'clear_cache') {
      priceCache.clear();
      return NextResponse.json({
        success: true,
        message: 'Price cache cleared',
        timestamp: Date.now(),
      });
    }

    if (body.action === 'health_check') {
      return NextResponse.json({
        success: true,
        status: 'healthy',
        config: {
          api_key_configured: !!ONEINCH_API_KEY,
          api_url: ONEINCH_API_URL,
          chain_id: BASE_CHAIN_ID,
          cache_duration: CACHE_DURATION,
        },
        cache_stats: {
          size: priceCache.size,
          entries: Array.from(priceCache.entries()).map(([key, data]) => ({
            asset: key,
            age_ms: Date.now() - data.timestamp,
            source: data.source,
            price: data.price,
          })),
        },
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Unknown action',
    }, { status: 400 });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}