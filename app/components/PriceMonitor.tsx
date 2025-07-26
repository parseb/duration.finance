'use client';

import { useWETHPrice, useUSDCPrice, usePrices } from '../hooks/usePrices';

interface PriceDisplayProps {
  label: string;
  price: number;
  timestamp: number;
  source: string;
  loading: boolean;
  error: string | null;
}

function PriceDisplay({ label, price, timestamp, source, loading, error }: PriceDisplayProps) {
  if (loading) {
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <div className="text-sm text-gray-400">{label}</div>
        <div className="text-xl font-mono text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
        <div className="text-sm text-gray-400">{label}</div>
        <div className="text-xl font-mono text-red-400">Error</div>
        <div className="text-xs text-red-300 mt-1">{error}</div>
      </div>
    );
  }

  const lastUpdate = timestamp ? new Date(timestamp).toLocaleTimeString() : 'Unknown';

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-2xl font-mono text-white">
        ${price.toLocaleString(undefined, { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 6 
        })}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {source} • {lastUpdate}
      </div>
    </div>
  );
}

export function PriceMonitor() {
  const wethPrice = useWETHPrice();
  const usdcPrice = useUSDCPrice();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Live Prices</h3>
        <div className="flex items-center space-x-2 text-xs text-gray-400">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span>Updates every 3s</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PriceDisplay
          label="WETH"
          price={wethPrice.price}
          timestamp={wethPrice.timestamp}
          source={wethPrice.source}
          loading={wethPrice.loading}
          error={wethPrice.error}
        />
        
        <PriceDisplay
          label="USDC"
          price={usdcPrice.price}
          timestamp={usdcPrice.timestamp}
          source={usdcPrice.source}
          loading={usdcPrice.loading}
          error={usdcPrice.error}
        />
      </div>
    </div>
  );
}

/**
 * Component to show all supported asset prices
 */
export function AllPricesMonitor() {
  const { prices, loading, error } = usePrices();

  if (loading && Object.keys(prices).length === 0) {
    return (
      <div className="bg-white/5 rounded-lg p-6 border border-white/10">
        <div className="text-center text-gray-400">Loading prices...</div>
      </div>
    );
  }

  if (error && Object.keys(prices).length === 0) {
    return (
      <div className="bg-red-500/10 rounded-lg p-6 border border-red-500/20">
        <div className="text-center text-red-400">Failed to load prices</div>
        <div className="text-center text-red-300 text-sm mt-2">{error}</div>
      </div>
    );
  }

  const tokenNames: Record<string, string> = {
    '0x4200000000000000000000000000000000000006': 'WETH',
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'DAI',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">All Asset Prices</h3>
        <div className="flex items-center space-x-2 text-xs text-gray-400">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span>1inch API</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(prices).map(([address, data]) => (
          <PriceDisplay
            key={address}
            label={tokenNames[address] || address.slice(0, 8)}
            price={data.price}
            timestamp={data.timestamp}
            source={data.source}
            loading={false}
            error={null}
          />
        ))}
      </div>
      
      {error && (
        <div className="text-yellow-400 text-sm text-center">
          Warning: {error}
        </div>
      )}
    </div>
  );
}