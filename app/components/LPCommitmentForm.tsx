'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits, Address } from 'viem';
import { LPCommitmentStruct, createLPCommitmentMessage, signLPCommitment } from '../../lib/eip712/lp-commitment';
import { SUPPORTED_ASSETS, DURATION_LIMITS, PREMIUM_LIMITS, POSITION_LIMITS } from '../../lib/api/duration-options';
import { useX402API, X402PaymentInfo } from '../../lib/x402/client';

interface LPCommitmentFormProps {
  onSuccess?: (commitmentHash: string) => void;
  onError?: (error: string) => void;
}

export function LPCommitmentForm({ onSuccess, onError }: LPCommitmentFormProps) {
  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();
  const { createLPCommitmentWithPayment } = useX402API();
  
  // Form state
  const [amount, setAmount] = useState('');
  const [dailyPremium, setDailyPremium] = useState('');
  const [minLockDays, setMinLockDays] = useState('1');
  const [maxDuration, setMaxDuration] = useState('7');
  const [optionType, setOptionType] = useState<'CALL' | 'PUT'>('CALL');
  const [isFramentable, setIsFramentable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<X402PaymentInfo | null>(null);
  
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

  // Validation
  const isValid = 
    amountNum >= POSITION_LIMITS.MIN_WETH && amountNum <= POSITION_LIMITS.MAX_WETH &&
    dailyPremiumNum >= PREMIUM_LIMITS.MIN_DAILY_USDC &&
    minLockNum >= DURATION_LIMITS.MIN_DAYS &&
    maxDurationNum <= DURATION_LIMITS.MAX_DAYS &&
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
      // Create commitment message for signing
      const message = createLPCommitmentMessage({
        lp: address,
        asset: SUPPORTED_ASSETS.WETH,
        amount: amount,
        dailyPremiumUsdc: dailyPremium,
        minLockDays: minLockNum,
        maxDurationDays: maxDurationNum,
        optionType: optionType,
        expiryHours: 24, // 24 hour expiry
      });

      // For now, create a mock signature - in production, would use wallet signing
      const mockSignature = '0x' + '0'.repeat(130) as `0x${string}`;
      
      const commitment: LPCommitmentStruct = {
        lp: address,
        asset: SUPPORTED_ASSETS.WETH,
        amount: parseEther(amount).toString(),
        dailyPremiumUsdc: parseUnits(dailyPremium, 6).toString(), // USDC has 6 decimals
        minLockDays: minLockNum,
        maxDurationDays: maxDurationNum,
        optionType: optionType === 'CALL' ? 0 : 1,
        expiry: message.expiry.toString(),
        nonce: message.nonce.toString(),
        isFramentable: isFramentable,
        signature: mockSignature,
      };

      // Use x402 API client for database storage (requires 1 USDC payment)
      const result = await createLPCommitmentWithPayment(
        commitment,
        (info: X402PaymentInfo) => {
          setPaymentInfo(info);
          // Show payment required UI
        }
      );

      onSuccess?.(result.id);
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
            <label className="block text-sm font-medium mb-2">Amount ({POSITION_LIMITS.MIN_WETH} - {POSITION_LIMITS.MAX_WETH} WETH)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder={POSITION_LIMITS.MIN_WETH.toString()}
              step="0.001"
              min={POSITION_LIMITS.MIN_WETH}
              max={POSITION_LIMITS.MAX_WETH}
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