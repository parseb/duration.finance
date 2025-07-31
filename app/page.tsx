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
import { LPCommitmentForm } from './components/LPCommitmentForm';

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
  
  const [activeTab, setActiveTab] = useState<'provide' | 'take' | 'portfolio'>('provide');

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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white">
      {/* Header */}
      <header className="flex justify-between items-center p-4 border-b border-blue-600">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
            <span className="text-blue-900 font-bold text-sm">D</span>
          </div>
          <h1 className="text-xl font-bold">Duration.Finance</h1>
        </div>
        
        <div className="flex items-center space-x-2">
          {isMiniApp === true && context?.client.added && (
            <button
              onClick={handleAddFrame}
              className="px-3 py-1 bg-blue-600 rounded-lg text-sm"
            >
              SAVE
            </button>
          )}
          {isMiniApp === true && (
            <>
              <button
                onClick={() => viewProfile()}
                className="px-3 py-1 bg-transparent border border-blue-400 rounded-lg text-sm"
              >
                PROFILE
              </button>
              <button
                onClick={close}
                className="px-3 py-1 bg-transparent text-sm"
              >
                CLOSE
              </button>
            </>
          )}
        </div>
      </header>

      {/* Enhanced Wallet Connection */}
      <div className="p-4 bg-blue-800 border-b border-blue-600">
        <WalletConnection />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-blue-600">
        {(['provide', 'take', 'portfolio'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 px-4 text-center capitalize font-medium transition-colors ${
              activeTab === tab 
                ? 'bg-blue-600 text-white border-b-2 border-yellow-500' 
                : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="p-4 pb-20">
        {activeTab === 'provide' && <ProvideTab />}
        {activeTab === 'take' && <TakeTab />}
        {activeTab === 'portfolio' && <PortfolioTab />}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-center p-4 bg-blue-900">
        <button
          type="button"
          className="px-4 py-2 rounded-2xl font-semibold opacity-60 border border-blue-400 text-xs"
          onClick={() => openUrl(isMiniApp === true ? 'https://base.org/builders/minikit' : 'https://duration.finance')}
        >
          {isMiniApp === true ? 'BUILT ON BASE WITH MINIKIT' : 'DURATION.FINANCE - POWERED BY BASE'}
        </button>
      </footer>
    </div>
  );
}

function ProvideTab() {
  return (
    <div className="space-y-6">
      <LPCommitmentForm 
        onSuccess={(commitmentHash) => {
          console.log('LP Commitment created:', commitmentHash);
          // TODO: Show success message and refresh marketplace
        }}
        onError={(error) => {
          console.error('LP Commitment failed:', error);
          // TODO: Show error message to user
        }}
      />
    </div>
  );
}

function TakeTab() {
  const [durationRange, setDurationRange] = useState([1, 30]);
  const [costRange, setCostRange] = useState([0, 200]);
  const [yieldRange, setYieldRange] = useState([0, 5]);
  const [sortBy, setSortBy] = useState<'daily-cost' | 'total-cost' | 'yield'>('daily-cost');
  const [selectedDuration, setSelectedDuration] = useState(7);
  
  // Mock current price
  const currentPrice = 3836.50;
  
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
        <div className="space-y-3">
          {sortedLiquidity.length > 0 ? (
            sortedLiquidity.map((offer) => (
              <div key={offer.id} className={`bg-blue-700 rounded-lg p-4 border ${
                offer.canTake ? 'border-blue-600' : 'border-red-600 opacity-60'
              }`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-white font-medium">{offer.amount} WETH</div>
                    <div className="text-blue-200 text-sm">LP: {offer.lp}</div>
                    <div className="text-green-400 text-xs">{offer.dailyYield.toFixed(2)}% daily yield</div>
                  </div>
                  <div className="text-right">
                    <div className="text-yellow-500 font-bold">${offer.totalCost.toFixed(0)}</div>
                    <div className="text-blue-200 text-sm">Total Premium</div>
                    <div className="text-blue-300 text-xs">${offer.dailyPremium}/day</div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-sm text-blue-200 mb-3">
                  <span>Range: {offer.minLock}-{offer.maxDuration} days</span>
                  <span>Collateral: ${offer.collateralValue.toLocaleString()}</span>
                  <span>Strike: Market @ Taking</span>
                </div>
                
                {offer.canTake ? (
                  <button className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors">
                    Take {selectedDuration}-Day Option • ${offer.totalCost} USDC
                  </button>
                ) : (
                  <div className="w-full py-2 bg-red-600/50 text-red-300 font-medium rounded-lg text-center">
                    Duration not available (needs {offer.minLock}-{offer.maxDuration} days)
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-blue-300">
              <div className="text-lg mb-2">No liquidity matches your filters</div>
              <div className="text-sm">Try adjusting the duration, cost, or yield ranges</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortfolioTab() {
  return (
    <div className="space-y-6">
      <div className="bg-blue-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-yellow-500">Your Portfolio</h2>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-700 rounded-lg p-4">
            <div className="text-blue-200 text-sm">Total P&L</div>
            <div className="text-green-400 text-xl font-bold">+2.3 ETH</div>
          </div>
          <div className="bg-blue-700 rounded-lg p-4">
            <div className="text-blue-200 text-sm">Active Positions</div>
            <div className="text-white text-xl font-bold">3</div>
          </div>
        </div>
        
        {/* Active Positions */}
        <h3 className="text-lg font-semibold mb-3">Active Positions</h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-blue-700 rounded-lg p-4 border border-blue-600">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-white font-medium">WETH Call Option</div>
                  <div className="text-blue-200 text-sm">1.0 WETH @ $4,000</div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold">+0.5 ETH</div>
                  <div className="text-blue-200 text-sm">Unrealized P&L</div>
                </div>
              </div>
              
              <div className="flex justify-between items-center text-sm text-blue-200 mb-3">
                <span>Expires in: 1.2 days</span>
                <span>Premium Paid: 0.2 ETH</span>
              </div>
              
              <button className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors">
                Exercise Option
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
