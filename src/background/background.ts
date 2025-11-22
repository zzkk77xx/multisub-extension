import { Wallet } from '../core/wallet';
import { StorageService } from '../services/storage';
import { ethers } from 'ethers';

// In-memory wallet instance (cleared when locked)
let walletInstance: Wallet | null = null;

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

  // Try to restore wallet from session storage
  const mnemonic = await StorageService.getSessionMnemonic();
  if (mnemonic) {
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
        return await sendTransaction({
          transaction: payload,
          path: currentAccount.derivationPath
        });
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
      return await sendTransaction(payload);

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
 * Unlock wallet
 */
async function unlockWallet(password: string) {
  const mnemonic = await StorageService.unlockWallet(password);

  const wallet = new Wallet();
  await wallet.fromMnemonic(mnemonic);

  walletInstance = wallet;

  const currentAccount = await StorageService.getCurrentAccount();
  return { address: currentAccount?.address };
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
async function signMessage(payload: { message: string; path: string }) {
  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  const signature = await walletInstance.signMessage(payload.message, payload.path);
  return { signature };
}

/**
 * Sign a transaction
 */
async function signTransaction(payload: {
  transaction: ethers.TransactionRequest;
  path: string;
}) {
  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  // Ensure transaction has the correct chain ID
  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  const transaction = {
    ...payload.transaction,
    chainId: network.chainId
  };

  const signedTx = await walletInstance.signTransaction(
    transaction,
    payload.path
  );

  return { signedTransaction: signedTx };
}

/**
 * Send a transaction
 */
async function sendTransaction(payload: {
  transaction: ethers.TransactionRequest;
  path: string;
}) {
  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  const network = await StorageService.getCurrentNetwork();
  if (!network) {
    throw new Error('No network selected');
  }

  const provider = new ethers.JsonRpcProvider(network.rpcUrl);

  // Prepare transaction with all required fields
  const transaction = {
    ...payload.transaction,
    chainId: network.chainId
  };

  // Estimate gas if not provided
  if (!transaction.gasLimit) {
    try {
      const gasEstimate = await provider.estimateGas(transaction);
      // Add 20% buffer to gas estimate
      transaction.gasLimit = (gasEstimate * 120n) / 100n;
    } catch (error) {
      console.warn('Gas estimation failed, using default:', error);
      // Default gas for simple transfer
      transaction.gasLimit = 21000;
    }
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
  if (transaction.nonce === undefined && transaction.from) {
    transaction.nonce = await provider.getTransactionCount(transaction.from as string, 'latest');
  }

  const signedTx = await walletInstance.signTransaction(
    transaction,
    payload.path
  );

  const txResponse = await provider.broadcastTransaction(signedTx);

  return {
    hash: txResponse.hash,
    from: txResponse.from,
    to: txResponse.to
  };
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

console.log('Crypto Wallet background service worker initialized');
