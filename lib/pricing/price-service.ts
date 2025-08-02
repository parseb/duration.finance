/**
 * Price service for real-time asset pricing using 1inch API
 */

interface PriceData {
  price: number;
  timestamp: number;
  asset: string;
  source: '1inch' | 'fallback';
}

interface OneInchQuoteResponse {
  toAmount: string;
  protocols?: any[];
  gas?: string;
  estimatedGas?: string;
}

class PriceService {
  private cache = new Map<string, PriceData>();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private readonly BASE_CHAIN_ID = 8453; // Base mainnet
  
  // Asset addresses on Base
  private readonly ASSETS = {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  };

  private readonly FALLBACK_PRICES = {
    WETH: 3836.50,
    USDC: 1.00,
  };

  /**
   * Get current price for an asset in USD
   */
  async getCurrentPrice(assetAddress: string): Promise<PriceData> {
    const assetKey = this.getAssetKey(assetAddress);
    
    // Check cache first
    const cached = this.cache.get(assetKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached;
    }

    // Try to fetch from 1inch
    try {
      const priceData = await this.fetchFromOneInch(assetAddress);
      this.cache.set(assetKey, priceData);
      return priceData;
    } catch (error) {
      console.warn('Failed to fetch price from 1inch, using fallback:', error);
      
      // Return cached data if available (even if stale)
      if (cached) {
        return { ...cached, source: 'fallback' as const };
      }
      
      // Use fallback price
      const fallbackPrice = this.getFallbackPrice(assetAddress);
      const fallbackData: PriceData = {
        price: fallbackPrice,
        timestamp: Date.now(),
        asset: assetKey,
        source: 'fallback',
      };
      
      this.cache.set(assetKey, fallbackData);
      return fallbackData;
    }
  }

  /**
   * Fetch price from 1inch API
   */
  private async fetchFromOneInch(assetAddress: string): Promise<PriceData> {
    const assetKey = this.getAssetKey(assetAddress);
    
    if (assetKey === 'USDC') {
      // USDC is the quote currency, always $1
      return {
        price: 1.0,
        timestamp: Date.now(),
        asset: 'USDC',
        source: '1inch',
      };
    }

    // Get quote for 1 unit of the asset in USDC
    const fromToken = assetAddress;
    const toToken = this.ASSETS.USDC;
    const amount = '1000000000000000000'; // 1 ETH in wei

    const url = `https://api.1inch.dev/swap/v6.0/${this.BASE_CHAIN_ID}/quote?` +
      `src=${fromToken}&dst=${toToken}&amount=${amount}&includeProtocols=true&includeGas=true`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Duration.Finance/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`1inch API error: ${response.status}`);
    }

    const data: OneInchQuoteResponse = await response.json();
    
    // Convert USDC amount (6 decimals) to USD price
    const usdcAmount = parseInt(data.toAmount) / 1e6;
    
    return {
      price: usdcAmount,
      timestamp: Date.now(),
      asset: assetKey,
      source: '1inch',
    };
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(assetAddresses: string[]): Promise<Map<string, PriceData>> {
    const pricePromises = assetAddresses.map(async (address) => {
      const price = await this.getCurrentPrice(address);
      return [address, price] as const;
    });

    const results = await Promise.allSettled(pricePromises);
    const priceMap = new Map<string, PriceData>();

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        priceMap.set(assetAddresses[index], result.value[1]);
      } else {
        // Use fallback for failed requests
        const address = assetAddresses[index];
        const fallbackPrice = this.getFallbackPrice(address);
        priceMap.set(address, {
          price: fallbackPrice,
          timestamp: Date.now(),
          asset: this.getAssetKey(address),
          source: 'fallback',
        });
      }
    });

    return priceMap;
  }

  /**
   * Start price monitoring for given assets
   */
  startPriceMonitoring(
    assetAddresses: string[], 
    callback: (prices: Map<string, PriceData>) => void,
    intervalMs: number = 30000
  ): () => void {
    const interval = setInterval(async () => {
      try {
        const prices = await this.getPrices(assetAddresses);
        callback(prices);
      } catch (error) {
        console.error('Error in price monitoring:', error);
      }
    }, intervalMs);

    // Initial fetch
    this.getPrices(assetAddresses).then(callback).catch(console.error);

    // Return cleanup function
    return () => clearInterval(interval);
  }

  private getAssetKey(address: string): string {
    const normalized = address.toLowerCase();
    if (normalized === this.ASSETS.WETH.toLowerCase()) return 'WETH';
    if (normalized === this.ASSETS.USDC.toLowerCase()) return 'USDC';
    return address;
  }

  private getFallbackPrice(address: string): number {
    const key = this.getAssetKey(address);
    return this.FALLBACK_PRICES[key as keyof typeof this.FALLBACK_PRICES] || 1.0;
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getCacheStats(): { size: number; entries: Array<{ asset: string; age: number; source: string }> } {
    const entries = Array.from(this.cache.entries()).map(([key, data]) => ({
      asset: key,
      age: Date.now() - data.timestamp,
      source: data.source,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

// Export singleton instance
export const priceService = new PriceService();

// Export types
export type { PriceData };