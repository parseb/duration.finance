'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import { SignedOptionCommitment, OptionCommitment, CommitmentType, OptionType, DURATION_DOMAIN, COMMITMENT_TYPES } from '../../lib/eip712/verification';
import { useWethPrice } from '../../hooks/use-prices';

interface MakeCommitmentFormProps {
  onSuccess?: (commitmentId: string) => void;
  onError?: (error: string) => void;
}

export function MakeCommitmentForm({ onSuccess, onError }: MakeCommitmentFormProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { price: wethPrice, isLoading: isPriceLoading, error: priceError } = useWethPrice();
  const { signTypedData, isLoading: isSigning, data: signature, error: signError } = useSignTypedData();
  
  // Helper function to validate and normalize address
  const getValidAddress = (): string | null => {
    if (!address || typeof address !== 'string') return null;
    if (address === '0x0' || address === '0x') return null;
    if (!address.startsWith('0x') || address.length !== 42) return null;
    return address;
  };
  
  const validAddress = getValidAddress();
  
  // Form state
  const [amount, setAmount] = useState('');
  const [premiumAmount, setPremiumAmount] = useState('');
  const [durationRange, setDurationRange] = useState([1, 7]); // [min, max] days
  const [optionType, setOptionType] = useState<'CALL' | 'PUT'>('CALL');
  const [commitmentType, setCommitmentType] = useState<'OFFER' | 'DEMAND'>('OFFER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState<OptionCommitment | null>(null);
  
  // Get real-time WETH price from our pricing API
  const currentPrice = wethPrice?.price || 3836.50; // Fallback to last known price
  const amountNum = parseFloat(amount) || 0;
  const premiumNum = parseFloat(premiumAmount) || 0;
  const [minDuration, maxDuration] = durationRange;
  
  // Calculate metrics based on commitment type
  const totalCollateral = amountNum * currentPrice;
  const isOffer = commitmentType === 'OFFER';
  
  // For LP offers: premium is daily rate, calculate range
  // For Taker demands: premium is total amount for specific duration
  const minPremiumEarned = isOffer ? (premiumNum * minDuration) : premiumNum;
  const maxPremiumEarned = isOffer ? (premiumNum * maxDuration) : premiumNum;
  const dailyYield = totalCollateral > 0 && isOffer 
    ? ((premiumNum / totalCollateral) * 100) 
    : totalCollateral > 0 && !isOffer 
      ? ((premiumNum / totalCollateral / ((minDuration + maxDuration) / 2)) * 100)
      : 0;
  const annualizedYield = dailyYield * 365;

  // Validation
  const MIN_WETH = 0.001;
  const MAX_WETH = 1;
  const MIN_PREMIUM = 0.01;
  
  // Enhanced validation including proper address check
  const isValid = 
    amountNum >= MIN_WETH && amountNum <= MAX_WETH &&
    premiumNum >= MIN_PREMIUM &&
    minDuration >= 1 && maxDuration <= 365 &&
    minDuration <= maxDuration &&
    isConnected &&
    validAddress !== null;

  // Handle signature completion and API submission
  useEffect(() => {
    if (signature && pendingCommitment) {
      submitCommitmentToAPI(pendingCommitment, signature);
    }
  }, [signature, pendingCommitment]);

  // Handle signing errors
  useEffect(() => {
    if (signError) {
      console.error('Signing error:', signError);
      onError?.('Failed to sign commitment. Please try again.');
      setIsSubmitting(false);
      setPendingCommitment(null);
    }
  }, [signError, onError]);

  // Submit signed commitment to API
  const submitCommitmentToAPI = async (commitmentData: OptionCommitment, signature: `0x${string}`) => {
    try {
      const commitment: SignedOptionCommitment = {
        ...commitmentData,
        signature,
      };

      // Convert BigInt values to strings for JSON serialization
      const commitmentForAPI = {
        creator: commitment.creator,
        asset: commitment.asset,
        amount: commitment.amount.toString(),
        premiumAmount: commitment.premiumAmount.toString(),
        minDurationDays: commitment.minDurationDays.toString(),
        maxDurationDays: commitment.maxDurationDays.toString(),
        optionType: commitment.optionType,
        commitmentType: commitment.commitmentType,
        expiry: commitment.expiry.toString(),
        nonce: commitment.nonce.toString(),
        signature: commitment.signature,
      };

      // Debug the final payload
      console.log('Debug - Final API payload:', commitmentForAPI);

      // Store commitment via API (internal access)
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
      
      // Reset form state
      setAmount('');
      setPremiumAmount('');
      setDurationRange([1, 7]);
      setPendingCommitment(null);
      
    } catch (error) {
      console.error('Failed to create commitment:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to create commitment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dual knob slider handlers
  const handleMinDurationChange = useCallback((value: number) => {
    setDurationRange([Math.min(value, maxDuration), maxDuration]);
  }, [maxDuration]);

  const handleMaxDurationChange = useCallback((value: number) => {
    setDurationRange([minDuration, Math.max(value, minDuration)]);
  }, [minDuration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Debug logging
    console.log('Debug - Raw address:', address);
    console.log('Debug - Valid address:', validAddress);
    console.log('Debug - isConnected:', isConnected);
    console.log('Debug - Address type:', typeof address);
    
    // Enhanced wallet validation using validAddress
    if (!isConnected) {
      onError?.('Please connect your wallet first');
      return;
    }

    if (!validAddress) {
      onError?.('Invalid wallet address. Please disconnect and reconnect your wallet.');
      return;
    }

    if (!isValid) {
      onError?.('Please fill all fields correctly');
      return;
    }

    setIsSubmitting(true);

    try {
      const WETH_BASE = '0x4200000000000000000000000000000000000006';
      const expiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
      const nonce = Math.floor(Math.random() * 1000000); // Random nonce

      // Create the commitment data for signing
      const commitmentData: OptionCommitment = {
        creator: validAddress as `0x${string}`,
        asset: WETH_BASE as `0x${string}`,
        amount: parseEther(amount),
        premiumAmount: parseUnits(premiumAmount, 6), // USDC has 6 decimals
        minDurationDays: BigInt(minDuration),
        maxDurationDays: BigInt(maxDuration),
        optionType: optionType === 'CALL' ? OptionType.CALL : OptionType.PUT,
        commitmentType: commitmentType === 'OFFER' ? CommitmentType.LP_OFFER : CommitmentType.TAKER_DEMAND,
        expiry: BigInt(expiry),
        nonce: BigInt(nonce),
      };

      // Get the correct domain for the current chain
      const domain = {
        ...DURATION_DOMAIN,
        chainId: chainId,
        verifyingContract: (process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA || '0x0') as `0x${string}`,
      };

      console.log('Debug - About to sign with domain:', domain);
      console.log('Debug - Commitment data:', commitmentData);

      // Store commitment data and initiate signing
      setPendingCommitment(commitmentData);
      
      // Sign the commitment using the wallet
      signTypedData({
        domain,
        types: COMMITMENT_TYPES,
        primaryType: 'OptionCommitment',
        message: commitmentData,
      });
    } catch (error) {
      console.error('Failed to prepare commitment:', error);
      onError?.('Failed to prepare commitment. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gradient-to-br from-purple-800/50 via-blue-800/50 to-orange-800/30 backdrop-blur-lg rounded-2xl p-8 border border-purple-500/20 shadow-2xl shadow-orange-500/5">
        <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent flex items-center">
          ⚡ Create Commitment
        </h2>
        <p className="text-purple-200 mb-8 bg-purple-500/10 p-4 rounded-xl border border-purple-500/20">
          <span className="font-semibold">
            {commitmentType === 'OFFER' ? '🎯 ' : '🚀 '}
            Create a {commitmentType.toLowerCase()} for others to take.
          </span>
          <br />
          <span className="text-sm opacity-80">
            {isOffer ? 'Set your daily premium rate and duration range.' : 'Specify the premium you\'re willing to pay for specific duration.'}
          </span>
        </p>
        
        {/* Current Price Display */}
        <div className={`bg-gradient-to-r backdrop-blur-sm rounded-2xl p-6 mb-6 border shadow-lg hover:shadow-xl transition-all duration-300 ${
          isPriceLoading 
            ? 'from-purple-600/30 to-blue-600/30 border-purple-500/30'
            : priceError 
            ? 'from-red-600/30 to-pink-600/30 border-red-500/30'
            : wethPrice?.source === '1inch'
            ? 'from-emerald-600/30 to-green-600/30 border-emerald-500/30'
            : 'from-orange-600/30 to-yellow-600/30 border-orange-500/30'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-medium ${
                  isPriceLoading ? 'text-purple-300' : 
                  priceError ? 'text-red-300' :
                  wethPrice?.source === '1inch' ? 'text-emerald-300' : 'text-orange-300'
                }`}>
                  ⚡ Current WETH Price
                </span>
                {isPriceLoading && (
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                )}
                {!isPriceLoading && wethPrice && (
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    wethPrice.source === '1inch' ? 'bg-green-400' : 'bg-orange-400'
                  }`}></div>
                )}
              </div>
              <div className={`text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${
                isPriceLoading ? 'from-purple-400 to-blue-400' :
                priceError ? 'from-red-400 to-pink-400' :
                wethPrice?.source === '1inch' ? 'from-green-400 to-emerald-400' : 'from-orange-400 to-yellow-400'
              }`}>
                {isPriceLoading ? 'Loading...' : 
                 priceError ? 'Price Error' :
                 `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              {!isPriceLoading && wethPrice && (
                <div className={`text-xs mt-1 ${
                  wethPrice.source === '1inch' ? 'text-emerald-400' : 'text-orange-400'
                }`}>
                  {wethPrice.source === '1inch' ? '🔴 Live from 1inch' : '📦 Cached price'}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className={`text-sm font-medium mb-2 ${
                isPriceLoading ? 'text-purple-300' : 
                priceError ? 'text-red-300' :
                wethPrice?.source === '1inch' ? 'text-emerald-300' : 'text-orange-300'
              }`}>
                🎯 Strike Price
              </div>
              <div className="text-yellow-400 font-bold bg-yellow-500/20 px-3 py-2 rounded-xl border border-yellow-400/30">
                Market Price @ Taking
              </div>
            </div>
          </div>
        </div>
        
        {/* Wallet Status Debug */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-800 rounded-lg p-3 mb-6 text-xs">
            <div className="text-gray-300">Debug Info:</div>
            <div className="text-gray-400">Connected: {isConnected ? 'Yes' : 'No'}</div>
            <div className="text-gray-400">Chain ID: {chainId}</div>
            <div className="text-gray-400">Raw Address: {address || 'undefined'}</div>
            <div className="text-gray-400">Valid Address: {validAddress || 'null'}</div>
            <div className="text-gray-400">Form Valid: {isValid ? 'Yes' : 'No'}</div>
            <div className="text-gray-400">Signing: {isSigning ? 'Yes' : 'No'}</div>
            <div className="text-gray-400">Has Signature: {signature ? 'Yes' : 'No'}</div>
            <div className="text-gray-400">Pending Commitment: {pendingCommitment ? 'Yes' : 'No'}</div>
            {signError && <div className="text-red-400">Sign Error: {signError.message}</div>}
          </div>
        )}
        
        <div className="space-y-4">
          {/* Option Type and Commitment Type Toggle Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-3 text-purple-300">🎯 Option Type</label>
              <div className="flex bg-gradient-to-r from-purple-800/50 to-blue-800/50 backdrop-blur-sm rounded-xl p-1 border border-purple-500/30">
                <button
                  type="button"
                  onClick={() => setOptionType('CALL')}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-105 ${
                    optionType === 'CALL'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30'
                      : 'text-purple-200 hover:text-white hover:bg-gradient-to-r hover:from-green-500/20 hover:to-emerald-500/20'
                  }`}
                >
                  📈 CALL
                </button>
                <button
                  type="button"
                  onClick={() => setOptionType('PUT')}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-105 ${
                    optionType === 'PUT'
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/30'
                      : 'text-purple-200 hover:text-white hover:bg-gradient-to-r hover:from-red-500/20 hover:to-pink-500/20'
                  }`}
                >
                  📉 PUT
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-3 text-purple-300">💡 Commitment Type</label>
              <div className="flex bg-gradient-to-r from-purple-800/50 to-blue-800/50 backdrop-blur-sm rounded-xl p-1 border border-purple-500/30">
                <button
                  type="button"
                  onClick={() => setCommitmentType('OFFER')}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-105 ${
                    commitmentType === 'OFFER'
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30'
                      : 'text-purple-200 hover:text-white hover:bg-gradient-to-r hover:from-orange-500/20 hover:to-orange-600/20'
                  }`}
                >
                  🎯 OFFER
                </button>
                <button
                  type="button"
                  onClick={() => setCommitmentType('DEMAND')}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-105 ${
                    commitmentType === 'DEMAND'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                      : 'text-purple-200 hover:text-white hover:bg-gradient-to-r hover:from-purple-500/20 hover:to-pink-500/20'
                  }`}
                >
                  🚀 DEMAND
                </button>
              </div>
            </div>
          </div>
          
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
            <label className="block text-sm font-medium mb-2">
              Premium ({isOffer ? 'USDC per day' : 'Total USDC'})
            </label>
            <input
              type="number"
              value={premiumAmount}
              onChange={(e) => setPremiumAmount(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder={isOffer ? "50" : "350"}
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
          
          {/* Duration Range Slider */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Duration Range: {minDuration} - {maxDuration} days
            </label>
            <div className="bg-blue-700 p-4 rounded-lg space-y-4">
              {/* Min Duration Slider */}
              <div>
                <label className="block text-xs text-blue-300 mb-1">Minimum Duration: {minDuration} days</label>
                <input
                  type="range"
                  min="1"
                  max="365"
                  value={minDuration}
                  onChange={(e) => handleMinDurationChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #eab308 0%, #eab308 ${(minDuration - 1) / 364 * 100}%, #2563eb ${(minDuration - 1) / 364 * 100}%, #2563eb 100%)`
                  }}
                />
              </div>
              
              {/* Max Duration Slider */}
              <div>
                <label className="block text-xs text-blue-300 mb-1">Maximum Duration: {maxDuration} days</label>
                <input
                  type="range"
                  min="1"
                  max="365"
                  value={maxDuration}
                  onChange={(e) => handleMaxDurationChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${(maxDuration - 1) / 364 * 100}%, #eab308 ${(maxDuration - 1) / 364 * 100}%, #eab308 100%)`
                  }}
                />
              </div>
              
              {/* Duration scale */}
              <div className="flex justify-between text-xs text-blue-300 mt-2">
                <span>1d</span>
                <span>30d</span>
                <span>90d</span>
                <span>180d</span>
                <span>365d</span>
              </div>
            </div>
          </div>
          
          {/* Premium Range Display */}
          {premiumNum > 0 && (
            <div className="bg-blue-700 rounded-lg p-4">
              <div className="text-sm font-medium mb-2 text-blue-200">
                {isOffer ? 'Premium Earnings Range' : 'Premium Cost'}
              </div>
              {isOffer ? (
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-white font-bold">${minPremiumEarned.toFixed(2)}</div>
                    <div className="text-blue-300 text-xs">{minDuration} day minimum</div>
                  </div>
                  <div className="text-blue-400">to</div>
                  <div className="text-right">
                    <div className="text-white font-bold">${maxPremiumEarned.toFixed(2)}</div>
                    <div className="text-blue-300 text-xs">{maxDuration} day maximum</div>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-white font-bold">${premiumNum.toFixed(2)}</div>
                  <div className="text-blue-300 text-xs">Total premium willing to pay</div>
                </div>
              )}
            </div>
          )}
          
        </div>
        
        <button 
          type="submit"
          disabled={!isValid || isSubmitting || isSigning}
          className="w-full mt-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 hover:shadow-lg disabled:transform-none disabled:shadow-none shadow-lg shadow-orange-500/30"
        >
          <div className="flex items-center justify-center space-x-2">
            <span className="text-xl">
              {isSigning ? '✍️' : isSubmitting ? '⚡' : commitmentType === 'OFFER' ? '🎯' : '🚀'}
            </span>
            <span>
              {isSigning ? 'Please sign in wallet...' : 
               isSubmitting ? 'Creating Commitment...' : 
               `Create ${commitmentType} Commitment`}
            </span>
          </div>
        </button>

        {!isConnected && (
          <div className="mt-6 p-4 bg-gradient-to-r from-red-600/20 to-pink-600/20 border border-red-500/50 rounded-2xl backdrop-blur-sm">
            <p className="text-red-300 text-sm font-medium flex items-center">
              🔒 Please connect your wallet to create a commitment
            </p>
          </div>
        )}
        
        {isConnected && !validAddress && (
          <div className="mt-6 p-4 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/50 rounded-2xl backdrop-blur-sm">
            <p className="text-yellow-300 text-sm font-medium">
              ⚠️ Wallet connection issue detected. Please disconnect and reconnect your wallet.
              {address && <span className="block text-xs mt-2 opacity-75">Current address: {address}</span>}
            </p>
          </div>
        )}
      </div>
    </form>
  );
}