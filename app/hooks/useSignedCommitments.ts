/**
 * React hooks for creating signed commitments with dynamic chain support
 * Integrates with EIP-712 signature utilities and user's current chain
 */
import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSignTypedData } from 'wagmi';
import { 
  createLPCommitment, 
  createTakerCommitment, 
  CommitmentData,
  getContractAddressForChain,
} from '../utils/signatures';
import { useUserNonce } from './useDurationOptions';

/**
 * Hook for creating LP commitments with proper chain-aware EIP-712 signatures
 */
export function useCreateLPCommitment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { nonce, refetch: refetchNonce } = useUserNonce();

  const createCommitment = useCallback(async (params: {
    asset: `0x${string}`;
    amount: bigint;
    targetPrice: bigint;
    durationDays: number;
    optionType: 0 | 1;
  }) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!address) {
        throw new Error('Wallet not connected');
      }

      // Verify contract is deployed on current chain
      try {
        getContractAddressForChain(chainId);
      } catch (err) {
        throw new Error(`Duration.Finance not available on chain ${chainId}. Please switch to a supported chain.`);
      }

      // Get current nonce (add 1 for next commitment)
      const nextNonce = nonce + 1;

      const result = await createLPCommitment({
        ...params,
        nonce: nextNonce,
        signer: address,
        chainId,
        signTypedData: signTypedDataAsync,
      });

      // Refresh nonce after successful signature
      await refetchNonce();

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create LP commitment';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, signTypedDataAsync, nonce, refetchNonce]);

  return {
    createCommitment,
    isLoading,
    error,
    currentChain: chainId,
    isSupported: (() => {
      try {
        getContractAddressForChain(chainId);
        return true;
      } catch {
        return false;
      }
    })(),
  };
}

/**
 * Hook for creating Taker commitments with proper chain-aware EIP-712 signatures
 */
export function useCreateTakerCommitment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { nonce, refetch: refetchNonce } = useUserNonce();

  const createCommitment = useCallback(async (params: {
    asset: `0x${string}`;
    amount: bigint;
    premium: bigint;
    durationDays: number;
    optionType: 0 | 1;
  }) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!address) {
        throw new Error('Wallet not connected');
      }

      // Verify contract is deployed on current chain
      try {
        getContractAddressForChain(chainId);
      } catch (err) {
        throw new Error(`Duration.Finance not available on chain ${chainId}. Please switch to a supported chain.`);
      }

      // Get current nonce (add 1 for next commitment)
      const nextNonce = nonce + 1;

      const result = await createTakerCommitment({
        ...params,
        nonce: nextNonce,
        signer: address,
        chainId,
        signTypedData: signTypedDataAsync,
      });

      // Refresh nonce after successful signature
      await refetchNonce();

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create Taker commitment';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, signTypedDataAsync, nonce, refetchNonce]);

  return {
    createCommitment,
    isLoading,
    error,
    currentChain: chainId,
    isSupported: (() => {
      try {
        getContractAddressForChain(chainId);
        return true;
      } catch {
        return false;
      }
    })(),
  };
}

/**
 * Hook to get information about supported chains
 */
export function useSupportedChains() {
  const chainId = useChainId();
  
  const supportedChains = [
    { chainId: 8453, name: 'Base Mainnet', testnet: false },
    { chainId: 84532, name: 'Base Sepolia', testnet: true },
    { chainId: 1, name: 'Ethereum Mainnet', testnet: false },
    { chainId: 11155111, name: 'Ethereum Sepolia', testnet: true },
  ];

  const currentChain = supportedChains.find(chain => chain.chainId === chainId);
  const isSupported = !!currentChain;

  return {
    supportedChains,
    currentChain,
    isSupported,
    needsSwitch: !isSupported,
  };
}