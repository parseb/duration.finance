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

  const getStatusDot = () => {
    if (isStale) return 'bg-yellow-400 shadow-yellow-400/50';
    return price.source === '1inch' 
      ? 'bg-green-400 shadow-green-400/50' 
      : 'bg-orange-400 shadow-orange-400/50';
  };

  const getStatusLabel = () => {
    if (isStale) return 'Stale Data';
    return price.source === '1inch' ? 'Live from 1inch' : 'Cached Price';
  };

  return (
    <div className={`${className}`}>
      <div className="flex items-center space-x-2">
        {/* Price with integrated status indicator */}
        <div className="relative group">
          <div className="flex items-center space-x-2">
            <span className={`font-bold text-lg ${isStale ? 'text-yellow-400' : 'text-transparent bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text'} transition-all duration-300`}>
              💲${formatPrice(price.price)}
            </span>
            
            {/* Small integrated status dot */}
            <div className={`w-2 h-2 rounded-full ${getStatusDot()} animate-pulse shadow-lg transition-all duration-300 group-hover:scale-150`}></div>
          </div>
          
          {/* Hover tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            {getStatusLabel()}
            {lastUpdated && (
              <div className="text-xs opacity-75">
                {Math.round((Date.now() - lastUpdated) / 1000)}s ago
              </div>
            )}
          </div>
        </div>
        
        {/* Legacy source display for explicit showSource requests */}
        {showSource && (
          <span className={`text-xs px-2 py-1 rounded-full ${getSourceColor()} ${
            price.source === '1inch' 
              ? 'bg-green-500/20 border border-green-500/30' 
              : 'bg-orange-500/20 border border-orange-500/30'
          }`}>
            {price.source === '1inch' ? '🔗 1inch' : '📦 cached'}
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
  const { price, isLoading, error, lastUpdated } = useWethPrice();
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
      <div className={`relative group inline-flex items-center ${className}`}>
        <span className="text-red-400 font-bold">💲---.--</span>
        <div className="w-2 h-2 rounded-full bg-red-400 ml-2 animate-pulse shadow-lg shadow-red-400/50"></div>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
          Price Error
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`relative group inline-flex items-center ${className}`}>
        <span className="text-purple-400 font-bold animate-pulse">💲---.--</span>
        <div className="w-2 h-2 rounded-full bg-purple-400 ml-2 animate-pulse shadow-lg shadow-purple-400/50"></div>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
          Loading Price...
        </div>
      </div>
    );
  }

  if (!price) {
    return (
      <div className={`relative group inline-flex items-center ${className}`}>
        <span className="text-gray-400 font-bold">💲---.--</span>
        <div className="w-2 h-2 rounded-full bg-gray-400 ml-2 animate-pulse shadow-lg shadow-gray-400/50"></div>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
          Price Unavailable
        </div>
      </div>
    );
  }

  const isLive = price.source === '1inch';
  const dotColor = isLive 
    ? 'bg-green-400 shadow-green-400/50' 
    : 'bg-orange-400 shadow-orange-400/50';
  const priceColor = isLive 
    ? 'text-transparent bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text' 
    : 'text-transparent bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text';

  const formatPrice = (price: number) => {
    return price.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const getStatusLabel = () => {
    return isLive ? 'Live from 1inch' : 'Cached Price';
  };

  return (
    <div className={`relative group inline-flex items-center ${className}`}>
      <span className={`font-bold ${priceColor} transition-all duration-300`}>
        💲{formatPrice(price.price)}
      </span>
      <div className={`w-2 h-2 rounded-full ${dotColor} ml-2 shadow-lg transition-all duration-300 group-hover:scale-150 ${pulse ? 'animate-ping' : 'animate-pulse'}`}></div>
      
      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
        {getStatusLabel()}
        {lastUpdated && (
          <div className="text-xs opacity-75">
            {Math.round((Date.now() - lastUpdated) / 1000)}s ago
          </div>
        )}
      </div>
    </div>
  );
}