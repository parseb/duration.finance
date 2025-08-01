'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits, Address } from 'viem';
import { SignedLPCommitment, LPCommitment } from '../../lib/eip712/verification';

interface LPCommitmentFormProps {
  onSuccess?: (commitmentId: string) => void;
  onError?: (error: string) => void;
}

export function LPCommitmentForm({ onSuccess, onError }: LPCommitmentFormProps) {
  const { address, isConnected } = useAccount();
  
  // Form state
  const [amount, setAmount] = useState('');
  const [dailyPremium, setDailyPremium] = useState('');
  const [minLockDays, setMinLockDays] = useState('1');
  const [maxDuration, setMaxDuration] = useState('7');
  const [optionType, setOptionType] = useState<'CALL' | 'PUT'>('CALL');
  const [isFramentable, setIsFramentable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Mock current price - in real app this would come from 1inch API
  const currentPrice = 3836.50;
  const amountNum = parseFloat(amount) || 0;
  const dailyPremiumNum = parseFloat(dailyPremium) || 0;
  const minLockNum = parseInt(minLockDays) || 1;
  const maxDurationNum = parseInt(maxDuration) || 7;
  
  // Calculate metrics
  const totalCollateral = amountNum * currentPrice;
  const minPremiumEarned = dailyPremiumNum * minLockNum;
  const maxPremiumEarned = dailyPremiumNum * maxDurationNum;
  const dailyYield = totalCollateral > 0 ? ((dailyPremiumNum / totalCollateral) * 100) : 0;
  const annualizedYield = dailyYield * 365;

  // Constants for validation
  const WETH_BASE = '0x4200000000000000000000000000000000000006';
  const MIN_WETH = 0.001;
  const MAX_WETH = 1;
  const MIN_DAILY_USDC = 0.01;
  const MIN_DAYS = 1;
  const MAX_DAYS = 365;

  // Validation
  const isValid = 
    amountNum >= MIN_WETH && amountNum <= MAX_WETH &&
    dailyPremiumNum >= MIN_DAILY_USDC &&
    minLockNum >= MIN_DAYS &&
    maxDurationNum <= MAX_DAYS &&
    minLockNum <= maxDurationNum &&
    isConnected;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !address) {
      onError?.('Please fill all fields correctly and connect wallet');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create commitment struct
      const expiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
      const nonce = Math.floor(Math.random() * 1000000); // Random nonce

      // For now, create a mock signature - in production, would use wallet signing
      const mockSignature = '0x' + '0'.repeat(130) as `0x${string}`;
      
      const commitment: SignedLPCommitment = {
        lp: address,
        asset: WETH_BASE as `0x${string}`,
        amount: parseEther(amount),
        dailyPremiumUsdc: parseUnits(dailyPremium, 6),
        minLockDays: BigInt(minLockNum),
        maxDurationDays: BigInt(maxDurationNum),
        optionType: optionType === 'CALL' ? 0 : 1,
        expiry: BigInt(expiry),
        nonce: BigInt(nonce),
        isFramentable: isFramentable,
        signature: mockSignature,
      };

      // Convert BigInt values to strings for JSON serialization
      const commitmentForAPI = {
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
        signature: commitment.signature,
      };

      // Store commitment via API
      const response = await fetch('/api/commitments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commitmentForAPI),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to store commitment');
      }

      const result = await response.json();
      onSuccess?.(result.commitmentId);
    } catch (error) {
      console.error('Failed to create LP commitment:', error);
      onError?.('Failed to create commitment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-blue-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-yellow-500">Provide Liquidity</h2>
        <p className="text-blue-200 mb-6">Set your daily premium rate and duration. Takers pay based on how long they lock your collateral.</p>
        
        {/* Current Price Display */}
        <div className="bg-blue-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-blue-200 text-sm">Current WETH Price</div>
              <div className="text-white text-xl font-bold">${currentPrice.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-blue-200 text-sm">Strike Price</div>
              <div className="text-yellow-500 font-medium">Market Price @ Taking</div>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Asset</label>
            <div className="bg-blue-700 rounded-lg p-3">
              <span className="text-white">WETH (Wrapped Ethereum)</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Amount ({MIN_WETH} - {MAX_WETH} WETH)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder={MIN_WETH.toString()}
              step="0.001"
              min={MIN_WETH}
              max={MAX_WETH}
              required
            />
            {amountNum > 0 && (
              <div className="text-blue-300 text-sm mt-1">
                Collateral Value: ${totalCollateral.toLocaleString()}
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Daily Premium (USDC)</label>
            <input
              type="number"
              value={dailyPremium}
              onChange={(e) => setDailyPremium(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder="50"
              step="0.01"
              min="0.01"
              required
            />
            {dailyYield > 0 && (
              <div className="text-green-400 text-sm mt-1">
                Daily Yield: {dailyYield.toFixed(3)}% • Annualized: {annualizedYield.toFixed(1)}%
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Min Lock Period (days)</label>
              <input
                type="number"
                value={minLockDays}
                onChange={(e) => setMinLockDays(e.target.value)}
                className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
                placeholder="1"
                min="1"
                max={maxDuration}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Max Duration (days)</label>
              <input
                type="number"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
                placeholder="7"
                min={minLockDays}
                max="365"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Option Type</label>
            <select
              value={optionType}
              onChange={(e) => setOptionType(e.target.value as 'CALL' | 'PUT')}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="CALL">CALL (Bullish)</option>
              <option value="PUT">PUT (Bearish)</option>
            </select>
          </div>
          
          {/* Premium Range Display */}
          {dailyPremiumNum > 0 && minLockNum > 0 && (
            <div className="bg-blue-700 rounded-lg p-4">
              <div className="text-sm font-medium mb-2 text-blue-200">Premium Earnings Range</div>
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-white font-bold">${minPremiumEarned.toFixed(2)}</div>
                  <div className="text-blue-300 text-xs">{minLockNum} day minimum</div>
                </div>
                <div className="text-blue-400">to</div>
                <div className="text-right">
                  <div className="text-white font-bold">${maxPremiumEarned.toFixed(2)}</div>
                  <div className="text-blue-300 text-xs">{maxDurationNum} day maximum</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="fractionable"
              checked={isFramentable}
              onChange={(e) => setIsFramentable(e.target.checked)}
              className="rounded border-blue-600"
            />
            <label htmlFor="fractionable" className="text-sm">
              Allow partial taking
            </label>
          </div>
        </div>
        
        <button 
          type="submit"
          disabled={!isValid || isSubmitting}
          className="w-full mt-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-blue-900 font-bold rounded-lg transition-colors"
        >
          {isSubmitting ? 'Creating Commitment...' : 'Create Duration Commitment'}
        </button>

        {!isConnected && (
          <div className="mt-4 p-3 bg-red-600/20 border border-red-500 rounded-lg">
            <p className="text-red-300 text-sm">Please connect your wallet to create a commitment</p>
          </div>
        )}

        {paymentInfo && (
          <div className="mt-4 p-4 bg-yellow-600/20 border border-yellow-500 rounded-lg">
            <h4 className="text-yellow-400 font-medium mb-2">Payment Required</h4>
            <p className="text-yellow-300 text-sm mb-3">
              Creating an LP offer requires a payment of <strong>{paymentInfo.cost}</strong> to prevent spam.
            </p>
            <div className="text-xs text-yellow-300/80 space-y-1">
              <p><strong>Step 1:</strong> {paymentInfo.instructions.step1}</p>
              <p><strong>Step 2:</strong> {paymentInfo.instructions.step2}</p>
              <p><strong>Step 3:</strong> {paymentInfo.instructions.step3}</p>
            </div>
            <div className="mt-3 p-2 bg-yellow-900/30 rounded text-xs font-mono">
              <p className="text-yellow-200">Recipient: {paymentInfo.recipient}</p>
            </div>
            <button 
              onClick={() => setPaymentInfo(null)}
              className="mt-3 text-xs text-yellow-400 hover:text-yellow-300"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </form>
  );
}