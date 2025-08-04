'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { USDCApprovalCheck } from './USDCApprovalCheck';
import { AssetApprovalCheck } from './AssetApprovalCheck';

interface LPCommitment {
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

interface TakeCommitmentButtonSimplifiedProps {
  commitment: LPCommitment;
  durationDays: number;
  onSuccess?: (optionId: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function TakeCommitmentButtonSimplified({ 
  commitment, 
  durationDays, 
  onSuccess, 
  onError, 
  className = "w-full py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
}: TakeCommitmentButtonSimplifiedProps) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Contract and token addresses
  const contractAddress = (
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA ||
    process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE ||
    '0x9FC6E5Ff91D2be55b9ee25eD5b64DFB1020eBC44' // Corrected contract address
  ) as `0x${string}`;
  
  const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as `0x${string}`; // Base WETH
  
  // Calculate premium for the selected duration
  const getDailyPremium = () => {
    if (!commitment.dailyPremiumUsdc) return 0;
    try {
      // Convert from USDC wei (6 decimals) to regular USDC
      const premiumWei = BigInt(commitment.dailyPremiumUsdc);
      return Number(premiumWei) / 1e6;
    } catch {
      return 0;
    }
  };
  
  const dailyPremiumUsdc = getDailyPremium();
  const totalPremium = dailyPremiumUsdc * durationDays;
  const totalPremiumWei = BigInt(Math.round(totalPremium * 1e6)); // Convert to USDC wei (6 decimals)

  const handleTakeCommitment = async () => {
    if (!isConnected || !address) {
      onError?.('Please connect your wallet');
      return;
    }

    const minDays = Number(commitment.minLockDays);
    const maxDays = Number(commitment.maxDurationDays);
    
    if (durationDays < minDays || durationDays > maxDays) {
      onError?.(`Duration must be between ${minDays} and ${maxDays} days`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare the commitment struct for the simplified contract
      // Map from our unified format to the contract's expected LPCommitment format
      const lpCommitment = {
        lp: (commitment.lp || commitment.creator) as `0x${string}`,
        asset: commitment.asset as `0x${string}`,
        amount: BigInt(commitment.amount),
        dailyPremiumUsdc: BigInt(commitment.dailyPremiumUsdc || commitment.premiumAmount || '0'),
        minLockDays: BigInt(commitment.minLockDays || commitment.minDurationDays || '1'),
        maxDurationDays: BigInt(commitment.maxDurationDays),
        optionType: commitment.optionType,
        expiry: BigInt(commitment.expiry),
        nonce: BigInt(commitment.nonce),
      };

      const settlementParams = {
        method: 1, // UnoswapRouter
        routingData: '0x' as `0x${string}`,
        minReturn: 0n,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
      };

      console.log('Calling simplified takeCommitment with:', {
        contractAddress,
        lpCommitment,
        signature: commitment.signature,
        durationDays: BigInt(durationDays),
        settlementParams
      });

      // Call the simplified contract's takeCommitment function
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
                  { name: 'lp', type: 'address' },
                  { name: 'asset', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                  { name: 'dailyPremiumUsdc', type: 'uint256' },
                  { name: 'minLockDays', type: 'uint256' },
                  { name: 'maxDurationDays', type: 'uint256' },
                  { name: 'optionType', type: 'uint8' },
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
        args: [lpCommitment, commitment.signature as `0x${string}`, BigInt(durationDays), settlementParams],
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
    onError?.(writeError.message || 'Transaction failed');
  }

  const isLoading = isPending || isConfirming || isSubmitting;
  
  // Validate duration with proper fallbacks
  const minDays = Number(commitment.minLockDays || 1);
  const maxDays = Number(commitment.maxDurationDays || 7);
  const isValidDuration = durationDays >= minDays && durationDays <= maxDays;
  
  // Check if we have valid premium data
  const hasValidPremium = totalPremium > 0 && !isNaN(totalPremium);

  return (
    <USDCApprovalCheck
      spenderAddress={contractAddress}
      requiredAmount={totalPremiumWei}
      onApprovalConfirmed={() => console.log('USDC approval confirmed')}
    >
      {({ needsApproval: needsUsdcApproval, isApproving: isApprovingUsdc, handleApprove: handleUsdcApprove }) => (
        <AssetApprovalCheck
          assetAddress={WETH_ADDRESS}
          spenderAddress={contractAddress}
          requiredAmount={BigInt(commitment.amount)}
          assetSymbol="WETH"
          onApprovalConfirmed={() => console.log('WETH collateral approval confirmed')}
        >
          {({ needsApproval: needsWethApproval, isApproving: isApprovingWeth, handleApprove: handleWethApprove }) => {
            const needsApproval = needsUsdcApproval || needsWethApproval;
            const isApproving = isApprovingUsdc || isApprovingWeth;
            
            const handleApprove = () => {
              if (needsUsdcApproval) {
                handleUsdcApprove();
              } else if (needsWethApproval) {
                handleWethApprove();
              }
            };

            return (
              <button
                onClick={needsApproval ? handleApprove : handleTakeCommitment}
                disabled={!isConnected || !isValidDuration || !hasValidPremium || isLoading || isApproving}
                className={`${className} ${
                  !isConnected || !isValidDuration || !hasValidPremium || isLoading || isApproving
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
                  : isApprovingUsdc
                  ? 'Approving USDC...'
                  : isApprovingWeth
                  ? 'Approving WETH...'
                  : isLoading 
                  ? 'Taking Option...'
                  : needsUsdcApproval
                  ? `Approve $${totalPremium.toFixed(2)} USDC`
                  : needsWethApproval
                  ? `Approve ${(Number(commitment.amount) / 1e18).toFixed(4)} WETH`
                  : `Take ${durationDays}-Day Option • $${totalPremium.toFixed(2)} USDC`
                }
              </button>
            );
          }}
        </AssetApprovalCheck>
      )}
    </USDCApprovalCheck>
  );
}