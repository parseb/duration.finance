import { PublicClient, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { SignedLPCommitment, shouldCleanupCommitment } from '../eip712/verification';

// Contract ABI for balance and allowance checks
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

/**
 * Asset checking service for LP commitment validation
 */
export class CommitmentValidator {
  private publicClient: PublicClient;
  private protocolAddress: `0x${string}`;

  constructor(publicClient: PublicClient, protocolAddress: `0x${string}`) {
    this.publicClient = publicClient;
    this.protocolAddress = protocolAddress;
  }

  /**
   * Check if LP has sufficient balance and allowance for the commitment
   */
  async checkLPAssets(
    lpAddress: string,
    assetAddress: string,
    amount: bigint
  ): Promise<boolean> {
    try {
      // Check LP's token balance
      const balance = await this.publicClient.readContract({
        address: assetAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [lpAddress as `0x${string}`],
      });

      // Check LP's allowance to the protocol
      const allowance = await this.publicClient.readContract({
        address: assetAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [lpAddress as `0x${string}`, this.protocolAddress],
      });

      // LP must have sufficient balance and allowance
      return balance >= amount && allowance >= amount;
    } catch (error) {
      console.error('Error checking LP assets:', error);
      return false;
    }
  }

  /**
   * Validate a commitment and determine if it should be cleaned up
   */
  async validateCommitment(commitment: SignedLPCommitment): Promise<{
    isValid: boolean;
    shouldCleanup: boolean;
    reason?: string;
  }> {
    const cleanupResult = await shouldCleanupCommitment(
      commitment,
      (lp, asset, amount) => this.checkLPAssets(lp, asset, amount)
    );

    return {
      isValid: !cleanupResult.shouldCleanup,
      shouldCleanup: cleanupResult.shouldCleanup,
      reason: cleanupResult.reason,
    };
  }
}

/**
 * Batch validation for multiple commitments
 */
export async function validateCommitmentsBatch(
  commitments: SignedLPCommitment[],
  validator: CommitmentValidator
): Promise<{
  valid: SignedLPCommitment[];
  invalid: Array<{ commitment: SignedLPCommitment; reason: string }>;
}> {
  const valid: SignedLPCommitment[] = [];
  const invalid: Array<{ commitment: SignedLPCommitment; reason: string }> = [];

  const results = await Promise.allSettled(
    commitments.map((commitment) => validator.validateCommitment(commitment))
  );

  for (let i = 0; i < commitments.length; i++) {
    const result = results[i];
    const commitment = commitments[i];

    if (result.status === 'fulfilled' && result.value.isValid) {
      valid.push(commitment);
    } else {
      const reason = result.status === 'fulfilled' 
        ? result.value.reason || 'Unknown validation error'
        : 'Validation threw an error';
      
      invalid.push({ commitment, reason });
    }
  }

  return { valid, invalid };
}

/**
 * Create a commitment validator instance
 */
export function createCommitmentValidator(
  rpcUrl: string,
  protocolAddress: `0x${string}`
): CommitmentValidator {
  const publicClient = {
    async readContract(params: any) {
      // Mock implementation for now - replace with actual viem client
      const { address, functionName, args } = params;
      
      if (functionName === 'balanceOf') {
        return BigInt('10000000000000000000'); // 10 ETH
      }
      
      if (functionName === 'allowance') {
        return BigInt('10000000000000000000'); // 10 ETH
      }
      
      return BigInt(0);
    }
  } as PublicClient;

  return new CommitmentValidator(publicClient, protocolAddress);
}