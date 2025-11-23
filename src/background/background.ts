import { Wallet } from '../core/wallet';
import { StorageService } from '../services/storage';
import { ethers } from 'ethers';
import { wrapTransactionThroughModule } from '../services/defiInteractor';
import { BaseSigner, SignerType, LedgerDeviceManager, SoftwareSigner } from '../signers';

// In-memory wallet instance (cleared when locked)
let walletInstance: Wallet | null = null;

// Get signer for the current account
async function getCurrentSigner(): Promise<BaseSigner> {
  const walletType = await StorageService.getWalletType();
  const currentAccount = await StorageService.getCurrentAccount();

  if (!currentAccount) {
    throw new Error('No account selected');
  }

  if (!currentAccount.derivationPath) {
    throw new Error('Account derivation path not found');
  }

  if (walletType === SignerType.LEDGER) {
    // For Ledger, create a new signer instance
    return Wallet.createLedgerSigner(currentAccount.derivationPath);
  }

  // For software wallet, use the wallet instance
  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  return walletInstance.createSigner(currentAccount.derivationPath, SignerType.SOFTWARE);
}

// Pending requests from DApps
interface PendingRequest {
  id: string;
  type: 'signature' | 'transaction';
  payload: any;
  sender: chrome.runtime.MessageSender;
  timestamp: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

const pendingRequests = new Map<string, PendingRequest>();

interface Message {
  type: string;
  payload?: any;
}

interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Ensure wallet instance is initialized if session is unlocked
 * This is needed because service workers can be terminated and restarted
 */
async function ensureWalletInstance(): Promise<void> {
  // If we already have an instance, nothing to do
  if (walletInstance) {
    return;
  }

  // Check wallet type
  const storedWallet = await StorageService.getWallet();
  if (!storedWallet) {
    return; // No wallet exists yet
  }

  // For private key wallets, we don't need a Wallet instance
  if (storedWallet.encryptedPrivateKey) {
    console.log('Private key wallet detected, no Wallet instance needed');
    return;
  }

  // Try to restore wallet from session storage (for mnemonic wallets)
  const mnemonic = await StorageService.getSessionMnemonic();
  if (mnemonic) {
    // Check if it's actually a mnemonic (not a private key stored in same field)
    if (mnemonic.startsWith('0x')) {
      console.log('Private key wallet restored, no Wallet instance needed');
      return;
    }

    const wallet = new Wallet();
    await wallet.fromMnemonic(mnemonic);
    walletInstance = wallet;
    console.log('Wallet instance restored from session');
  }
}

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => {
  handleMessage(message, sender)
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Keep channel open for async response
});

/**
 * Handle external messages from web pages (via content script)
 */
chrome.runtime.onMessageExternal?.addListener((
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => {
  handleExternalMessage(message, sender)
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true;
});

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<any> {
  // Ensure wallet instance is restored if session is active
  await ensureWalletInstance();

  const { type, payload } = message;

  switch (type) {
    case 'CREATE_WALLET':
      return await createWallet(payload);

    case 'CREATE_WALLET_FROM_PRIVATE_KEY':
      return await createWalletFromPrivateKey(payload);

    case 'UNLOCK_WALLET':
      return await unlockWallet(payload.password);

    case 'LOCK_WALLET':
      return await lockWallet();

    case 'RESET_WALLET':
      return await resetWallet();

    case 'GET_WALLET_STATUS':
      return await getWalletStatus();

    case 'ADD_ACCOUNT':
      return await addAccount();

    case 'GET_ACCOUNTS':
      return await StorageService.getAccounts();

    case 'GET_CURRENT_ACCOUNT':
      return await StorageService.getCurrentAccount();

    case 'SET_CURRENT_ACCOUNT':
      return await StorageService.setCurrentAccount(payload.index);

    case 'GET_NETWORKS':
      return await StorageService.getNetworks();

    case 'GET_CURRENT_NETWORK':
      return await StorageService.getCurrentNetwork();

    case 'SET_CURRENT_NETWORK':
      return await StorageService.setCurrentNetwork(payload.index);

    case 'ADD_NETWORK':
      return await StorageService.addNetwork(payload.network);

    case 'GET_BALANCE':
      return await getBalance(payload.address);

    case 'SIGN_MESSAGE':
      // If path is not provided, use current account's path (for DApp requests)
      if (!payload.path) {
        const currentAccount = await StorageService.getCurrentAccount();
        if (!currentAccount) {
          throw new Error('No account selected');
        }
        if (!currentAccount.derivationPath) {
          throw new Error('Account derivation path not found');
        }
        payload.path = currentAccount.derivationPath;
      }
      return await signMessage(payload);

    case 'SIGN_TRANSACTION':
      // If path is not provided, use current account's path (for DApp requests)
      if (!payload.path) {
        const currentAccount = await StorageService.getCurrentAccount();
        if (!currentAccount) {
          throw new Error('No account selected');
        }
        if (!currentAccount.derivationPath) {
          throw new Error('Account derivation path not found');
        }
        payload.path = currentAccount.derivationPath;
      }
      return await signTransaction(payload);

    case 'SEND_TRANSACTION':
      // If path is not provided, use current account's path (for DApp requests)
      if (!payload.path && !payload.transaction) {
        // This is a transaction request from DApp
        const currentAccount = await StorageService.getCurrentAccount();
        if (!currentAccount) {
          throw new Error('No account selected');
        }
        if (!currentAccount.derivationPath) {
          throw new Error('Account derivation path not found');
        }
        const result = await sendTransaction({
          transaction: payload,
          path: currentAccount.derivationPath
        });
        // EIP-1193: eth_sendTransaction must return ONLY the transaction hash
        return result.hash;
      } else if (!payload.path) {
        const currentAccount = await StorageService.getCurrentAccount();
        if (!currentAccount) {
          throw new Error('No account selected');
        }
        if (!currentAccount.derivationPath) {
          throw new Error('Account derivation path not found');
        }
        payload.path = currentAccount.derivationPath;
      }
      const result = await sendTransaction(payload);
      // EIP-1193: eth_sendTransaction must return ONLY the transaction hash
      return result.hash;

    case 'GET_MNEMONIC':
      return await getMnemonic();

    case 'GET_TOKENS':
      return await StorageService.getTokens();

    case 'GET_TOKENS_FOR_CHAIN':
      return await StorageService.getTokensForChain(payload.chainId);

    case 'ADD_TOKEN':
      return await StorageService.addToken(payload.token);

    case 'REMOVE_TOKEN':
      return await StorageService.removeToken(payload.address, payload.chainId);

    case 'GET_TOKEN_BALANCE':
      return await getTokenBalance(payload.tokenAddress, payload.walletAddress);

    case 'REQUEST_ACCOUNTS':
      return await requestAccounts(sender);

    case 'RPC_CALL':
      return await handleRpcCall(payload);

    case 'SWITCH_CHAIN':
      return await handleSwitchChain(payload.chainId);

    case 'ADD_CHAIN':
      return await handleAddChain(payload.chainParams);

    case 'GET_PENDING_REQUESTS':
      return Array.from(pendingRequests.values()).map(req => ({
        id: req.id,
        type: req.type,
        payload: req.payload,
        sender: req.sender.url,
        timestamp: req.timestamp
      }));

    case 'APPROVE_REQUEST':
      return await approveRequest(payload.requestId);

    case 'REJECT_REQUEST':
      return await rejectRequest(payload.requestId, payload.reason);

    case 'GET_ADDRESS_SPOOF_CONFIG':
      return await StorageService.getAddressSpoofConfig();

    case 'SET_ADDRESS_SPOOF_CONFIG':
      return await StorageService.setAddressSpoofConfig(payload);

    case 'UPDATE_DEFAULT_NETWORKS':
      return await StorageService.updateDefaultNetworks();

    case 'GET_DEFI_INTERACTOR_CONFIGS':
      return await StorageService.getDeFiInteractorConfigs();

    case 'GET_DEFI_INTERACTOR_CONFIG_FOR_CHAIN':
      return await StorageService.getDeFiInteractorConfigForChain(payload.chainId);

    case 'SET_DEFI_INTERACTOR_CONFIG':
      return await StorageService.setDeFiInteractorConfig(payload.config);

    case 'REMOVE_DEFI_INTERACTOR_CONFIG':
      return await StorageService.removeDeFiInteractorConfig(payload.chainId);

    case 'LEDGER_CHECK_SUPPORT':
      return { supported: LedgerDeviceManager.isSupported() };

    case 'LEDGER_REQUEST_DEVICE':
      return await LedgerDeviceManager.requestDevice();

    case 'LEDGER_DERIVE_ADDRESSES':
      return await LedgerDeviceManager.deriveAddresses(payload.basePath, payload.count);

    case 'CREATE_LEDGER_WALLET':
      return await createLedgerWallet(payload);

    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

/**
 * Handle messages from web pages (EIP-1193 provider requests)
 */
async function handleExternalMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<any> {
  // Ensure wallet instance is restored if session is active
  await ensureWalletInstance();

  const { type, payload } = message;

  // Verify sender origin
  if (!sender.url) {
    throw new Error('Invalid sender');
  }

  switch (type) {
    case 'ETH_REQUEST_ACCOUNTS':
      return await requestAccounts(sender);

    case 'ETH_SIGN_MESSAGE':
      return await requestSignature(payload, sender);

    case 'ETH_SEND_TRANSACTION':
      return await requestTransaction(payload, sender);

    default:
      throw new Error(`Unknown external message type: ${type}`);
  }
}

/**
 * Create a new wallet
 */
async function createWallet(payload: { password: string; mnemonic?: string }) {
  const { password, mnemonic: providedMnemonic } = payload;

  const wallet = new Wallet();
  const mnemonic = providedMnemonic || Wallet.generateMnemonic();

  await wallet.fromMnemonic(mnemonic);

  // Derive first account
  const account = wallet.deriveAccount(0);

  await StorageService.createWallet(mnemonic, password, [account]);

  walletInstance = wallet;

  return { address: account.address };
}

/**
 * Create a wallet from a private key
 */
async function createWalletFromPrivateKey(payload: { password: string; privateKey: string }) {
  const { password, privateKey } = payload;

  // Validate private key format
  if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
    throw new Error('Invalid private key format. Expected 64 hex characters (optionally prefixed with 0x)');
  }

  // Create ethers wallet from private key to get address and public key
  const ethersWallet = new ethers.Wallet(privateKey);

  // Create account object
  const account = {
    address: ethersWallet.address,
    derivationPath: 'imported', // No derivation path for imported private keys
    index: 0,
    publicKey: ethersWallet.signingKey.publicKey
  };

  await StorageService.createWalletFromPrivateKey(privateKey, password, account);

  // Don't create a Wallet instance with mnemonic, we'll handle it differently
  // The wallet will be initialized on unlock
  walletInstance = null;

  return { address: account.address };
}

/**
 * Create a new Ledger wallet
 */
async function createLedgerWallet(payload: { password: string; accounts: any[] }) {
  const { password, accounts } = payload;

  await StorageService.createLedgerWallet(password, accounts);

  // No wallet instance needed for Ledger
  walletInstance = null;

  return { address: accounts[0]?.address };
}

/**
 * Unlock wallet
 */
async function unlockWallet(password: string) {
  const walletType = await StorageService.getWalletType();
  const storedWallet = await StorageService.getWallet();

  if (!storedWallet) {
    throw new Error("No wallet found");
  }

  // For Ledger wallets, just verify password (no mnemonic to restore)
  if (walletType === SignerType.LEDGER) {
    const passwordHash = await (await import('../core/crypto')).CryptoService.hash(password);
    if (passwordHash !== storedWallet.passwordHash) {
      throw new Error("Invalid password");
    }

    // Store session password for Ledger
    const sessionPassword = (await import('../core/crypto')).CryptoService.generateSessionPassword();
    await chrome.storage.session.set({
      sessionPassword,
    });

    const state = await StorageService.getState();
    await StorageService.setState({
      isLocked: false,
      currentAccount: state?.currentAccount ?? 0,
      currentNetwork: state?.currentNetwork ?? 0,
    } as any);

    const currentAccount = await StorageService.getCurrentAccount();
    return { address: currentAccount?.address, walletType: SignerType.LEDGER };
  }

  // Check if this is a private key wallet
  if (storedWallet.encryptedPrivateKey) {
    // For private key wallets, unlock returns the private key
    await StorageService.unlockWallet(password);

    // Don't create a Wallet instance for private key wallets
    walletInstance = null;

    const currentAccount = await StorageService.getCurrentAccount();
    return { address: currentAccount?.address, walletType: SignerType.SOFTWARE };
  }

  // For mnemonic-based software wallets, restore mnemonic
  const mnemonic = await StorageService.unlockWallet(password);

  const wallet = new Wallet();
  await wallet.fromMnemonic(mnemonic);

  walletInstance = wallet;

  const currentAccount = await StorageService.getCurrentAccount();
  return { address: currentAccount?.address, walletType: SignerType.SOFTWARE };
}

/**
 * Lock wallet
 */
async function lockWallet() {
  walletInstance?.clear();
  walletInstance = null;
  await StorageService.lockWallet();
  return { locked: true };
}

/**
 * Reset wallet (delete all data)
 */
async function resetWallet() {
  walletInstance?.clear();
  walletInstance = null;
  await StorageService.resetWallet();
  return { reset: true };
}

/**
 * Get wallet status
 */
async function getWalletStatus() {
  const exists = await StorageService.walletExists();
  const isLocked = await StorageService.isLocked();

  return { exists, isLocked };
}

/**
 * Add a new account
 */
async function addAccount() {
  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  const accounts = await StorageService.getAccounts();
  const newIndex = accounts.length;

  const account = walletInstance.deriveAccount(newIndex);
  await StorageService.addAccount(account);

  return account;
}

/**
 * Get balance for an address
 */
async function getBalance(address: string) {
  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  const provider = new ethers.JsonRpcProvider(network.rpcUrl);
  const balance = await provider.getBalance(address);

  return {
    balance: balance.toString(),
    formatted: ethers.formatEther(balance)
  };
}

/**
 * Sign a message
 */
async function signMessage(payload: { message: string; path?: string; typed?: boolean }) {
  const walletType = await StorageService.getWalletType();
  const currentAccount = await StorageService.getCurrentAccount();

  if (!currentAccount) {
    throw new Error('No account selected');
  }

  const path = payload.path || currentAccount.derivationPath;
  if (!path) {
    throw new Error('No derivation path found');
  }

  // Create appropriate signer
  let signer: BaseSigner;
  if (walletType === SignerType.LEDGER) {
    signer = Wallet.createLedgerSigner(path);
  } else {
    // For software wallets, check if we have a mnemonic or private key
    if (walletInstance) {
      // Mnemonic-based wallet
      signer = walletInstance.createSigner(path, SignerType.SOFTWARE);
    } else {
      // Private key wallet - get private key from session storage
      const privateKeyOrMnemonic = await StorageService.getSessionMnemonic();
      if (!privateKeyOrMnemonic) {
        throw new Error('Wallet is locked');
      }

      // Check if it's a private key (starts with 0x)
      if (privateKeyOrMnemonic.startsWith('0x')) {
        signer = new SoftwareSigner(privateKeyOrMnemonic);
      } else {
        throw new Error('Wallet state error: no wallet instance but session contains mnemonic');
      }
    }
  }

  try {
    // Handle EIP-712 typed data signatures (e.g., Permit)
    if (payload.typed) {
      console.log('[EIP-712] Signing typed data, raw message:', payload.message);

      const typedData = typeof payload.message === 'string'
        ? JSON.parse(payload.message)
        : payload.message;

      console.log('[EIP-712] Parsed typed data:', JSON.stringify(typedData, null, 2));

      // EIP-712 typed data format
      const { domain, types, message, primaryType } = typedData;

      if (!domain || !types || !message) {
        throw new Error('Invalid EIP-712 typed data format');
      }

      // Remove EIP712Domain from types as it's implicit
      const filteredTypes = { ...types };
      delete filteredTypes.EIP712Domain;

      console.log('[EIP-712] Signing with domain:', domain);
      console.log('[EIP-712] Types:', Object.keys(filteredTypes));
      console.log('[EIP-712] Primary type:', primaryType);
      console.log('[EIP-712] Message:', message);

      const signature = await signer.signTypedData(domain, filteredTypes, message);

      console.log('[EIP-712] Signature created:', signature);
      return signature;
    }

    // Handle regular message signatures
    const signature = await signer.signMessage(payload.message);
    return signature;
  } finally {
    signer.clear();
  }
}

/**
 * Sign a transaction
 */
async function signTransaction(payload: {
  transaction: ethers.TransactionRequest;
  path?: string;
}) {
  const walletType = await StorageService.getWalletType();
  const currentAccount = await StorageService.getCurrentAccount();

  if (!currentAccount) {
    throw new Error('No account selected');
  }

  const path = payload.path || currentAccount.derivationPath;
  if (!path) {
    throw new Error('No derivation path found');
  }

  // Create appropriate signer
  let signer: BaseSigner;
  if (walletType === SignerType.LEDGER) {
    signer = Wallet.createLedgerSigner(path);
  } else {
    // For software wallets, check if we have a mnemonic or private key
    if (walletInstance) {
      // Mnemonic-based wallet
      signer = walletInstance.createSigner(path, SignerType.SOFTWARE);
    } else {
      // Private key wallet - get private key from session storage
      const privateKeyOrMnemonic = await StorageService.getSessionMnemonic();
      if (!privateKeyOrMnemonic) {
        throw new Error('Wallet is locked');
      }

      // Check if it's a private key (starts with 0x)
      if (privateKeyOrMnemonic.startsWith('0x')) {
        signer = new SoftwareSigner(privateKeyOrMnemonic);
      } else {
        throw new Error('Wallet state error: no wallet instance but session contains mnemonic');
      }
    }
  }

  try {
    // Ensure transaction has the correct chain ID
    const network = await StorageService.getCurrentNetwork();
    if (!network) {
      throw new Error('No network selected');
    }

    const transaction = {
      ...payload.transaction,
      chainId: network.chainId
    };

    const signedTx = await signer.signTransaction(transaction);

    return { signedTransaction: signedTx };
  } finally {
    signer.clear();
  }
}

/**
 * Send a transaction
 */
async function sendTransaction(payload: {
  transaction: ethers.TransactionRequest;
  path?: string;
}) {
  const walletType = await StorageService.getWalletType();
  const currentAccount = await StorageService.getCurrentAccount();

  if (!currentAccount) {
    throw new Error('No account selected');
  }

  const path = payload.path || currentAccount.derivationPath;
  if (!path) {
    throw new Error('No derivation path found');
  }

  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  const provider = new ethers.JsonRpcProvider(network.rpcUrl);

  // Prepare transaction with all required fields
  let transaction: ethers.TransactionRequest = {
    ...payload.transaction,
    chainId: network.chainId,
    from: payload.transaction.from || currentAccount.address // Ensure 'from' is set
  };

  // Wrap transactions through DeFi Interactor Module if configured
  // This handles ERC20 transfers, approvals, and protocol calls (like Aave)
  try {
    const wrappedTx = await wrapTransactionThroughModule(transaction, network.chainId);
    // Preserve chainId after wrapping
    transaction = {
      ...wrappedTx,
      chainId: network.chainId,
      from: currentAccount.address
    };
  } catch (error) {
    console.error('[DeFi Interactor] Failed to wrap transaction, using original transaction:', error);
    // Continue with original transaction if wrapping fails
  }

  const dataSize = transaction.data ? (transaction.data.length - 2) / 2 : 0;
  console.log('[Transaction] Received from dApp:', {
    to: transaction.to,
    value: transaction.value,
    dataSize: dataSize > 0 ? `${dataSize} bytes` : 'none',
    gasLimit: transaction.gasLimit || 'not provided',
    gas: (transaction as any).gas || 'not provided'
  });

  // Handle gas limit (check both 'gas' and 'gasLimit' fields)
  // Normalize: some dApps use 'gas', ethers uses 'gasLimit'
  const txAny = transaction as any;
  if (txAny.gas && !transaction.gasLimit) {
    transaction.gasLimit = txAny.gas;
    delete txAny.gas;
  }

  // Only estimate gas if not provided by the dApp
  if (!transaction.gasLimit) {
    console.log('[Gas] No gas limit provided, estimating...');
    try {
      const gasEstimate = await provider.estimateGas(transaction);
      // Add 50% buffer for safety (Uniswap swaps can vary)
      transaction.gasLimit = (gasEstimate * 150n) / 100n;
      console.log('[Gas] Estimated:', gasEstimate.toString(), '→ With buffer:', transaction.gasLimit.toString());
    } catch (error: any) {
      console.warn('[Gas] Estimation failed:', error.message);

      // Use intelligent defaults based on transaction complexity
      if (transaction.data && transaction.data !== '0x') {
        const dataLength = (transaction.data.length - 2) / 2; // bytes

        if (dataLength > 1000) {
          // Very complex transaction (like Uniswap multicall)
          transaction.gasLimit = 500000;
          console.log('[Gas] Using high default for complex transaction:', transaction.gasLimit);
        } else if (dataLength > 100) {
          // Medium complexity (normal DEX swap)
          transaction.gasLimit = 300000;
          console.log('[Gas] Using medium default for DEX transaction:', transaction.gasLimit);
        } else {
          // Simple contract call (ERC20 transfer)
          transaction.gasLimit = 100000;
          console.log('[Gas] Using low default for simple contract call:', transaction.gasLimit);
        }
      } else {
        // Simple ETH transfer
        transaction.gasLimit = 21000;
        console.log('[Gas] Using default for ETH transfer:', transaction.gasLimit);
      }
    }
  } else {
    console.log('[Gas] Using provided gas limit:', transaction.gasLimit.toString());
  }

  // Get gas price if not provided
  if (!transaction.gasPrice && !transaction.maxFeePerGas) {
    try {
      const feeData = await provider.getFeeData();
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // EIP-1559 transaction
        transaction.maxFeePerGas = feeData.maxFeePerGas;
        transaction.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        transaction.type = 2;
      } else if (feeData.gasPrice) {
        // Legacy transaction
        transaction.gasPrice = feeData.gasPrice;
      }
    } catch (error) {
      console.warn('Failed to get gas price:', error);
    }
  }

  // Get nonce if not provided
  if (transaction.nonce === undefined) {
    transaction.nonce = await provider.getTransactionCount(currentAccount.address, 'latest');
    console.log('Nonce fetched:', transaction.nonce);
  }

  // Create appropriate signer
  let signer: BaseSigner;
  if (walletType === SignerType.LEDGER) {
    signer = Wallet.createLedgerSigner(path);
  } else {
    // For software wallets, check if we have a mnemonic or private key
    if (walletInstance) {
      // Mnemonic-based wallet
      signer = walletInstance.createSigner(path, SignerType.SOFTWARE);
    } else {
      // Private key wallet - get private key from session storage
      const privateKeyOrMnemonic = await StorageService.getSessionMnemonic();
      if (!privateKeyOrMnemonic) {
        throw new Error('Wallet is locked');
      }

      // Check if it's a private key (starts with 0x)
      if (privateKeyOrMnemonic.startsWith('0x')) {
        signer = new SoftwareSigner(privateKeyOrMnemonic);
      } else {
        throw new Error('Wallet state error: no wallet instance but session contains mnemonic');
      }
    }
  }

  try {
    const signedTx = await signer.signTransaction(transaction);

    console.log('[Transaction] Signed, broadcasting...');
    const txResponse = await provider.broadcastTransaction(signedTx);
    console.log('[Transaction] Broadcast successful! Hash:', txResponse.hash);

    return {
      hash: txResponse.hash,
      from: txResponse.from,
      to: txResponse.to
    };
  } finally {
    signer.clear();
  }
}

/**
 * Request accounts (for EIP-1193)
 */
async function requestAccounts(sender: chrome.runtime.MessageSender) {
  const isLocked = await StorageService.isLocked();
  if (isLocked) {
    throw new Error('Wallet is locked. Please unlock your wallet.');
  }

  const currentAccount = await StorageService.getCurrentAccount();
  if (!currentAccount) {
    throw new Error('No account available');
  }

  // In a production wallet, you would show a permission prompt here
  // For now, we'll auto-approve

  return [currentAccount.address];
}

/**
 * Request signature from user
 */
async function requestSignature(
  payload: { message: string },
  _sender: chrome.runtime.MessageSender
): Promise<string> {
  const currentAccount = await StorageService.getCurrentAccount();
  if (!currentAccount) {
    throw new Error('No account selected');
  }

  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  // For now, auto-approve signatures (TODO: implement confirmation UI)
  console.log('Auto-approving signature request for:', payload.message);
  const signature = await walletInstance.signMessage(
    payload.message,
    currentAccount.derivationPath
  );

  return signature;

  /* TODO: Implement confirmation popup
  // Create pending request
  const requestId = `sig_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      id: requestId,
      type: 'signature',
      payload: {
        message: payload.message,
        account: currentAccount.address
      },
      sender,
      timestamp: Date.now(),
      resolve,
      reject
    });

    // Open popup for confirmation
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?request=' + requestId),
      type: 'popup',
      width: 400,
      height: 600
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to open confirmation popup:', chrome.runtime.lastError);
        pendingRequests.delete(requestId);
        reject(new Error('Failed to open confirmation popup'));
      }
    });

    // Set timeout for request (5 minutes)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, 5 * 60 * 1000);
  });
  */
}

/**
 * Request transaction from user
 */
async function requestTransaction(
  payload: { transaction: ethers.TransactionRequest },
  _sender: chrome.runtime.MessageSender
): Promise<string> {
  const currentAccount = await StorageService.getCurrentAccount();
  if (!currentAccount) {
    throw new Error('No account selected');
  }

  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  // For now, auto-approve transactions (TODO: implement confirmation UI)
  console.log('Auto-approving transaction request for:', payload.transaction);
  const result = await sendTransaction({
    transaction: payload.transaction,
    path: currentAccount.derivationPath
  });

  return result.hash;

  /* TODO: Implement confirmation popup
  // Create pending request
  const requestId = `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      id: requestId,
      type: 'transaction',
      payload: {
        transaction: payload.transaction,
        account: currentAccount.address,
        network: network.name,
        chainId: network.chainId
      },
      sender,
      timestamp: Date.now(),
      resolve,
      reject
    });

    // Open popup for confirmation
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?request=' + requestId),
      type: 'popup',
      width: 400,
      height: 600
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to open confirmation popup:', chrome.runtime.lastError);
        pendingRequests.delete(requestId);
        reject(new Error('Failed to open confirmation popup'));
      }
    });

    // Set timeout for request (5 minutes)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, 5 * 60 * 1000);
  });
  */
}

/**
 * Approve a pending request
 */
async function approveRequest(requestId: string) {
  const request = pendingRequests.get(requestId);
  if (!request) {
    throw new Error('Request not found');
  }

  try {
    const currentAccount = await StorageService.getCurrentAccount();
    if (!currentAccount) {
      throw new Error('No account selected');
    }

    if (!walletInstance) {
      throw new Error('Wallet is locked');
    }

    let result: any;

    if (request.type === 'signature') {
      // Sign the message
      const signature = await walletInstance.signMessage(
        request.payload.message,
        currentAccount.derivationPath
      );
      result = signature;
    } else if (request.type === 'transaction') {
      // Send the transaction
      const txResult = await sendTransaction({
        transaction: request.payload.transaction,
        path: currentAccount.derivationPath
      });
      result = txResult.hash;
    }

    // Resolve the pending request
    request.resolve(result);
    pendingRequests.delete(requestId);

    return { approved: true, result };
  } catch (error: any) {
    request.reject(error);
    pendingRequests.delete(requestId);
    throw error;
  }
}

/**
 * Reject a pending request
 */
async function rejectRequest(requestId: string, reason?: string) {
  const request = pendingRequests.get(requestId);
  if (!request) {
    throw new Error('Request not found');
  }

  request.reject(new Error(reason || 'User rejected the request'));
  pendingRequests.delete(requestId);

  return { rejected: true };
}

/**
 * Get mnemonic phrase (requires wallet to be unlocked)
 */
async function getMnemonic() {
  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  const mnemonic = walletInstance.getMnemonic();
  if (!mnemonic) {
    throw new Error('Mnemonic not available');
  }

  return { mnemonic };
}

/**
 * Get ERC20 token balance
 */
async function getTokenBalance(tokenAddress: string, walletAddress: string) {
  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  const provider = new ethers.JsonRpcProvider(network.rpcUrl);

  // ERC20 ABI for balanceOf function
  const erc20Abi = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];

  const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);

  try {
    const balance = await contract.balanceOf(walletAddress);
    const decimals = await contract.decimals();

    return {
      balance: balance.toString(),
      formatted: ethers.formatUnits(balance, decimals)
    };
  } catch (error) {
    console.error('Failed to get token balance:', error);
    return {
      balance: '0',
      formatted: '0'
    };
  }
}

/**
 * Handle RPC calls (read-only methods forwarded to current network)
 */
async function handleRpcCall(payload: { method: string; params?: any[] }) {
  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  const provider = new ethers.JsonRpcProvider(network.rpcUrl);

  try {
    // Forward the RPC call to the provider
    const result = await provider.send(payload.method, payload.params || []);
    return result;
  } catch (error: any) {
    console.error('RPC call failed:', error);
    throw new Error(error.message || 'RPC call failed');
  }
}

/**
 * Handle chain switching request
 */
async function handleSwitchChain(chainIdHex: string) {
  // Convert hex chain ID to decimal
  const chainId = parseInt(chainIdHex, 16);

  // Find the network with this chain ID
  const networks = await StorageService.getNetworks();
  const networkIndex = networks.findIndex(n => n.chainId === chainId);

  if (networkIndex === -1) {
    throw new Error(`Chain ${chainIdHex} not found. Please add it first.`);
  }

  // Switch to the network
  await StorageService.setCurrentNetwork(networkIndex);

  // Return the network info
  return networks[networkIndex];
}

/**
 * Handle add chain request (EIP-3085)
 */
async function handleAddChain(chainParams: {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls?: string[];
}) {
  // Convert hex chain ID to decimal
  const chainId = parseInt(chainParams.chainId, 16);

  // Check if network already exists
  const networks = await StorageService.getNetworks();
  const existingNetwork = networks.find(n => n.chainId === chainId);

  if (existingNetwork) {
    // Network already exists, switch to it
    const networkIndex = networks.indexOf(existingNetwork);
    await StorageService.setCurrentNetwork(networkIndex);
    return existingNetwork;
  }

  // Add new network
  const newNetwork = {
    chainId,
    name: chainParams.chainName,
    rpcUrl: chainParams.rpcUrls[0],
    symbol: chainParams.nativeCurrency.symbol,
    blockExplorerUrl: chainParams.blockExplorerUrls?.[0]
  };

  await StorageService.addNetwork(newNetwork);

  // Switch to the new network
  const updatedNetworks = await StorageService.getNetworks();
  const newNetworkIndex = updatedNetworks.findIndex(n => n.chainId === chainId);
  if (newNetworkIndex !== -1) {
    await StorageService.setCurrentNetwork(newNetworkIndex);
  }

  return newNetwork;
}

console.log('MultiSub background service worker initialized');
