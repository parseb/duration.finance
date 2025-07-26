/**
 * @title 1inch API Client
 * @notice Secure client for 1inch API using backend environment variables
 * @dev This module should only be imported in API routes (server-side)
 */

import { ENV } from './env';

// Ensure this can only run on server-side
if (typeof window !== 'undefined') {
  throw new Error('❌ SECURITY: 1inch client can only be used on the server-side!');
}

export interface PriceData {
  [tokenAddress: string]: string; // Price in USD
}

export interface QuoteParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage?: number; // Percentage (1-50)
}

export interface QuoteResponse {
  toTokenAmount: string;
  estimatedGas: string;
  protocols: any[];
}

export interface SwapParams extends QuoteParams {
  fromAddress: string;
  slippage: number;
  disableEstimate?: boolean;
  allowPartialFill?: boolean;
}

export interface SwapResponse {
  toTokenAmount: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: string;
  };
}

class OneInchClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly chainId: number = 8453; // Base mainnet

  constructor() {
    this.baseUrl = ENV.ONEINCH_API_URL;
    this.apiKey = ENV.ONEINCH_API_KEY;

    if (!this.apiKey) {
      console.warn('⚠️ 1inch API key not configured. API calls will fail.');
    }
  }

  private async makeRequest(endpoint: string, params?: Record<string, string>): Promise<any> {
    if (!this.apiKey) {
      throw new Error('1inch API key not configured');
    }

    const url = new URL(`${this.baseUrl}/v5.2/${this.chainId}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`1inch API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get current prices for tokens
   */
  async getPrices(tokenAddresses: string[]): Promise<PriceData> {
    const params = {
      tokens: tokenAddresses.join(','),
      currency: 'USD',
    };

    return this.makeRequest('/price', params);
  }

  /**
   * Get quote for token swap
   */
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const queryParams = {
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippage: (params.slippage || 1).toString(),
    };

    return this.makeRequest('/quote', queryParams);
  }

  /**
   * Get swap transaction data
   */
  async getSwap(params: SwapParams): Promise<SwapResponse> {
    const queryParams = {
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      fromAddress: params.fromAddress,
      slippage: params.slippage.toString(),
      disableEstimate: (params.disableEstimate || false).toString(),
      allowPartialFill: (params.allowPartialFill || false).toString(),
    };

    return this.makeRequest('/swap', queryParams);
  }

  /**
   * Get limit order data
   */
  async createLimitOrder(params: {
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    maker: string;
  }) {
    // Implementation would depend on 1inch Limit Order Protocol
    // This is a placeholder for the actual implementation
    throw new Error('Limit order creation not yet implemented');
  }

  /**
   * Health check for 1inch API
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.makeRequest('/healthcheck');
      return true;
    } catch (error) {
      console.error('1inch API health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const oneInchClient = new OneInchClient();

// Export types for use in API routes
export type { PriceData, QuoteParams, QuoteResponse, SwapParams, SwapResponse };