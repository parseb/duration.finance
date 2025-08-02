import { useState, useEffect, useMemo } from 'react';
import { priceService, PriceData } from '@/lib/pricing/price-service';

interface UsePricesOptions {
  assets?: string[];
  enabled?: boolean;
  refetchInterval?: number; // in milliseconds
}

interface UsePricesReturn {
  prices: Map<string, PriceData>;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching and monitoring real-time asset prices
 */
export function usePrices({
  assets = ['0x4200000000000000000000000000000000000006'], // Default to WETH
  enabled = true,
  refetchInterval = 30000, // 30 seconds
}: UsePricesOptions = {}): UsePricesReturn {
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Memoize assets array to prevent unnecessary re-renders
  const stableAssets = useMemo(() => assets, [JSON.stringify(assets)]);

  const fetchPrices = async () => {
    if (!enabled || stableAssets.length === 0) return;

    try {
      setError(null);
      const newPrices = await priceService.getPrices(stableAssets);
      setPrices(newPrices);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Error fetching prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cleanup: (() => void) | undefined;

    // Start price monitoring
    cleanup = priceService.startPriceMonitoring(
      stableAssets,
      (newPrices) => {
        setPrices(newPrices);
        setLastUpdated(Date.now());
        setIsLoading(false);
        setError(null);
      },
      refetchInterval
    );

    return () => {
      if (cleanup) cleanup();
    };
  }, [stableAssets, enabled, refetchInterval]);

  return {
    prices,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchPrices,
  };
}

/**
 * Hook for getting a single asset price
 */
export function usePrice(
  assetAddress: string,
  options: Omit<UsePricesOptions, 'assets'> = {}
): {
  price: PriceData | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refetch: () => Promise<void>;
} {
  const { prices, isLoading, error, lastUpdated, refetch } = usePrices({
    ...options,
    assets: [assetAddress],
  });

  return {
    price: prices.get(assetAddress) || null,
    isLoading,
    error,
    lastUpdated,
    refetch,
  };
}

/**
 * Hook for getting WETH price specifically
 */
export function useWethPrice(options: Omit<UsePricesOptions, 'assets'> = {}) {
  return usePrice('0x4200000000000000000000000000000000000006', options);
}