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
  public isMultiSub: boolean = true;
  public chainId: string | null = null;
  public selectedAddress: string | null = null;
  public networkVersion: string | null = null;

  // Additional MetaMask compatibility properties
  public _metamask: any = {
    isUnlocked: () => Promise.resolve(true)
  };

  private eventListeners: Map<string, Set<Function>> = new Map();
  private requestId: number = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();

  // Address spoofing
  private realAddress: string | null = null;
  private spoofConfig: { enabled: boolean; spoofedAddress: string } = { enabled: false, spoofedAddress: '' };

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

      if (event.data?.type === 'MULTISUB_RESPONSE') {
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

      // Listen for spoof config updates
      if (event.data?.type === 'MULTISUB_SPOOF_CONFIG_UPDATE') {
        const oldConfig = this.spoofConfig;
        this.spoofConfig = event.data.config;
        console.log('[MultiSub] Spoof config updated:', this.spoofConfig);

        // If config changed and we have a real address, update selected address
        if (this.realAddress) {
          const newDisplayAddress = this.getDisplayAddress();
          if (newDisplayAddress !== this.selectedAddress) {
            this.selectedAddress = newDisplayAddress;
            this.emit('accountsChanged', [this.selectedAddress]);
            console.log('[MultiSub] Display address changed to:', this.selectedAddress);
          }
        }
      }
    });

    // Fetch spoof config
    try {
      this.spoofConfig = await this.sendMessage('GET_ADDRESS_SPOOF_CONFIG');
      console.log('[MultiSub] Address spoof config:', this.spoofConfig);
    } catch {
      this.spoofConfig = { enabled: false, spoofedAddress: '' };
    }

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
        type: `MULTISUB_${type}`,
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
   * Get the address to display to dApps (may be spoofed)
   */
  private getDisplayAddress(): string | null {
    if (this.spoofConfig.enabled && this.spoofConfig.spoofedAddress) {
      console.log('[MultiSub] Using spoofed address:', this.spoofConfig.spoofedAddress, 'instead of real:', this.realAddress);
      return this.spoofConfig.spoofedAddress;
    }
    return this.realAddress;
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
          this.realAddress = accounts[0];
          this.selectedAddress = this.getDisplayAddress();
          this.emit('accountsChanged', [this.selectedAddress]);
        }
        return this.selectedAddress ? [this.selectedAddress] : [];

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
        // EIP-712 typed data: params[0] = address, params[1] = typed data JSON
        const typedDataParam = params && params[1];
        if (!typedDataParam) {
          throw this.createError(4001, 'Missing typed data parameter');
        }
        console.log('[Provider] eth_signTypedData_v4 called with:', typedDataParam);
        return this.sendMessage('SIGN_MESSAGE', {
          message: typedDataParam,
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
        // Handle chain switching - send to extension
        const switchChainId = (params as any)?.[0]?.chainId;
        if (!switchChainId) {
          throw this.createError(4001, 'Missing chainId parameter');
        }
        try {
          await this.sendMessage('SWITCH_CHAIN', { chainId: switchChainId });
          // Update local state
          this.chainId = switchChainId;
          this.networkVersion = parseInt(switchChainId, 16).toString();
          this.emit('chainChanged', switchChainId);
          return null;
        } catch (error: any) {
          throw this.createError(4902, error.message || 'Chain not available');
        }

      case 'wallet_addEthereumChain':
        // Handle adding custom chain - send to extension
        const chainParams = (params as any)?.[0];
        if (!chainParams) {
          throw this.createError(4001, 'Missing chain parameters');
        }
        try {
          await this.sendMessage('ADD_CHAIN', { chainParams });
          // Update local state
          this.chainId = chainParams.chainId;
          this.networkVersion = parseInt(chainParams.chainId, 16).toString();
          this.emit('chainChanged', chainParams.chainId);
          return null;
        } catch (error: any) {
          throw this.createError(4001, error.message || 'Failed to add chain');
        }

      case 'wallet_watchAsset':
        // Handle token watch request (for adding tokens)
        const assetParams = (params as any)?.[0];
        if (assetParams?.type === 'ERC20') {
          return this.sendMessage('ADD_TOKEN', {
            token: {
              address: assetParams.options.address,
              symbol: assetParams.options.symbol,
              name: assetParams.options.symbol, // Use symbol as name if not provided
              decimals: assetParams.options.decimals,
              chainId: parseInt(this.chainId || '0x1', 16)
            }
          });
        }
        throw this.createError(4001, 'Only ERC20 tokens are supported');

      case 'eth_sign':
        // Legacy sign method (deprecated but still used)
        return this.sendMessage('SIGN_MESSAGE', {
          message: params && params[1]
        });

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

console.log('[MultiSub] Inject script starting...');

// Store reference to any existing provider (e.g., MetaMask)
const existingProvider = (window as any).ethereum;
if (existingProvider) {
  console.log('[MultiSub] Found existing provider:', existingProvider);
}

// Inject provider (overwrite MetaMask if present)
const provider = new EthereumProvider();
console.log('[MultiSub] Provider instance created');

// Aggressively take over window.ethereum
const setupProvider = () => {
  try {
    // Try to delete existing property first
    delete (window as any).ethereum;
    console.log('[MultiSub] Deleted existing ethereum property');
  } catch (e) {
    console.log('[MultiSub] Could not delete existing property (probably locked)');
  }

  try {
    // Try to define our provider
    Object.defineProperty(window, 'ethereum', {
      get() {
        return provider;
      },
      set(_newProvider) {
        console.warn('[MultiSub] Blocked attempt to overwrite ethereum provider');
      },
      configurable: false
    });

    // VERIFY it actually worked
    if ((window as any).ethereum?.isMultiSub) {
      console.log('[MultiSub] Successfully defined ethereum property');
      return; // Success, exit function
    } else {
      console.warn('[MultiSub] Object.defineProperty succeeded but did not replace provider');
      throw new Error('Provider not replaced');
    }
  } catch (e) {
    // If we can't define the property, it's already locked by MetaMask
    console.warn('[MultiSub] Could not define property, trying to hijack existing provider...');

    // Plan B: Mutate the existing provider object in place
    console.log('[MultiSub] Attempting to hijack existing provider by mutation...');
    const existingEthereum = (window as any).ethereum;

    // Copy all our provider's properties/methods to the existing object
    try {
      // Add our identifier
      existingEthereum.isMultiSub = true;

      // Store original request method (not used but good to have)
      const _originalRequest = existingEthereum.request?.bind(existingEthereum);

      // Override the request method to redirect to our provider
      existingEthereum.request = function(args: any) {
        console.log('[MultiSub] Intercepted request:', args.method);
        return provider.request(args);
      };

      // Override other critical methods
      if (existingEthereum.sendAsync) {
        existingEthereum.sendAsync = provider.sendAsync.bind(provider);
      }
      if (existingEthereum.send) {
        existingEthereum.send = provider.send.bind(provider);
      }

      // Verify it worked
      if ((window as any).ethereum?.isMultiSub) {
        console.log('[MultiSub] ✅ Successfully hijacked existing provider!');
        return; // Success
      } else {
        throw new Error('Mutation failed to set isMultiSub');
      }
    } catch (e2) {
      console.error('[MultiSub] Mutation failed:', e2);

      // Plan C: Last resort - wrap the entire ethereum object in our own Proxy
      console.warn('[MultiSub] Using Proxy wrapper as last resort...');
      try {
        // We can't replace window.ethereum, but we can document our presence
        (window as any).multiSubProvider = provider;
        console.log('[MultiSub] Provider available at window.multiSubProvider');
        console.warn('[MultiSub] ⚠️ Could not override MetaMask. To use this wallet, disable MetaMask extension.');
      } catch (e3) {
        console.error('[MultiSub] All override attempts failed!', e3);
      }
    }
  }
};

// Setup immediately
setupProvider();
console.log('[MultiSub] Provider setup complete');
console.log('[MultiSub] Checking: window.ethereum =', (window as any).ethereum);
console.log('[MultiSub] Checking: window.ethereum.isMultiSub =', (window as any).ethereum?.isMultiSub);
console.log('[MultiSub] Checking: window.ethereum.isMetaMask =', (window as any).ethereum?.isMetaMask);

// Verify provider is set correctly after a delay
setTimeout(() => {
  const currentProvider = (window as any).ethereum;
  if (currentProvider?.isMultiSub) {
    console.log('[MultiSub] ✅ Provider successfully installed!');
  } else {
    console.warn('[MultiSub] ⚠️ Provider may not be correctly installed');
    console.log('[MultiSub] Current provider:', currentProvider);
  }
}, 1000);

// Announce provider to DApps (EIP-6963)
window.dispatchEvent(new Event('ethereum#initialized'));

// EIP-6963: Announce wallet
const announceProvider = () => {
  const info = {
    uuid: 'multisub-uuid',
    name: 'MultiSub',
    icon: 'data:image/png;base64,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',
    rdns: 'com.multisub'
  };

  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info, provider })
    })
  );
};

// Announce immediately and on request
announceProvider();
window.addEventListener('eip6963:requestProvider', announceProvider);

console.log('[MultiSub] Provider injected and locked', existingProvider ? '(replaced existing provider)' : '');

// Export to make this a module
export {};
