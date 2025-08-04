'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

interface AssetApprovalCheckProps {
  assetAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  requiredAmount: bigint;
  assetSymbol: string; // e.g., "WETH", "USDC"
  onApprovalConfirmed: () => void;
  children: (props: {
    needsApproval: boolean;
    isApproving: boolean;
    handleApprove: () => void;
    currentAllowance: bigint;
    error?: string;
    approvalSuccess?: boolean;
  }) => React.ReactNode;
}

export function AssetApprovalCheck({
  assetAddress,
  spenderAddress,
  requiredAmount,
  assetSymbol,
  onApprovalConfirmed,
  children
}: AssetApprovalCheckProps) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string>();
  const [approvalSuccess, setApprovalSuccess] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  // Check current allowance for the asset
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: assetAddress,
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
    args: address && spenderAddress ? [address, spenderAddress] : undefined,
  });

  const currentAllowance = allowance || 0n;
  const needsApproval = currentAllowance < requiredAmount;
  
  // Use forceUpdate to trigger re-render when approval is confirmed
  const _ = forceUpdate;

  // Handle approval transaction
  const handleApprove = async () => {
    if (!isConnected || !address || !spenderAddress || requiredAmount <= 0) {
      setApprovalError('Invalid approval parameters');
      return;
    }

    setIsApproving(true);
    setApprovalError(undefined);

    try {
      // Approve the required amount (or max for convenience)
      const approvalAmount = requiredAmount * 2n; // Approve 2x for future transactions
      
      writeContract({
        address: assetAddress,
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
        args: [spenderAddress, approvalAmount],
      });
    } catch (error) {
      console.error(`${assetSymbol} approval failed:`, error);
      setApprovalError(error instanceof Error ? error.message : `Failed to approve ${assetSymbol}`);
      setIsApproving(false);
    }
  };

  // Handle approval success
  useEffect(() => {
    if (hash && !isConfirming && !isPending && isApproving) {
      console.log(`${assetSymbol} approval confirmed:`, hash);
      setIsApproving(false);
      setApprovalSuccess(true);
      
      // Force immediate re-render and refetch allowance
      setForceUpdate(prev => prev + 1);
      refetchAllowance();
      
      // Also refetch after a short delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchAllowance();
        setForceUpdate(prev => prev + 1);
        setApprovalSuccess(false); // Reset success state
      }, 3000);
      
      onApprovalConfirmed();
    }
  }, [hash, isConfirming, isPending, isApproving, refetchAllowance, onApprovalConfirmed, assetSymbol]);

  // Handle errors
  useEffect(() => {
    if (error) {
      console.error(`${assetSymbol} approval error:`, error);
      setApprovalError(error.message || `Failed to approve ${assetSymbol}`);
      setIsApproving(false);
    }
  }, [error, assetSymbol]);

  return (
    <>
      {children({
        needsApproval: needsApproval && !approvalSuccess,
        isApproving: isApproving || isPending || isConfirming,
        handleApprove,
        currentAllowance,
        error: approvalError,
        approvalSuccess,
      })}
    </>
  );
}