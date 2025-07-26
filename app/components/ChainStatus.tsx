/**
 * Chain Status Component
 * Shows current chain and Duration.Finance contract deployment status
 * Helps users understand multi-chain support
 */
'use client';

import { useChainId, useAccount, useSwitchChain } from 'wagmi';
import { useDurationOptionsAddress } from '../hooks/useDurationOptions';
import { useSupportedChains } from '../hooks/useSignedCommitments';
import { getContractAddressForChain } from '../utils/signatures';

export function ChainStatus() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const contractAddress = useDurationOptionsAddress();
  const { supportedChains, currentChain, isSupported } = useSupportedChains();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <p className="text-gray-600">Connect wallet to view chain status</p>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${isSupported ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Chain Status</h3>
        <div className={`px-2 py-1 rounded text-sm font-medium ${
          isSupported ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {isSupported ? '✅ Supported' : '❌ Unsupported'}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <strong>Current Chain:</strong> {currentChain?.name || `Unknown (${chainId})`}
        </div>
        
        {isSupported && contractAddress && (
          <div>
            <strong>Contract:</strong> 
            <code className="ml-1 px-1 bg-gray-100 rounded text-xs">
              {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
            </code>
          </div>
        )}

        <div>
          <strong>Network Type:</strong> {currentChain?.testnet ? 'Testnet' : 'Mainnet'}
        </div>
      </div>

      {!isSupported && (
        <div className="mt-4">
          <p className="text-sm text-red-600 mb-3">
            Duration.Finance is not deployed on this chain. Please switch to a supported chain:
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {supportedChains.map((chain) => (
              <button
                key={chain.chainId}
                onClick={() => switchChain({ chainId: chain.chainId })}
                className="px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 rounded border border-blue-300 transition-colors"
              >
                {chain.name}
                {chain.testnet && <span className="ml-1 text-blue-600">(Testnet)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {isSupported && (
        <div className="mt-4">
          <p className="text-sm text-green-600">
            ✅ You can create and take commitments on this chain
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact chain indicator for navigation/header
 */
export function ChainIndicator() {
  const { currentChain, isSupported } = useSupportedChains();
  const { isConnected } = useAccount();

  if (!isConnected) return null;

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
      isSupported ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      <div className={`w-2 h-2 rounded-full mr-1 ${
        isSupported ? 'bg-green-500' : 'bg-red-500'
      }`} />
      {currentChain?.name || 'Unknown Chain'}
    </div>
  );
}