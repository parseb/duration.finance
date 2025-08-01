/**
 * x402 Payment Client for Duration.Finance
 * Handles payment required API endpoints
 */

export interface X402PaymentInfo {
  amount: number;
  token: string;
  recipient: string;
  chainId: number;
  description: string;
}

export interface X402Response {
  error: string;
  code: number;
  message: string;
  payment: X402PaymentInfo;
  instructions: string;
}

export interface CommitmentCreateRequest {
  lp: string;
  asset: string;
  amount: string;
  dailyPremiumUsdc: string;
  minLockDays: string;
  maxDurationDays: string;
  optionType: number;
  expiry: string;
  nonce: string;
  isFramentable: boolean;
  signature: string;
}

export class X402Client {
  private baseUrl: string;
  private paymentHash?: string;
  private paymentAmount?: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Set payment information after making payment transaction
   */
  setPayment(transactionHash: string, amountUsdc: number) {
    this.paymentHash = transactionHash;
    this.paymentAmount = (amountUsdc * 1e6).toString(); // Convert to USDC wei
  }

  /**
   * Create LP commitment with x402 payment
   */
  async createCommitment(commitment: CommitmentCreateRequest): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add payment headers if available
    if (this.paymentHash && this.paymentAmount) {
      headers['X-Payment-Hash'] = this.paymentHash;
      headers['X-Payment-Amount'] = this.paymentAmount;
    }

    const response = await fetch(`${this.baseUrl}/api/x402/commitments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(commitment),
    });

    if (response.status === 402) {
      // Payment required
      const x402Data: X402Response = await response.json();
      throw new PaymentRequiredError(x402Data);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create commitment');
    }

    return response.json();
  }

  /**
   * Read commitments (free)
   */
  async getCommitments(filters?: {
    creator?: string;
    type?: string;
    lp?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.creator) params.append('creator', filters.creator);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.lp) params.append('lp', filters.lp);

    const url = `${this.baseUrl}/api/x402/commitments${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch commitments');
    }

    return response.json();
  }
}

export class PaymentRequiredError extends Error {
  public paymentInfo: X402PaymentInfo;
  public instructions: string;

  constructor(x402Response: X402Response) {
    super(x402Response.message);
    this.name = 'PaymentRequiredError';
    this.paymentInfo = x402Response.payment;
    this.instructions = x402Response.instructions;
  }
}

/**
 * Example usage:
 * 
 * const client = new X402Client('http://localhost:3001');
 * 
 * try {
 *   // This will throw PaymentRequiredError on first attempt
 *   await client.createCommitment(commitmentData);
 * } catch (error) {
 *   if (error instanceof PaymentRequiredError) {
 *     // Show payment UI to user
 *     console.log('Payment required:', error.paymentInfo);
 *     
 *     // After user pays, set payment info and retry
 *     client.setPayment('0x123...', 1); // $1 USDC
 *     const result = await client.createCommitment(commitmentData);
 *   }
 * }
 */

// React hook for x402 API (optional)
export function useX402API(baseUrl?: string) {
  const client = new X402Client(baseUrl);

  const createCommitmentWithPayment = async (
    commitment: CommitmentCreateRequest,
    paymentTxHash?: string,
    paymentAmount?: number
  ) => {
    if (paymentTxHash && paymentAmount) {
      client.setPayment(paymentTxHash, paymentAmount);
    }
    return client.createCommitment(commitment);
  };

  return {
    client,
    createCommitmentWithPayment,
    getCommitments: client.getCommitments.bind(client),
    PaymentRequiredError,
  };
}