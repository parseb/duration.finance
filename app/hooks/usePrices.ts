import { useState, useEffect } from 'react';

interface PriceData {
  price: number;
  timestamp: number;
  source: string;
}

interface UsePricesReturn {
  prices: Record<string, PriceData>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch and manage asset prices from 1inch API
 * Auto-refreshes every 3 seconds when component is active
 */
export function usePrices(assets?: string[]): UsePricesReturn {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = async () => {
    try {
      const params = new URLSearchParams();
      if (assets && assets.length > 0) {
        params.set('assets', assets.join(','));
      }

      const response = await fetch(`/api/price?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch prices');
      }

      if (data.success && data.prices) {
        setPrices(data.prices);
        setError(null);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error fetching prices:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const refetch = () => {
    setLoading(true);
    fetchPrices();
  };

  useEffect(() => {
    // Initial fetch
    fetchPrices();

    // Set up auto-refresh every 3 seconds
    const interval = setInterval(fetchPrices, 3000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [assets?.join(',')]); // Re-run if assets change

  return {
    prices,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook to get a specific asset price
 */
export function useAssetPrice(asset: string) {
  const { prices, loading, error, refetch } = usePrices([asset]);
  
  return {
    price: prices[asset]?.price || 0,
    timestamp: prices[asset]?.timestamp || 0,
    source: prices[asset]?.source || 'unknown',
    loading,
    error,
    refetch,
  };
}

/**
 * Hook to get WETH price specifically (most commonly used)
 */
export function useWETHPrice() {
  return useAssetPrice('0x4200000000000000000000000000000000000006');
}

/**
 * Hook to get USDC price specifically
 */
export function useUSDCPrice() {
  return useAssetPrice('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
}