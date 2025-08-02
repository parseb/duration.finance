'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { ExerciseOptionButton } from './ExerciseOptionButton';
import { useWethPrice } from '../../hooks/use-prices';

interface PortfolioStats {
  totalPositions: number;
  activeCommitments: number;
  totalValueLocked: string;
  unrealizedPnL: string;
  totalPremiumsEarned: string;
  totalPremiumsPaid: string;
}

interface ActiveOption {
  user_address: string;
  position_type: 'taker' | 'lp';
  position_hash: string;
  asset_address: string;
  amount: string;
  strike_price: string;
  premium_amount: string;
  option_type: number;
  expiry_timestamp: string;
  exercise_status: string;
  created_at: string;
  option_type_name: string;
}

interface ActiveCommitment {
  id: string;
  lp: string;
  asset: string;
  amount: string;
  dailyPremiumUsdc: string;
  minLockDays: string;
  maxDurationDays: string;
  optionType: number;
  expiry: string;
  nonce: string;
  signature: string;
}

interface PortfolioData {
  activeOptions: ActiveOption[];
  activeCommitments: ActiveCommitment[];
  stats: PortfolioStats;
}

export function Portfolio() {
  const { address } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (address) {
      fetchPortfolio();
    } else {
      setPortfolio(null);
      setLoading(false);
    }
  }, [address, refreshTrigger]);

  const fetchPortfolio = async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/portfolio?address=${address}`);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio');
      }

      const data = await response.json();
      setPortfolio(data.portfolio);
    } catch (err) {
      console.error('Error fetching portfolio:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleExerciseSuccess = (hash: string) => {
    console.log('Option exercised:', hash);
    setRefreshTrigger(prev => prev + 1); // Refresh portfolio
  };

  const handleExerciseError = (error: string) => {
    console.error('Exercise failed:', error);
    alert(`Failed to exercise: ${error}`);
  };

  // Get real-time ETH price
  const { price: ethPrice } = useWethPrice();
  const currentPrice = ethPrice?.price || 3836.50; // Fallback to default if no price data

  if (!address) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-yellow-500">Your Portfolio</h2>
          <div className="text-center py-8">
            <div className="text-blue-300 mb-4">
              Please connect your wallet to view your portfolio.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-800 rounded-lg p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-blue-700 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="h-20 bg-blue-700 rounded"></div>
              <div className="h-20 bg-blue-700 rounded"></div>
            </div>
            <div className="space-y-4">
              <div className="h-32 bg-blue-700 rounded"></div>
              <div className="h-32 bg-blue-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-yellow-500">Your Portfolio</h2>
          <div className="bg-red-600/20 border border-red-500 rounded-lg p-4">
            <h3 className="text-red-400 font-medium mb-2">Error Loading Portfolio</h3>
            <p className="text-red-300 text-sm">{error}</p>
            <button 
              onClick={fetchPortfolio}
              className="mt-3 text-red-400 hover:text-red-300 text-sm underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = portfolio?.stats || {
    totalPositions: 0,
    activeCommitments: 0,
    totalValueLocked: '0',
    unrealizedPnL: '0',
    totalPremiumsEarned: '0',
    totalPremiumsPaid: '0',
  };

  const pnlValue = parseFloat(stats.unrealizedPnL);
  const pnlColor = pnlValue >= 0 ? 'text-green-400' : 'text-red-400';
  const pnlSign = pnlValue >= 0 ? '+' : '';

  return (
    <div className="space-y-6">
      <div className="bg-blue-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-yellow-500">Your Portfolio</h2>
          <button 
            onClick={fetchPortfolio}
            className="text-blue-300 hover:text-white text-sm"
          >
            Refresh
          </button>
        </div>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-600/30 to-cyan-600/30 backdrop-blur-sm rounded-xl p-4 border border-blue-400/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <div className="text-cyan-300 text-sm font-medium flex items-center">
              🔐 Total Value Locked
            </div>
            <div className="text-white text-xl font-bold mt-1">${parseFloat(stats.totalValueLocked).toLocaleString()}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-600/30 to-pink-600/30 backdrop-blur-sm rounded-xl p-4 border border-purple-400/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <div className="text-purple-300 text-sm font-medium flex items-center">
              📈 Unrealized P&L
            </div>
            <div className={`text-xl font-bold mt-1 ${pnlColor}`}>
              {pnlSign}${Math.abs(pnlValue).toLocaleString()}
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-600/30 to-green-600/30 backdrop-blur-sm rounded-xl p-4 border border-emerald-400/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <div className="text-emerald-300 text-sm font-medium flex items-center">
              ⚡ Active Positions
            </div>
            <div className="text-white text-xl font-bold mt-1">{stats.totalPositions}</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-600/30 to-orange-600/30 backdrop-blur-sm rounded-xl p-4 border border-yellow-400/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <div className="text-yellow-300 text-sm font-medium flex items-center">
              🎯 Active Offers
            </div>
            <div className="text-white text-xl font-bold mt-1">{stats.activeCommitments}</div>
          </div>
        </div>

        {/* Active Options */}
        {portfolio?.activeOptions && portfolio.activeOptions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Active Options</h3>
            <div className="space-y-3">
              {portfolio.activeOptions.map((option) => {
                const amount = formatEther(BigInt(option.amount));
                const strikePrice = parseFloat(option.strike_price) / 1e18;
                const premiumAmount = formatUnits(BigInt(option.premium_amount), 6);
                const expiryDate = new Date(option.expiry_timestamp);
                const timeUntilExpiry = Math.max(0, (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                
                // Calculate current profit/loss
                let currentPnL = 0;
                if (option.option_type === 0) { // CALL
                  currentPnL = Math.max(0, currentPrice - strikePrice) * parseFloat(amount);
                } else { // PUT
                  currentPnL = Math.max(0, strikePrice - currentPrice) * parseFloat(amount);
                }
                
                if (option.position_type === 'taker') {
                  currentPnL -= parseFloat(premiumAmount);
                } else {
                  currentPnL = parseFloat(premiumAmount) - currentPnL;
                }

                const pnlColor = currentPnL >= 0 ? 'text-green-400' : 'text-red-400';
                const pnlSign = currentPnL >= 0 ? '+' : '';

                return (
                  <div key={option.position_hash} className="bg-blue-700 rounded-lg p-4 border border-blue-600">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            option.option_type === 0 
                              ? 'bg-green-600 text-green-100' 
                              : 'bg-red-600 text-red-100'
                          }`}>
                            {option.option_type_name}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            option.position_type === 'taker'
                              ? 'bg-purple-600 text-purple-100'
                              : 'bg-yellow-600 text-yellow-100'
                          }`}>
                            {option.position_type === 'taker' ? 'HOLDER' : 'PROVIDER'}
                          </span>
                        </div>
                        <div className="text-white font-medium">{amount} WETH</div>
                        <div className="text-blue-200 text-sm">Strike: ${strikePrice.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${pnlColor}`}>
                          {pnlSign}${Math.abs(currentPnL).toFixed(2)}
                        </div>
                        <div className="text-blue-200 text-sm">Current P&L</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm text-blue-200 mb-3">
                      <span>Expires in: {timeUntilExpiry.toFixed(1)} days</span>
                      <span>Premium: ${premiumAmount} USDC</span>
                    </div>
                    
                    {option.position_type === 'taker' && currentPnL > 0 && timeUntilExpiry > 0 && (
                      <ExerciseOptionButton
                        option={{
                          positionHash: option.position_hash,
                          takerAddress: option.user_address as `0x${string}`,
                          lpAddress: '0x0' as `0x${string}`, // Will be filled from contract
                          assetAddress: option.asset_address as `0x${string}`,
                          amount: BigInt(option.amount),
                          strikePrice: BigInt(option.strike_price),
                          premiumPaidUsdc: BigInt(option.premium_amount),
                          optionType: option.option_type,
                          expiryTimestamp: expiryDate,
                          exerciseStatus: option.exercise_status,
                        }}
                        currentPrice={currentPrice}
                        onSuccess={handleExerciseSuccess}
                        onError={handleExerciseError}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Commitments */}
        {portfolio?.activeCommitments && portfolio.activeCommitments.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Your LP Offers (Available to Take)</h3>
            <div className="space-y-3">
              {portfolio.activeCommitments.map((commitment) => {
                const amount = formatEther(BigInt(commitment.amount));
                const dailyPremium = formatUnits(BigInt(commitment.dailyPremiumUsdc), 6);
                const expiryDate = new Date(parseInt(commitment.expiry) * 1000);
                const timeUntilExpiry = Math.max(0, (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                return (
                  <div key={commitment.id} className="bg-blue-700 rounded-lg p-4 border border-blue-600">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            commitment.optionType === 0 
                              ? 'bg-green-600 text-green-100' 
                              : 'bg-red-600 text-red-100'
                          }`}>
                            {commitment.optionType === 0 ? 'CALL' : 'PUT'}
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-600 text-yellow-100">
                            LP OFFER
                          </span>
                        </div>
                        <div className="text-white font-medium">{amount} WETH</div>
                        <div className="text-blue-200 text-sm">
                          Duration: {commitment.minLockDays}-{commitment.maxDurationDays} days
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-yellow-500 font-bold">${dailyPremium}/day</div>
                        <div className="text-blue-200 text-sm">Daily Premium</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm text-blue-200">
                      <span>Expires in: {timeUntilExpiry.toFixed(1)} days</span>
                      <span>Collateral: ${(parseFloat(amount) * currentPrice).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!portfolio?.activeOptions?.length && !portfolio?.activeCommitments?.length) && (
          <div className="text-center py-8">
            <div className="text-blue-300 mb-4">
              No active positions or commitments found.
            </div>
            <p className="text-blue-400 text-sm">
              Create LP commitments or take options to start building your portfolio.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}