// EIP-712 signing utilities for LP commitments
// Must match exactly with smart contract struct and type hash

import { Address, Hash, verifyTypedData, signTypedData } from 'viem';
import { LPCommitmentStruct } from '../api/duration-options';

// EIP-712 Domain - MUST match contract exactly
export const LP_COMMITMENT_DOMAIN = {
  name: 'DurationOptions', // Must match contract's EIP712 name
  version: '1.0', // Must match contract's version
  chainId: 84532, // Base Sepolia - change to 8453 for mainnet
  verifyingContract: '0x8cD578CfaF2139A315F3ac4E76E42de3F571CF6D' as Address, // Deployed contract address
} as const;

// EIP-712 Types - MUST match smart contract exactly
export const COMMITMENT_TYPES = {
  Commitment: [
    { name: 'creator', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'dailyPremiumUsdc', type: 'uint256' },
    { name: 'minLockDays', type: 'uint256' },
    { name: 'maxDurationDays', type: 'uint256' },
    { name: 'optionType', type: 'uint8' },
    { name: 'commitmentType', type: 'uint8' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// Commitment types
export enum CommitmentType {
  OFFER = 0,  // LP provides liquidity
  DEMAND = 1  // Taker seeks liquidity
}

// Create signing message (without signature field)
export interface CommitmentMessage {
  creator: Address;
  asset: Address;
  amount: bigint;
  dailyPremiumUsdc: bigint;
  minLockDays: bigint;
  maxDurationDays: bigint;
  optionType: number; // 0 for CALL, 1 for PUT
  commitmentType: CommitmentType;
  expiry: bigint;
  nonce: bigint;
}

/**
 * Sign commitment using EIP-712
 * @param commitment The commitment data (without signature)
 * @param privateKey The creator's private key
 * @param contractAddress The deployed contract address
 * @param chainId The chain ID (8453 for Base, 84532 for Base Sepolia)
 * @returns The signed commitment with signature
 */
export async function signCommitment(
  commitment: CommitmentMessage,
  privateKey: Hash,
  contractAddress: Address,
  chainId: number = 84532
): Promise<any> {
  const domain = {
    ...LP_COMMITMENT_DOMAIN,
    chainId,
    verifyingContract: contractAddress,
  };

  const signature = await signTypedData({
    domain,
    types: COMMITMENT_TYPES,
    primaryType: 'Commitment',
    message: commitment,
    privateKey,
  });

  // Return struct with signature (convert BigInts to strings for JSON compatibility)
  return {
    creator: commitment.creator,
    asset: commitment.asset,
    amount: commitment.amount.toString(),
    dailyPremiumUsdc: commitment.dailyPremiumUsdc.toString(),
    minLockDays: Number(commitment.minLockDays),
    maxDurationDays: Number(commitment.maxDurationDays),
    optionType: commitment.optionType as 0 | 1,
    commitmentType: commitment.commitmentType,
    expiry: commitment.expiry.toString(),
    nonce: commitment.nonce.toString(),
    signature,
  };
}

/**
 * Verify commitment signature
 * @param commitment The signed commitment
 * @param contractAddress The deployed contract address
 * @param chainId The chain ID
 * @returns True if signature is valid
 */
export async function verifyCommitment(
  commitment: any,
  contractAddress: Address,
  chainId: number = 84532
): Promise<boolean> {
  const domain = {
    ...LP_COMMITMENT_DOMAIN,
    chainId,
    verifyingContract: contractAddress,
  };

  const message: CommitmentMessage = {
    creator: commitment.creator,
    asset: commitment.asset,
    amount: BigInt(commitment.amount),
    dailyPremiumUsdc: BigInt(commitment.dailyPremiumUsdc),
    minLockDays: BigInt(commitment.minLockDays),
    maxDurationDays: BigInt(commitment.maxDurationDays),
    optionType: commitment.optionType,
    commitmentType: commitment.commitmentType,
    expiry: BigInt(commitment.expiry),
    nonce: BigInt(commitment.nonce),
  };

  return await verifyTypedData({
    address: commitment.creator,
    domain,
    types: COMMITMENT_TYPES,
    primaryType: 'Commitment',
    message,
    signature: commitment.signature,
  });
}

/**
 * Generate nonce for commitment
 * @param creatorAddress The creator address
 * @returns A unique nonce
 */
export function generateNonce(creatorAddress: Address): bigint {
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
 * @param params Commitment parameters
 * @returns Message ready for EIP-712 signing
 */
export function createCommitmentMessage(params: {
  creator: Address;
  asset: Address;
  amount: string; // WETH amount (e.g., "1.5")
  dailyPremiumUsdc: string; // Daily premium (e.g., "75.50")
  minLockDays: number;
  maxDurationDays: number;
  optionType: 'CALL' | 'PUT';
  commitmentType: CommitmentType;
  expiryHours?: number;
}): CommitmentMessage {
  return {
    creator: params.creator,
    asset: params.asset,
    amount: BigInt(Math.floor(parseFloat(params.amount) * 1e18)), // Convert to wei
    dailyPremiumUsdc: BigInt(Math.floor(parseFloat(params.dailyPremiumUsdc) * 1e6)), // Convert to USDC (6 decimals)
    minLockDays: BigInt(params.minLockDays),
    maxDurationDays: BigInt(params.maxDurationDays),
    optionType: params.optionType === 'CALL' ? 0 : 1,
    commitmentType: params.commitmentType,
    expiry: calculateExpiry(params.expiryHours),
    nonce: generateNonce(params.creator),
  };
}