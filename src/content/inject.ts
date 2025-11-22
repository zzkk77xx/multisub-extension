/**
 * Inject script - runs in page context, provides EIP-1193 compatible provider
 * This script is injected into the page's main world
 */

interface RequestArguments {
  method: string;
  params?: any[];
}

interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
}

class EthereumProvider {
  public isMetaMask: boolean = true; // Spoof MetaMask for compatibility
  public isCryptoWallet: boolean = true;
  public chainId: string | null = null;
  public selectedAddress: string | null = null;
  public networkVersion: string | null = null;

  private eventListeners: Map<string, Set<Function>> = new Map();
  private requestId: number = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();

  constructor() {
    this.initialize();
  }

  /**
   * Initialize provider
   */
  private async initialize() {
    // Listen for responses from content script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      if (event.data?.type === 'CRYPTO_WALLET_RESPONSE') {
        const { id, response } = event.data;
        const pending = this.pendingRequests.get(id);

        if (pending) {
          this.pendingRequests.delete(id);

          if (response.success) {
            pending.resolve(response.data);
          } else {
            pending.reject(this.createError(4001, response.error || 'Request failed'));
          }
        }
      }
    });

    // Fetch current network from wallet
    try {
      const network = await this.sendMessage('GET_CURRENT_NETWORK');
      if (network) {
        this.chainId = '0x' + network.chainId.toString(16);
        this.networkVersion = network.chainId.toString();
      } else {
        // Fallback to Ethereum mainnet
        this.chainId = '0x1';
        this.networkVersion = '1';
      }
    } catch {
      // Fallback to Ethereum mainnet if fetch fails
      this.chainId = '0x1';
      this.networkVersion = '1';
    }
  }

  /**
   * Send message to content script
   */
  private sendMessage(type: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      this.pendingRequests.set(id, { resolve, reject });

      window.postMessage({
        type: `CRYPTO_WALLET_${type}`,
        payload,
        id
      }, '*');

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(this.createError(4001, 'Request timeout'));
        }
      }, 60000);
    });
  }

  /**
   * Create EIP-1193 error
   */
  private createError(code: number, message: string, data?: unknown): ProviderRpcError {
    const error = new Error(message) as ProviderRpcError;
    error.code = code;
    if (data !== undefined) {
      error.data = data;
    }
    return error;
  }

  /**
   * EIP-1193: request method
   */
  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args;

    switch (method) {
      case 'eth_requestAccounts':
        const accounts = await this.sendMessage('REQUEST_ACCOUNTS');
        if (accounts && accounts.length > 0) {
          this.selectedAddress = accounts[0];
          this.emit('accountsChanged', accounts);
        }
        return accounts;

      case 'eth_accounts':
        if (this.selectedAddress) {
          return [this.selectedAddress];
        }
        return [];

      case 'eth_chainId':
        return this.chainId;

      case 'net_version':
        return this.networkVersion;

      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4':
        return this.sendMessage('SIGN_MESSAGE', {
          message: (params && params[1]) || (params && params[0]),
          typed: true
        });

      case 'personal_sign':
        return this.sendMessage('SIGN_MESSAGE', {
          message: params && params[0]
        });

      case 'eth_sendTransaction':
        return this.sendMessage('SEND_TRANSACTION', {
          transaction: params && params[0]
        });

      case 'eth_getBalance':
      case 'eth_getTransactionCount':
      case 'eth_getTransactionReceipt':
      case 'eth_call':
      case 'eth_estimateGas':
      case 'eth_blockNumber':
      case 'eth_getBlockByNumber':
      case 'eth_getTransactionByHash':
        // Forward read-only methods to RPC
        return this.sendMessage('RPC_CALL', { method, params });

      case 'wallet_switchEthereumChain':
        // Handle chain switching
        const chainId = (params as any)?.[0]?.chainId;
        if (chainId) {
          this.chainId = chainId;
          this.networkVersion = parseInt(chainId, 16).toString();
          this.emit('chainChanged', chainId);
        }
        return null;

      case 'wallet_addEthereumChain':
        // Handle adding custom chain
        return this.sendMessage('ADD_NETWORK', { network: params && params[0] });

      default:
        throw this.createError(
          4200,
          `Unsupported method: ${method}`
        );
    }
  }

  /**
   * Legacy methods for compatibility
   */
  async send(methodOrRequest: string | RequestArguments, paramsOrCallback?: unknown[] | Function): Promise<unknown> {
    if (typeof methodOrRequest === 'string') {
      // Legacy: send(method, params)
      return this.request({
        method: methodOrRequest,
        params: paramsOrCallback as unknown[]
      });
    } else {
      // EIP-1193: send(request)
      return this.request(methodOrRequest);
    }
  }

  async sendAsync(request: RequestArguments & { id?: number; jsonrpc?: string }, callback: (error: Error | null, response?: any) => void): Promise<void> {
    try {
      const result = await this.request(request);
      callback(null, {
        id: request.id,
        jsonrpc: request.jsonrpc || '2.0',
        result
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Event emitter methods
   */
  on(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  removeListener(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.chainId !== null;
  }
}

// Only inject if not already present
if (!(window as any).ethereum) {
  const provider = new EthereumProvider();
  (window as any).ethereum = provider;

  // Announce provider to DApps (EIP-6963)
  window.dispatchEvent(new Event('ethereum#initialized'));

  console.log('Crypto Wallet provider injected');
}

// Export to make this a module
export {};
