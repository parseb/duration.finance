// x402 Client Helper
// Client-side utilities for handling x402 payment requirements

import { Address, parseUnits, formatUnits } from 'viem';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { createPaymentProof, PaymentProof } from './payment-middleware';

export interface X402PaymentInfo {
  required: boolean;
  cost: string;
  recipient: Address;
  methods: string[];
  instructions: {
    step1: string;
    step2: string;
    step3: string;
  };
}

export interface X402Error extends Error {
  status: 402;
  paymentInfo: X402PaymentInfo;
}

export class X402Client {
  private baseUrl: string;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make API request with x402 payment handling
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    paymentProof?: PaymentProof
  ): Promise<T> {
    const headers = new Headers(options.headers);
    
    // Add payment proof if provided
    if (paymentProof) {
      headers.set('X-Payment-Proof', JSON.stringify(paymentProof));
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle payment required response
    if (response.status === 402) {
      const paymentInfo = await this.parsePaymentResponse(response);
      const error = new Error('Payment Required') as X402Error;
      error.status = 402;
      error.paymentInfo = paymentInfo;
      throw error;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  /**
   * Parse x402 payment response
   */
  private async parsePaymentResponse(response: Response): Promise<X402PaymentInfo> {
    const data = await response.json();
    
    return {
      required: true,
      cost: response.headers.get('X-Payment-Cost') || data.cost || '1.0 USDC',
      recipient: (response.headers.get('X-Payment-Recipient') || data.recipient) as Address,
      methods: response.headers.get('X-Payment-Methods')?.split(',') || data.methods || ['ERC20-USDC'],
      instructions: data.instructions || {
        step1: 'Send the required USDC amount to the recipient address',
        step2: 'Include the transaction hash in the X-Payment-Proof header',
        step3: 'Retry the request with the payment proof',
      },
    };
  }

  /**
   * Create LP commitment with payment handling
   */
  async createLPCommitment(commitment: any): Promise<any> {
    try {
      return await this.request('/commitments/lp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commitment),
      });
    } catch (error) {
      if (this.isX402Error(error)) {
        // Handle payment requirement
        throw error; // Let the UI handle payment
      }
      throw error;
    }
  }

  /**
   * Take commitment with payment handling
   */
  async takeCommitment(commitmentId: string, data: any): Promise<any> {
    try {
      return await this.request(`/commitments/${commitmentId}/take`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      if (this.isX402Error(error)) {
        throw error; // Let the UI handle payment
      }
      throw error;
    }
  }

  /**
   * Get marketplace liquidity (free)
   */
  async getMarketplaceLiquidity(filters: any = {}): Promise<any> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, value.toString());
      }
    });

    return this.request(`/marketplace/liquidity?${params}`);
  }

  /**
   * Check if error is x402 payment required
   */
  isX402Error(error: any): error is X402Error {
    return error.status === 402;
  }
}

/**
 * React hook for x402 payments
 */
export function useX402Payment() {
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  
  /**
   * Execute USDC payment for x402
   */
  const executePayment = async (
    amount: string,
    recipient: Address
  ): Promise<PaymentProof> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address; // Base USDC
    const amountWei = parseUnits(amount, 6); // USDC has 6 decimals

    // Execute USDC transfer
    const txHash = await writeContract({
      abi: [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      address: usdcAddress,
      functionName: 'transfer',
      args: [recipient, amountWei],
    });

    // Create payment proof
    return createPaymentProof(
      txHash,
      amountWei.toString(),
      recipient,
      address
    );
  };

  return {
    executePayment,
  };
}

/**
 * React hook for x402-enabled API client
 */
export function useX402API() {
  const client = new X402Client();
  const { executePayment } = useX402Payment();

  /**
   * Create LP commitment with automatic payment handling
   */
  const createLPCommitmentWithPayment = async (
    commitment: any,
    onPaymentRequired?: (info: X402PaymentInfo) => void
  ): Promise<any> => {
    try {
      return await client.createLPCommitment(commitment);
    } catch (error) {
      if (client.isX402Error(error)) {
        onPaymentRequired?.(error.paymentInfo);
        
        // Auto-execute payment if user confirms
        // In practice, you'd show a confirmation dialog
        const shouldPay = confirm(`Payment required: ${error.paymentInfo.cost}. Pay now?`);
        
        if (shouldPay) {
          const costAmount = error.paymentInfo.cost.split(' ')[0]; // Extract amount
          const paymentProof = await executePayment(costAmount, error.paymentInfo.recipient);
          
          // Retry with payment proof
          return await client.request('/commitments/lp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(commitment),
          }, paymentProof);
        }
      }
      throw error;
    }
  };

  /**
   * Take commitment with automatic payment handling
   */
  const takeCommitmentWithPayment = async (
    commitmentId: string,
    data: any,
    onPaymentRequired?: (info: X402PaymentInfo) => void
  ): Promise<any> => {
    try {
      return await client.takeCommitment(commitmentId, data);
    } catch (error) {
      if (client.isX402Error(error)) {
        onPaymentRequired?.(error.paymentInfo);
        
        const shouldPay = confirm(`Payment required: ${error.paymentInfo.cost}. Pay now?`);
        
        if (shouldPay) {
          const costAmount = error.paymentInfo.cost.split(' ')[0];
          const paymentProof = await executePayment(costAmount, error.paymentInfo.recipient);
          
          return await client.request(`/commitments/${commitmentId}/take`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }, paymentProof);
        }
      }
      throw error;
    }
  };

  return {
    client,
    createLPCommitmentWithPayment,
    takeCommitmentWithPayment,
    getMarketplaceLiquidity: client.getMarketplaceLiquidity.bind(client),
  };
}

// Export singleton client
export const x402Client = new X402Client();