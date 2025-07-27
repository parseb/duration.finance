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

  return (
    <div className="flex flex-col gap-4">
      {/* OnchainKit Default Connect Button */}
      <ConnectWallet>
        <Avatar className="h-6 w-6" />
        <Name />
      </ConnectWallet>

      {/* Custom Wallet Selection */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowWalletOptions(!showWalletOptions)}
          className="text-sm text-blue-300 hover:text-blue-100 underline"
        >
          {showWalletOptions ? "Hide" : "Show"} all wallet options
        </button>

        {showWalletOptions && (
          <div className="grid grid-cols-2 gap-2 p-4 bg-blue-800/30 rounded-lg">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setShowWalletOptions(false);
                }}
                className="flex items-center gap-2 p-3 bg-blue-700/50 hover:bg-blue-600/50 rounded-lg transition-colors"
              >
                <WalletIcon name={connector.name} />
                <span className="text-sm font-medium">{connector.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletIcon({ name }: { name: string }) {
  const iconMap: Record<string, string> = {
    "Coinbase Wallet": "🔵",
    "MetaMask": "🦊", 
    "WalletConnect": "🔗",
    "Injected": "💼",
  };

  return <span className="text-lg">{iconMap[name] || "🔑"}</span>;
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