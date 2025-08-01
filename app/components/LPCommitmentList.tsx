'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { SignedLPCommitment } from '../../lib/eip712/verification';
import { formatEther, formatUnits } from 'viem';

interface LPCommitmentListProps {
  showOnlyMyCommitments?: boolean;
  onCancel?: (commitmentId: string) => void;
}

export function LPCommitmentList({ showOnlyMyCommitments = false, onCancel }: LPCommitmentListProps) {
  const { address } = useAccount();
  const [commitments, setCommitments] = useState<SignedLPCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    fetchCommitments();
  }, [address, showOnlyMyCommitments]);

  const fetchCommitments = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = showOnlyMyCommitments && address
        ? `/api/commitments?lp=${address}`
        : '/api/commitments';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch commitments');
      }

      const data = await response.json();
      setCommitments(data.commitments || []);
    } catch (err) {
      console.error('Error fetching commitments:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (commitmentId: string) => {
    if (!confirm('Are you sure you want to cancel this commitment?')) {
      return;
    }

    try {
      setCancelling(commitmentId);

      const response = await fetch(`/api/commitments/${commitmentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel commitment');
      }

      // Remove from local state
      setCommitments(prev => prev.filter(c => hashCommitment(c) !== commitmentId));
      
      onCancel?.(commitmentId);
    } catch (err) {
      console.error('Error cancelling commitment:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel commitment');
    } finally {
      setCancelling(null);
    }
  };

  // Helper to create commitment ID (same as hashLPCommitment)
  const hashCommitment = (commitment: SignedLPCommitment): string => {
    const data = JSON.stringify({
      lp: commitment.lp,
      asset: commitment.asset,
      amount: commitment.amount.toString(),
      dailyPremiumUsdc: commitment.dailyPremiumUsdc.toString(),
      minLockDays: commitment.minLockDays.toString(),
      maxDurationDays: commitment.maxDurationDays.toString(),
      optionType: commitment.optionType,
      expiry: commitment.expiry.toString(),
      nonce: commitment.nonce.toString(),
      isFramentable: commitment.isFramentable,
    });
    return Buffer.from(data).toString('base64');
  };

  const isExpired = (expiry: bigint): boolean => {
    return expiry <= BigInt(Math.floor(Date.now() / 1000));
  };

  const formatExpiry = (expiry: bigint): string => {
    const date = new Date(Number(expiry) * 1000);
    return date.toLocaleString();
  };

  const calculateYield = (commitment: SignedLPCommitment, currentPrice: number): number => {
    const collateralValue = Number(formatEther(commitment.amount)) * currentPrice;
    const dailyPremium = Number(formatUnits(commitment.dailyPremiumUsdc, 6));
    return collateralValue > 0 ? (dailyPremium / collateralValue) * 100 : 0;
  };

  if (loading) {
    return (
      <div className="bg-blue-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-blue-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-blue-700 rounded"></div>
            <div className="h-20 bg-blue-700 rounded"></div>
            <div className="h-20 bg-blue-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-blue-800 rounded-lg p-6">
        <div className="bg-red-600/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-400 font-medium mb-2">Error Loading Commitments</h3>
          <p className="text-red-300 text-sm">{error}</p>
          <button 
            onClick={fetchCommitments}
            className="mt-3 text-red-400 hover:text-red-300 text-sm underline"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (commitments.length === 0) {
    return (
      <div className="bg-blue-800 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-2 text-yellow-500">
          {showOnlyMyCommitments ? 'Your LP Commitments' : 'Available LP Commitments'}
        </h3>
        <div className="text-center py-8">
          <div className="text-blue-300 mb-4">
            {showOnlyMyCommitments 
              ? "You haven't created any commitments yet."
              : "No active commitments available."
            }
          </div>
          {showOnlyMyCommitments && (
            <p className="text-blue-400 text-sm">
              Create your first commitment above to start earning yield.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-yellow-500">
          {showOnlyMyCommitments ? 'Your LP Commitments' : 'Available LP Commitments'}
        </h3>
        <button 
          onClick={fetchCommitments}
          className="text-blue-300 hover:text-white text-sm"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-4">
        {commitments.map((commitment) => {
          const commitmentId = hashCommitment(commitment);
          const expired = isExpired(commitment.expiry);
          const currentPrice = 3836.50; // Mock price
          const dailyYield = calculateYield(commitment, currentPrice);
          const annualizedYield = dailyYield * 365;
          const isMyCommitment = address && commitment.lp.toLowerCase() === address.toLowerCase();
          
          return (
            <div 
              key={commitmentId}
              className={`border rounded-lg p-4 ${
                expired 
                  ? 'border-red-500 bg-red-600/10' 
                  : 'border-blue-600 bg-blue-700'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      commitment.optionType === 0 
                        ? 'bg-green-600 text-green-100' 
                        : 'bg-red-600 text-red-100'
                    }`}>
                      {commitment.optionType === 0 ? 'CALL' : 'PUT'}
                    </span>
                    {expired && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-red-100">
                        EXPIRED
                      </span>
                    )}
                    {commitment.isFramentable && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-blue-600 text-blue-100">
                        FRACTIONABLE
                      </span>
                    )}
                  </div>
                  <div className="text-white font-medium mt-1">
                    {formatEther(commitment.amount)} WETH
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-500 font-bold">
                    ${formatUnits(commitment.dailyPremiumUsdc, 6)}/day
                  </div>
                  <div className="text-blue-300 text-sm">
                    {dailyYield.toFixed(2)}% daily
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-300">Duration: </span>
                  <span className="text-white">
                    {commitment.minLockDays.toString()}-{commitment.maxDurationDays.toString()} days
                  </span>
                </div>
                <div>
                  <span className="text-blue-300">Annualized: </span>
                  <span className="text-green-400 font-medium">
                    {annualizedYield.toFixed(1)}%
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-blue-300">LP: </span>
                  <span className="text-white font-mono text-xs">
                    {commitment.lp.slice(0, 6)}...{commitment.lp.slice(-4)}
                  </span>
                  {isMyCommitment && (
                    <span className="ml-2 px-2 py-1 rounded text-xs bg-yellow-600 text-yellow-100">
                      YOU
                    </span>
                  )}
                </div>
                <div className="col-span-2">
                  <span className="text-blue-300">Expires: </span>
                  <span className={expired ? 'text-red-400' : 'text-white'}>
                    {formatExpiry(commitment.expiry)}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <div className="text-xs text-blue-400">
                  Collateral: ${(Number(formatEther(commitment.amount)) * currentPrice).toLocaleString()}
                </div>
                
                <div className="flex space-x-2">
                  {!showOnlyMyCommitments && !expired && (
                    <button className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-blue-900 text-sm font-medium rounded">
                      Take Option
                    </button>
                  )}
                  
                  {isMyCommitment && !expired && (
                    <button 
                      onClick={() => handleCancel(commitmentId)}
                      disabled={cancelling === commitmentId}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white text-sm font-medium rounded disabled:cursor-not-allowed"
                    >
                      {cancelling === commitmentId ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}