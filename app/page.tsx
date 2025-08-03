'use client';

import { useState, useEffect } from 'react';
import { 
  useMiniKit, 
  useAddFrame, 
  useOpenUrl,
  useClose,
  useViewProfile,
  useNotification 
} from '@coinbase/onchainkit/minikit';
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import { WalletConnection } from './components/WalletConnection';
import { MakeCommitmentForm } from './components/MakeCommitmentForm';
import { CommitmentList } from './components/CommitmentList';
import { TakeCommitmentButton } from './components/TakeCommitmentButton';
import { ExerciseOptionButton } from './components/ExerciseOptionButton';
import { Portfolio } from './components/Portfolio';
import { EthPriceIndicator, LivePriceBadge } from './components/PriceDisplay';
import { useWethPrice } from '../hooks/use-prices';
import { BrandedHeader, NavigationLogo, DurationSpinner } from './components/Logo';

// Helper to detect if we're in a Farcaster mini app environment
function useIsMiniApp() {
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);
  
  useEffect(() => {
    // Check for Farcaster mini app environment
    const isInFrame = window !== window.top;
    const hasFrameContext = typeof window !== 'undefined' && 
      (window as any).frameContext !== undefined;
    const isFarcaster = typeof window !== 'undefined' && 
      navigator.userAgent.includes('Farcaster');
    
    setIsMiniApp(isInFrame || hasFrameContext || isFarcaster);
  }, []);
  
  return isMiniApp;
}

// Custom hook that conditionally uses MiniKit hooks
function useMiniKitConditional() {
  const isMiniApp = useIsMiniApp();
  
  // Don't render anything until hydration is complete
  if (isMiniApp === null) {
    return {
      isMiniApp: false,
      miniKit: { setFrameReady: () => {}, isFrameReady: false, context: null },
      addFrame: () => Promise.resolve(null),
      openUrl: (url: string) => { if (typeof window !== 'undefined') window.open(url, '_blank'); },
      close: () => {},
      viewProfile: () => {},
      sendNotification: () => Promise.resolve()
    };
  }
  
  // Only use MiniKit hooks if we're in a mini app environment
  let miniKitData = null;
  let addFrame = null;
  let openUrl = null;
  let close = null;
  let viewProfile = null;
  let sendNotification = null;
  
  try {
    if (isMiniApp) {
      miniKitData = useMiniKit();
      addFrame = useAddFrame();
      openUrl = useOpenUrl();
      close = useClose();
      viewProfile = useViewProfile();
      sendNotification = useNotification();
    }
  } catch (error) {
    // If MiniKit hooks fail, fall back to mock functions
    console.warn('MiniKit hooks not available, using fallback functions');
  }
  
  return {
    isMiniApp,
    miniKit: miniKitData || { setFrameReady: () => {}, isFrameReady: false, context: null },
    addFrame: addFrame || (() => Promise.resolve(null)),
    openUrl: openUrl || ((url: string) => { if (typeof window !== 'undefined') window.open(url, '_blank'); }),
    close: close || (() => {}),
    viewProfile: viewProfile || (() => {}),
    sendNotification: sendNotification || (() => Promise.resolve())
  };
}

export default function Page() {
  const { isMiniApp, miniKit, addFrame, openUrl, close, viewProfile, sendNotification } = useMiniKitConditional();
  const { setFrameReady, isFrameReady, context } = miniKit;
  
  const [activeTab, setActiveTab] = useState<'make' | 'take' | 'portfolio'>('make');

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  const handleAddFrame = async () => {
    const result = await addFrame();
    if (result) {
      console.log('Frame added:', result.url, result.token);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white relative overflow-hidden">
      {/* Animated Background Elements with Orange Harmony */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-orange-500/25 to-pink-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-blue-500/20 to-orange-500/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-orange-500/15 to-yellow-500/10 rounded-full blur-3xl animate-ping opacity-30"></div>
        <div className="absolute top-20 right-1/4 w-60 h-60 bg-gradient-to-br from-orange-400/10 to-red-500/10 rounded-full blur-2xl animate-pulse delay-2000"></div>
      </div>

      {/* Header */}
      <header className="relative flex justify-between items-center p-6 bg-gradient-to-r from-purple-800/50 via-blue-800/50 to-orange-800/30 backdrop-blur-lg border-b border-purple-500/30 shadow-lg shadow-orange-500/5">
        <div className="flex items-center space-x-4">
          <NavigationLogo />
        </div>
        
        <div className="flex items-center space-x-3">
          {isMiniApp === true && context?.client.added && (
            <button
              onClick={handleAddFrame}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
            >
              ✨ SAVE
            </button>
          )}
          {isMiniApp === true && (
            <>
              <button
                onClick={() => viewProfile()}
                className="px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-400/50 rounded-xl text-sm font-semibold backdrop-blur-sm transform hover:scale-105 transition-all duration-200"
              >
                👤 PROFILE
              </button>
              <button
                onClick={close}
                className="px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white transform hover:scale-105 transition-all duration-200"
              >
                ✕ CLOSE
              </button>
            </>
          )}
        </div>
      </header>

      {/* Enhanced Wallet Connection */}
      <div className="relative p-6 bg-gradient-to-r from-purple-800/30 to-blue-800/30 backdrop-blur-lg border-b border-purple-500/20">
        <div className="flex justify-between items-center">
          <WalletConnection />
          <div className="flex items-center space-x-4">
            <LivePriceBadge />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative flex bg-gradient-to-r from-purple-800/20 via-blue-800/20 to-orange-800/15 backdrop-blur-sm border-b border-purple-500/20">
        {([
          {key: 'make', label: 'Offer', icon: '📋'},
          {key: 'take', label: 'Take', icon: '🎯'}, 
          {key: 'portfolio', label: 'Portfolio', icon: '📊'}
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`relative flex-1 py-4 px-6 text-center font-semibold transition-all duration-300 transform hover:scale-105 ${
              activeTab === tab.key
                ? 'text-white bg-gradient-to-r from-orange-600/40 via-purple-600/50 to-pink-600/40 shadow-lg backdrop-blur-sm'
                : 'text-purple-200 hover:text-white hover:bg-gradient-to-r hover:from-orange-600/15 hover:via-purple-600/20 hover:to-pink-600/15'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </div>
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-orange-600 rounded-t-full animate-pulse shadow-lg shadow-orange-500/50"></div>
            )}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="relative p-6 pb-20">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'make' && <MakeTab />}
          {activeTab === 'take' && <TakeTab />}
          {activeTab === 'portfolio' && <Portfolio />}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-purple-500/20 bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-orange-900/30 backdrop-blur-lg p-6">
        <div className="text-center">
          <p className="text-purple-300 text-sm">
            ⚡ Powered by <span className="text-transparent bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text font-bold">Duration.Finance</span>
          </p>
          <div className="flex justify-center items-center space-x-4 mt-2 text-xs text-purple-400">
            <span>Real-time 1inch pricing</span>
            <span>•</span>
            <span>Fast settlements</span>
            <span>•</span>
            <span>Zero governance complexity</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
          <div className="text-sm text-blue-300">
            2025 Duration.Finance - A first of its kind duration marketplace
          </div>
          <div className="flex space-x-6 text-sm">
            <button
              onClick={() => openUrl('https://docs.duration.finance')}
              className="text-blue-300 hover:text-white transition-colors"
            >
              Docs
            </button>
            <button
              onClick={() => openUrl('https://duration.finance/about')}
              className="text-blue-300 hover:text-white transition-colors"
            >
              About
            </button>
            <button
              onClick={() => openUrl('https://signal.group/#CjQKIAcAdm-Fk5pvY_G5fSUKjEt8rqHZcAN3AR7l_3GXOKx0EhDALqPtmCN5Nf83lcxTrsnT')}
              className="text-blue-300 hover:text-white transition-colors"
            >
              Signal
            </button>
            <button
              onClick={() => openUrl('mailto:contact@duration.finance')}
              className="text-blue-300 hover:text-white transition-colors"
            >
              Contact
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}

function MakeTab() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="space-y-6">
      <MakeCommitmentForm 
        onSuccess={(commitmentId) => {
          console.log('Commitment created:', commitmentId);
          setRefreshTrigger(prev => prev + 1); // Trigger refresh of commitment list
        }}
        onError={(error) => {
          console.error('Commitment failed:', error);
          // TODO: Show error message to user
        }}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CommitmentList 
          key={`my-${refreshTrigger}`}
          showOnlyMyCommitments={true}
          onCancel={() => setRefreshTrigger(prev => prev + 1)}
        />
        <CommitmentList 
          key={`all-${refreshTrigger}`}
          showOnlyMyCommitments={false}
        />
      </div>
    </div>
  );
}

function TakeTab() {
  const [durationRange, setDurationRange] = useState([1, 30]);
  const [costRange, setCostRange] = useState([0, 200]);
  const [yieldRange, setYieldRange] = useState([0, 5]);
  const [sortBy, setSortBy] = useState<'daily-cost' | 'total-cost' | 'yield'>('daily-cost');
  const [selectedDuration, setSelectedDuration] = useState(7);
  
  // Get real-time price from the price service
  const { price } = useWethPrice();
  const currentPrice = price?.price || 3836.50; // Fallback to default if no price data
  
  // Expanded mock liquidity data for better chart visualization
  const mockLiquidity = [
    { id: 1, amount: 2.0, dailyPremium: 75, minLock: 1, maxDuration: 14, lp: '0x1234...5678' },
    { id: 2, amount: 1.5, dailyPremium: 45, minLock: 2, maxDuration: 7, lp: '0x8765...4321' },
    { id: 3, amount: 0.8, dailyPremium: 25, minLock: 1, maxDuration: 30, lp: '0xabcd...efgh' },
    { id: 4, amount: 3.0, dailyPremium: 90, minLock: 3, maxDuration: 21, lp: '0x9876...1234' },
    { id: 5, amount: 1.2, dailyPremium: 35, minLock: 1, maxDuration: 14, lp: '0x5555...6666' },
    { id: 6, amount: 0.5, dailyPremium: 18, minLock: 1, maxDuration: 7, lp: '0x7777...8888' },
    { id: 7, amount: 4.0, dailyPremium: 120, minLock: 7, maxDuration: 30, lp: '0x9999...aaaa' },
    { id: 8, amount: 0.3, dailyPremium: 12, minLock: 1, maxDuration: 5, lp: '0xbbbb...cccc' }
  ].map(item => ({
    ...item,
    totalCost: item.dailyPremium * selectedDuration,
    collateralValue: item.amount * currentPrice,
    dailyYield: (item.dailyPremium / (item.amount * currentPrice)) * 100,
    canTake: selectedDuration >= item.minLock && selectedDuration <= item.maxDuration
  }));
  
  // Filter liquidity based on sliders
  const filteredLiquidity = mockLiquidity.filter(item => 
    selectedDuration >= durationRange[0] && selectedDuration <= durationRange[1] &&
    item.dailyPremium >= costRange[0] && item.dailyPremium <= costRange[1] &&
    item.dailyYield >= yieldRange[0] && item.dailyYield <= yieldRange[1]
  );
  
  // Sort liquidity based on selected criteria
  const sortedLiquidity = [...filteredLiquidity].sort((a, b) => {
    switch (sortBy) {
      case 'daily-cost': return a.dailyPremium - b.dailyPremium;
      case 'total-cost': return a.totalCost - b.totalCost;
      case 'yield': return b.dailyYield - a.dailyYield;
      default: return 0;
    }
  });
  
  // Generate chart data for LP concentration
  const generateChartData = () => {
    const durationBuckets = Array.from({length: 30}, (_, i) => i + 1);
    return durationBuckets.map(duration => {
      const availableOffers = mockLiquidity.filter(item => 
        duration >= item.minLock && duration <= item.maxDuration
      );
      const totalLiquidity = availableOffers.reduce((sum, item) => sum + item.amount, 0);
      const avgCost = availableOffers.length > 0 
        ? availableOffers.reduce((sum, item) => sum + item.dailyPremium, 0) / availableOffers.length 
        : 0;
      return { duration, totalLiquidity, avgCost, offers: availableOffers.length };
    });
  };
  
  const chartData = generateChartData();
  const maxLiquidity = Math.max(...chartData.map(d => d.totalLiquidity));
  const maxCost = Math.max(...chartData.map(d => d.avgCost));

  return (
    <div className="space-y-6">
      <div className="bg-blue-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-yellow-500">Duration Marketplace</h2>
        <p className="text-blue-200 mb-6">Filter liquidity with sliders and visualize LP concentration across durations.</p>
        
        {/* Filter Sliders */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Duration Range: {durationRange[0]}-{durationRange[1]} days</label>
            <div className="relative">
              <input
                type="range"
                min="1"
                max="30"
                value={durationRange[0]}
                onChange={(e) => setDurationRange([parseInt(e.target.value), durationRange[1]])}
                className="absolute w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="range"
                min="1"
                max="30"
                value={durationRange[1]}
                onChange={(e) => setDurationRange([durationRange[0], parseInt(e.target.value)])}
                className="absolute w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Daily Cost Range: ${costRange[0]}-${costRange[1]}</label>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="200"
                value={costRange[0]}
                onChange={(e) => setCostRange([parseInt(e.target.value), costRange[1]])}
                className="absolute w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="range"
                min="0"
                max="200"
                value={costRange[1]}
                onChange={(e) => setCostRange([costRange[0], parseInt(e.target.value)])}
                className="absolute w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Daily Yield Range: {yieldRange[0].toFixed(1)}%-{yieldRange[1].toFixed(1)}%</label>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={yieldRange[0]}
                onChange={(e) => setYieldRange([parseFloat(e.target.value), yieldRange[1]])}
                className="absolute w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={yieldRange[1]}
                onChange={(e) => setYieldRange([yieldRange[0], parseFloat(e.target.value)])}
                className="absolute w-full h-2 bg-blue-600 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>
        </div>
        
        {/* LP Concentration Chart */}
        <div className="bg-blue-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">LP Concentration by Duration</h3>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded mr-2"></div>
                <span className="text-blue-200">Liquidity (WETH)</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-400 rounded mr-2"></div>
                <span className="text-blue-200">Avg Cost (USDC)</span>
              </div>
            </div>
          </div>
          
          {/* Simple Chart Visualization */}
          <div className="h-32 flex items-end space-x-1 overflow-x-auto">
            {chartData.map((data, index) => {
              const liquidityHeight = (data.totalLiquidity / maxLiquidity) * 100;
              const costHeight = (data.avgCost / maxCost) * 100;
              const isInRange = data.duration >= durationRange[0] && data.duration <= durationRange[1];
              
              return (
                <div key={index} className="flex flex-col items-center min-w-8">
                  <div className="relative h-24 w-6 bg-blue-800 rounded-t cursor-pointer hover:bg-blue-600 transition-colors"
                       onClick={() => setSelectedDuration(data.duration)}
                       title={`Duration: ${data.duration}d, Liquidity: ${data.totalLiquidity.toFixed(1)} WETH, Avg Cost: $${data.avgCost.toFixed(0)}, Offers: ${data.offers}`}>
                    {/* Liquidity bar */}
                    <div 
                      className={`absolute bottom-0 w-3 rounded-t ${
                        isInRange ? 'bg-yellow-500' : 'bg-yellow-300 opacity-50'
                      }`}
                      style={{ height: `${liquidityHeight}%` }}
                    ></div>
                    {/* Cost bar */}
                    <div 
                      className={`absolute bottom-0 right-0 w-3 rounded-t ${
                        isInRange ? 'bg-green-400' : 'bg-green-300 opacity-50'
                      }`}
                      style={{ height: `${costHeight}%` }}
                    ></div>
                    {/* Selected duration indicator */}
                    {selectedDuration === data.duration && (
                      <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </div>
                  <div className={`text-xs mt-1 ${
                    selectedDuration === data.duration ? 'text-white font-bold' : 'text-blue-300'
                  }`}>
                    {data.duration}d
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Duration Selection and Sort */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Selected Duration</label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="30"
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(parseInt(e.target.value))}
                className="flex-1 bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white"
              />
              <span className="text-blue-200 text-sm">days</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="daily-cost">Daily Cost (Low to High)</option>
              <option value="total-cost">Total Cost (Low to High)</option>
              <option value="yield">LP Yield (High to Low)</option>
            </select>
          </div>
        </div>
        
        {/* Current Market Info */}
        <div className="bg-blue-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-blue-200 text-sm">WETH Market Price</div>
              <div className="text-white text-lg font-bold">${currentPrice.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-blue-200 text-sm">Filtered Results</div>
              <div className="text-yellow-500 font-bold">{sortedLiquidity.filter(l => l.canTake).length} offers</div>
            </div>
          </div>
        </div>
        
        {/* Available Liquidity */}
        {/* Show real commitments from database */}
        <CommitmentList 
          showOnlyMyCommitments={false}
          commitmentType="OFFER"
        />
      </div>
    </div>
  );
}

