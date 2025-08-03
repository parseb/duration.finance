"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";

// Helper to detect mini app environment
function useIsMiniApp() {
  const [isMiniApp, setIsMiniApp] = useState(false);
  
  useEffect(() => {
    const isInFrame = window !== window.top;
    const hasFrameContext = typeof window !== 'undefined' && 
      (window as any).frameContext !== undefined;
    const isFarcaster = typeof window !== 'undefined' && 
      navigator.userAgent.includes('Farcaster');
    
    setIsMiniApp(isInFrame || hasFrameContext || isFarcaster);
  }, []);
  
  return isMiniApp;
}

export function WalletConnection() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isMiniApp = useIsMiniApp();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (showWalletOptions && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
  }, [showWalletOptions]);

  if (isConnected && address) {
    return (
      <div className="relative z-50">
        <button
          ref={buttonRef}
          onClick={() => setShowWalletOptions(!showWalletOptions)}
          className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-600/30 to-purple-600/30 backdrop-blur-sm rounded-xl border border-blue-500/20 hover:border-blue-400/40 transition-all duration-300 cursor-pointer group"
        >
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {address.slice(2, 4).toUpperCase()}
          </div>
          <div className="flex flex-col text-left">
            <div className="text-white text-sm font-medium">
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
            <div className="text-blue-200 text-xs">Connected</div>
          </div>
          
          {/* Dropdown indicator */}
          <svg className={`w-4 h-4 text-blue-300 group-hover:text-white transition-all duration-200 ${showWalletOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {/* Portal-based dropdown menu */}
        {showWalletOptions && mounted && typeof window !== 'undefined' && 
          createPortal(
            <>
              {/* Backdrop to close dropdown */}
              <div 
                className="fixed inset-0 z-[999998]" 
                onClick={() => setShowWalletOptions(false)}
              />
              
              {/* Dropdown menu rendered at body level */}
              <div 
                className="fixed w-64 bg-gray-900/95 backdrop-blur-lg rounded-xl border border-gray-700/50 shadow-xl z-[999999]"
                style={{
                  top: `${dropdownPosition.top}px`,
                  right: `${dropdownPosition.right}px`
                }}
              >
                <div className="p-4 border-b border-gray-700/50">
                  <div className="text-sm text-gray-300 mb-2">Connected Wallet</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                      {address.slice(2, 4).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium">{address.slice(0, 8)}...{address.slice(-6)}</div>
                      <div className="text-emerald-400 text-sm">Connected</div>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      disconnect();
                      setShowWalletOptions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10 rounded-lg transition-colors duration-200 text-sm flex items-center gap-2 cursor-pointer hover:scale-[1.02] transform"
                  >
                    🚪 Disconnect Wallet
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigator.clipboard.writeText(address);
                      setShowWalletOptions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors duration-200 text-sm flex items-center gap-2 mt-1 cursor-pointer hover:scale-[1.02] transform"
                  >
                    📋 Copy Address
                  </button>
                </div>
              </div>
            </>,
            document.body
          )
        }
      </div>
    );
  }

  // Show different UI based on environment
  if (isMiniApp) {
    // Mini app environment - use OnchainKit default
    return (
      <ConnectWallet>
        <Avatar className="h-6 w-6" />
        <Name />
      </ConnectWallet>
    );
  }

  // Regular web environment - show specific wallet options
  const targetWallets = ['Coinbase Wallet', 'MetaMask', 'WalletConnect', 'Injected'];
  const filteredConnectors = connectors.filter(connector => 
    targetWallets.some(target => connector.name.includes(target) || target === connector.name)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-white mb-1">Connect Wallet</h3>
        <p className="text-sm text-blue-200">Choose your preferred wallet to get started</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {filteredConnectors.map((connector) => {
          const walletInfo = getWalletInfo(connector.name);
          return (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              className="flex flex-col items-center gap-3 p-4 bg-blue-700/50 hover:bg-blue-600/70 rounded-lg transition-all hover:scale-105 border border-blue-600/30 hover:border-blue-500"
            >
              <WalletIcon name={connector.name} size="large" />
              <div className="text-center">
                <div className="font-medium text-white text-xs">{getDisplayName(connector.name)}</div>
                {walletInfo.badge && (
                  <div className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full mt-1">
                    {walletInfo.badge}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WalletIcon({ name, size = "normal" }: { name: string; size?: "normal" | "large" }) {
  const iconMap: Record<string, string> = {
    "Coinbase Wallet": "🔵",
    "MetaMask": "🦊", 
    "WalletConnect": "🔗",
    "Injected": "💼",
  };

  const sizeClass = size === "large" ? "text-3xl" : "text-lg";
  return <span className={sizeClass}>{iconMap[name] || "🔑"}</span>;
}

function getWalletInfo(name: string) {
  const walletInfoMap: Record<string, { description: string; badge?: string }> = {
    "Coinbase Wallet": { 
      description: "Coinbase's self-custody wallet", 
      badge: "Recommended" 
    },
    "MetaMask": { 
      description: "Most popular Ethereum wallet", 
      badge: "Popular" 
    },
    "WalletConnect": { 
      description: "Connect 100+ mobile wallets" 
    },
    "Injected": { 
      description: "Browser extension wallet" 
    },
  };

  return walletInfoMap[name] || { description: "Connect your wallet" };
}

function getDisplayName(name: string) {
  // Clean up connector names for display
  if (name.includes('Coinbase')) return 'Coinbase';
  if (name.includes('MetaMask')) return 'MetaMask';
  if (name.includes('WalletConnect')) return 'WalletConnect';
  if (name === 'Injected') return 'Browser';
  return name;
}

// Export the wallet configuration info
export const SUPPORTED_WALLETS = [
  {
    name: "Coinbase Wallet",
    description: "Coinbase's self-custody wallet",
    icon: "🔵",
    recommended: true,
  },
  {
    name: "MetaMask",
    description: "The most popular Ethereum wallet",
    icon: "🦊",
    popular: true,
  },
  {
    name: "WalletConnect",
    description: "Connect with 100+ wallets",
    icon: "🔗",
  },
  {
    name: "Other Wallets",
    description: "Browser extension wallets",
    icon: "💼",
  },
] as const;