/**
 * @title 1inch API Client with Caching
 * @notice Handles 1inch API requests with 5-second TTL caching
 */

interface QuoteParams {
  src: string;          // Source token address
  dst: string;          // Destination token address  
  amount: string;       // Amount in minimal divisible units
  includeTokensInfo?: boolean;
  includeProtocols?: boolean;
  fee?: string;         // Fee percentage (0-3%)
  gasLimit?: string;    // Gas limit for swap
  connectorTokens?: string; // Connector tokens
}

interface QuoteResponse {
  dstAmount: string;    // Destination amount in minimal divisible units
  srcAmount: string;    // Source amount (same as input)
  gas: string;          // Estimated gas usage
  gasPrice: string;     // Current gas price
  protocols: any[];     // Route protocols
  estimatedGas: string; // Estimated gas
}

interface SwapParams extends QuoteParams {
  from: string;         // Sender address
  slippage: number;     // Slippage percentage (1-50)
  disableEstimate?: boolean;
  allowPartialFill?: boolean;
  referrer?: string;
}

interface SwapResponse {
  dstAmount: string;
  srcAmount: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class OneInchAPIClient {
  private baseUrl: string;
  private apiKey: string;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 5000; // 5 seconds in milliseconds

  constructor(apiKey: string, chainId: number = 8453) {
    this.apiKey = apiKey;
    this.baseUrl = `https://api.1inch.dev/swap/v6.0/${chainId}`;
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${endpoint}:${sortedParams}`;
  }

  /**
   * Check if cache entry is valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get cached data or fetch from API
   */
  private async getCachedOrFetch<T>(
    endpoint: string,
    params: Record<string, any>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params);
    const cached = this.cache.get(cacheKey);

    // Return cached data if valid
    if (cached && this.isCacheValid(cached)) {
      console.log(`Cache hit for ${endpoint}`);
      return cached.data as T;
    }

    // Fetch fresh data
    console.log(`Cache miss for ${endpoint}, fetching from API`);
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`1inch API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cache the result
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    // Clean up old cache entries (optional)
    this.cleanupCache();

    return data as T;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get quote for token swap (cached for 5 seconds)
   */
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    return this.getCachedOrFetch<QuoteResponse>('/quote', params);
  }

  /**
   * Get swap transaction data (not cached - each swap is unique)
   */
  async getSwap(params: SwapParams): Promise<SwapResponse> {
    const url = new URL(`${this.baseUrl}/swap`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`1inch API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get token list (cached for 30 minutes)
   */
  async getTokens(): Promise<Record<string, any>> {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    return this.getCachedOrFetch<Record<string, any>>('/tokens', {}, THIRTY_MINUTES);
  }

  /**
   * Get supported protocols (cached for 1 hour)
   */
  async getProtocols(): Promise<any[]> {
    const ONE_HOUR = 60 * 60 * 1000;
    return this.getCachedOrFetch<any[]>('/liquidity-sources', {}, ONE_HOUR);
  }

  /**
   * Clear cache manually
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance for the app
let oneInchClient: OneInchAPIClient | null = null;

/**
 * Get 1inch API client instance
 */
export function getOneInchClient(chainId?: number): OneInchAPIClient {
  if (!oneInchClient) {
    const apiKey = process.env.ONEINCH_API_KEY;
    if (!apiKey) {
      throw new Error('ONEINCH_API_KEY environment variable is required');
    }
    oneInchClient = new OneInchAPIClient(apiKey, chainId);
  }
  return oneInchClient;
}

/**
 * Get quote for token swap with caching
 */
export async function getSwapQuote(
  srcToken: string,
  dstToken: string,
  amount: string,
  chainId?: number
): Promise<QuoteResponse> {
  const client = getOneInchClient(chainId);
  return client.getQuote({
    src: srcToken,
    dst: dstToken,
    amount,
    includeTokensInfo: true,
    includeProtocols: true,
  });
}

/**
 * Get swap transaction data
 */
export async function getSwapTransaction(
  srcToken: string,
  dstToken: string,
  amount: string,
  fromAddress: string,
  slippage: number = 1,
  chainId?: number
): Promise<SwapResponse> {
  const client = getOneInchClient(chainId);
  return client.getSwap({
    src: srcToken,
    dst: dstToken,
    amount,
    from: fromAddress,
    slippage,
    disableEstimate: true,
  });
}

/**
 * Convert token amount to minimal units
 */
export function toMinimalUnits(amount: string, decimals: number): string {
  const factor = BigInt(10 ** decimals);
  const amountBigInt = BigInt(parseFloat(amount) * Math.pow(10, decimals));
  return amountBigInt.toString();
}

/**
 * Convert minimal units to human readable amount
 */
export function fromMinimalUnits(amount: string, decimals: number): string {
  const factor = BigInt(10 ** decimals);
  const amountBigInt = BigInt(amount);
  return (Number(amountBigInt) / Math.pow(10, decimals)).toString();
}

export type { QuoteParams, QuoteResponse, SwapParams, SwapResponse };