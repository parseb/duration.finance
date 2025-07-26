/**
 * DurationOptions Contract ABI
 * Updated with security fixes: nonce validation, proper access control, reentrancy protection
 */
import durationOptionsAbi from './DurationOptions.json';

export const durationOptionsABI = durationOptionsAbi as const;

// Export type-safe contract interface
export type DurationOptionsABI = typeof durationOptionsAbi;