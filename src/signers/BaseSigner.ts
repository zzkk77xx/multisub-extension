import { TransactionRequest, TypedDataDomain, TypedDataField } from 'ethers';

/**
 * Base interface for all signer implementations
 * Supports both software wallets and hardware wallets
 */
export interface BaseSigner {
  /**
   * Get the address for this signer
   */
  getAddress(): Promise<string>;

  /**
   * Sign a message
   * @param message - The message to sign (can be string or bytes)
   * @returns Signature as hex string
   */
  signMessage(message: string | Uint8Array): Promise<string>;

  /**
   * Sign a transaction
   * @param transaction - The transaction to sign
   * @returns Signed transaction as hex string
   */
  signTransaction(transaction: TransactionRequest): Promise<string>;

  /**
   * Sign typed data (EIP-712)
   * @param domain - The EIP-712 domain
   * @param types - The types definition
   * @param value - The value to sign
   * @returns Signature as hex string
   */
  signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string>;

  /**
   * Get the public key (if available)
   * Not all signers support this (e.g., some hardware wallets)
   */
  getPublicKey?(): Promise<string>;

  /**
   * Clear any sensitive data from memory
   */
  clear(): void;
}

/**
 * Type of signer
 */
export enum SignerType {
  SOFTWARE = 'software',
  LEDGER = 'ledger',
  TREZOR = 'trezor', // For future implementation
  WALLETCONNECT = 'walletconnect' // For future implementation
}

/**
 * Account information with signer type
 */
export interface SignerAccount {
  address: string;
  derivationPath: string;
  index: number;
  publicKey?: string;
  signerType: SignerType;

  // Ledger-specific
  deviceId?: string;

  // WalletConnect-specific (future)
  wcSession?: string;
}
