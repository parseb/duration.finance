'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

interface ActiveOption {
  positionHash: string;
  takerAddress: string;
  lpAddress: string;
  assetAddress: string;
  amount: bigint;
  strikePrice: bigint;
  premiumPaidUsdc: bigint;
  optionType: number; // 0=CALL, 1=PUT
  expiryTimestamp: Date;
  exerciseStatus: string;
}

interface ExerciseOptionButtonProps {
  option: ActiveOption;
  currentPrice: number; // Current market price in USD
  onSuccess?: (transactionHash: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function ExerciseOptionButton({ 
  option, 
  currentPrice,
  onSuccess, 
  onError, 
  className = "w-full py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
}: ExerciseOptionButtonProps) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate if option is profitable
  const strikePriceUsd = Number(option.strikePrice) / 1e18; // Convert from wei to ETH, assume 1 ETH = currentPrice USD
  const isCall = option.optionType === 0;
  const isProfitable = isCall 
    ? currentPrice > strikePriceUsd 
    : currentPrice < strikePriceUsd;
  
  // Calculate potential profit
  const profitPerToken = isProfitable 
    ? Math.abs(currentPrice - strikePriceUsd)
    : 0;
  const totalProfit = profitPerToken * Number(option.amount) / 1e18;

  // Check if option is expired
  const isExpired = new Date() > option.expiryTimestamp;
  
  // Check if user can exercise (must be the taker)
  const canExercise = isConnected && 
                     address && 
                     address.toLowerCase() === option.takerAddress.toLowerCase() &&
                     option.exerciseStatus === 'active' &&
                     !isExpired &&
                     isProfitable;

  const handleExercise = async () => {
    if (!canExercise) {
      onError?.('Cannot exercise option');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get contract address from environment
      const contractAddress = process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS as `0x${string}`;
      
      if (!contractAddress) {
        throw new Error('Contract address not configured');
      }

      // Settlement parameters for 1inch execution
      const settlementParams = {
        method: 1, // UnoswapRouter
        routingData: '0x',
        minReturn: 0n, // No minimum return for now
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
      };

      // Call exerciseOption on the contract
      writeContract({
        address: contractAddress,
        abi: [
          {
            name: 'exerciseOption',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'positionHash', type: 'bytes32' },
              {
                name: 'settlementParams',
                type: 'tuple',
                components: [
                  { name: 'method', type: 'uint8' },
                  { name: 'routingData', type: 'bytes' },
                  { name: 'minReturn', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' },
                ],
              },
            ],
            outputs: [],
          },
        ],
        functionName: 'exerciseOption',
        args: [option.positionHash as `0x${string}`, settlementParams],
      });

    } catch (error) {
      console.error('Failed to exercise option:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to exercise option');
      setIsSubmitting(false);
    }
  };

  // Handle transaction success
  if (hash && !isConfirming && !isPending) {
    setIsSubmitting(false);
    onSuccess?.(hash);
  }

  // Handle transaction error
  if (!isPending && !isConfirming && hash && isSubmitting) {
    setIsSubmitting(false);
  }

  const isLoading = isPending || isConfirming || isSubmitting;

  // Different button states based on option status
  if (isExpired) {
    return (
      <button disabled className="w-full py-2 bg-gray-600 text-gray-300 font-medium rounded-lg cursor-not-allowed">
        Option Expired
      </button>
    );
  }

  if (!isProfitable) {
    return (
      <button disabled className="w-full py-2 bg-gray-600 text-gray-300 font-medium rounded-lg cursor-not-allowed">
        Not Profitable (${profitPerToken.toFixed(2)} {isCall ? 'below' : 'above'} strike)
      </button>
    );
  }

  if (!canExercise) {
    return (
      <button disabled className="w-full py-2 bg-gray-600 text-gray-300 font-medium rounded-lg cursor-not-allowed">
        Cannot Exercise
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {isProfitable && (
        <div className="text-sm text-green-400 text-center">
          Potential Profit: ${totalProfit.toFixed(2)} (+{profitPerToken.toFixed(2)} per token)
        </div>
      )}
      <button
        onClick={handleExercise}
        disabled={isLoading}
        className={`${className} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isLoading 
          ? 'Exercising Option...' 
          : `Exercise ${isCall ? 'Call' : 'Put'} Option`
        }
      </button>
    </div>
  );
}