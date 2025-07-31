// GET /api/marketplace/liquidity - Retrieve Available LP Offers (Free)
// No payment required for reading marketplace data

import { NextRequest, NextResponse } from 'next/server';
import { Address } from 'viem';

// Mock database - replace with real database
const lpCommitments = new Map<string, any>();

// Seed with some mock data for demonstration
seedMockData();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filter parameters
    const filters = {
      asset: searchParams.get('asset') as Address | null,
      minDuration: parseInt(searchParams.get('minDuration') || '1'),
      maxDuration: parseInt(searchParams.get('maxDuration') || '365'),
      minDailyPremium: parseFloat(searchParams.get('minDailyPremium') || '0'),
      maxDailyPremium: parseFloat(searchParams.get('maxDailyPremium') || '10000'),
      minYield: parseFloat(searchParams.get('minYield') || '0'),
      maxYield: parseFloat(searchParams.get('maxYield') || '100'),
      minAmount: parseFloat(searchParams.get('minAmount') || '0'),
      maxAmount: parseFloat(searchParams.get('maxAmount') || '1000'),
      optionType: searchParams.get('optionType') as 'CALL' | 'PUT' | null,
      sortBy: searchParams.get('sortBy') || 'dailyPremium',
      sortDirection: searchParams.get('sortDirection') || 'asc',
      limit: Math.min(parseInt(searchParams.get('limit') || '50'), 100),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    // Get active commitments
    let commitments = Array.from(lpCommitments.values()).filter(
      commitment => commitment.status === 'active'
    );

    // Apply filters
    commitments = commitments.filter(commitment => {
      // Asset filter
      if (filters.asset && commitment.asset.toLowerCase() !== filters.asset.toLowerCase()) {
        return false;
      }

      // Duration overlap filter
      if (commitment.maxDurationDays < filters.minDuration || commitment.minLockDays > filters.maxDuration) {
        return false;
      }

      // Premium filters
      const dailyPremium = parseFloat(commitment.dailyPremiumUsdc);
      if (dailyPremium < filters.minDailyPremium || dailyPremium > filters.maxDailyPremium) {
        return false;
      }

      // Amount filters
      const amount = parseFloat(commitment.amount);
      if (amount < filters.minAmount || amount > filters.maxAmount) {
        return false;
      }

      // Option type filter
      const optionType = commitment.optionType === 0 ? 'CALL' : 'PUT';
      if (filters.optionType && optionType !== filters.optionType) {
        return false;
      }

      // Yield filter (calculated dynamically)
      const currentPrice = 3836.50; // Mock price
      const collateralValue = amount * currentPrice;
      const dailyYield = (dailyPremium / collateralValue) * 100;
      if (dailyYield < filters.minYield || dailyYield > filters.maxYield) {
        return false;
      }

      return true;
    });

    // Enrich with calculated fields
    const enrichedCommitments = commitments.map(commitment => {
      const dailyPremium = parseFloat(commitment.dailyPremiumUsdc);
      const amount = parseFloat(commitment.amount);
      const currentPrice = 3836.50; // Mock price
      const collateralValue = amount * currentPrice;
      const dailyYield = (dailyPremium / collateralValue) * 100;

      return {
        ...commitment,
        estimatedCollateralValueUsd: collateralValue.toFixed(2),
        dailyYieldPercent: dailyYield.toFixed(4),
        annualizedYieldPercent: (dailyYield * 365).toFixed(2),
        optionType: commitment.optionType === 0 ? 'CALL' : 'PUT',
        // Add sample duration calculations
        sampleDurations: [1, 7, 14, 30].map(days => ({
          days,
          totalCost: (dailyPremium * days).toFixed(2),
          canTake: days >= commitment.minLockDays && days <= commitment.maxDurationDays,
        })),
      };
    });

    // Sort commitments
    enrichedCommitments.sort((a, b) => {
      let aValue: number, bValue: number;

      switch (filters.sortBy) {
        case 'dailyPremium':
          aValue = parseFloat(a.dailyPremiumUsdc);
          bValue = parseFloat(b.dailyPremiumUsdc);
          break;
        case 'amount':
          aValue = parseFloat(a.amount);
          bValue = parseFloat(b.amount);
          break;
        case 'yield':
          aValue = parseFloat(a.dailyYieldPercent);
          bValue = parseFloat(b.dailyYieldPercent);
          break;
        case 'collateral':
          aValue = parseFloat(a.estimatedCollateralValueUsd);
          bValue = parseFloat(b.estimatedCollateralValueUsd);
          break;
        default:
          aValue = parseFloat(a.dailyPremiumUsdc);
          bValue = parseFloat(b.dailyPremiumUsdc);
      }

      const result = aValue - bValue;
      return filters.sortDirection === 'desc' ? -result : result;
    });

    // Apply pagination
    const paginatedCommitments = enrichedCommitments.slice(filters.offset, filters.offset + filters.limit);

    // Generate market statistics
    const marketStats = generateMarketStats(enrichedCommitments);

    return NextResponse.json({
      offers: paginatedCommitments,
      total: enrichedCommitments.length,
      hasMore: filters.offset + filters.limit < enrichedCommitments.length,
      filters,
      marketStats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Failed to fetch marketplace liquidity:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateMarketStats(commitments: any[]) {
  if (commitments.length === 0) {
    return {
      totalOffers: 0,
      totalLiquidity: '0',
      averageDailyPremium: '0',
      averageYield: '0',
      priceRange: { min: '0', max: '0' },
    };
  }

  const totalLiquidity = commitments.reduce((sum, c) => sum + parseFloat(c.estimatedCollateralValueUsd), 0);
  const avgDailyPremium = commitments.reduce((sum, c) => sum + parseFloat(c.dailyPremiumUsdc), 0) / commitments.length;
  const avgYield = commitments.reduce((sum, c) => sum + parseFloat(c.dailyYieldPercent), 0) / commitments.length;

  const dailyPremiums = commitments.map(c => parseFloat(c.dailyPremiumUsdc));
  const minPremium = Math.min(...dailyPremiums);
  const maxPremium = Math.max(...dailyPremiums);

  return {
    totalOffers: commitments.length,
    totalLiquidity: totalLiquidity.toFixed(2),
    averageDailyPremium: avgDailyPremium.toFixed(2),
    averageYield: avgYield.toFixed(4),
    priceRange: {
      min: minPremium.toFixed(2),
      max: maxPremium.toFixed(2),
    },
  };
}

function seedMockData() {
  // Only seed if empty
  if (lpCommitments.size > 0) return;

  const mockCommitments = [
    {
      id: 'mock-1',
      lp: '0x1234567890123456789012345678901234567890' as Address,
      asset: '0x4200000000000000000000000000000000000006' as Address, // WETH
      amount: '0.5',
      dailyPremiumUsdc: '25.00',
      minLockDays: 1,
      maxDurationDays: 14,
      optionType: 0, // CALL
      expiry: (Date.now() / 1000 + 86400).toString(),
      nonce: '1',
      isFramentable: true,
      signature: '0x' + '0'.repeat(130),
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mock-2',
      lp: '0x2345678901234567890123456789012345678901' as Address,
      asset: '0x4200000000000000000000000000000000000006' as Address, // WETH
      amount: '1.0',
      dailyPremiumUsdc: '50.00',
      minLockDays: 3,
      maxDurationDays: 30,
      optionType: 1, // PUT
      expiry: (Date.now() / 1000 + 86400).toString(),
      nonce: '1',
      isFramentable: true,
      signature: '0x' + '1'.repeat(130),
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mock-3',
      lp: '0x3456789012345678901234567890123456789012' as Address,
      asset: '0x4200000000000000000000000000000000000006' as Address, // WETH
      amount: '0.1',
      dailyPremiumUsdc: '8.00',
      minLockDays: 1,
      maxDurationDays: 7,
      optionType: 0, // CALL
      expiry: (Date.now() / 1000 + 86400).toString(),
      nonce: '1',
      isFramentable: false,
      signature: '0x' + '2'.repeat(130),
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ];

  mockCommitments.forEach(commitment => {
    lpCommitments.set(commitment.id, commitment);
  });
}