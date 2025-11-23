import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import type Transport from '@ledgerhq/hw-transport';
import Eth from '@ledgerhq/hw-app-eth';
import { ethers, TransactionRequest, TypedDataDomain, TypedDataField, Transaction } from 'ethers';
import { BaseSigner } from './BaseSigner';

/**
 * Ledger hardware wallet signer
 * Communicates with Ledger device via WebHID
 */
export class LedgerSigner implements BaseSigner {
  private transport: Transport | null = null;
  private eth: Eth | null = null;
  private derivationPath: string;
  private cachedAddress: string | null = null;

  constructor(derivationPath: string = "m/44'/60'/0'/0/0") {
    this.derivationPath = derivationPath;
  }

  /**
   * Connect to Ledger device
   */
  private async connect(): Promise<void> {
    if (this.transport && this.eth) {
      return; // Already connected
    }

    try {
      this.transport = await TransportWebHID.create();
      if (!this.transport) {
        throw new Error('Failed to create transport');
      }
      this.eth = new Eth(this.transport);
    } catch (error) {
      throw new Error(`Failed to connect to Ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disconnect from Ledger device
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.eth = null;
    }
  }

  /**
   * Get the address for this derivation path
   */
  async getAddress(): Promise<string> {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    await this.connect();

    if (!this.eth) {
      throw new Error('Ledger not connected');
    }

    try {
      const result = await this.eth.getAddress(this.derivationPath, false, true);
      this.cachedAddress = ethers.getAddress(result.address); // Checksum address
      return this.cachedAddress;
    } catch (error) {
      throw new Error(`Failed to get address from Ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sign a message with Ledger
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    await this.connect();

    if (!this.eth) {
      throw new Error('Ledger not connected');
    }

    try {
      // Convert message to hex if it's a string
      const messageHex = typeof message === 'string'
        ? ethers.hexlify(ethers.toUtf8Bytes(message))
        : ethers.hexlify(message);

      // Remove 0x prefix for Ledger
      const messageBytes = messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex;

      const result = await this.eth.signPersonalMessage(this.derivationPath, messageBytes);

      // Combine v, r, s into signature
      let v = result.v;
      if (typeof v === 'string') {
        v = parseInt(v, 10);
      }

      const signature = {
        r: '0x' + result.r,
        s: '0x' + result.s,
        v: v as number
      };

      return ethers.Signature.from(signature).serialized;
    } catch (error) {
      throw new Error(`Failed to sign message with Ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sign a transaction with Ledger
   */
  async signTransaction(transaction: TransactionRequest): Promise<string> {
    await this.connect();

    if (!this.eth) {
      throw new Error('Ledger not connected');
    }

    try {
      // Prepare transaction for signing
      const tx = {
        to: transaction.to ? String(transaction.to) : undefined,
        value: transaction.value ? BigInt(transaction.value.toString()) : undefined,
        data: transaction.data || '0x',
        nonce: transaction.nonce,
        gasLimit: transaction.gasLimit,
        gasPrice: transaction.gasPrice,
        maxFeePerGas: transaction.maxFeePerGas,
        maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
        chainId: transaction.chainId,
        type: transaction.type
      };

      // Serialize the transaction for Ledger
      const unsignedTx = Transaction.from(tx).unsignedSerialized;

      // Remove 0x prefix
      const txHex = unsignedTx.startsWith('0x') ? unsignedTx.slice(2) : unsignedTx;

      // Sign with Ledger
      const signature = await this.eth.signTransaction(this.derivationPath, txHex);

      // Parse v correctly - Ledger returns it as a number
      const v = typeof signature.v === 'string' ? parseInt(signature.v, 10) : signature.v;

      // Combine signature with transaction
      const signedTx = Transaction.from({
        ...tx,
        signature: {
          r: '0x' + signature.r,
          s: '0x' + signature.s,
          v: v
        }
      });

      return signedTx.serialized;
    } catch (error) {
      throw new Error(`Failed to sign transaction with Ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sign EIP-712 typed data with Ledger
   */
  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string> {
    await this.connect();

    if (!this.eth) {
      throw new Error('Ledger not connected');
    }

    try {
      // Prepare EIP-712 data for Ledger
      const domainSeparatorHex = ethers.TypedDataEncoder.hashDomain(domain);
      const messageHashHex = ethers.TypedDataEncoder.from(types).hash(value);

      // Remove 0x prefix
      const domainSeparator = domainSeparatorHex.startsWith('0x') ? domainSeparatorHex.slice(2) : domainSeparatorHex;
      const messageHash = messageHashHex.startsWith('0x') ? messageHashHex.slice(2) : messageHashHex;

      // Sign with Ledger
      const result = await this.eth.signEIP712HashedMessage(
        this.derivationPath,
        domainSeparator,
        messageHash
      );

      // Combine v, r, s into signature
      let v = result.v;
      if (typeof v === 'string') {
        v = parseInt(v, 10);
      }

      const signature = {
        r: '0x' + result.r,
        s: '0x' + result.s,
        v: v as number
      };

      return ethers.Signature.from(signature).serialized;
    } catch (error) {
      throw new Error(`Failed to sign typed data with Ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get public key from Ledger
   */
  async getPublicKey(): Promise<string> {
    await this.connect();

    if (!this.eth) {
      throw new Error('Ledger not connected');
    }

    try {
      const result = await this.eth.getAddress(this.derivationPath, false, true);
      return '0x' + result.publicKey;
    } catch (error) {
      throw new Error(`Failed to get public key from Ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear cached data and disconnect
   */
  clear(): void {
    this.cachedAddress = null;
    this.disconnect().catch(console.error);
  }

  /**
   * Set derivation path
   */
  setDerivationPath(path: string): void {
    this.derivationPath = path;
    this.cachedAddress = null; // Clear cached address
  }

  /**
   * Get current derivation path
   */
  getDerivationPath(): string {
    return this.derivationPath;
  }
}

/**
 * Helper functions for Ledger device management
 */
export class LedgerDeviceManager {
  /**
   * Check if WebHID is supported in this environment
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  /**
   * Request permission to connect to Ledger device
   * Opens browser's device selection dialog
   */
  static async requestDevice(): Promise<boolean> {
    try {
      const transport = await TransportWebHID.create();
      await transport.close();
      return true;
    } catch (error) {
      console.error('Failed to request Ledger device:', error);
      return false;
    }
  }

  /**
   * List all connected Ledger devices
   */
  static async listDevices(): Promise<any[]> {
    try {
      return await TransportWebHID.list();
    } catch (error) {
      console.error('Failed to list Ledger devices:', error);
      return [];
    }
  }

  /**
   * Derive multiple addresses from Ledger
   * Useful for account discovery
   */
  static async deriveAddresses(
    basePath: string = "m/44'/60'/0'/0",
    count: number = 5
  ): Promise<Array<{ address: string; path: string; index: number }>> {
    const transport = await TransportWebHID.create();
    const eth = new Eth(transport);
    const addresses = [];

    try {
      for (let i = 0; i < count; i++) {
        const path = `${basePath}/${i}`;
        const result = await eth.getAddress(path, false, true);
        addresses.push({
          address: ethers.getAddress(result.address),
          path,
          index: i
        });
      }
    } finally {
      await transport.close();
    }

    return addresses;
  }
}
