"use client";

import { useState, useEffect } from "react";
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
  const isMiniApp = useIsMiniApp();

  if (isConnected && address) {
    return (
      <Wallet>
        <div className="flex items-center gap-4">
          <Identity
            address={address}
            schemaId="0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9"
          >
            <Avatar />
            <Name />
            <Address />
            <EthBalance />
          </Identity>
          
          <WalletDropdown>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </div>
      </Wallet>
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