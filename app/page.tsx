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

export default function Page() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const addFrame = useAddFrame();
  const openUrl = useOpenUrl();
  const close = useClose();
  const viewProfile = useViewProfile();
  const sendNotification = useNotification();
  
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
          {context?.client.added && (
            <button
              onClick={handleAddFrame}
              className="px-3 py-1 bg-blue-600 rounded-lg text-sm"
            >
              SAVE
            </button>
          )}
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
          onClick={() => openUrl('https://base.org/builders/minikit')}
        >
          BUILT ON BASE WITH MINIKIT
        </button>
      </footer>
    </div>
  );
}

function ProvideTab() {
  const [amount, setAmount] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [duration, setDuration] = useState('1');
  const [fractionable, setFractionable] = useState(true);

  return (
    <div className="space-y-6">
      <div className="bg-blue-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-yellow-500">Provide Liquidity</h2>
        <p className="text-blue-200 mb-6">Create options for others to take. Set your target price and earn premiums.</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Asset</label>
            <div className="bg-blue-700 rounded-lg p-3">
              <span className="text-white">WETH (Wrapped Ethereum)</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Amount (0.1 - 1000)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder="1.0"
              step="0.1"
              min="0.1"
              max="1000"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Target Price ($)</label>
            <input
              type="number"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder="4000"
              step="1"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Max Duration (days)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-blue-700 border border-blue-600 rounded-lg px-3 py-2 text-white placeholder-blue-300"
              placeholder="1"
              min="1"
              max="365"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="fractionable"
              checked={fractionable}
              onChange={(e) => setFractionable(e.target.checked)}
              className="rounded border-blue-600"
            />
            <label htmlFor="fractionable" className="text-sm">
              Allow partial taking
            </label>
          </div>
        </div>
        
        <button className="w-full mt-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-blue-900 font-bold rounded-lg transition-colors">
          Create Commitment
        </button>
      </div>
    </div>
  );
}

function TakeTab() {
  return (
    <div className="space-y-6">
      <div className="bg-blue-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-yellow-500">Available Options</h2>
        <p className="text-blue-200 mb-6">Take options created by liquidity providers.</p>
        
        {/* Mock Options List */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-blue-700 rounded-lg p-4 border border-blue-600">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-white font-medium">1.5 WETH</div>
                  <div className="text-blue-200 text-sm">Target: $4,200</div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-500 font-bold">0.3 ETH</div>
                  <div className="text-blue-200 text-sm">Premium</div>
                </div>
              </div>
              
              <div className="flex justify-between items-center text-sm text-blue-200 mb-3">
                <span>Duration: 2 days</span>
                <span>Type: CALL</span>
                <span>Fractionable: Yes</span>
              </div>
              
              <button className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors">
                Take Option
              </button>
            </div>
          ))}
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
