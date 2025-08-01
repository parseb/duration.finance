import { SignedLPCommitment, validateLPCommitment, hashLPCommitment } from '../eip712/verification';
import { CommitmentValidator } from './commitment-validation';

/**
 * Database interface for LP commitments
 */
export interface CommitmentStorage {
  store(commitment: SignedLPCommitment): Promise<string>;
  get(commitmentId: string): Promise<SignedLPCommitment | null>;
  getByLP(lpAddress: string): Promise<SignedLPCommitment[]>;
  getAllActive(): Promise<SignedLPCommitment[]>;
  remove(commitmentId: string): Promise<boolean>;
  cleanup(validator: CommitmentValidator): Promise<{ removed: number; reasons: string[] }>;
}

/**
 * In-memory commitment storage implementation
 * Replace with actual database implementation (PostgreSQL, etc.)
 */
export class InMemoryCommitmentStorage implements CommitmentStorage {
  private commitments = new Map<string, SignedLPCommitment>();

  async store(commitment: SignedLPCommitment): Promise<string> {
    // Validate commitment before storing
    const validation = await validateLPCommitment(commitment);
    if (!validation.isValid) {
      throw new Error(`Invalid commitment: ${validation.errors.join(', ')}`);
    }

    const commitmentId = hashLPCommitment(commitment);
    this.commitments.set(commitmentId, commitment);
    
    return commitmentId;
  }

  async get(commitmentId: string): Promise<SignedLPCommitment | null> {
    return this.commitments.get(commitmentId) || null;
  }

  async getByLP(lpAddress: string): Promise<SignedLPCommitment[]> {
    const results: SignedLPCommitment[] = [];
    
    for (const commitment of this.commitments.values()) {
      if (commitment.lp.toLowerCase() === lpAddress.toLowerCase()) {
        results.push(commitment);
      }
    }
    
    return results;
  }

  async getAllActive(): Promise<SignedLPCommitment[]> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const results: SignedLPCommitment[] = [];
    
    for (const commitment of this.commitments.values()) {
      if (commitment.expiry > now) {
        results.push(commitment);
      }
    }
    
    return results;
  }

  async remove(commitmentId: string): Promise<boolean> {
    return this.commitments.delete(commitmentId);
  }

  async cleanup(validator: CommitmentValidator): Promise<{ removed: number; reasons: string[] }> {
    const removed: string[] = [];
    const reasons: string[] = [];
    
    for (const [commitmentId, commitment] of this.commitments.entries()) {
      const validation = await validator.validateCommitment(commitment);
      
      if (validation.shouldCleanup) {
        this.commitments.delete(commitmentId);
        removed.push(commitmentId);
        if (validation.reason) {
          reasons.push(validation.reason);
        }
      }
    }
    
    return { removed: removed.length, reasons };
  }
}

/**
 * PostgreSQL commitment storage implementation
 */
export class PostgreSQLCommitmentStorage implements CommitmentStorage {
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async store(commitment: SignedLPCommitment): Promise<string> {
    // Validate commitment before storing
    const validation = await validateLPCommitment(commitment);
    if (!validation.isValid) {
      throw new Error(`Invalid commitment: ${validation.errors.join(', ')}`);
    }

    const commitmentId = hashLPCommitment(commitment);
    
    // TODO: Implement actual PostgreSQL insertion
    // INSERT INTO commitments (id, lp_address, asset_address, amount, daily_premium_usdc, 
    //   min_lock_days, max_duration_days, option_type, expiry, nonce, is_framentable, signature, created_at)
    // VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    
    console.log('Would store commitment to PostgreSQL:', commitmentId);
    
    return commitmentId;
  }

  async get(commitmentId: string): Promise<SignedLPCommitment | null> {
    // TODO: Implement actual PostgreSQL query
    // SELECT * FROM commitments WHERE id = ? AND taken_at IS NULL
    
    console.log('Would query commitment from PostgreSQL:', commitmentId);
    return null;
  }

  async getByLP(lpAddress: string): Promise<SignedLPCommitment[]> {
    // TODO: Implement actual PostgreSQL query
    // SELECT * FROM commitments WHERE lp_address = ? AND taken_at IS NULL AND expiry > NOW()
    
    console.log('Would query LP commitments from PostgreSQL:', lpAddress);
    return [];
  }

  async getAllActive(): Promise<SignedLPCommitment[]> {
    // TODO: Implement actual PostgreSQL query
    // SELECT * FROM commitments WHERE taken_at IS NULL AND expiry > NOW()
    
    console.log('Would query all active commitments from PostgreSQL');
    return [];
  }

  async remove(commitmentId: string): Promise<boolean> {
    // TODO: Implement actual PostgreSQL deletion
    // DELETE FROM commitments WHERE id = ?
    
    console.log('Would remove commitment from PostgreSQL:', commitmentId);
    return true;
  }

  async cleanup(validator: CommitmentValidator): Promise<{ removed: number; reasons: string[] }> {
    // TODO: Implement actual PostgreSQL cleanup
    // 1. SELECT all active commitments
    // 2. Validate each one
    // 3. DELETE invalid ones
    
    console.log('Would cleanup commitments in PostgreSQL');
    return { removed: 0, reasons: [] };
  }
}

/**
 * Create commitment storage instance
 */
export function createCommitmentStorage(type: 'memory' | 'postgresql', config?: any): CommitmentStorage {
  switch (type) {
    case 'memory':
      return new InMemoryCommitmentStorage();
    case 'postgresql':
      if (!config?.connectionString) {
        throw new Error('PostgreSQL connection string required');
      }
      return new PostgreSQLCommitmentStorage(config.connectionString);
    default:
      throw new Error(`Unsupported storage type: ${type}`);
  }
}