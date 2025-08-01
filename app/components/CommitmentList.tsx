'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { SignedOptionCommitment, CommitmentType } from '../../lib/eip712/verification';
import { formatEther, formatUnits } from 'viem';
import { TakeCommitmentButton } from './TakeCommitmentButton';

interface CommitmentListProps {
  showOnlyMyCommitments?: boolean;
  commitmentType?: 'OFFER' | 'DEMAND' | 'ALL';
  onCancel?: (commitmentId: string) => void;
}

export function CommitmentList({ 
  showOnlyMyCommitments = false, 
  commitmentType = 'ALL',
  onCancel 
}: CommitmentListProps) {
  const { address } = useAccount();
  const [commitments, setCommitments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(7);

  useEffect(() => {
    fetchCommitments();
  }, [address, showOnlyMyCommitments, commitmentType]);

  const fetchCommitments = async () => {
    try {
      setLoading(true);
      setError(null);

      let url = '/api/commitments';
      const params = new URLSearchParams();

      if (showOnlyMyCommitments && address) {
        params.append('creator', address);
      }

      if (commitmentType !== 'ALL') {
        params.append('type', commitmentType.toLowerCase());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

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

      const response = await fetch(`/api/commitments?id=${commitmentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel commitment');
      }

      // Remove from local state using database ID
      setCommitments(prev => prev.filter(c => c.id !== commitmentId));
      
      onCancel?.(commitmentId);
    } catch (err) {
      console.error('Error cancelling commitment:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel commitment');
    } finally {
      setCancelling(null);
    }
  };

  // Helper to create commitment ID - handles both BigInt and string values
  const hashCommitment = (commitment: any): string => {
    // Safe toString that handles both BigInt and string values
    const safeToString = (value: any): string => {
      if (value === null || value === undefined) return '0';
      if (typeof value === 'string') return value;
      if (typeof value === 'bigint') return value.toString();
      return String(value);
    };

    const data = JSON.stringify({
      creator: commitment.creator || commitment.lp,  // Handle both formats
      asset: commitment.asset,
      amount: safeToString(commitment.amount),
      premiumAmount: safeToString(commitment.premiumAmount || commitment.dailyPremiumUsdc),
      minDurationDays: safeToString(commitment.minDurationDays || commitment.minLockDays),
      maxDurationDays: safeToString(commitment.maxDurationDays),
      optionType: commitment.optionType,
      commitmentType: commitment.commitmentType || 0, // Default to LP_OFFER
      expiry: safeToString(commitment.expiry),
      nonce: safeToString(commitment.nonce),
      isFramentable: commitment.isFramentable,
    });
    return Buffer.from(data).toString('base64');
  };

  const isExpired = (expiry: bigint | string): boolean => {
    const expiryNum = typeof expiry === 'string' ? BigInt(expiry) : expiry;
    return expiryNum <= BigInt(Math.floor(Date.now() / 1000));
  };

  const formatExpiry = (expiry: bigint | string): string => {
    const expiryNum = typeof expiry === 'string' ? BigInt(expiry) : expiry;
    const date = new Date(Number(expiryNum) * 1000);
    return date.toLocaleString();
  };

  const calculateYield = (commitment: any, currentPrice: number): number => {
    // Handle both string and BigInt values safely
    const getAmount = (value: any): bigint => {
      if (typeof value === 'string') return BigInt(value);
      if (typeof value === 'bigint') return value;
      return BigInt(0);
    };

    const amount = getAmount(commitment.amount);
    const collateralValue = Number(formatEther(amount)) * currentPrice;
    const isOffer = (commitment.commitmentType || 0) === CommitmentType.LP_OFFER;
    
    if (!isOffer) return 0; // Taker demands don't have yield
    
    // Handle both unified and legacy formats
    const premiumAmount = getAmount(commitment.premiumAmount || commitment.dailyPremiumUsdc || 0);
    const dailyPremium = Number(formatUnits(premiumAmount, 6));
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
          {showOnlyMyCommitments ? 'Your Commitments' : `Available ${commitmentType === 'ALL' ? '' : commitmentType.toLowerCase() + ' '}Commitments`}
        </h3>
        <div className="text-center py-8">
          <div className="text-blue-300 mb-4">
            {showOnlyMyCommitments 
              ? "You haven't created any commitments yet."
              : "No active commitments available."}
          </div>
          {showOnlyMyCommitments && (
            <p className="text-blue-400 text-sm">
              Create your first commitment above to start trading.
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
          {showOnlyMyCommitments ? 'Your Commitments' : `Available ${commitmentType === 'ALL' ? '' : commitmentType.toLowerCase() + ' '}Commitments`}
        </h3>
        <button 
          onClick={fetchCommitments}
          className="text-blue-300 hover:text-white text-sm"
        >
          Refresh
        </button>
      </div>
      
      {!showOnlyMyCommitments && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Duration for calculation</label>
          <input
            type="number"
            min="1"
            max="365"
            value={selectedDuration}
            onChange={(e) => setSelectedDuration(parseInt(e.target.value))}
            className="w-32 bg-blue-700 border border-blue-600 rounded px-3 py-1 text-white text-sm"
          />
          <span className="text-blue-300 text-sm ml-2">days</span>
        </div>
      )}
      
      <div className="space-y-4">
        {commitments.map((commitment) => {
          const commitmentId = commitment.id || hashCommitment(commitment); // Use database ID if available
          const expired = isExpired(commitment.expiry);
          const currentPrice = 3836.50; // Mock price
          const isOffer = (commitment.commitmentType || 0) === CommitmentType.LP_OFFER;
          const isDemand = (commitment.commitmentType || 0) === CommitmentType.TAKER_DEMAND;
          const dailyYield = calculateYield(commitment, currentPrice);
          const annualizedYield = dailyYield * 365;
          const creator = commitment.creator || commitment.lp; // Handle both formats
          const isMyCommitment = address && creator && creator.toLowerCase() === address.toLowerCase();
          
          // For offers: calculate premium for duration
          // For demands: show fixed premium
          const getAmount = (value: any): bigint => {
            if (typeof value === 'string') return BigInt(value);
            if (typeof value === 'bigint') return value;
            return BigInt(0);
          };
          
          const premiumAmount = getAmount(commitment.premiumAmount || commitment.dailyPremiumUsdc || 0);
          const displayPremium = isOffer 
            ? (Number(formatUnits(premiumAmount, 6)) * selectedDuration)
            : Number(formatUnits(premiumAmount, 6));
          
          const minDuration = Number(commitment.minDurationDays || commitment.minLockDays || 1);
          const maxDuration = Number(commitment.maxDurationDays || 7);
          
          const canTake = !showOnlyMyCommitments && 
                         !expired && 
                         !isMyCommitment &&
                         selectedDuration >= minDuration &&
                         selectedDuration <= maxDuration;
          
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
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isOffer 
                        ? 'bg-yellow-600 text-yellow-100' 
                        : 'bg-purple-600 text-purple-100'
                    }`}>
                      {isOffer ? 'OFFER' : 'DEMAND'}
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
                    {formatEther(getAmount(commitment.amount))} WETH
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-500 font-bold">
                    ${displayPremium.toFixed(2)} USDC
                  </div>
                  <div className="text-blue-300 text-sm">
                    {isOffer ? `${selectedDuration}d × ${formatUnits(premiumAmount, 6)}/day` : 'Total premium'}
                  </div>
                  {isOffer && dailyYield > 0 && (
                    <div className="text-green-400 text-xs">
                      {dailyYield.toFixed(2)}% daily
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-300">Duration: </span>
                  <span className="text-white">
                    {minDuration}-{maxDuration} days
                  </span>
                </div>
                {isOffer && annualizedYield > 0 && (
                  <div>
                    <span className="text-blue-300">Annualized: </span>
                    <span className="text-green-400 font-medium">
                      {annualizedYield.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-blue-300">Creator: </span>
                  <span className="text-white font-mono text-xs">
                    {creator.slice(0, 6)}...{creator.slice(-4)}
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
                  {canTake && (
                    <TakeCommitmentButton
                      commitment={{
                        lp: commitment.creator, // Map creator to lp for backward compatibility
                        asset: commitment.asset,
                        amount: commitment.amount,
                        dailyPremiumUsdc: commitment.premiumAmount,
                        minLockDays: commitment.minDurationDays,
                        maxDurationDays: commitment.maxDurationDays,
                        optionType: commitment.optionType,
                        expiry: commitment.expiry,
                        nonce: commitment.nonce,
                        isFramentable: commitment.isFramentable,
                        signature: commitment.signature,
                      }}
                      durationDays={selectedDuration}
                      onSuccess={(optionId) => {
                        console.log('Option taken:', optionId);
                        fetchCommitments(); // Refresh list
                      }}
                      onError={(error) => {
                        console.error('Take option failed:', error);
                        alert(`Failed to take option: ${error}`);
                      }}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded"
                    />
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