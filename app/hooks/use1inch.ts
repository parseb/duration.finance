import { useState, useEffect, useCallback } from 'react';
import { useChainId } from 'wagmi';

/**
 * @title use1inch Hook
 * @notice React hook for interacting with cached 1inch API
 */

interface QuoteData {
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  gas: string;
  gasPrice: string;
  estimatedGas: string;
  protocols: any[];
}

interface SwapData {
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

interface UseQuoteOptions {
  srcToken?: string;
  dstToken?: string;
  amount?: string;
  srcDecimals?: number;
  enabled?: boolean;
  refreshInterval?: number; // Auto-refresh interval in ms
}

interface UseSwapOptions {
  srcToken: string;
  dstToken: string;
  amount: string;
  fromAddress: string;
  slippage?: number;
  srcDecimals?: number;
}

export function useQuote(options: UseQuoteOptions) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chainId = useChainId();

  const { 
    srcToken, 
    dstToken, 
    amount, 
    srcDecimals = 18,
    enabled = true,
    refreshInterval = 10000 // 10 seconds default
  } = options;

  const fetchQuote = useCallback(async () => {
    if (!enabled || !srcToken || !dstToken || !amount) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        srcToken,
        dstToken,
        amount,
        srcDecimals: srcDecimals.toString(),
        chainId: chainId.toString(),
      });

      const response = await fetch(`/api/quote?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch quote');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [srcToken, dstToken, amount, srcDecimals, chainId, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Auto-refresh
  useEffect(() => {
    if (!enabled || !refreshInterval) return;

    const interval = setInterval(fetchQuote, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchQuote, enabled, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch: fetchQuote,
  };
}

export function useSwap() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chainId = useChainId();

  const getSwapData = useCallback(async (options: UseSwapOptions): Promise<SwapData | null> => {
    const { 
      srcToken, 
      dstToken, 
      amount, 
      fromAddress,
      slippage = 1,
      srcDecimals = 18 
    } = options;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          srcToken,
          dstToken,
          amount,
          fromAddress,
          slippage,
          srcDecimals,
          chainId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get swap data');
      }

      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  return {
    getSwapData,
    loading,
    error,
  };
}

/**
 * Hook to get current price of a token in USDC
 */
export function useTokenPrice(tokenAddress?: string, amount: string = '1') {
  const chainId = useChainId();
  
  // Base USDC address
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  const { data, loading, error, refetch } = useQuote({
    srcToken: tokenAddress,
    dstToken: USDC_ADDRESS,
    amount,
    srcDecimals: 18, // Assume 18 decimals for most tokens
    enabled: !!tokenAddress && tokenAddress !== USDC_ADDRESS,
    refreshInterval: 15000, // 15 seconds for price updates
  });

  // Calculate price per unit
  const price = data ? 
    (parseFloat(data.dstAmount) / 1e6) / parseFloat(amount) : // USDC has 6 decimals
    tokenAddress === USDC_ADDRESS ? 1 : null; // USDC = $1

  return {
    price,
    loading,
    error,
    refetch,
    rawData: data,
  };
}

/**
 * Hook to estimate gas costs for transactions
 */
export function useGasEstimate(tokenA?: string, tokenB?: string, amount: string = '1') {
  const { data, loading, error } = useQuote({
    srcToken: tokenA,
    dstToken: tokenB,
    amount,
    enabled: !!tokenA && !!tokenB,
    refreshInterval: 30000, // 30 seconds for gas estimates
  });

  const gasEstimate = data ? {
    gas: parseInt(data.gas),
    gasPrice: parseInt(data.gasPrice),
    estimatedGas: parseInt(data.estimatedGas),
    gasCostWei: parseInt(data.gas) * parseInt(data.gasPrice),
    gasCostEth: (parseInt(data.gas) * parseInt(data.gasPrice)) / 1e18,
  } : null;

  return {
    gasEstimate,
    loading,
    error,
  };
}