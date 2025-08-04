import { Pool, PoolClient, QueryResult } from 'pg';
import { SignedLPCommitment, validateLPCommitment, hashLPCommitment } from '../eip712/verification';
import { CommitmentValidator } from './commitment-validation';
import { CommitmentStorage } from './commitment-storage';

/**
 * PostgreSQL implementation of commitment storage
 */
export class PostgreSQLCommitmentStorage implements CommitmentStorage {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async store(commitment: SignedLPCommitment): Promise<string> {
    // Skip signature validation in development for testing
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log('Development mode: Skipping signature validation');
    } else {
      // Validate commitment before storing
      const validation = await validateLPCommitment(commitment);
      if (!validation.isValid) {
        throw new Error(`Invalid commitment: ${validation.errors.join(', ')}`);
      }
    }

    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO commitments (
          lp_address, 
          asset_address, 
          amount, 
          daily_premium_usdc,
          min_lock_days, 
          max_duration_days, 
          option_type, 
          expiry, 
          nonce, 
          signature
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id::text
      `;

      const values = [
        commitment.lp,
        commitment.asset,
        commitment.amount.toString(),
        (Number(commitment.dailyPremiumUsdc) / 1e6).toString(), // Convert to USDC with 6 decimals
        Number(commitment.minLockDays || 1), // Minimum lock days
        Number(commitment.maxDurationDays), // Maximum duration days
        commitment.optionType, // Keep as number (0 for CALL, 1 for PUT)
        Number(commitment.expiry), // Store as Unix timestamp (BIGINT)
        Number(commitment.nonce),
        commitment.signature,
      ];

      const result = await client.query(query, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async get(commitmentId: string): Promise<SignedLPCommitment | null> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT * FROM commitments 
        WHERE id = $1 AND taken_at IS NULL
      `;

      const result = await client.query(query, [commitmentId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToCommitment(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getByLP(lpAddress: string): Promise<SignedLPCommitment[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT * FROM commitments 
        WHERE lp_address = $1 
          AND taken_at IS NULL 
          AND expiry > EXTRACT(EPOCH FROM NOW())
        ORDER BY created_at DESC
      `;

      const result = await client.query(query, [lpAddress.toLowerCase()]);
      
      return result.rows.map(row => this.rowToCommitment(row));
    } finally {
      client.release();
    }
  }

  async getAllActive(): Promise<SignedLPCommitment[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT * FROM commitments 
        WHERE taken_at IS NULL 
          AND expiry > EXTRACT(EPOCH FROM NOW())
        ORDER BY created_at DESC
      `;

      const result = await client.query(query);
      
      return result.rows.map(row => this.rowToCommitment(row));
    } finally {
      client.release();
    }
  }

  async remove(commitmentId: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        DELETE FROM commitments 
        WHERE id = $1 AND taken_at IS NULL
      `;

      const result = await client.query(query, [commitmentId]);
      
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async cleanup(validator: CommitmentValidator): Promise<{ removed: number; reasons: string[] }> {
    const client = await this.pool.connect();
    
    try {
      // Get all active commitments
      const activeCommitments = await this.getAllActive();
      
      const toRemove: string[] = [];
      const reasons: string[] = [];
      
      // Validate each commitment
      for (const commitment of activeCommitments) {
        const validation = await validator.validateCommitment(commitment);
        
        if (validation.shouldCleanup) {
          const commitmentId = hashLPCommitment(commitment);
          toRemove.push(commitmentId);
          if (validation.reason) {
            reasons.push(validation.reason);
          }
        }
      }
      
      // Remove invalid commitments
      if (toRemove.length > 0) {
        const query = `
          DELETE FROM commitments 
          WHERE id = ANY($1::uuid[]) AND taken_at IS NULL
        `;
        
        await client.query(query, [toRemove]);
      }
      
      return { removed: toRemove.length, reasons };
    } finally {
      client.release();
    }
  }

  /**
   * Mark a commitment as taken (when converted to active option)
   */
  async markAsTaken(commitmentId: string, positionHash: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE commitments 
        SET taken_at = NOW()
        WHERE id = $1 AND taken_at IS NULL
      `;

      const result = await client.query(query, [commitmentId]);
      
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Store active option position
   */
  async storeActiveOption(
    positionHash: string,
    commitmentId: string | null,
    takerAddress: string,
    lpAddress: string,
    assetAddress: string,
    amount: bigint,
    strikePrice: bigint,
    premiumPaidUsdc: bigint,
    optionType: number,
    expiryTimestamp: Date
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO active_options (
          position_hash,
          commitment_id,
          taker_address,
          lp_address,
          asset_address,
          amount,
          strike_price,
          premium_paid_usdc,
          option_type,
          expiry_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      const values = [
        positionHash,
        commitmentId,
        takerAddress,
        lpAddress,
        assetAddress,
        amount.toString(),
        strikePrice.toString(),
        (Number(premiumPaidUsdc) / 1e6).toString(), // Convert to decimal
        optionType,
        expiryTimestamp,
      ];

      await client.query(query, values);
    } finally {
      client.release();
    }
  }

  /**
   * Get user's portfolio (both LP and taker positions)
   */
  async getUserPortfolio(userAddress: string): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT * FROM user_portfolio 
        WHERE user_address = $1
        ORDER BY created_at DESC
      `;

      const result = await client.query(query, [userAddress.toLowerCase()]);
      
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get commitment statistics
   */
  async getStats(): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query('SELECT * FROM get_commitment_stats()');
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Convert database row to SignedLPCommitment
   */
  private rowToCommitment(row: any): SignedLPCommitment {
    // Helper to safely convert values to BigInt
    const toBigInt = (value: any): bigint => {
      if (typeof value === 'string') {
        // Remove decimal places for BigInt conversion
        const parts = value.split('.');
        return BigInt(parts[0]);
      }
      return BigInt(Math.floor(Number(value)));
    };
    
    // Convert daily premium from USDC decimal to wei (multiply by 1e6)
    const dailyPremiumUsdc = BigInt(Math.round(parseFloat(row.daily_premium_usdc.toString()) * 1e6));
    
    return {
      id: row.id, // Include database ID for cancellation
      lp: row.lp_address as `0x${string}`,
      asset: row.asset_address as `0x${string}`,
      amount: toBigInt(row.amount),
      dailyPremiumUsdc: dailyPremiumUsdc,
      minLockDays: BigInt(row.min_lock_days || 1),
      maxDurationDays: BigInt(row.max_duration_days || 7),
      optionType: Number(row.option_type), // Already stored as number (0 or 1)
      expiry: BigInt(row.expiry), // Already stored as Unix timestamp
      nonce: BigInt(row.nonce),
      signature: row.signature as `0x${string}`,
    };
  }
}

/**
 * Create PostgreSQL storage instance
 */
export function createPostgreSQLStorage(connectionString: string): PostgreSQLCommitmentStorage {
  return new PostgreSQLCommitmentStorage(connectionString);
}