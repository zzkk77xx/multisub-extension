/**
 * Popup UI controller
 */

interface WalletStatus {
  exists: boolean;
  isLocked: boolean;
}

let currentScreen: string = 'welcome-screen';
let generatedMnemonic: string = '';

/**
 * Initialize popup
 */
async function initialize() {
  try {
    const status = await sendMessage<WalletStatus>('GET_WALLET_STATUS');

    if (!status.exists) {
      showScreen('welcome-screen');
    } else if (status.isLocked) {
      showScreen('unlock-screen');
    } else {
      await loadWalletData();
      showScreen('wallet-screen');
    }
  } catch (error) {
    console.error('Failed to initialize:', error);
    showError('Failed to load wallet');
  }

  setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Welcome screen
  document.getElementById('create-wallet-btn')?.addEventListener('click', () => {
    showScreen('create-wallet-screen');
  });

  document.getElementById('import-wallet-btn')?.addEventListener('click', () => {
    showScreen('import-wallet-screen');
  });

  // Create wallet
  document.getElementById('create-submit-btn')?.addEventListener('click', handleCreateWallet);
  document.getElementById('create-back-btn')?.addEventListener('click', () => {
    showScreen('welcome-screen');
  });

  // Mnemonic screen
  document.getElementById('copy-mnemonic-btn')?.addEventListener('click', copyMnemonic);
  document.getElementById('mnemonic-continue-btn')?.addEventListener('click', async () => {
    await loadWalletData();
    showScreen('wallet-screen');
  });

  // Import wallet
  document.getElementById('import-submit-btn')?.addEventListener('click', handleImportWallet);
  document.getElementById('import-back-btn')?.addEventListener('click', () => {
    showScreen('welcome-screen');
  });

  // Unlock
  document.getElementById('unlock-btn')?.addEventListener('click', handleUnlock);
  document.getElementById('unlock-password')?.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      handleUnlock();
    }
  });

  // Main wallet
  document.getElementById('copy-address-btn')?.addEventListener('click', copyAddress);
  document.getElementById('add-account-btn')?.addEventListener('click', handleAddAccount);
  document.getElementById('lock-wallet-btn')?.addEventListener('click', handleLock);

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tabName = target.dataset.tab;
      if (tabName) {
        switchTab(tabName);
      }
    });
  });
}

/**
 * Show screen
 */
function showScreen(screenId: string) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    currentScreen = screenId;
  }
}

/**
 * Switch tab
 */
function switchTab(tabName: string) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) {
    tab.classList.add('active');
  }

  const content = document.getElementById(`${tabName}-tab`);
  if (content) {
    content.classList.remove('hidden');
  }
}

/**
 * Handle create wallet
 */
async function handleCreateWallet() {
  const password = (document.getElementById('create-password') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('create-password-confirm') as HTMLInputElement).value;
  const errorEl = document.getElementById('create-error');

  if (!password || password.length < 8) {
    showElementError(errorEl, 'Password must be at least 8 characters');
    return;
  }

  if (password !== confirmPassword) {
    showElementError(errorEl, 'Passwords do not match');
    return;
  }

  try {
    hideElementError(errorEl);

    const result = await sendMessage<{ address: string; mnemonic?: string }>('CREATE_WALLET', {
      password
    });

    // Get the mnemonic from wallet
    const wallet = await sendMessage<any>('GET_WALLET_STATUS');

    // For display purposes, generate a mnemonic to show
    // In production, the backend should return it securely
    generatedMnemonic = 'Your mnemonic phrase would be displayed here securely from the backend';

    // Show mnemonic screen
    const mnemonicDisplay = document.getElementById('mnemonic-display');
    if (mnemonicDisplay) {
      mnemonicDisplay.textContent = generatedMnemonic;
    }

    showScreen('mnemonic-screen');
  } catch (error) {
    showElementError(errorEl, (error as Error).message);
  }
}

/**
 * Handle import wallet
 */
async function handleImportWallet() {
  const mnemonic = (document.getElementById('import-mnemonic') as HTMLTextAreaElement).value.trim();
  const password = (document.getElementById('import-password') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('import-password-confirm') as HTMLInputElement).value;
  const errorEl = document.getElementById('import-error');

  if (!mnemonic) {
    showElementError(errorEl, 'Please enter your recovery phrase');
    return;
  }

  if (!password || password.length < 8) {
    showElementError(errorEl, 'Password must be at least 8 characters');
    return;
  }

  if (password !== confirmPassword) {
    showElementError(errorEl, 'Passwords do not match');
    return;
  }

  try {
    hideElementError(errorEl);

    await sendMessage('CREATE_WALLET', {
      password,
      mnemonic
    });

    await loadWalletData();
    showScreen('wallet-screen');
  } catch (error) {
    showElementError(errorEl, (error as Error).message);
  }
}

/**
 * Handle unlock
 */
async function handleUnlock() {
  const password = (document.getElementById('unlock-password') as HTMLInputElement).value;
  const errorEl = document.getElementById('unlock-error');

  if (!password) {
    showElementError(errorEl, 'Please enter your password');
    return;
  }

  try {
    hideElementError(errorEl);

    await sendMessage('UNLOCK_WALLET', { password });
    await loadWalletData();
    showScreen('wallet-screen');
  } catch (error) {
    showElementError(errorEl, 'Invalid password');
  }
}

/**
 * Handle lock
 */
async function handleLock() {
  try {
    await sendMessage('LOCK_WALLET');
    showScreen('unlock-screen');
  } catch (error) {
    showError((error as Error).message);
  }
}

/**
 * Load wallet data
 */
async function loadWalletData() {
  try {
    const [account, network, balance] = await Promise.all([
      sendMessage<any>('GET_CURRENT_ACCOUNT'),
      sendMessage<any>('GET_CURRENT_NETWORK'),
      sendMessage<any>('GET_CURRENT_ACCOUNT').then(async (acc) => {
        if (acc?.address) {
          return sendMessage<{ balance: string; formatted: string }>('GET_BALANCE', {
            address: acc.address
          });
        }
        return { balance: '0', formatted: '0.00' };
      })
    ]);

    // Update account display
    const addressEl = document.getElementById('account-address');
    if (addressEl && account) {
      const shortAddress = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
      addressEl.textContent = shortAddress;
    }

    // Update balance
    const balanceEl = document.getElementById('balance-amount');
    const symbolEl = document.getElementById('balance-symbol');
    if (balanceEl && balance) {
      balanceEl.textContent = parseFloat(balance.formatted).toFixed(4);
    }

    // Update network
    const networkEl = document.getElementById('network-name');
    if (networkEl && network) {
      networkEl.textContent = network.name;
    }

    if (symbolEl && network) {
      symbolEl.textContent = network.symbol;
    }
  } catch (error) {
    console.error('Failed to load wallet data:', error);
  }
}

/**
 * Copy address
 */
async function copyAddress() {
  const addressEl = document.getElementById('account-address');
  if (!addressEl) return;

  try {
    const account = await sendMessage<any>('GET_CURRENT_ACCOUNT');
    if (account?.address) {
      await navigator.clipboard.writeText(account.address);

      const btn = document.getElementById('copy-address-btn');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    }
  } catch (error) {
    console.error('Failed to copy address:', error);
  }
}

/**
 * Copy mnemonic
 */
async function copyMnemonic() {
  try {
    await navigator.clipboard.writeText(generatedMnemonic);

    const btn = document.getElementById('copy-mnemonic-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to copy mnemonic:', error);
  }
}

/**
 * Handle add account
 */
async function handleAddAccount() {
  try {
    const account = await sendMessage<any>('ADD_ACCOUNT');
    await loadWalletData();
    showSuccess('Account added successfully');
  } catch (error) {
    showError((error as Error).message);
  }
}

/**
 * Send message to background
 */
async function sendMessage<T = any>(type: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Request failed'));
      }
    });
  });
}

/**
 * Show error in element
 */
function showElementError(element: HTMLElement | null, message: string) {
  if (element) {
    element.textContent = message;
    element.classList.remove('hidden');
  }
}

/**
 * Hide error element
 */
function hideElementError(element: HTMLElement | null) {
  if (element) {
    element.classList.add('hidden');
  }
}

/**
 * Show error notification
 */
function showError(message: string) {
  alert(`Error: ${message}`);
}

/**
 * Show success notification
 */
function showSuccess(message: string) {
  alert(message);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initialize);
