// GET /api/marketplace/concentration - LP Concentration by Duration (Free)
// Returns data for the LP concentration chart

import { NextRequest, NextResponse } from 'next/server';
import { Address } from 'viem';

// Mock database - replace with real database
const lpCommitments = new Map<string, any>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const asset = searchParams.get('asset') as Address;
    const maxDuration = parseInt(searchParams.get('maxDuration') || '30');
    const minDuration = parseInt(searchParams.get('minDuration') || '1');

    // Get active commitments for the asset
    let commitments = Array.from(lpCommitments.values()).filter(
      commitment => 
        commitment.status === 'active' &&
        (!asset || commitment.asset.toLowerCase() === asset.toLowerCase())
    );

    // Generate concentration data for each duration day
    const concentrationData = [];
    
    for (let duration = minDuration; duration <= maxDuration; duration++) {
      // Find all commitments that accept this duration
      const availableOffers = commitments.filter(commitment =>
        duration >= commitment.minLockDays && duration <= commitment.maxDurationDays
      );

      // Calculate metrics for this duration
      const totalLiquidity = availableOffers.reduce((sum, offer) => {
        return sum + parseFloat(offer.amount);
      }, 0);

      const avgDailyCost = availableOffers.length > 0
        ? availableOffers.reduce((sum, offer) => sum + parseFloat(offer.dailyPremiumUsdc), 0) / availableOffers.length
        : 0;

      const totalCollateralValue = availableOffers.reduce((sum, offer) => {
        const amount = parseFloat(offer.amount);
        const price = 3836.50; // Mock price
        return sum + (amount * price);
      }, 0);

      const avgYield = availableOffers.length > 0
        ? availableOffers.reduce((sum, offer) => {
          const dailyPremium = parseFloat(offer.dailyPremiumUsdc);
          const amount = parseFloat(offer.amount);
          const collateralValue = amount * 3836.50;
          return sum + ((dailyPremium / collateralValue) * 100);
        }, 0) / availableOffers.length
        : 0;

      // Calculate cost ranges
      const dailyCosts = availableOffers.map(offer => parseFloat(offer.dailyPremiumUsdc));
      const minDailyCost = dailyCosts.length > 0 ? Math.min(...dailyCosts) : 0;
      const maxDailyCost = dailyCosts.length > 0 ? Math.max(...dailyCosts) : 0;

      concentrationData.push({
        duration,
        totalLiquidity: totalLiquidity.toFixed(3),
        totalLiquidityUsd: totalCollateralValue.toFixed(2),
        averageDailyCost: avgDailyCost.toFixed(2),
        averageYield: avgYield.toFixed(4),
        offerCount: availableOffers.length,
        costRange: {
          min: minDailyCost.toFixed(2),
          max: maxDailyCost.toFixed(2),
        },
        offers: availableOffers.map(offer => ({
          id: offer.id,
          lp: offer.lp,
          amount: offer.amount,
          dailyPremium: offer.dailyPremiumUsdc,
          optionType: offer.optionType === 0 ? 'CALL' : 'PUT',
        })),
      });
    }

    // Calculate overall market metrics
    const marketMetrics = {
      totalDurationsCovered: concentrationData.filter(d => d.offerCount > 0).length,
      peakLiquidityDuration: concentrationData.reduce((max, current) => 
        parseFloat(current.totalLiquidity) > parseFloat(max.totalLiquidity) ? current : max
      ),
      averageOfferCount: concentrationData.reduce((sum, d) => sum + d.offerCount, 0) / concentrationData.length,
      liquidityDistribution: {
        shortTerm: concentrationData.filter(d => d.duration <= 7).reduce((sum, d) => sum + parseFloat(d.totalLiquidity), 0),
        mediumTerm: concentrationData.filter(d => d.duration > 7 && d.duration <= 21).reduce((sum, d) => sum + parseFloat(d.totalLiquidity), 0),
        longTerm: concentrationData.filter(d => d.duration > 21).reduce((sum, d) => sum + parseFloat(d.totalLiquidity), 0),
      },
    };

    return NextResponse.json({
      asset: asset || 'ALL',
      durationRange: { min: minDuration, max: maxDuration },
      concentration: concentrationData,
      marketMetrics,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Failed to fetch concentration data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper endpoint for chart-specific data formats
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asset, durationRange, aggregation = 'daily' } = body;

    // Generate optimized data for charting libraries
    const chartData = await generateChartData(asset, durationRange, aggregation);

    return NextResponse.json({
      chartData,
      config: {
        type: 'concentration',
        aggregation,
        asset,
        durationRange,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Failed to generate chart data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateChartData(
  asset: Address | null,
  durationRange: { min: number; max: number },
  aggregation: 'daily' | 'weekly'
) {
  // Get concentration data
  const concentrationResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/marketplace/concentration?${new URLSearchParams({
    ...(asset && { asset }),
    minDuration: durationRange.min.toString(),
    maxDuration: durationRange.max.toString(),
  })}`);

  if (!concentrationResponse.ok) {
    throw new Error('Failed to fetch concentration data');
  }

  const { concentration } = await concentrationResponse.json();

  // Format for popular charting libraries
  return {
    // Chart.js format
    chartjs: {
      labels: concentration.map((d: any) => `${d.duration}d`),
      datasets: [
        {
          label: 'Total Liquidity (WETH)',
          data: concentration.map((d: any) => parseFloat(d.totalLiquidity)),
          backgroundColor: 'rgba(255, 193, 7, 0.8)',
          borderColor: 'rgba(255, 193, 7, 1)',
        },
        {
          label: 'Average Cost (USDC)',
          data: concentration.map((d: any) => parseFloat(d.averageDailyCost)),
          backgroundColor: 'rgba(40, 167, 69, 0.8)',
          borderColor: 'rgba(40, 167, 69, 1)',
        },
      ],
    },
    // Recharts format
    recharts: concentration.map((d: any) => ({
      duration: d.duration,
      liquidity: parseFloat(d.totalLiquidity),
      cost: parseFloat(d.averageDailyCost),
      offers: d.offerCount,
      yield: parseFloat(d.averageYield),
    })),
    // D3.js format
    d3: concentration.map((d: any) => ({
      x: d.duration,
      y: parseFloat(d.totalLiquidity),
      size: d.offerCount,
      color: parseFloat(d.averageYield),
    })),
  };
}