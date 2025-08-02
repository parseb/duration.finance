// EIP-712 signing utilities for LP commitments
// Must match exactly with smart contract struct and type hash

import { Address, Hash, verifyTypedData, signTypedData } from 'viem';
import { LPCommitmentStruct } from '../api/duration-options';

// EIP-712 Domain
export const LP_COMMITMENT_DOMAIN = {
  name: 'Duration.Finance',
  version: '1',
  chainId: 8453, // Base mainnet (change for testnet: 84532)
  verifyingContract: '0x0000000000000000000000000000000000000000' as Address, // Will be updated with deployed address
} as const;

// EIP-712 Types - MUST match smart contract exactly
export const LP_COMMITMENT_TYPES = {
  LPCommitment: [
    { name: 'lp', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'dailyPremiumUsdc', type: 'uint256' },
    { name: 'minLockDays', type: 'uint256' },
    { name: 'maxDurationDays', type: 'uint256' },
    { name: 'optionType', type: 'uint8' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// Create signing message (without signature field)
export interface LPCommitmentMessage {
  lp: Address;
  asset: Address;
  amount: bigint;
  dailyPremiumUsdc: bigint;
  minLockDays: bigint;
  maxDurationDays: bigint;
  optionType: number; // 0 for CALL, 1 for PUT
  expiry: bigint;
  nonce: bigint;
}

/**
 * Sign LP commitment using EIP-712
 * @param commitment The commitment data (without signature)
 * @param privateKey The LP's private key
 * @param contractAddress The deployed contract address
 * @param chainId The chain ID (8453 for Base, 84532 for Base Sepolia)
 * @returns The signed commitment with signature
 */
export async function signLPCommitment(
  commitment: LPCommitmentMessage,
  privateKey: Hash,
  contractAddress: Address,
  chainId: number = 8453
): Promise<LPCommitmentStruct> {
  const domain = {
    ...LP_COMMITMENT_DOMAIN,
    chainId,
    verifyingContract: contractAddress,
  };

  const signature = await signTypedData({
    domain,
    types: LP_COMMITMENT_TYPES,
    primaryType: 'LPCommitment',
    message: commitment,
    privateKey,
  });

  // Return struct with signature (convert BigInts to strings for JSON compatibility)
  return {
    lp: commitment.lp,
    asset: commitment.asset,
    amount: commitment.amount.toString(),
    dailyPremiumUsdc: commitment.dailyPremiumUsdc.toString(),
    minLockDays: Number(commitment.minLockDays),
    maxDurationDays: Number(commitment.maxDurationDays),
    optionType: commitment.optionType as 0 | 1,
    expiry: commitment.expiry.toString(),
    nonce: commitment.nonce.toString(),
    signature,
  };
}

/**
 * Verify LP commitment signature
 * @param commitment The signed commitment
 * @param contractAddress The deployed contract address
 * @param chainId The chain ID
 * @returns True if signature is valid
 */
export async function verifyLPCommitment(
  commitment: LPCommitmentStruct,
  contractAddress: Address,
  chainId: number = 8453
): Promise<boolean> {
  const domain = {
    ...LP_COMMITMENT_DOMAIN,
    chainId,
    verifyingContract: contractAddress,
  };

  const message: LPCommitmentMessage = {
    lp: commitment.lp,
    asset: commitment.asset,
    amount: BigInt(commitment.amount),
    dailyPremiumUsdc: BigInt(commitment.dailyPremiumUsdc),
    minLockDays: BigInt(commitment.minLockDays),
    maxDurationDays: BigInt(commitment.maxDurationDays),
    optionType: commitment.optionType,
    expiry: BigInt(commitment.expiry),
    nonce: BigInt(commitment.nonce),
  };

  return await verifyTypedData({
    address: commitment.lp,
    domain,
    types: LP_COMMITMENT_TYPES,
    primaryType: 'LPCommitment',
    message,
    signature: commitment.signature,
  });
}

/**
 * Generate nonce for commitment
 * @param lpAddress The LP address
 * @returns A unique nonce
 */
export function generateNonce(lpAddress: Address): bigint {
  // Simple nonce generation - in production, should query contract or use timestamp
  return BigInt(Date.now());
}

/**
 * Calculate commitment expiry (default 24 hours from now)
 * @param hoursFromNow Hours until commitment expires
 * @returns Expiry timestamp
 */
export function calculateExpiry(hoursFromNow: number = 24): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + (hoursFromNow * 3600));
}

/**
 * Create commitment message for signing
 * @param params LP commitment parameters
 * @returns Message ready for EIP-712 signing
 */
export function createLPCommitmentMessage(params: {
  lp: Address;
  asset: Address;
  amount: string; // WETH amount (e.g., "1.5")
  dailyPremiumUsdc: string; // Daily premium (e.g., "75.50")
  minLockDays: number;
  maxDurationDays: number;
  optionType: 'CALL' | 'PUT';
  expiryHours?: number;
}): LPCommitmentMessage {
  return {
    lp: params.lp,
    asset: params.asset,
    amount: BigInt(Math.floor(parseFloat(params.amount) * 1e18)), // Convert to wei
    dailyPremiumUsdc: BigInt(Math.floor(parseFloat(params.dailyPremiumUsdc) * 1e6)), // Convert to USDC (6 decimals)
    minLockDays: BigInt(params.minLockDays),
    maxDurationDays: BigInt(params.maxDurationDays),
    optionType: params.optionType === 'CALL' ? 0 : 1,
    expiry: calculateExpiry(params.expiryHours),
    nonce: generateNonce(params.lp),
  };
}