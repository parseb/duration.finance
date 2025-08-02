import { NextRequest, NextResponse } from 'next/server';
import { createPostgreSQLStorage } from '@/lib/database/postgresql-storage';

// Initialize storage
const storage = process.env.DATABASE_URL 
  ? createPostgreSQLStorage(process.env.DATABASE_URL)
  : null;

/**
 * GET /api/portfolio - Get user's portfolio (both LP and taker positions)
 * Query params:
 * - address: User wallet address (required)
 */
export async function GET(request: NextRequest) {
  try {
    if (!storage) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'User address required' },
        { status: 400 }
      );
    }

    // Get user's portfolio from database
    const portfolioData = await storage.getUserPortfolio(userAddress);

    // Get user's active commitments (LP offers not yet taken)
    const activeCommitments = await storage.getByLP(userAddress);

    // Calculate portfolio statistics
    const stats = calculatePortfolioStats(portfolioData, activeCommitments);

    // Serialize BigInt values for JSON response
    const serializedPortfolio = portfolioData.map((position: any) => ({
      ...position,
      amount: position.amount?.toString() || '0',
      strike_price: position.strike_price?.toString() || '0',
      premium_amount: position.premium_amount?.toString() || '0',
    }));

    const serializedCommitments = activeCommitments.map((commitment: any) => ({
      ...commitment,
      id: commitment.id,
      amount: commitment.amount?.toString() || '0',
      dailyPremiumUsdc: commitment.dailyPremiumUsdc?.toString() || '0',
      minLockDays: commitment.minLockDays?.toString() || '0',
      maxDurationDays: commitment.maxDurationDays?.toString() || '0',
      expiry: commitment.expiry?.toString() || '0',
      nonce: commitment.nonce?.toString() || '0',
    }));

    return NextResponse.json({
      success: true,
      address: userAddress,
      portfolio: {
        activeOptions: serializedPortfolio,
        activeCommitments: serializedCommitments,
        stats: {
          totalPositions: portfolioData.length,
          activeCommitments: activeCommitments.length,
          totalValueLocked: stats.totalValueLocked,
          unrealizedPnL: stats.unrealizedPnL,
          totalPremiumsEarned: stats.totalPremiumsEarned,
          totalPremiumsPaid: stats.totalPremiumsPaid,
        }
      }
    });

  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function calculatePortfolioStats(positions: any[], commitments: any[]) {
  // Note: In production, this would ideally use server-side price fetching
  // For now, we'll use a default price and let the frontend handle real-time updates
  const currentEthPrice = 3836.50; // Mock price - frontend will update with real-time data

  let totalValueLocked = 0;
  let unrealizedPnL = 0;
  let totalPremiumsEarned = 0;
  let totalPremiumsPaid = 0;

  // Calculate stats from active options
  positions.forEach((position) => {
    const amount = parseFloat(position.amount || '0') / 1e18; // Convert wei to ETH
    const strikePrice = parseFloat(position.strike_price || '0') / 1e18; // Strike price in USD
    const premiumPaid = parseFloat(position.premium_amount || '0') / 1e6; // Premium in USDC

    // Add to total value locked
    totalValueLocked += amount * currentEthPrice;

    if (position.position_type === 'taker') {
      // For takers: calculate unrealized P&L based on option profitability
      totalPremiumsPaid += premiumPaid;
      
      if (position.option_type === 0) { // CALL
        const profit = Math.max(0, currentEthPrice - strikePrice) * amount;
        unrealizedPnL += profit - premiumPaid;
      } else { // PUT
        const profit = Math.max(0, strikePrice - currentEthPrice) * amount;
        unrealizedPnL += profit - premiumPaid;
      }
    } else if (position.position_type === 'lp') {
      // For LPs: they earned the premium and have collateral at risk
      totalPremiumsEarned += premiumPaid;
      
      // LP's unrealized P&L is the premium earned minus potential payout
      if (position.option_type === 0) { // CALL
        const potentialPayout = Math.max(0, currentEthPrice - strikePrice) * amount;
        unrealizedPnL += premiumPaid - potentialPayout;
      } else { // PUT
        const potentialPayout = Math.max(0, strikePrice - currentEthPrice) * amount;
        unrealizedPnL += premiumPaid - potentialPayout;
      }
    }
  });

  // Add value from active commitments (LP offers waiting to be taken)
  commitments.forEach((commitment) => {
    const amount = parseFloat(commitment.amount?.toString() || '0') / 1e18;
    totalValueLocked += amount * currentEthPrice;
  });

  return {
    totalValueLocked: totalValueLocked.toFixed(2),
    unrealizedPnL: unrealizedPnL.toFixed(2),
    totalPremiumsEarned: totalPremiumsEarned.toFixed(2),
    totalPremiumsPaid: totalPremiumsPaid.toFixed(2),
  };
}