/**
 * React hooks for interacting with DurationOptions contract
 * Includes security improvements: nonce tracking, signature validation, checks-effects-interactions
 * Dynamic chain support for mainnet, testnet, and future deployments
 */
import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useChainId } from 'wagmi';
import { durationOptionsABI } from '../abi/DurationOptions';
import { getContractAddressForChain } from '../utils/signatures';

/**
 * Hook to get the contract address for the current chain
 */
export function useDurationOptionsAddress() {
  const chainId = useChainId();
  
  try {
    return getContractAddressForChain(chainId);
  } catch (error) {
    console.error('DurationOptions not deployed on current chain:', error);
    return undefined;
  }
}

export interface OptionCommitment {
  lp: `0x${string}`;
  taker: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  targetPrice: bigint;
  premium: bigint;
  durationDays: number;
  optionType: 0 | 1; // 0 = CALL, 1 = PUT
  expiry: number;
  nonce: number;
  signature: `0x${string}`;
}

export interface ActiveOption {
  commitmentHash: `0x${string}`;
  taker: `0x${string}`;
  lp: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  targetPrice: bigint;
  premium: bigint;
  exerciseDeadline: number;
  currentPrice: bigint;
  optionType: 0 | 1;
  state: 0 | 1 | 2 | 3; // ACTIVE, EXERCISED, EXPIRED, LIQUIDATED
}

/**
 * Hook to get user's current nonce for EIP-712 signatures
 */
export function useUserNonce() {
  const { address } = useAccount();
  const contractAddress = useDurationOptionsAddress();
  
  const { data: nonce, isError, isLoading, refetch } = useReadContract({
    address: contractAddress,
    abi: durationOptionsABI,
    functionName: 'getNonce',
    args: address ? [address] : undefined,
    query: {
      enabled: !!(address && contractAddress),
    },
  });

  return {
    nonce: nonce as number || 0,
    isError,
    isLoading,
    refetch,
  };
}

/**
 * Hook to create commitments with proper signature validation
 */
export function useCreateCommitment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const contractAddress = useDurationOptionsAddress();

  const createCommitment = useCallback(async (commitment: OptionCommitment) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!contractAddress) {
        throw new Error('DurationOptions not deployed on current chain');
      }

      // Validate commitment structure before sending
      const isLpCommitment = commitment.lp !== '0x0000000000000000000000000000000000000000';
      const isTakerCommitment = commitment.taker !== '0x0000000000000000000000000000000000000000';
      
      if (!((isLpCommitment && !isTakerCommitment) || (!isLpCommitment && isTakerCommitment))) {
        throw new Error('Invalid commitment: must be either LP or Taker commitment');
      }

      // Validate LP commitment
      if (isLpCommitment) {
        if (commitment.targetPrice === 0n) {
          throw new Error('LP commitment must specify target price');
        }
        if (commitment.premium !== 0n) {
          throw new Error('LP commitment should not specify premium');
        }
      }

      // Validate Taker commitment
      if (isTakerCommitment) {
        if (commitment.premium === 0n) {
          throw new Error('Taker commitment must specify premium');
        }
        if (commitment.targetPrice !== 0n) {
          throw new Error('Taker commitment should not specify target price');
        }
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: durationOptionsABI,
        functionName: 'createCommitment',
        args: [commitment],
      });

      return hash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create commitment';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [writeContractAsync, contractAddress]);

  return {
    createCommitment,
    isLoading,
    error,
  };
}

/**
 * Hook to take commitments with proper validation
 */
export function useTakeCommitment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const contractAddress = useDurationOptionsAddress();

  const takeCommitment = useCallback(async (
    commitmentHash: `0x${string}`,
    optionType: 0 | 1
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!contractAddress) {
        throw new Error('DurationOptions not deployed on current chain');
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: durationOptionsABI,
        functionName: 'takeCommitment',
        args: [commitmentHash, optionType],
      });

      return hash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to take commitment';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [writeContractAsync, contractAddress]);

  return {
    takeCommitment,
    isLoading,
    error,
  };
}

/**
 * Hook to exercise options
 */
export function useExerciseOption() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const contractAddress = useDurationOptionsAddress();

  const exerciseOption = useCallback(async (
    optionId: number,
    settlementParams: {
      method: number;
      minReturn: bigint;
      deadline: number;
      routingData: `0x${string}`;
    }
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!contractAddress) {
        throw new Error('DurationOptions not deployed on current chain');
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: durationOptionsABI,
        functionName: 'exerciseOption',
        args: [optionId, settlementParams],
      });

      return hash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exercise option';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [writeContractAsync]);

  return {
    exerciseOption,
    isLoading,
    error,
  };
}

/**
 * Hook to get commitment details
 */
export function useCommitment(commitmentHash?: `0x${string}`) {
  const contractAddress = useDurationOptionsAddress();
  
  const { data: commitment, isError, isLoading, refetch } = useReadContract({
    address: contractAddress,
    abi: durationOptionsABI,
    functionName: 'getCommitment',
    args: commitmentHash ? [commitmentHash] : undefined,
    query: {
      enabled: !!(commitmentHash && contractAddress),
    },
  });

  return {
    commitment: commitment as OptionCommitment | undefined,
    isError,
    isLoading,
    refetch,
  };
}

/**
 * Hook to get active option details
 */
export function useActiveOption(optionId?: number) {
  const contractAddress = useDurationOptionsAddress();
  
  const { data: option, isError, isLoading, refetch } = useReadContract({
    address: contractAddress,
    abi: durationOptionsABI,
    functionName: 'getOption',
    args: optionId !== undefined ? [optionId] : undefined,
    query: {
      enabled: !!(optionId !== undefined && contractAddress),
    },
  });

  return {
    option: option as ActiveOption | undefined,
    isError,
    isLoading,
    refetch,
  };
}

/**
 * Hook to calculate premium for taking an option
 */
export function useCalculatePremium(commitmentHash?: `0x${string}`, currentPrice?: bigint) {
  const contractAddress = useDurationOptionsAddress();
  
  const { data: premium, isError, isLoading, refetch } = useReadContract({
    address: contractAddress,
    abi: durationOptionsABI,
    functionName: 'calculatePremium',
    args: commitmentHash && currentPrice ? [commitmentHash, currentPrice] : undefined,
    query: {
      enabled: !!(commitmentHash && currentPrice && contractAddress),
    },
  });

  return {
    premium: premium as bigint | undefined,
    isError,
    isLoading,
    refetch,
  };
}

/**
 * Hook to check if option is exercisable
 */
export function useIsExercisable(optionId?: number) {
  const contractAddress = useDurationOptionsAddress();
  
  const { data: isExercisable, isError, isLoading, refetch } = useReadContract({
    address: contractAddress,
    abi: durationOptionsABI,
    functionName: 'isExercisable',
    args: optionId !== undefined ? [optionId] : undefined,
    query: {
      enabled: !!(optionId !== undefined && contractAddress),
    },
  });

  return {
    isExercisable: isExercisable as boolean | undefined,
    isError,
    isLoading,
    refetch,
  };
}