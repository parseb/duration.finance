import { verifyTypedData, recoverTypedDataAddress } from 'viem';
import { base } from 'viem/chains';

// EIP-712 domain for Duration.Finance
export const DURATION_DOMAIN = {
  name: 'Duration.Finance',
  version: '1',
  chainId: base.id,
  verifyingContract: process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS as `0x${string}` || '0x0',
} as const;

// EIP-712 types for unified commitments
export const COMMITMENT_TYPES = {
  OptionCommitment: [
    { name: 'creator', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'premiumAmount', type: 'uint256' },
    { name: 'minDurationDays', type: 'uint256' },
    { name: 'maxDurationDays', type: 'uint256' },
    { name: 'optionType', type: 'uint8' },
    { name: 'commitmentType', type: 'uint8' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// Legacy EIP-712 types for LP commitments (backward compatibility)
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

// Option types enum
export enum OptionType {
  CALL = 0,
  PUT = 1,
}

// Commitment types enum
export enum CommitmentType {
  LP_OFFER = 0,
  TAKER_DEMAND = 1,
}

// Unified Commitment interface
export interface OptionCommitment {
  creator: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  premiumAmount: bigint; // Daily rate for LP_OFFER, total amount for TAKER_DEMAND
  minDurationDays: bigint;
  maxDurationDays: bigint;
  optionType: OptionType;
  commitmentType: CommitmentType;
  expiry: bigint;
  nonce: bigint;
}

// Signed commitment
export interface SignedOptionCommitment extends OptionCommitment {
  signature: `0x${string}`;
}

// Legacy LP Commitment interface (backward compatibility)
export interface LPCommitment {
  lp: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  dailyPremiumUsdc: bigint;
  minLockDays: bigint;
  maxDurationDays: bigint;
  optionType: OptionType;
  expiry: bigint;
  nonce: bigint;
}

// Legacy LP Commitment with signature
export interface SignedLPCommitment extends LPCommitment {
  signature: `0x${string}`;
}

/**
 * Verify unified commitment signature off-chain
 */
export async function verifyCommitmentSignature(
  commitment: SignedOptionCommitment
): Promise<{ isValid: boolean; recoveredAddress?: `0x${string}`; error?: string }> {
  try {
    // Extract signature from commitment
    const { signature, ...commitmentData } = commitment;

    // Recover the signer address
    const recoveredAddress = await recoverTypedDataAddress({
      domain: DURATION_DOMAIN,
      types: COMMITMENT_TYPES,
      primaryType: 'OptionCommitment',
      message: commitmentData,
      signature,
    });

    // Check if recovered address matches the creator address
    const isValid = recoveredAddress.toLowerCase() === commitment.creator.toLowerCase();

    return {
      isValid,
      recoveredAddress,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

/**
 * Verify LP commitment signature off-chain (legacy support)
 */
export async function verifyLPCommitmentSignature(
  commitment: SignedLPCommitment
): Promise<{ isValid: boolean; recoveredAddress?: `0x${string}`; error?: string }> {
  try {
    // Extract signature from commitment
    const { signature, ...commitmentData } = commitment;

    // Recover the signer address
    const recoveredAddress = await recoverTypedDataAddress({
      domain: DURATION_DOMAIN,
      types: LP_COMMITMENT_TYPES,
      primaryType: 'LPCommitment',
      message: commitmentData,
      signature,
    });

    // Check if recovered address matches the LP address
    const isValid = recoveredAddress.toLowerCase() === commitment.lp.toLowerCase();

    return {
      isValid,
      recoveredAddress,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

/**
 * Validate unified commitment structure (off-chain validation)
 */
export function validateCommitmentStructure(
  commitment: OptionCommitment
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check expiry
  if (commitment.expiry <= BigInt(Math.floor(Date.now() / 1000))) {
    errors.push('Commitment has expired');
  }

  // Check amount limits (0.001 to 1 WETH)
  const minSize = BigInt('1000000000000000'); // 0.001 ETH in wei
  const maxSize = BigInt('1000000000000000000'); // 1 ETH in wei
  if (commitment.amount < minSize || commitment.amount > maxSize) {
    errors.push(`Amount must be between ${minSize} and ${maxSize} wei`);
  }

  // Check asset is WETH (Base)
  const WETH_BASE = '0x4200000000000000000000000000000000000006';
  if (commitment.asset.toLowerCase() !== WETH_BASE.toLowerCase()) {
    errors.push('Asset must be WETH on Base');
  }

  // Check duration limits (1-365 days)
  if (commitment.minDurationDays < 1n || commitment.maxDurationDays > 365n) {
    errors.push('Duration must be between 1 and 365 days');
  }

  if (commitment.minDurationDays > commitment.maxDurationDays) {
    errors.push('Min duration cannot be greater than max duration');
  }

  // Check premium amount
  if (commitment.premiumAmount === 0n) {
    errors.push('Premium amount must be greater than 0');
  }

  // Check option type
  if (![0, 1].includes(commitment.optionType)) {
    errors.push('Option type must be CALL (0) or PUT (1)');
  }

  // Check commitment type
  if (![0, 1].includes(commitment.commitmentType)) {
    errors.push('Commitment type must be LP_OFFER (0) or TAKER_DEMAND (1)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate LP commitment structure (legacy support)
 */
export function validateLPCommitmentStructure(
  commitment: LPCommitment
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check expiry
  if (commitment.expiry <= BigInt(Math.floor(Date.now() / 1000))) {
    errors.push('Commitment has expired');
  }

  // Check amount limits (0.001 to 1 WETH)
  const minSize = BigInt('1000000000000000'); // 0.001 ETH in wei
  const maxSize = BigInt('1000000000000000000'); // 1 ETH in wei
  if (commitment.amount < minSize || commitment.amount > maxSize) {
    errors.push(`Amount must be between ${minSize} and ${maxSize} wei`);
  }

  // Check asset is WETH (Base)
  const WETH_BASE = '0x4200000000000000000000000000000000000006';
  if (commitment.asset.toLowerCase() !== WETH_BASE.toLowerCase()) {
    errors.push('Asset must be WETH on Base');
  }

  // Check duration limits (1-365 days)
  if (commitment.minLockDays < 1n || commitment.maxDurationDays > 365n) {
    errors.push('Duration must be between 1 and 365 days');
  }

  if (commitment.minLockDays > commitment.maxDurationDays) {
    errors.push('Min lock days cannot be greater than max duration days');
  }

  // Check daily premium
  if (commitment.dailyPremiumUsdc === 0n) {
    errors.push('Daily premium must be greater than 0');
  }

  // Check option type
  if (![0, 1].includes(commitment.optionType)) {
    errors.push('Option type must be CALL (0) or PUT (1)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Complete LP commitment validation (structure + signature)
 */
export async function validateLPCommitment(
  commitment: SignedLPCommitment
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Validate structure
  const structureValidation = validateLPCommitmentStructure(commitment);
  if (!structureValidation.isValid) {
    errors.push(...structureValidation.errors);
  }

  // Verify signature
  const signatureValidation = await verifyLPCommitmentSignature(commitment);
  if (!signatureValidation.isValid) {
    errors.push(signatureValidation.error || 'Invalid signature');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create hash for LP commitment (for database indexing)
 */
export function hashLPCommitment(commitment: LPCommitment): string {
  // Create a deterministic hash from commitment data
  const data = JSON.stringify({
    lp: commitment.lp,
    asset: commitment.asset,
    amount: commitment.amount.toString(),
    dailyPremiumUsdc: commitment.dailyPremiumUsdc.toString(),
    minLockDays: commitment.minLockDays.toString(),
    maxDurationDays: commitment.maxDurationDays.toString(),
    optionType: commitment.optionType,
    expiry: commitment.expiry.toString(),
    nonce: commitment.nonce.toString(),
  });

  // Simple hash for now - in production, use keccak256 like the contract
  return Buffer.from(data).toString('base64');
}

/**
 * Check if commitment should be cleaned up from database
 */
export async function shouldCleanupCommitment(
  commitment: SignedLPCommitment,
  checkAssets: (lp: string, asset: string, amount: bigint) => Promise<boolean>
): Promise<{ shouldCleanup: boolean; reason?: string }> {
  // 1. Check signature validity
  const signatureCheck = await verifyLPCommitmentSignature(commitment);
  if (!signatureCheck.isValid) {
    return { shouldCleanup: true, reason: 'Invalid signature' };
  }

  // 2. Check expiry
  if (commitment.expiry <= BigInt(Math.floor(Date.now() / 1000))) {
    return { shouldCleanup: true, reason: 'Commitment expired' };
  }

  // 3. Check LP has assets and allowance
  const hasAssets = await checkAssets(commitment.lp, commitment.asset, commitment.amount);
  if (!hasAssets) {
    return { shouldCleanup: true, reason: 'LP insufficient assets or allowance' };
  }

  // All checks passed - keep commitment
  return { shouldCleanup: false };
}