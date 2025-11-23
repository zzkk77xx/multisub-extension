import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { ethers } from 'ethers';
import { BaseSigner, SoftwareSigner, LedgerSigner, SignerType } from '../signers';

export interface WalletAccount {
  address: string;
  derivationPath: string;
  index: number;
  publicKey?: string;
}

export class Wallet {
  private hdKey: HDKey | null = null;
  private mnemonic: string = '';

  /**
   * Generate a new wallet with a BIP39 mnemonic (12 words by default)
   */
  static generateMnemonic(strength: 128 | 256 = 128): string {
    return bip39.generateMnemonic(wordlist, strength);
  }

  /**
   * Validate a BIP39 mnemonic phrase
   */
  static validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic, wordlist);
  }

  /**
   * Create wallet from mnemonic
   */
  async fromMnemonic(mnemonic: string): Promise<void> {
    if (!Wallet.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    this.mnemonic = mnemonic;
    const seed = await bip39.mnemonicToSeed(mnemonic);
    this.hdKey = HDKey.fromMasterSeed(seed);
  }

  /**
   * Derive an account using BIP44 path
   * Default: m/44'/60'/0'/0/{index} for Ethereum
   *
   * @param index - Account index
   * @param coinType - BIP44 coin type (60 for Ethereum, 966 for Polygon)
   * @param account - Account number
   * @param change - Change address (0 for external, 1 for internal)
   */
  deriveAccount(
    index: number = 0,
    coinType: number = 60,
    account: number = 0,
    change: number = 0
  ): WalletAccount {
    if (!this.hdKey) {
      throw new Error('Wallet not initialized');
    }

    // BIP44 derivation path: m / purpose' / coin_type' / account' / change / address_index
    const path = `m/44'/${coinType}'/${account}'/${change}/${index}`;
    const derived = this.hdKey.derive(path);

    if (!derived.privateKey) {
      throw new Error('Failed to derive private key');
    }

    const privateKeyHex = ethers.hexlify(derived.privateKey);
    const wallet = new ethers.Wallet(privateKeyHex);

    return {
      address: wallet.address,
      derivationPath: path,
      index,
      publicKey: wallet.signingKey.publicKey
    };
  }

  /**
   * Get private key for a specific derivation path
   */
  getPrivateKey(path: string): string {
    if (!this.hdKey) {
      throw new Error('Wallet not initialized');
    }

    const derived = this.hdKey.derive(path);
    if (!derived.privateKey) {
      throw new Error('Failed to derive private key');
    }

    return ethers.hexlify(derived.privateKey);
  }

  /**
   * Sign a message with a specific account
   */
  async signMessage(message: string, path: string): Promise<string> {
    const privateKey = this.getPrivateKey(path);
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signMessage(message);
  }

  /**
   * Sign EIP-712 typed data with a specific account
   */
  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
    path: string
  ): Promise<string> {
    const privateKey = this.getPrivateKey(path);
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signTypedData(domain, types, value);
  }

  /**
   * Sign a transaction with a specific account
   */
  async signTransaction(
    transaction: ethers.TransactionRequest,
    path: string
  ): Promise<string> {
    const privateKey = this.getPrivateKey(path);
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signTransaction(transaction);
  }

  /**
   * Get the mnemonic phrase (use with caution)
   */
  getMnemonic(): string {
    return this.mnemonic;
  }

  /**
   * Clear sensitive data from memory
   */
  clear(): void {
    this.hdKey = null;
    this.mnemonic = '';
  }

  /**
   * Create a signer for a specific account
   * Returns appropriate signer based on account type
   */
  createSigner(path: string, signerType: SignerType = SignerType.SOFTWARE): BaseSigner {
    if (signerType === SignerType.LEDGER) {
      return new LedgerSigner(path);
    }

    // Default: Software signer
    const privateKey = this.getPrivateKey(path);
    return new SoftwareSigner(privateKey);
  }

  /**
   * Create a Ledger signer for a specific derivation path
   */
  static createLedgerSigner(path: string): LedgerSigner {
    return new LedgerSigner(path);
  }
}
