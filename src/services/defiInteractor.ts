import { ethers } from 'ethers';
import { StorageService } from './storage';

/**
 * DeFi Interactor Module ABI - only the functions we need
 */
const DEFI_INTERACTOR_ABI = [
  'function transferToken(address token, address recipient, uint256 amount) external returns (bool success)',
  'function approveProtocol(address token, address target, uint256 amount) external',
  'function executeOnProtocol(address target, bytes calldata data) external returns (bytes memory result)'
];

/**
 * ERC20 function selectors
 */
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'; // transfer(address,uint256)
const ERC20_APPROVE_SELECTOR = '0x095ea7b3'; // approve(address,uint256)

/**
 * Detect if a transaction is an ERC20 transfer
 */
export function isERC20Transfer(transaction: ethers.TransactionRequest): boolean {
  if (!transaction.data || typeof transaction.data !== 'string') {
    return false;
  }

  const data = transaction.data.toLowerCase();

  // Check if it's a transfer function call (first 4 bytes = function selector)
  if (data.startsWith(ERC20_TRANSFER_SELECTOR)) {
    return true;
  }

  return false;
}

/**
 * Decode ERC20 transfer data
 */
export function decodeERC20Transfer(data: string): { recipient: string; amount: bigint } | null {
  try {
    // Remove '0x' prefix and function selector (first 4 bytes = 8 hex chars)
    const params = data.slice(10);

    // Decode recipient (32 bytes = 64 hex chars, but address is last 20 bytes = 40 hex chars)
    const recipientHex = params.slice(24, 64);
    const recipient = '0x' + recipientHex;

    // Decode amount (next 32 bytes = 64 hex chars)
    const amountHex = params.slice(64, 128);
    const amount = BigInt('0x' + amountHex);

    return { recipient, amount };
  } catch (error) {
    console.error('Failed to decode ERC20 transfer:', error);
    return null;
  }
}

/**
 * Detect if a transaction is an ERC20 approve
 */
export function isERC20Approve(transaction: ethers.TransactionRequest): boolean {
  if (!transaction.data || typeof transaction.data !== 'string') {
    return false;
  }

  const data = transaction.data.toLowerCase();

  // Check if it's an approve function call (first 4 bytes = function selector)
  if (data.startsWith(ERC20_APPROVE_SELECTOR)) {
    return true;
  }

  return false;
}

/**
 * Decode ERC20 approve data
 */
export function decodeERC20Approve(data: string): { spender: string; amount: bigint } | null {
  try {
    // Remove '0x' prefix and function selector (first 4 bytes = 8 hex chars)
    const params = data.slice(10);

    // Decode spender (32 bytes = 64 hex chars, but address is last 20 bytes = 40 hex chars)
    const spenderHex = params.slice(24, 64);
    const spender = '0x' + spenderHex;

    // Decode amount (next 32 bytes = 64 hex chars)
    const amountHex = params.slice(64, 128);
    const amount = BigInt('0x' + amountHex);

    return { spender, amount };
  } catch (error) {
    console.error('Failed to decode ERC20 approve:', error);
    return null;
  }
}

/**
 * Function selectors for transactions that should NOT be wrapped
 * These transactions contain embedded signatures or are caller-dependent
 */
const UNWRAPPABLE_SELECTORS = [
  '0x02c205f0', // supplyWithPermit - contains Permit signature
  '0x680dd47c', // permitAndDeposit - contains Permit signature
  '0xd505accf', // permit - ERC20 permit itself
];

/**
 * Check if a transaction contains a method that should not be wrapped
 */
function isUnwrappableCall(transaction: ethers.TransactionRequest): boolean {
  if (!transaction.data || typeof transaction.data !== 'string') {
    return false;
  }

  const selector = transaction.data.slice(0, 10).toLowerCase();
  return UNWRAPPABLE_SELECTORS.includes(selector);
}

/**
 * Check if a transaction is a call to a whitelisted protocol
 */
export function isProtocolCall(transaction: ethers.TransactionRequest, whitelistedAddresses: string[]): boolean {
  if (!transaction.to || !transaction.data || typeof transaction.to !== 'string') {
    return false;
  }

  // Don't wrap transactions with embedded signatures
  if (isUnwrappableCall(transaction)) {
    console.log('[DeFi Interactor] Transaction contains embedded signature (e.g., Permit), skipping wrapper');
    return false;
  }

  // Normalize addresses for comparison
  const normalizedTo = transaction.to.toLowerCase();
  const normalizedWhitelist = whitelistedAddresses.map(addr => addr.toLowerCase());

  return normalizedWhitelist.includes(normalizedTo);
}

/**
 * Wrap an ERC20 approve transaction to go through DeFiInteractorModule
 */
export async function wrapApproveThroughModule(
  transaction: ethers.TransactionRequest,
  chainId: number
): Promise<ethers.TransactionRequest | null> {
  // Get DeFi Interactor Module config for this chain
  const config = await StorageService.getDeFiInteractorConfigForChain(chainId);

  if (!config || !config.enabled) {
    return null;
  }

  // Decode the approve data
  const approveData = decodeERC20Approve(transaction.data as string);
  if (!approveData) {
    console.error('[DeFi Interactor] Failed to decode approve data');
    return null;
  }

  // Check if the spender is a whitelisted protocol
  const whitelisted = config.whitelistedProtocols || [];
  const isWhitelisted = whitelisted.some(
    addr => addr.toLowerCase() === approveData.spender.toLowerCase()
  );

  if (!isWhitelisted) {
    console.log('[DeFi Interactor] Spender not whitelisted, skipping approve wrapping');
    return null;
  }

  console.log('[DeFi Interactor] Wrapping approve through module:', {
    token: transaction.to,
    spender: approveData.spender,
    amount: approveData.amount.toString(),
    moduleAddress: config.moduleAddress
  });

  // Create the DeFi Interactor Module interface
  const moduleInterface = new ethers.Interface(DEFI_INTERACTOR_ABI);

  // Encode the call to approveProtocol(token, target, amount)
  const wrappedData = moduleInterface.encodeFunctionData('approveProtocol', [
    transaction.to, // token address
    approveData.spender, // protocol address (spender)
    approveData.amount
  ]);

  // Return modified transaction that calls the module instead of the token directly
  return {
    ...transaction,
    to: config.moduleAddress, // Change target to the module
    data: wrappedData, // Replace data with module call
    value: 0 // No ETH value for token approvals
  };
}

/**
 * Wrap a protocol call transaction to go through DeFiInteractorModule
 */
export async function wrapProtocolCallThroughModule(
  transaction: ethers.TransactionRequest,
  chainId: number
): Promise<ethers.TransactionRequest | null> {
  // Get DeFi Interactor Module config for this chain
  const config = await StorageService.getDeFiInteractorConfigForChain(chainId);

  if (!config || !config.enabled) {
    console.log('[DeFi Interactor] Module not enabled for chain', chainId);
    return null;
  }

  // Check if the target is a whitelisted protocol
  const whitelisted = config.whitelistedProtocols || [];
  if (!isProtocolCall(transaction, whitelisted)) {
    console.log('[DeFi Interactor] Target not whitelisted, skipping protocol wrapping');
    return null;
  }

  // Log the function being called for debugging
  const functionSelector = transaction.data ? (transaction.data as string).slice(0, 10) : 'none';
  console.log('[DeFi Interactor] Wrapping protocol call through module:', {
    protocol: transaction.to,
    functionSelector,
    dataLength: transaction.data ? (transaction.data as string).length : 0,
    moduleAddress: config.moduleAddress
  });

  // Create the DeFi Interactor Module interface
  const moduleInterface = new ethers.Interface(DEFI_INTERACTOR_ABI);

  // Encode the call to executeOnProtocol(target, data)
  const wrappedData = moduleInterface.encodeFunctionData('executeOnProtocol', [
    transaction.to, // protocol address
    transaction.data // original call data
  ]);

  // Return modified transaction that calls the module instead of the protocol directly
  return {
    ...transaction,
    to: config.moduleAddress, // Change target to the module
    data: wrappedData, // Replace data with module call
    value: transaction.value || 0 // Preserve value if any
  };
}

/**
 * Wrap an ERC20 transfer transaction to go through DeFiInteractorModule
 */
export async function wrapTransferThroughModule(
  transaction: ethers.TransactionRequest,
  chainId: number
): Promise<ethers.TransactionRequest> {
  // Get DeFi Interactor Module config for this chain
  const config = await StorageService.getDeFiInteractorConfigForChain(chainId);

  if (!config || !config.enabled) {
    // Module not configured or not enabled for this chain, return original transaction
    console.log('[DeFi Interactor] Module not configured for chain', chainId);
    return transaction;
  }

  // Check if this is an ERC20 transfer
  if (!isERC20Transfer(transaction)) {
    console.log('[DeFi Interactor] Not an ERC20 transfer, skipping');
    return transaction;
  }

  // Decode the original transfer data
  const transferData = decodeERC20Transfer(transaction.data as string);
  if (!transferData) {
    console.error('[DeFi Interactor] Failed to decode transfer data');
    return transaction;
  }

  console.log('[DeFi Interactor] Wrapping transfer through module:', {
    token: transaction.to,
    recipient: transferData.recipient,
    amount: transferData.amount.toString(),
    moduleAddress: config.moduleAddress
  });

  // Create the DeFi Interactor Module interface
  const moduleInterface = new ethers.Interface(DEFI_INTERACTOR_ABI);

  // Encode the call to transferToken(token, recipient, amount)
  const wrappedData = moduleInterface.encodeFunctionData('transferToken', [
    transaction.to, // token address
    transferData.recipient,
    transferData.amount
  ]);

  // Return modified transaction that calls the module instead of the token directly
  return {
    ...transaction,
    to: config.moduleAddress, // Change target to the module
    data: wrappedData, // Replace data with module call
    value: 0 // No ETH value for token transfers
  };
}

/**
 * Main wrapping function - detects transaction type and wraps appropriately
 */
export async function wrapTransactionThroughModule(
  transaction: ethers.TransactionRequest,
  chainId: number
): Promise<ethers.TransactionRequest> {
  console.log('[DeFi Interactor] wrapTransactionThroughModule called:', {
    chainId,
    to: transaction.to,
    hasData: !!transaction.data,
    dataSelector: transaction.data ? (transaction.data as string).slice(0, 10) : 'none'
  });

  // Get DeFi Interactor Module config for this chain
  const config = await StorageService.getDeFiInteractorConfigForChain(chainId);

  console.log('[DeFi Interactor] Config for chain:', {
    chainId,
    hasConfig: !!config,
    enabled: config?.enabled,
    moduleAddress: config?.moduleAddress,
    whitelistedCount: config?.whitelistedProtocols?.length || 0,
    whitelisted: config?.whitelistedProtocols
  });

  if (!config || !config.enabled) {
    // Module not configured or not enabled for this chain, return original transaction
    console.log('[DeFi Interactor] Module not configured or disabled for chain', chainId);
    return transaction;
  }

  // Try wrapping as ERC20 approve
  if (isERC20Approve(transaction)) {
    console.log('[DeFi Interactor] Detected ERC20 approve');
    const wrapped = await wrapApproveThroughModule(transaction, chainId);
    if (wrapped) {
      console.log('[DeFi Interactor] Wrapped approve transaction');
      return wrapped;
    }
    // If approve wrapping failed (spender not whitelisted), return original
    console.log('[DeFi Interactor] Approve wrapping not applicable, using original transaction');
    return transaction;
  }

  // Try wrapping as ERC20 transfer
  if (isERC20Transfer(transaction)) {
    console.log('[DeFi Interactor] Detected ERC20 transfer');
    return wrapTransferThroughModule(transaction, chainId);
  }

  // Try wrapping as protocol call (only if has data and whitelisted)
  if (transaction.data && transaction.data !== '0x') {
    console.log('[DeFi Interactor] Checking if protocol call');
    const wrapped = await wrapProtocolCallThroughModule(transaction, chainId);
    if (wrapped) {
      console.log('[DeFi Interactor] Wrapped protocol call');
      return wrapped;
    } else {
      console.log('[DeFi Interactor] Protocol call wrapping returned null - target not whitelisted or unwrappable');
    }
  }

  // No wrapping applicable, return original transaction
  console.log('[DeFi Interactor] No wrapping applicable for this transaction');
  return transaction;
}

/**
 * Get the DeFi Interactor Module contract instance
 */
export function getDeFiInteractorContract(
  moduleAddress: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): ethers.Contract {
  return new ethers.Contract(moduleAddress, DEFI_INTERACTOR_ABI, signerOrProvider);
}
