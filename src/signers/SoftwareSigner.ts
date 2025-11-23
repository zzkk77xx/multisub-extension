import { ethers, TransactionRequest, TypedDataDomain, TypedDataField } from 'ethers';
import { BaseSigner } from './BaseSigner';

/**
 * Software-based signer using ethers.Wallet
 * Holds private key in memory
 */
export class SoftwareSigner implements BaseSigner {
  private wallet: ethers.Wallet;

  constructor(privateKey: string) {
    this.wallet = new ethers.Wallet(privateKey);
  }

  async getAddress(): Promise<string> {
    return this.wallet.address;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this.wallet.signMessage(message);
  }

  async signTransaction(transaction: TransactionRequest): Promise<string> {
    return this.wallet.signTransaction(transaction);
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  async getPublicKey(): Promise<string> {
    return this.wallet.signingKey.publicKey;
  }

  clear(): void {
    // Clear the wallet reference
    // @ts-ignore - Accessing private property for cleanup
    this.wallet = null;
  }
}
