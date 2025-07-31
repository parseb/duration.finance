// Duration-Centric Options API Client
// Handles LP commitments, taker commitments, and marketplace queries

import { Address } from 'viem';

// Exact match with smart contract struct (for EIP-712 signing)
export interface LPCommitmentStruct {
  lp: Address;                    // Liquidity provider address
  asset: Address;                 // Underlying asset address
  amount: string;                 // Amount of asset (as string for BigInt compatibility)
  dailyPremiumUsdc: string;       // LP daily premium rate in USDC
  minLockDays: number;            // LP minimum lock period in days
  maxDurationDays: number;        // LP maximum duration in days
  optionType: 0 | 1;              // CALL (0) or PUT (1) - matches enum
  expiry: string;                 // Commitment expiration timestamp (as string for BigInt)
  nonce: string;                  // Nonce for signature uniqueness (as string for BigInt)
  isFramentable: boolean;         // Allow partial taking
  signature: `0x${string}`;       // EIP-712 signature
}

// Database/API interface (includes additional fields)
export interface LPCommitment extends LPCommitmentStruct {
  id: string;                     // Database UUID
  createdAt: string;             // Creation timestamp
  takenAt?: string;              // When taken (if applicable)
  optionType: 'CALL' | 'PUT';    // Human-readable format
}

// Note: Taker commitments are simplified - they just request duration
// The actual option is created when LP accepts with their daily rate
export interface TakerRequest {
  taker: Address;
  asset: Address;
  amount: string;
  requestedDurationDays: number;
  optionType: 'CALL' | 'PUT';
  maxDailyPremium: string;        // Maximum daily rate willing to pay
}

export interface MarketplaceLiquidity {
  id: string;
  lpAddress: Address;
  asset: Address;
  amount: string;
  dailyPremiumUsdc: string;
  minLockDays: number;
  maxDurationDays: number;
  isFramentable: boolean;
  optionType: 'CALL' | 'PUT';
  // Calculated fields
  estimatedCollateralValueUsd: string;
  dailyYieldPercent: string;
  annualizedYieldPercent: string;
  totalCostForDuration?: string; // Calculated based on selected duration
  canTakeForDuration?: boolean;  // Whether duration is within acceptable range
}

export interface FilterParams {
  asset?: Address;
  duration?: number;
  minDailyPremium?: number;
  maxDailyPremium?: number;
  minYield?: number;
  maxYield?: number;
  sortBy?: 'daily-cost' | 'total-cost' | 'yield' | 'amount';
  sortDirection?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface ActiveOption {
  optionId: number;
  commitmentId: string;
  takerAddress: Address;
  lpAddress: Address;
  asset: Address;
  amount: string;
  strikePrice: string;
  dailyPremiumUsdc: string;
  lockDurationDays: number;
  totalPremiumPaid: string;
  exerciseDeadline: string;
  optionType: 'CALL' | 'PUT';
  status: 'active' | 'exercised' | 'expired';
}

export interface LiquidityConcentration {
  duration: number;
  totalLiquidity: string;
  averageCost: string;
  offerCount: number;
}

class DurationOptionsAPI {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  // LP Commitment Operations (uses exact struct for EIP-712)
  async createLPCommitment(commitment: LPCommitmentStruct): Promise<LPCommitment> {
    const response = await fetch(`${this.baseUrl}/commitments/lp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commitment),
    });

    if (!response.ok) {
      throw new Error(`Failed to create LP commitment: ${response.statusText}`);
    }

    return response.json();
  }

  // Taker Commitment Operations
  async createTakerCommitment(commitment: Omit<TakerCommitment, 'id' | 'createdAt'>): Promise<TakerCommitment> {
    const response = await fetch(`${this.baseUrl}/commitments/taker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commitment),
    });

    if (!response.ok) {
      throw new Error(`Failed to create taker commitment: ${response.statusText}`);
    }

    return response.json();
  }

  // Marketplace Queries
  async getMarketplaceLiquidity(filters: FilterParams = {}): Promise<{
    offers: MarketplaceLiquidity[];
    total: number;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, value.toString());
      }
    });

    const response = await fetch(`${this.baseUrl}/marketplace/liquidity?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch marketplace liquidity: ${response.statusText}`);
    }

    return response.json();
  }

  // Calculate premium for specific duration
  async calculatePremium(commitmentId: string, durationDays: number): Promise<{
    totalPremium: string;
    dailyPremium: string;
    isValidDuration: boolean;
  }> {
    const response = await fetch(`${this.baseUrl}/commitments/${commitmentId}/premium?duration=${durationDays}`);
    
    if (!response.ok) {
      throw new Error(`Failed to calculate premium: ${response.statusText}`);
    }

    return response.json();
  }

  // Take a commitment
  async takeCommitment(commitmentId: string, durationDays: number, signature: string): Promise<{
    optionId: number;
    totalPremium: string;
    exerciseDeadline: string;
  }> {
    const response = await fetch(`${this.baseUrl}/commitments/${commitmentId}/take`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        durationDays,
        signature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to take commitment: ${response.statusText}`);
    }

    return response.json();
  }

  // Get LP concentration data for chart
  async getLiquidityConcentration(asset: Address, maxDuration = 30): Promise<LiquidityConcentration[]> {
    const response = await fetch(`${this.baseUrl}/marketplace/concentration?asset=${asset}&maxDuration=${maxDuration}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch liquidity concentration: ${response.statusText}`);
    }

    return response.json();
  }

  // Get user's active options
  async getUserOptions(address: Address, filters: {
    status?: 'active' | 'exercised' | 'expired';
    minDuration?: number;
    maxDuration?: number;
  } = {}): Promise<ActiveOption[]> {
    const params = new URLSearchParams({ address });
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    });

    const response = await fetch(`${this.baseUrl}/options?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user options: ${response.statusText}`);
    }

    return response.json();
  }

  // Get current asset price from 1inch
  async getCurrentPrice(asset: Address): Promise<{
    price: string;
    timestamp: string;
    source: '1inch' | 'fallback';
  }> {
    const response = await fetch(`${this.baseUrl}/prices/${asset}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch current price: ${response.statusText}`);
    }

    return response.json();
  }

  // Portfolio analytics
  async getPortfolioAnalytics(address: Address): Promise<{
    totalPnl: string;
    activePositions: number;
    totalPremiumsReceived: string;
    totalPremiumsPaid: string;
    averageDuration: number;
    yieldMetrics: {
      totalYield: string;
      annualizedYield: string;
      bestPerformingAsset: Address;
    };
  }> {
    const response = await fetch(`${this.baseUrl}/portfolio/${address}/analytics`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch portfolio analytics: ${response.statusText}`);
    }

    return response.json();
  }

  // Exercise option
  async exerciseOption(optionId: number, settlementParams: any): Promise<{
    profit: string;
    protocolFee: string;
    transactionHash: string;
  }> {
    const response = await fetch(`${this.baseUrl}/options/${optionId}/exercise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlementParams }),
    });

    if (!response.ok) {
      throw new Error(`Failed to exercise option: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const durationOptionsAPI = new DurationOptionsAPI();

// Export types and constants
export const SUPPORTED_ASSETS = {
  WETH: '0x4200000000000000000000000000000000000006' as Address, // Base WETH
} as const;

export const DURATION_LIMITS = {
  MIN_DAYS: 1,
  MAX_DAYS: 365,
  DEFAULT_MAX_DAYS: 30,
} as const;

export const POSITION_LIMITS = {
  MIN_WETH: parseFloat(process.env.MIN_POSITION_SIZE_WETH || '0.001'),
  MAX_WETH: parseFloat(process.env.MAX_POSITION_SIZE_WETH || '1.0'),
} as const;

export const PREMIUM_LIMITS = {
  MIN_DAILY_USDC: 0.01,
  MAX_DAILY_USDC: 10000,
} as const;

export const YIELD_LIMITS = {
  MIN_DAILY_PERCENT: 0,
  MAX_DAILY_PERCENT: 10,
} as const;