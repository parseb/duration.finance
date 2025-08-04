'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

interface USDCApprovalCheckProps {
  spenderAddress: `0x${string}`;
  requiredAmount: bigint;
  onApprovalConfirmed: () => void;
  children: (props: {
    needsApproval: boolean;
    isApproving: boolean;
    handleApprove: () => void;
    currentAllowance: bigint;
    approvalSuccess?: boolean;
  }) => React.ReactNode;
}

export function USDCApprovalCheck({
  spenderAddress,
  requiredAmount,
  onApprovalConfirmed,
  children
}: USDCApprovalCheckProps) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [isApproving, setIsApproving] = useState(false);
  const [approvalSuccess, setApprovalSuccess] = useState(false);

  // USDC contract address for Base Sepolia
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`;

  // Check current USDC allowance
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
    args: address && spenderAddress ? [address, spenderAddress] : undefined,
  });

  const currentAllowance = allowance || 0n;
  const needsApproval = currentAllowance < requiredAmount;

  // Handle approval transaction
  const handleApprove = async () => {
    if (!isConnected || !address || !spenderAddress || requiredAmount <= 0) {
      return;
    }

    setIsApproving(true);

    try {
      writeContract({
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
        args: [spenderAddress, requiredAmount],
      });
    } catch (error) {
      console.error('Approval failed:', error);
      setIsApproving(false);
    }
  };

  // Handle approval success
  useEffect(() => {
    if (hash && !isConfirming && !isPending && isApproving) {
      console.log('USDC approval confirmed:', hash);
      setIsApproving(false);
      setApprovalSuccess(true);
      refetchAllowance();
      
      // Reset success state after delay
      setTimeout(() => {
        setApprovalSuccess(false);
      }, 3000);
      
      onApprovalConfirmed();
    }
  }, [hash, isConfirming, isPending, isApproving, refetchAllowance, onApprovalConfirmed]);

  // Handle errors
  useEffect(() => {
    if (error) {
      console.error('USDC approval error:', error);
      setIsApproving(false);
    }
  }, [error]);

  return (
    <>
      {children({
        needsApproval: needsApproval && !approvalSuccess,
        isApproving: isApproving || isPending || isConfirming,
        handleApprove,
        currentAllowance,
        approvalSuccess,
      })}
    </>
  );
}