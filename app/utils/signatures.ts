/**
 * EIP-712 signature utilities for DurationOptions commitments
 * Provides secure signature generation for LP and Taker commitments
 */
import { TypedDataDomain, TypedDataField } from 'viem';

/**
 * Create dynamic EIP-712 domain based on current chain and contract address
 * @param chainId Current blockchain chain ID from user's wallet
 * @param contractAddress Contract address for the current chain
 * @returns EIP-712 domain configuration
 */
export function createDurationOptionsDomain(
  chainId: number, 
  contractAddress: `0x${string}`
): TypedDataDomain {
  return {
    name: 'Duration.Finance',  // Must match contract: EIP712("Duration.Finance", "1.0")
    version: '1.0',            // Must match contract version
    chainId: chainId,          // Dynamic chain ID from user's wallet
    verifyingContract: contractAddress,
  };
}

/**
 * Get contract address for the current chain
 * @param chainId Current blockchain chain ID
 * @returns Contract address for the chain
 */
export function getContractAddressForChain(chainId: number): `0x${string}` {
  // Contract addresses for different chains
  const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
    8453: process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE as `0x${string}`,           // Base Mainnet
    84532: process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_BASE_SEPOLIA as `0x${string}`, // Base Sepolia Testnet
    1: process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_ETHEREUM as `0x${string}`,         // Ethereum Mainnet
    11155111: process.env.NEXT_PUBLIC_DURATION_OPTIONS_ADDRESS_SEPOLIA as `0x${string}`,   // Ethereum Sepolia
  };

  const contractAddress = CONTRACT_ADDRESSES[chainId];
  
  if (!contractAddress) {
    throw new Error(`Duration.Finance not deployed on chain ${chainId}. Supported chains: ${Object.keys(CONTRACT_ADDRESSES).join(', ')}`);
  }

  return contractAddress;
}

export const OPTION_COMMITMENT_TYPES: Record<string, TypedDataField[]> = {
  OptionCommitment: [
    { name: 'lp', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'targetPrice', type: 'uint256' },
    { name: 'premium', type: 'uint256' },
    { name: 'durationDays', type: 'uint256' },
    { name: 'optionType', type: 'uint8' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

export interface CommitmentData {
  lp: `0x${string}`;
  taker: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  targetPrice: bigint;
  premium: bigint;
  durationDays: bigint;
  optionType: number;
  expiry: bigint;
  nonce: bigint;
}

/**
 * Create EIP-712 typed data for commitment signature
 * Ensures exact match with contract's OPTION_COMMITMENT_TYPEHASH
 * @param commitment Commitment data to sign
 * @param chainId Current blockchain chain ID from user's wallet
 * @returns EIP-712 typed data structure
 */
export function createCommitmentTypedData(
  commitment: CommitmentData, 
  chainId: number
) {
  // Get contract address for current chain
  const contractAddress = getContractAddressForChain(chainId);
  
  // Create dynamic domain for current chain
  const domain = createDurationOptionsDomain(chainId, contractAddress);

  return {
    domain,
    types: OPTION_COMMITMENT_TYPES,
    primaryType: 'OptionCommitment' as const,
    message: {
      lp: commitment.lp,
      taker: commitment.taker,
      asset: commitment.asset,
      amount: commitment.amount,
      targetPrice: commitment.targetPrice,
      premium: commitment.premium,
      durationDays: commitment.durationDays,
      optionType: commitment.optionType,
      expiry: commitment.expiry,
      nonce: commitment.nonce,
    },
  };
}

/**
 * Verify that our frontend types match the contract's OPTION_COMMITMENT_TYPEHASH
 * This should be called during development to ensure compatibility
 */
export function getExpectedTypeHash(): string {
  // This should match the contract's OPTION_COMMITMENT_TYPEHASH exactly
  return "OptionCommitment(address lp,address taker,address asset,uint256 amount,uint256 targetPrice,uint256 premium,uint256 durationDays,uint8 optionType,uint256 expiry,uint256 nonce)";
}

/**
 * Validate commitment data before signing
 */
export function validateCommitmentData(commitment: CommitmentData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if commitment is LP or Taker
  const isLpCommitment = commitment.lp !== '0x0000000000000000000000000000000000000000';
  const isTakerCommitment = commitment.taker !== '0x0000000000000000000000000000000000000000';

  if (!((isLpCommitment && !isTakerCommitment) || (!isLpCommitment && isTakerCommitment))) {
    errors.push('Must be either LP or Taker commitment, not both');
  }

  // Validate amounts
  if (commitment.amount <= 0n) {
    errors.push('Amount must be greater than 0');
  }

  if (commitment.durationDays <= 0n || commitment.durationDays > 365n) {
    errors.push('Duration must be between 1 and 365 days');
  }

  if (commitment.expiry <= BigInt(Math.floor(Date.now() / 1000))) {
    errors.push('Expiry must be in the future');
  }

  // LP-specific validations
  if (isLpCommitment) {
    if (commitment.targetPrice <= 0n) {
      errors.push('LP must specify target price');
    }
    if (commitment.premium !== 0n) {
      errors.push('LP should not specify premium');
    }
  }

  // Taker-specific validations
  if (isTakerCommitment) {
    if (commitment.premium <= 0n) {
      errors.push('Taker must specify premium');
    }
    if (commitment.targetPrice !== 0n) {
      errors.push('Taker should not specify target price');
    }
  }

  // Validate option type
  if (commitment.optionType !== 0 && commitment.optionType !== 1) {
    errors.push('Option type must be 0 (CALL) or 1 (PUT)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create a complete commitment with signature for LP
 */
export async function createLPCommitment(params: {
  asset: `0x${string}`;
  amount: bigint;
  targetPrice: bigint;
  durationDays: number;
  optionType: 0 | 1;
  nonce: number;
  signer: `0x${string}`;
  chainId: number;  // Added chainId parameter
  signTypedData: (args: any) => Promise<`0x${string}`>;
}): Promise<{
  commitment: CommitmentData & { signature: `0x${string}` };
  typedData: any;
}> {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const commitmentData: CommitmentData = {
    lp: params.signer,
    taker: '0x0000000000000000000000000000000000000000',
    asset: params.asset,
    amount: params.amount,
    targetPrice: params.targetPrice,
    premium: 0n,
    durationDays: BigInt(params.durationDays),
    optionType: params.optionType,
    expiry,
    nonce: BigInt(params.nonce),
  };

  // Validate before signing
  const validation = validateCommitmentData(commitmentData);
  if (!validation.isValid) {
    throw new Error(`Invalid commitment data: ${validation.errors.join(', ')}`);
  }

  const typedData = createCommitmentTypedData(commitmentData, params.chainId);
  const signature = await params.signTypedData(typedData);

  return {
    commitment: {
      ...commitmentData,
      signature,
    },
    typedData,
  };
}

/**
 * Create a complete commitment with signature for Taker
 */
export async function createTakerCommitment(params: {
  asset: `0x${string}`;
  amount: bigint;
  premium: bigint;
  durationDays: number;
  optionType: 0 | 1;
  nonce: number;
  signer: `0x${string}`;
  chainId: number;  // Added chainId parameter
  signTypedData: (args: any) => Promise<`0x${string}`>;
}): Promise<{
  commitment: CommitmentData & { signature: `0x${string}` };
  typedData: any;
}> {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const commitmentData: CommitmentData = {
    lp: '0x0000000000000000000000000000000000000000',
    taker: params.signer,
    asset: params.asset,
    amount: params.amount,
    targetPrice: 0n,
    premium: params.premium,
    durationDays: BigInt(params.durationDays),
    optionType: params.optionType,
    expiry,
    nonce: BigInt(params.nonce),
  };

  // Validate before signing
  const validation = validateCommitmentData(commitmentData);
  if (!validation.isValid) {
    throw new Error(`Invalid commitment data: ${validation.errors.join(', ')}`);
  }

  const typedData = createCommitmentTypedData(commitmentData, params.chainId);
  const signature = await params.signTypedData(typedData);

  return {
    commitment: {
      ...commitmentData,
      signature,
    },
    typedData,
  };
}