'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { USDCApprovalCheck } from './USDCApprovalCheck';
import { AssetApprovalCheck } from './AssetApprovalCheck';

interface UnifiedCommitment {
  creator: string;
  asset: string;
  amount: string;
  premiumAmount: string;
  minDuration: string;
  maxDuration: string;
  optionType: number;
  commitmentType: number; // 0 = OFFER, 1 = DEMAND
  expiry: string;
  nonce: string;
  signature: string;
}

interface TakeCommitmentButtonUnifiedProps {
  commitment: UnifiedCommitment;
  durationDays: number;
  onSuccess?: (optionId: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function TakeCommitmentButtonUnified({ 
  commitment, 
  durationDays, 
  onSuccess, 
  onError, 
  className = "w-full py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
}: TakeCommitmentButtonUnifiedProps) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState(false);

  // Contract and token addresses
  const contractAddress = (
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA ||
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE ||
    '0x9FC6E5Ff91D2be55b9ee25eD5b64DFB1020eBC44' // Deployed corrected contract address
  ) as `0x${string}`;
  
  const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as `0x${string}`; // Base WETH
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`; // Base Sepolia USDC
  
  const isOffer = commitment.commitmentType === 0;
  const isDemand = commitment.commitmentType === 1;
  
  // Calculate premium based on commitment type
  const calculatePremium = () => {
    if (!commitment.premiumAmount) return 0;
    try {
      const premiumWei = BigInt(commitment.premiumAmount);
      const premiumUsdc = Number(premiumWei) / 1e6; // Convert from USDC wei (6 decimals)
      
      if (isOffer) {
        // For offers: daily rate * duration
        return premiumUsdc * durationDays;
      } else {
        // For demands: fixed total premium
        return premiumUsdc;
      }
    } catch {
      return 0;
    }
  };
  
  const totalPremium = calculatePremium();
  const totalPremiumWei = BigInt(Math.round(totalPremium * 1e6)); // Convert to USDC wei (6 decimals)

  const handleTakeCommitment = async () => {
    if (!isConnected || !address) {
      onError?.('Please connect your wallet');
      return;
    }

    const minDays = Number(commitment.minDuration);
    const maxDays = Number(commitment.maxDuration);
    
    if (durationDays < minDays || durationDays > maxDays) {
      onError?.(`Duration must be between ${minDays} and ${maxDays} days`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare the commitment struct for the unified contract (correct field names)
      const unifiedCommitment = {
        creator: commitment.creator as `0x${string}`,
        asset: commitment.asset as `0x${string}`,
        amount: BigInt(commitment.amount),
        dailyPremiumUsdc: BigInt(commitment.premiumAmount),
        minLockDays: BigInt(commitment.minDuration),
        maxDurationDays: BigInt(commitment.maxDuration),
        optionType: commitment.optionType,
        commitmentType: commitment.commitmentType,
        expiry: BigInt(commitment.expiry),
        nonce: BigInt(commitment.nonce),
      };
      
      const signatureBytes = commitment.signature as `0x${string}`;

      const settlementParams = {
        method: 1, // UnoswapRouter
        routingData: '0x' as `0x${string}`,
        minReturn: 0n,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
      };

      console.log('Calling unified takeCommitment with:', {
        contractAddress,
        commitment: unifiedCommitment,
        signature: signatureBytes,
        durationDays: BigInt(durationDays),
        settlementParams
      });

      // Call the unified contract's takeCommitment function
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
            outputs: [{ name: 'optionId', type: 'uint256' }],
          },
        ],
        functionName: 'takeCommitment',
        args: [unifiedCommitment, signatureBytes, BigInt(durationDays), settlementParams],
      });

    } catch (error) {
      console.error('Failed to take commitment:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to take commitment');
      setIsSubmitting(false);
    }
  };

  // Handle transaction success
  if (hash && !isConfirming && !isPending && !transactionSuccess) {
    console.log('Transaction successful:', hash);
    setTransactionSuccess(true);
    setIsSubmitting(false);
    setTimeout(() => {
      onSuccess?.(hash);
      setTransactionSuccess(false);
    }, 3000); // Show success for 3 seconds
  }

  // Handle write contract errors
  if (writeError) {
    console.error('Write contract error:', writeError);
    setIsSubmitting(false);
    onError?.(writeError.message || 'Transaction failed');
  }

  const isLoading = isPending || isConfirming || isSubmitting;
  
  // Validate duration with proper fallbacks
  const minDays = Number(commitment.minDuration || 1);
  const maxDays = Number(commitment.maxDuration || 7);
  const isValidDuration = durationDays >= minDays && durationDays <= maxDays;
  
  // Check if we have valid premium data
  const hasValidPremium = totalPremium > 0 && !isNaN(totalPremium);

  // Taking OFFERS: Always need USDC approval (pay premium)
  // Taking DEMANDS: Always need WETH approval (provide collateral)
  
  if (isOffer) {
    // Taking OFFER: Taker needs to approve USDC to pay premium
    return (
      <USDCApprovalCheck
        spenderAddress={contractAddress}
        requiredAmount={totalPremiumWei}
        onApprovalConfirmed={() => console.log('USDC approval confirmed')}
      >
        {({ needsApproval: needsUsdcApproval, isApproving: isApprovingUsdc, handleApprove: handleUsdcApprove }) => (
          <button
            onClick={needsUsdcApproval ? handleUsdcApprove : handleTakeCommitment}
            disabled={!isConnected || !isValidDuration || !hasValidPremium || isLoading || isApprovingUsdc}
            className={`${className} ${
              !isConnected || !isValidDuration || !hasValidPremium || isLoading || isApprovingUsdc
                ? 'opacity-50 cursor-not-allowed' 
                : transactionSuccess
                ? 'bg-green-500 cursor-default'
                : needsUsdcApproval 
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
              : transactionSuccess
              ? '✅ Option Taken Successfully!'
              : isApprovingUsdc
              ? 'Approving USDC...'
              : isLoading 
              ? 'Taking Option...'
              : needsUsdcApproval
              ? `Approve $${totalPremium.toFixed(2)} USDC`
              : `Take ${durationDays}-Day Option • $${totalPremium.toFixed(2)} USDC`
            }
          </button>
        )}
      </USDCApprovalCheck>
    );
  } else {
    // Taking DEMAND: LP needs to approve WETH to provide collateral
    return (
      <AssetApprovalCheck
        assetAddress={WETH_ADDRESS}
        spenderAddress={contractAddress}
        requiredAmount={BigInt(commitment.amount)}
        assetSymbol="WETH"
        onApprovalConfirmed={() => console.log('WETH collateral approval confirmed')}
      >
        {({ needsApproval: needsWethApproval, isApproving: isApprovingWeth, handleApprove: handleWethApprove }) => (
          <button
            onClick={needsWethApproval ? handleWethApprove : handleTakeCommitment}
            disabled={!isConnected || !isValidDuration || !hasValidPremium || isLoading || isApprovingWeth}
            className={`${className} ${
              !isConnected || !isValidDuration || !hasValidPremium || isLoading || isApprovingWeth
                ? 'opacity-50 cursor-not-allowed' 
                : transactionSuccess
                ? 'bg-green-500 cursor-default'
                : needsWethApproval 
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
              : transactionSuccess
              ? '✅ Demand Filled Successfully!'
              : isApprovingWeth
              ? 'Approving WETH...'
              : isLoading 
              ? 'Filling Demand...'
              : needsWethApproval
              ? `Approve ${(Number(commitment.amount) / 1e18).toFixed(4)} WETH`
              : `Fill Demand • Earn $${totalPremium.toFixed(2)} USDC`
            }
          </button>
        )}
      </AssetApprovalCheck>
    );
  }
}