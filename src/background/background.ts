import { Wallet } from '../core/wallet';
import { StorageService } from '../services/storage';
import { ethers } from 'ethers';

// In-memory wallet instance (cleared when locked)
let walletInstance: Wallet | null = null;

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

  const signedTx = await walletInstance.signTransaction(
    payload.transaction,
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
  const signedTx = await walletInstance.signTransaction(
    payload.transaction,
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
  sender: chrome.runtime.MessageSender
) {
  // In production, show a confirmation popup
  const currentAccount = await StorageService.getCurrentAccount();
  if (!currentAccount) {
    throw new Error('No account selected');
  }

  if (!walletInstance) {
    throw new Error('Wallet is locked');
  }

  const signature = await walletInstance.signMessage(
    payload.message,
    currentAccount.derivationPath
  );

  return signature;
}

/**
 * Request transaction from user
 */
async function requestTransaction(
  payload: { transaction: ethers.TransactionRequest },
  sender: chrome.runtime.MessageSender
) {
  // In production, show a confirmation popup
  const currentAccount = await StorageService.getCurrentAccount();
  if (!currentAccount) {
    throw new Error('No account selected');
  }

  const result = await sendTransaction({
    transaction: payload.transaction,
    path: currentAccount.derivationPath
  });

  return result.hash;
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

console.log('Crypto Wallet background service worker initialized');
