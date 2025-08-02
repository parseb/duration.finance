'use client';

import { useEffect, useState } from 'react';
import { useWethPrice } from '@/hooks/use-prices';

interface PriceDisplayProps {
  className?: string;
  showSource?: boolean;
  showLastUpdate?: boolean;
}

export function PriceDisplay({ 
  className = "", 
  showSource = false,
  showLastUpdate = false 
}: PriceDisplayProps) {
  const { price, isLoading, error, lastUpdated } = useWethPrice();
  const [isStale, setIsStale] = useState(false);

  // Mark price as stale if it's more than 2 minutes old
  useEffect(() => {
    if (!lastUpdated) return;

    const checkStale = () => {
      const age = Date.now() - lastUpdated;
      setIsStale(age > 120000); // 2 minutes
    };

    const interval = setInterval(checkStale, 10000); // Check every 10 seconds
    checkStale(); // Initial check

    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg w-24 animate-shimmer shadow-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-400 text-sm ${className} bg-red-500/10 px-3 py-1 rounded-full border border-red-500/30`}>
        ⚠️ Price unavailable
      </div>
    );
  }

  if (!price) {
    return (
      <div className={`text-gray-400 text-sm ${className}`}>
        No price data
      </div>
    );
  }

  const formatPrice = (value: number) => {
    if (value >= 1000) {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return value.toFixed(2);
  };

  const getSourceColor = () => {
    switch (price.source) {
      case '1inch': return 'text-green-400';
      case 'fallback': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className={`${className}`}>
      <div className="flex items-center space-x-2">
        <span className={`font-bold text-lg ${isStale ? 'text-yellow-400' : 'text-transparent bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text'} transition-all duration-300`}>
          💲${formatPrice(price.price)}
        </span>
        
        {showSource && (
          <span className={`text-xs px-2 py-1 rounded-full ${getSourceColor()} ${
            price.source === '1inch' 
              ? 'bg-green-500/20 border border-green-500/30' 
              : 'bg-yellow-500/20 border border-yellow-500/30'
          }`}>
            {price.source === '1inch' ? '🔗 1inch' : '📦 cached'}
          </span>
        )}
        
        {isStale && (
          <span className="text-xs text-yellow-400 animate-pulse" title="Price data is stale">
            ⚠️ stale
          </span>
        )}
      </div>
      
      {showLastUpdate && lastUpdated && (
        <div className="text-xs text-purple-300 mt-1 opacity-75">
          🕒 Updated {Math.round((Date.now() - lastUpdated) / 1000)}s ago
        </div>
      )}
    </div>
  );
}

interface EthPriceIndicatorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function EthPriceIndicator({ 
  showLabel = true, 
  size = 'md',
  className = "" 
}: EthPriceIndicatorProps) {
  const { price, isLoading } = useWethPrice();
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-semibold',
  };

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {showLabel && <span className="text-blue-200">ETH:</span>}
        <div className="animate-pulse">
          <div className="h-4 bg-blue-600 rounded w-16"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-2 ${sizeClasses[size]} ${className}`}>
      {showLabel && <span className="text-blue-200">ETH:</span>}
      <PriceDisplay className="text-white" />
    </div>
  );
}

interface LivePriceBadgeProps {
  className?: string;
}

export function LivePriceBadge({ className = "" }: LivePriceBadgeProps) {
  const { price, isLoading, error } = useWethPrice();
  const [pulse, setPulse] = useState(false);

  // Animate when price updates
  useEffect(() => {
    if (price && !isLoading) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 200);
      return () => clearTimeout(timer);
    }
  }, [price?.timestamp, isLoading]);

  if (error) {
    return (
      <div className={`inline-flex items-center px-3 py-2 rounded-full bg-gradient-to-r from-red-600/20 to-pink-600/20 border border-red-500/50 backdrop-blur-sm ${className}`}>
        <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse shadow-lg shadow-red-500/50"></div>
        <span className="text-red-400 text-xs font-bold">🚨 Price Error</span>
      </div>
    );
  }

  const isLive = price?.source === '1inch';
  const bgColor = isLive 
    ? 'bg-gradient-to-r from-green-600/30 to-emerald-600/30 border-green-400/60' 
    : 'bg-gradient-to-r from-yellow-600/30 to-orange-600/30 border-yellow-400/60';
  const dotColor = isLive 
    ? 'bg-gradient-to-r from-green-400 to-emerald-400 shadow-green-400/50' 
    : 'bg-gradient-to-r from-yellow-400 to-orange-400 shadow-yellow-400/50';
  const textColor = isLive ? 'text-green-300' : 'text-yellow-300';

  return (
    <div className={`inline-flex items-center px-3 py-2 rounded-full ${bgColor} backdrop-blur-sm border shadow-lg ${className}`}>
      <div className={`w-3 h-3 ${dotColor} rounded-full mr-2 shadow-lg ${pulse ? 'animate-ping' : 'animate-pulse'}`}></div>
      <span className={`text-xs font-bold ${textColor}`}>
        {isLoading ? '⏳ Loading...' : isLive ? '🔴 LIVE' : '📦 CACHED'}
      </span>
    </div>
  );
}