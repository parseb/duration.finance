"use client";

import { type ReactNode, useEffect, useState } from "react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base, baseSepolia } from "wagmi/chains";
import { http, WagmiProvider, createConfig } from "wagmi";
import { coinbaseWallet, metaMask, walletConnect, injected } from "wagmi/connectors";

// Enhanced wallet configuration for standard web app
const createWagmiConnectors = () => {
  const connectors = [
    coinbaseWallet({
      appName: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "Duration Finance",
      appLogoUrl: process.env.NEXT_PUBLIC_ICON_URL,
    }),
    metaMask({
      dappMetadata: {
        name: "Duration Finance",
        url: process.env.NEXT_PUBLIC_URL || "https://duration.finance",
      },
    }),
    injected({ shimDisconnect: true }), // Fallback for other injected wallets
  ];

  // Only add WalletConnect if we have a valid project ID
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (walletConnectProjectId && walletConnectProjectId !== "your-walletconnect-project-id") {
    connectors.push(
      walletConnect({
        projectId: walletConnectProjectId,
        metadata: {
          name: "Duration Finance",
          description: "Fully-collateralized options protocol",
          url: process.env.NEXT_PUBLIC_URL || "https://duration.finance",
          icons: [process.env.NEXT_PUBLIC_ICON_URL || "/logo.png"],
        },
      })
    );
  }

  return connectors;
};

const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: createWagmiConnectors(),
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: false,
});

const queryClient = new QueryClient();

// Helper to detect if we're in a Farcaster mini app environment
function useIsMiniApp() {
  const [isMiniApp, setIsMiniApp] = useState(false);
  
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

export function Providers(props: { children: ReactNode }) {
  const isMiniApp = useIsMiniApp();

  // Mini App Provider (Farcaster)
  if (isMiniApp) {
    return (
      <MiniKitProvider
        apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
        chain={base}
        config={{
          appearance: {
            mode: "auto",
            theme: "mini-app-theme",
            name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME,
            logo: process.env.NEXT_PUBLIC_ICON_URL,
          },
        }}
      >
        {props.children}
      </MiniKitProvider>
    );
  }

  // Standard Web App Provider (with multiple wallets)
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: "auto",
              theme: "base",
              name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME,
              logo: process.env.NEXT_PUBLIC_ICON_URL,
            },
          }}
        >
          {props.children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
