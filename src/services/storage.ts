import { CryptoService } from "../core/crypto";
import { WalletAccount } from "../core/wallet";

export interface StoredWallet {
  encryptedMnemonic: string;
  accounts: WalletAccount[];
  passwordHash: string;
  createdAt: number;
}

export interface Network {
  chainId: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  blockExplorerUrl?: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}

export interface WalletState {
  isLocked: boolean;
  currentAccount: number;
  currentNetwork: number;
}

export interface AddressSpoofConfig {
  enabled: boolean;
  spoofedAddress: string;
}

export class StorageService {
  private static readonly WALLET_KEY = "wallet";
  private static readonly NETWORKS_KEY = "networks";
  private static readonly TOKENS_KEY = "tokens";
  private static readonly STATE_KEY = "state";
  private static readonly SESSION_PASSWORD_KEY = "sessionPassword";
  private static readonly SESSION_MNEMONIC_KEY = "sessionMnemonic";
  private static readonly ADDRESS_SPOOF_KEY = "addressSpoof";

  /**
   * Initialize wallet with mnemonic and password
   */
  static async createWallet(
    mnemonic: string,
    password: string,
    accounts: WalletAccount[]
  ): Promise<void> {
    const passwordHash = await CryptoService.hash(password);
    const encryptedMnemonic = await CryptoService.encrypt(mnemonic, password);

    const wallet: StoredWallet = {
      encryptedMnemonic,
      accounts,
      passwordHash,
      createdAt: Date.now(),
    };

    await chrome.storage.local.set({ [this.WALLET_KEY]: wallet });

    // Store mnemonic in session storage so wallet survives service worker restarts
    const sessionPassword = CryptoService.generateSessionPassword();
    const sessionEncryptedMnemonic = await CryptoService.encrypt(
      mnemonic,
      sessionPassword
    );

    await chrome.storage.session.set({
      [this.SESSION_PASSWORD_KEY]: sessionPassword,
      [this.SESSION_MNEMONIC_KEY]: sessionEncryptedMnemonic,
    });

    // Initialize default state
    await this.setState({
      isLocked: false,
      currentAccount: 0,
      currentNetwork: 0,
    });

    // Initialize default networks
    await this.initializeDefaultNetworks();
  }

  /**
   * Get stored wallet
   */
  static async getWallet(): Promise<StoredWallet | null> {
    const result = await chrome.storage.local.get(this.WALLET_KEY);
    return result[this.WALLET_KEY] || null;
  }

  /**
   * Unlock wallet with password
   */
  static async unlockWallet(password: string): Promise<string> {
    const wallet = await this.getWallet();
    if (!wallet) {
      throw new Error("No wallet found");
    }

    const passwordHash = await CryptoService.hash(password);
    if (passwordHash !== wallet.passwordHash) {
      throw new Error("Invalid password");
    }

    try {
      const mnemonic = await CryptoService.decrypt(
        wallet.encryptedMnemonic,
        password
      );

      // Store session password and encrypted mnemonic in session storage
      // This allows wallet to survive service worker restarts while session is active
      const sessionPassword = CryptoService.generateSessionPassword();
      const sessionEncryptedMnemonic = await CryptoService.encrypt(
        mnemonic,
        sessionPassword
      );

      await chrome.storage.session.set({
        [this.SESSION_PASSWORD_KEY]: sessionPassword,
        [this.SESSION_MNEMONIC_KEY]: sessionEncryptedMnemonic,
      });

      const state = await this.getState();
      await this.setState({
        isLocked: false,
        currentAccount: state?.currentAccount ?? 0,
        currentNetwork: state?.currentNetwork ?? 0,
      });

      return mnemonic;
    } catch (error) {
      throw new Error("Failed to decrypt wallet");
    }
  }

  /**
   * Lock wallet
   */
  static async lockWallet(): Promise<void> {
    await chrome.storage.session.remove([
      this.SESSION_PASSWORD_KEY,
      this.SESSION_MNEMONIC_KEY,
    ]);
    const state = await this.getState();
    if (state) {
      state.isLocked = true;
      await this.setState(state);
    }
  }

  /**
   * Check if wallet is locked
   */
  static async isLocked(): Promise<boolean> {
    const state = await this.getState();
    if (!state) return true;

    const sessionData = await chrome.storage.session.get([
      this.SESSION_PASSWORD_KEY,
      this.SESSION_MNEMONIC_KEY,
    ]);
    return (
      !sessionData[this.SESSION_PASSWORD_KEY] ||
      !sessionData[this.SESSION_MNEMONIC_KEY] ||
      state.isLocked
    );
  }

  /**
   * Get decrypted mnemonic from session storage (if unlocked)
   * This allows wallet instance to be restored after service worker restart
   */
  static async getSessionMnemonic(): Promise<string | null> {
    const isLocked = await this.isLocked();
    if (isLocked) {
      return null;
    }

    try {
      const sessionData = await chrome.storage.session.get([
        this.SESSION_PASSWORD_KEY,
        this.SESSION_MNEMONIC_KEY,
      ]);

      const sessionPassword = sessionData[this.SESSION_PASSWORD_KEY];
      const sessionEncryptedMnemonic = sessionData[this.SESSION_MNEMONIC_KEY];

      if (!sessionPassword || !sessionEncryptedMnemonic) {
        return null;
      }

      const mnemonic = await CryptoService.decrypt(
        sessionEncryptedMnemonic,
        sessionPassword
      );
      return mnemonic;
    } catch (error) {
      console.error("Failed to retrieve session mnemonic:", error);
      return null;
    }
  }

  /**
   * Add a new account to wallet
   */
  static async addAccount(account: WalletAccount): Promise<void> {
    const wallet = await this.getWallet();
    if (!wallet) {
      throw new Error("No wallet found");
    }

    wallet.accounts.push(account);
    await chrome.storage.local.set({ [this.WALLET_KEY]: wallet });
  }

  /**
   * Get all accounts
   */
  static async getAccounts(): Promise<WalletAccount[]> {
    const wallet = await this.getWallet();
    return wallet?.accounts || [];
  }

  /**
   * Update account
   */
  static async updateAccount(
    index: number,
    account: WalletAccount
  ): Promise<void> {
    const wallet = await this.getWallet();
    if (!wallet) {
      throw new Error("No wallet found");
    }

    if (index < 0 || index >= wallet.accounts.length) {
      throw new Error("Invalid account index");
    }

    wallet.accounts[index] = account;
    await chrome.storage.local.set({ [this.WALLET_KEY]: wallet });
  }

  /**
   * Get current account
   */
  static async getCurrentAccount(): Promise<WalletAccount | null> {
    const state = await this.getState();
    const accounts = await this.getAccounts();

    if (!state || !accounts.length) return null;

    return accounts[state.currentAccount] || null;
  }

  /**
   * Set current account
   */
  static async setCurrentAccount(index: number): Promise<void> {
    const state = await this.getState();
    if (!state) return;

    state.currentAccount = index;
    await this.setState(state);
  }

  /**
   * Initialize default networks
   */
  private static async initializeDefaultNetworks(): Promise<void> {
    const defaultNetworks: Network[] = [
      {
        chainId: 1,
        name: "Ethereum Mainnet",
        rpcUrl: "https://eth.llamarpc.com",
        symbol: "ETH",
        blockExplorerUrl: "https://etherscan.io",
      },
      {
        chainId: 137,
        name: "Polygon",
        rpcUrl: "https://polygon-rpc.com",
        symbol: "POL",
        blockExplorerUrl: "https://polygonscan.com",
      },
      {
        chainId: 42161,
        name: "Arbitrum One",
        rpcUrl: "https://arb1.arbitrum.io/rpc",
        symbol: "ETH",
        blockExplorerUrl: "https://arbiscan.io",
      },
      {
        chainId: 8453,
        name: "Base",
        rpcUrl: "https://mainnet.base.org",
        symbol: "ETH",
        blockExplorerUrl: "https://basescan.org",
      },
      {
        chainId: 48900,
        name: "Zircuit",
        rpcUrl: "https://zircuit1-mainnet.p2pify.com",
        symbol: "ETH",
        blockExplorerUrl: "https://explorer.zircuit.com",
      },
      {
        chainId: 14,
        name: "Flare",
        rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
        symbol: "FLR",
        blockExplorerUrl: "https://flare-explorer.flare.network",
      },
      {
        chainId: 43114,
        name: "Avalanche C-Chain",
        rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
        symbol: "AVAX",
        blockExplorerUrl: "https://snowtrace.io",
      },
      {
        chainId: 11155111,
        name: "Sepolia Testnet",
        rpcUrl: "https://rpc.sepolia.org",
        symbol: "ETH",
        blockExplorerUrl: "https://sepolia.etherscan.io",
      },
    ];

    await chrome.storage.local.set({ [this.NETWORKS_KEY]: defaultNetworks });
  }

  /**
   * Get all networks
   */
  static async getNetworks(): Promise<Network[]> {
    const result = await chrome.storage.local.get(this.NETWORKS_KEY);
    return result[this.NETWORKS_KEY] || [];
  }

  /**
   * Merge new default networks with existing networks
   */
  static async updateDefaultNetworks(): Promise<void> {
    const defaultNetworks: Network[] = [
      {
        chainId: 1,
        name: "Ethereum Mainnet",
        rpcUrl: "https://eth.llamarpc.com",
        symbol: "ETH",
        blockExplorerUrl: "https://etherscan.io",
      },
      {
        chainId: 137,
        name: "Polygon",
        rpcUrl: "https://polygon-rpc.com",
        symbol: "POL",
        blockExplorerUrl: "https://polygonscan.com",
      },
      {
        chainId: 56,
        name: "BNB Smart Chain",
        rpcUrl: "https://bsc-dataseed.binance.org",
        symbol: "BNB",
        blockExplorerUrl: "https://bscscan.com",
      },
      {
        chainId: 42161,
        name: "Arbitrum One",
        rpcUrl: "https://arb1.arbitrum.io/rpc",
        symbol: "ETH",
        blockExplorerUrl: "https://arbiscan.io",
      },
      {
        chainId: 10,
        name: "Optimism",
        rpcUrl: "https://mainnet.optimism.io",
        symbol: "ETH",
        blockExplorerUrl: "https://optimistic.etherscan.io",
      },
      {
        chainId: 8453,
        name: "Base",
        rpcUrl: "https://mainnet.base.org",
        symbol: "ETH",
        blockExplorerUrl: "https://basescan.org",
      },
      {
        chainId: 48900,
        name: "Zircuit",
        rpcUrl: "https://zircuit1-mainnet.p2pify.com",
        symbol: "ETH",
        blockExplorerUrl: "https://explorer.zircuit.com",
      },
      {
        chainId: 14,
        name: "Flare",
        rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
        symbol: "FLR",
        blockExplorerUrl: "https://flare-explorer.flare.network",
      },
      {
        chainId: 43114,
        name: "Avalanche C-Chain",
        rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
        symbol: "AVAX",
        blockExplorerUrl: "https://snowtrace.io",
      },
      {
        chainId: 250,
        name: "Fantom Opera",
        rpcUrl: "https://rpc.ftm.tools",
        symbol: "FTM",
        blockExplorerUrl: "https://ftmscan.com",
      },
      {
        chainId: 11155111,
        name: "Sepolia Testnet",
        rpcUrl: "https://rpc.sepolia.org",
        symbol: "ETH",
        blockExplorerUrl: "https://sepolia.etherscan.io",
      },
    ];

    const existingNetworks = await this.getNetworks();
    const existingChainIds = new Set(existingNetworks.map(n => n.chainId));

    // Add only networks that don't already exist
    const networksToAdd = defaultNetworks.filter(
      n => !existingChainIds.has(n.chainId)
    );

    if (networksToAdd.length > 0) {
      const updatedNetworks = [...existingNetworks, ...networksToAdd];
      await chrome.storage.local.set({ [this.NETWORKS_KEY]: updatedNetworks });
    }
  }

  /**
   * Add custom network
   */
  static async addNetwork(network: Network): Promise<void> {
    const networks = await this.getNetworks();

    // Check if network already exists
    const exists = networks.some((n) => n.chainId === network.chainId);
    if (exists) {
      throw new Error("Network already exists");
    }

    networks.push(network);
    await chrome.storage.local.set({ [this.NETWORKS_KEY]: networks });
  }

  /**
   * Get current network
   */
  static async getCurrentNetwork(): Promise<Network | null> {
    const state = await this.getState();
    const networks = await this.getNetworks();

    if (!state || !networks.length) return null;

    return networks[state.currentNetwork] || null;
  }

  /**
   * Set current network
   */
  static async setCurrentNetwork(index: number): Promise<void> {
    const state = await this.getState();
    if (!state) return;

    state.currentNetwork = index;
    await this.setState(state);
  }

  /**
   * Get wallet state
   */
  static async getState(): Promise<WalletState | null> {
    const result = await chrome.storage.local.get(this.STATE_KEY);
    return result[this.STATE_KEY] || null;
  }

  /**
   * Set wallet state
   */
  private static async setState(state: WalletState): Promise<void> {
    await chrome.storage.local.set({ [this.STATE_KEY]: state });
  }

  /**
   * Check if wallet exists
   */
  static async walletExists(): Promise<boolean> {
    const wallet = await this.getWallet();
    return wallet !== null;
  }

  /**
   * Reset wallet (dangerous - deletes all data)
   */
  static async resetWallet(): Promise<void> {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
  }

  /**
   * Get all tokens
   */
  static async getTokens(): Promise<Token[]> {
    const result = await chrome.storage.local.get(this.TOKENS_KEY);
    return result[this.TOKENS_KEY] || [];
  }

  /**
   * Add custom token
   */
  static async addToken(token: Token): Promise<void> {
    const tokens = await this.getTokens();

    // Check if token already exists for this chain
    const exists = tokens.some(
      (t) =>
        t.address.toLowerCase() === token.address.toLowerCase() &&
        t.chainId === token.chainId
    );
    if (exists) {
      throw new Error("Token already exists");
    }

    tokens.push(token);
    await chrome.storage.local.set({ [this.TOKENS_KEY]: tokens });
  }

  /**
   * Get tokens for a specific chain
   */
  static async getTokensForChain(chainId: number): Promise<Token[]> {
    const tokens = await this.getTokens();
    return tokens.filter((t) => t.chainId === chainId);
  }

  /**
   * Remove token
   */
  static async removeToken(address: string, chainId: number): Promise<void> {
    const tokens = await this.getTokens();
    const filtered = tokens.filter(
      (t) =>
        !(
          t.address.toLowerCase() === address.toLowerCase() &&
          t.chainId === chainId
        )
    );
    await chrome.storage.local.set({ [this.TOKENS_KEY]: filtered });
  }

  /**
   * Get address spoof configuration
   */
  static async getAddressSpoofConfig(): Promise<AddressSpoofConfig> {
    const result = await chrome.storage.local.get(this.ADDRESS_SPOOF_KEY);
    return (
      result[this.ADDRESS_SPOOF_KEY] || { enabled: false, spoofedAddress: "" }
    );
  }

  /**
   * Set address spoof configuration
   */
  static async setAddressSpoofConfig(
    config: AddressSpoofConfig
  ): Promise<void> {
    await chrome.storage.local.set({ [this.ADDRESS_SPOOF_KEY]: config });
  }
}
