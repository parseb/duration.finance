'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
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
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // USDC contract addresses (Circle issued)
  // Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  // Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
  const USDC_ADDRESS = (
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA 
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet
  ) as `0x${string}`;
  
  // Get contract address
  const contractAddress = (
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA ||
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE ||
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS
  ) as `0x${string}`;

  // Calculate premium for the selected duration
  const getDailyPremium = () => {
    if (!commitment.dailyPremiumUsdc) return 0;
    
    try {
      if (typeof commitment.dailyPremiumUsdc === 'bigint') {
        return Number(commitment.dailyPremiumUsdc) / 1e6;
      } else if (typeof commitment.dailyPremiumUsdc === 'string') {
        return parseFloat(commitment.dailyPremiumUsdc) / 1e6;
      } else {
        return Number(commitment.dailyPremiumUsdc) / 1e6;
      }
    } catch (error) {
      console.error('Error calculating daily premium:', error, commitment.dailyPremiumUsdc);
      return 0;
    }
  };
  
  const dailyPremiumUsdc = getDailyPremium();
  const totalPremium = dailyPremiumUsdc * durationDays;
  const totalPremiumWei = BigInt(Math.round(totalPremium * 1e6)); // Convert to USDC wei (6 decimals)

  // Check USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: [
      {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' }
        ],
        outputs: [{ name: '', type: 'uint256' }]
      }
    ],
    functionName: 'allowance',
    args: address && contractAddress ? [address, contractAddress] : undefined,
  });

  // Check if approval is needed
  useEffect(() => {
    if (allowance !== undefined && totalPremiumWei > 0) {
      setNeedsApproval(allowance < totalPremiumWei);
    }
  }, [allowance, totalPremiumWei]);

  // Function to approve USDC spending
  const handleApprove = async () => {
    if (!contractAddress || totalPremiumWei <= 0) return;
    
    setIsApproving(true);
    try {
      const approveResult = writeContract({
        address: USDC_ADDRESS,
        abi: [
          {
            name: 'approve',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }
        ],
        functionName: 'approve',
        args: [contractAddress, totalPremiumWei],
      });
      
      console.log('USDC approval initiated:', approveResult);
    } catch (error) {
      console.error('Failed to approve USDC:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to approve USDC');
      setIsApproving(false);
    }
  };
  
  const handleTakeCommitment = async () => {
    if (!isConnected || !address) {
      onError?.('Please connect your wallet');
      return;
    }

    if (durationDays < Number(commitment.minLockDays) || durationDays > Number(commitment.maxDurationDays)) {
      onError?.(`Duration must be between ${commitment.minLockDays} and ${commitment.maxDurationDays} days`);
      return;
    }

    // If approval is needed, handle approval first
    if (needsApproval) {
      handleApprove();
      return;
    }

    setIsSubmitting(true);

    try {
      // Contract address is already defined above
      
      if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Contract address not configured for current network');
      }
      
      console.log('Taking commitment on Base Sepolia (84532) with contract:', contractAddress);

      // Prepare commitment exactly as the deployed contract expects
      const commitmentForContract = {
        creator: commitment.lp as `0x${string}`, // LP is now the creator in legacy storage format
        asset: commitment.asset as `0x${string}`,  
        amount: BigInt(commitment.amount),
        dailyPremiumUsdc: BigInt(commitment.dailyPremiumUsdc),
        minLockDays: BigInt(commitment.minLockDays),
        maxDurationDays: BigInt(commitment.maxDurationDays),
        optionType: Number(commitment.optionType),
        commitmentType: 0, // OFFER type (LP created offer, taker is taking it)
        expiry: BigInt(commitment.expiry),
        nonce: BigInt(commitment.nonce),
      };
      
      const signatureBytes = commitment.signature as `0x${string}`;

      // Log the exact data being sent to help debug signature issues
      console.log('Commitment data for signature verification:', {
        creator: commitmentForContract.creator,
        asset: commitmentForContract.asset,
        amount: commitmentForContract.amount.toString(),
        dailyPremiumUsdc: commitmentForContract.dailyPremiumUsdc.toString(),
        minLockDays: commitmentForContract.minLockDays.toString(),
        maxDurationDays: commitmentForContract.maxDurationDays.toString(),
        optionType: commitmentForContract.optionType,
        commitmentType: commitmentForContract.commitmentType,
        expiry: commitmentForContract.expiry.toString(),
        nonce: commitmentForContract.nonce.toString(),
        signature: signatureBytes,
      });

      // Validate addresses before proceeding
      if (!commitmentForContract.creator || commitmentForContract.creator === '0x' || commitmentForContract.creator.length !== 42) {
        throw new Error(`Invalid creator address: "${commitmentForContract.creator}" (type: ${typeof commitmentForContract.creator})`);
      }
      if (!commitmentForContract.asset || commitmentForContract.asset === '0x' || commitmentForContract.asset.length !== 42) {
        throw new Error(`Invalid asset address: "${commitmentForContract.asset}" (type: ${typeof commitmentForContract.asset})`);
      }
      if (!signatureBytes || signatureBytes === '0x' || signatureBytes.length < 132) {
        throw new Error(`Invalid signature: "${signatureBytes}" (type: ${typeof signatureBytes})`);
      }

      // Settlement parameters
      const settlementParams = {
        method: 1, // UnoswapRouter
        routingData: '0x',
        minReturn: 0n, // No minimum return for now
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
      };


      // Calculate the total premium that needs to be paid in USDC
      const totalPremiumUsdc = BigInt(Math.round(totalPremium * 1e6)); // Convert to USDC wei (6 decimals)
      

      // Call takeCommitment on the contract with correct ABI
      const result = writeContract({
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
                  { name: 'dailyPremiumUsdc', type: 'uint256' },
                  { name: 'minLockDays', type: 'uint256' },
                  { name: 'maxDurationDays', type: 'uint256' },
                  { name: 'optionType', type: 'uint8' },
                  { name: 'commitmentType', type: 'uint8' },
                  { name: 'expiry', type: 'uint256' },
                  { name: 'nonce', type: 'uint256' },
                ],
              },
              { name: 'signature', type: 'bytes' },
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
        args: [commitmentForContract, signatureBytes, BigInt(durationDays), settlementParams],
        // Note: Premium payment should be handled via USDC transfer approval, not ETH value
      });
      

    } catch (error) {
      console.error('Failed to take commitment:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to take commitment');
      setIsSubmitting(false);
    }
  };

  // Handle transaction success
  if (hash && !isConfirming && !isPending) {
    console.log('Transaction successful:', hash);
    setIsSubmitting(false);
    onSuccess?.(hash);
  }

  // Handle write contract errors
  if (writeError) {
    console.error('Write contract error:', writeError);
    setIsSubmitting(false);
    setIsApproving(false);
    onError?.(writeError.message || 'Transaction failed');
  }

  // Handle approval success - refetch allowance
  if (hash && isApproving && !isConfirming && !isPending) {
    console.log('Approval transaction successful:', hash);
    setIsApproving(false);
    refetchAllowance(); // This will trigger useEffect to update needsApproval
  }

  // Handle transaction error
  if (!isPending && !isConfirming && hash && isSubmitting) {
    setIsSubmitting(false);
  }

  const isLoading = isPending || isConfirming || isSubmitting || isApproving;
  
  // Validate duration with proper fallbacks
  const minDays = Number(commitment.minLockDays || 1);
  const maxDays = Number(commitment.maxDurationDays || 7);
  const isValidDuration = durationDays >= minDays && durationDays <= maxDays;
  
  // Check if we have valid premium data
  const hasValidPremium = totalPremium > 0 && !isNaN(totalPremium);

  return (
    <button
      onClick={handleTakeCommitment}
      disabled={!isConnected || !isValidDuration || !hasValidPremium || isLoading}
      className={`${className} ${
        !isConnected || !isValidDuration || !hasValidPremium || isLoading 
          ? 'opacity-50 cursor-not-allowed' 
          : needsApproval 
          ? 'bg-yellow-600 hover:bg-yellow-500'
          : ''
      }`}
    >
      {!isConnected 
        ? 'Connect Wallet'
        : !hasValidPremium
        ? 'Invalid Premium Data'
        : !isValidDuration
        ? `Duration must be ${minDays}-${maxDays} days`
        : isApproving
        ? 'Approving USDC...'
        : isLoading 
        ? 'Taking Option...'
        : needsApproval
        ? `Approve $${totalPremium.toFixed(2)} USDC`
        : `Take ${durationDays}-Day Option • $${totalPremium.toFixed(2)} USDC`
      }
    </button>
  );
}