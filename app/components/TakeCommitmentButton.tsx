'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { SignedLPCommitment } from '../../lib/eip712/verification';

interface TakeCommitmentButtonProps {
  commitment: SignedLPCommitment;
  durationDays: number;
  onSuccess?: (optionId: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function TakeCommitmentButton({ 
  commitment, 
  durationDays, 
  onSuccess, 
  onError, 
  className = "w-full py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
}: TakeCommitmentButtonProps) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate premium for the selected duration
  const totalPremium = Number(commitment.dailyPremiumUsdc) * durationDays / 1e6; // Convert to USDC
  
  const handleTakeCommitment = async () => {
    if (!isConnected || !address) {
      onError?.('Please connect your wallet');
      return;
    }

    if (durationDays < Number(commitment.minLockDays) || durationDays > Number(commitment.maxDurationDays)) {
      onError?.(`Duration must be between ${commitment.minLockDays} and ${commitment.maxDurationDays} days`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Get contract address from environment
      const contractAddress = process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS as `0x${string}`;
      
      if (!contractAddress) {
        throw new Error('Contract address not configured');
      }

      // Prepare commitment struct for contract call (using new OptionCommitment format)
      const commitmentForContract = {
        creator: commitment.lp, // LP is the creator for LP offers
        asset: commitment.asset,
        amount: commitment.amount,
        premiumAmount: commitment.dailyPremiumUsdc, // Map legacy field
        minDurationDays: commitment.minLockDays, // Map legacy field
        maxDurationDays: commitment.maxDurationDays,
        optionType: commitment.optionType,
        commitmentType: 0, // LP_OFFER
        expiry: commitment.expiry,
        nonce: commitment.nonce,
        signature: commitment.signature,
      };

      // Settlement parameters
      const settlementParams = {
        method: 1, // UnoswapRouter
        routingData: '0x',
        minReturn: 0n, // No minimum return for now
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
      };

      // Call takeCommitment on the contract
      writeContract({
        address: contractAddress,
        abi: [
          {
            name: 'takeCommitment',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              {
                name: 'commitment',
                type: 'tuple',
                components: [
                  { name: 'creator', type: 'address' },
                  { name: 'asset', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                  { name: 'premiumAmount', type: 'uint256' },
                  { name: 'minDurationDays', type: 'uint256' },
                  { name: 'maxDurationDays', type: 'uint256' },
                  { name: 'optionType', type: 'uint8' },
                  { name: 'commitmentType', type: 'uint8' },
                  { name: 'expiry', type: 'uint256' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'signature', type: 'bytes' },
                ],
              },
              { name: 'durationDays', type: 'uint256' },
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
            outputs: [{ name: '', type: 'uint256' }],
          },
        ],
        functionName: 'takeCommitment',
        args: [commitmentForContract, BigInt(durationDays), settlementParams],
      });

    } catch (error) {
      console.error('Failed to take commitment:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to take commitment');
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
  const isValidDuration = durationDays >= Number(commitment.minLockDays) && 
                         durationDays <= Number(commitment.maxDurationDays);

  return (
    <button
      onClick={handleTakeCommitment}
      disabled={!isConnected || !isValidDuration || isLoading}
      className={`${className} ${
        !isConnected || !isValidDuration || isLoading 
          ? 'opacity-50 cursor-not-allowed' 
          : ''
      }`}
    >
      {isLoading 
        ? 'Taking Option...' 
        : `Take ${durationDays}-Day Option • $${totalPremium.toFixed(2)} USDC`
      }
    </button>
  );
}