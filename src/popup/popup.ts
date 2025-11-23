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

  document.getElementById('connect-ledger-btn')?.addEventListener('click', () => {
    showScreen('ledger-setup-screen');
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
  document.getElementById('import-method-mnemonic')?.addEventListener('click', () => {
    document.getElementById('import-mnemonic-form')!.style.display = 'block';
    document.getElementById('import-privatekey-form')!.style.display = 'none';
    document.getElementById('import-method-mnemonic')!.style.background = '#667eea';
    document.getElementById('import-method-mnemonic')!.style.color = 'white';
    document.getElementById('import-method-privatekey')!.style.background = '';
    document.getElementById('import-method-privatekey')!.style.color = '';
  });

  document.getElementById('import-method-privatekey')?.addEventListener('click', () => {
    document.getElementById('import-mnemonic-form')!.style.display = 'none';
    document.getElementById('import-privatekey-form')!.style.display = 'block';
    document.getElementById('import-method-privatekey')!.style.background = '#667eea';
    document.getElementById('import-method-privatekey')!.style.color = 'white';
    document.getElementById('import-method-mnemonic')!.style.background = '';
    document.getElementById('import-method-mnemonic')!.style.color = '';
  });

  document.getElementById('import-submit-btn')?.addEventListener('click', handleImportWallet);
  document.getElementById('import-back-btn')?.addEventListener('click', () => {
    showScreen('welcome-screen');
  });

  // Ledger setup
  document.getElementById('ledger-connect-btn')?.addEventListener('click', handleLedgerConnect);
  document.getElementById('ledger-submit-btn')?.addEventListener('click', handleLedgerSubmit);
  document.getElementById('ledger-back-btn')?.addEventListener('click', () => {
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
  document.getElementById('send-btn')?.addEventListener('click', () => {
    showScreen('send-screen');
  });
  document.getElementById('receive-btn')?.addEventListener('click', () => {
    showScreen('receive-screen');
  });
  document.getElementById('copy-address-btn')?.addEventListener('click', copyAddress);
  document.getElementById('add-account-btn')?.addEventListener('click', handleAddAccount);
  document.getElementById('lock-wallet-btn')?.addEventListener('click', handleLock);
  document.getElementById('reset-wallet-btn')?.addEventListener('click', handleResetWallet);

  // Reset wallet checkbox
  document.getElementById('reset-confirm-checkbox')?.addEventListener('change', (e) => {
    const checkbox = e.target as HTMLInputElement;
    const resetBtn = document.getElementById('reset-wallet-btn') as HTMLButtonElement;
    if (resetBtn) {
      resetBtn.disabled = !checkbox.checked;
    }
  });

  // Send screen
  document.getElementById('send-submit-btn')?.addEventListener('click', handleSendTransaction);
  document.getElementById('send-back-btn')?.addEventListener('click', () => {
    showScreen('wallet-screen');
  });

  // Receive screen
  document.getElementById('copy-receive-address-btn')?.addEventListener('click', copyReceiveAddress);
  document.getElementById('receive-back-btn')?.addEventListener('click', () => {
    showScreen('wallet-screen');
  });

  // Network management
  document.getElementById('update-networks-btn')?.addEventListener('click', handleUpdateDefaultNetworks);
  document.getElementById('add-network-btn')?.addEventListener('click', () => {
    showScreen('add-network-screen');
  });
  document.getElementById('add-network-submit-btn')?.addEventListener('click', handleAddNetwork);
  document.getElementById('add-network-back-btn')?.addEventListener('click', async () => {
    await loadWalletData();
    showScreen('wallet-screen');
  });

  // Show recovery phrase
  document.getElementById('show-mnemonic-btn')?.addEventListener('click', handleShowMnemonic);
  document.getElementById('copy-mnemonic-view-btn')?.addEventListener('click', copyMnemonicView);
  document.getElementById('mnemonic-view-back-btn')?.addEventListener('click', () => {
    showScreen('wallet-screen');
  });

  // Token management
  document.getElementById('add-token-btn')?.addEventListener('click', () => {
    showScreen('add-token-screen');
  });
  document.getElementById('add-token-submit-btn')?.addEventListener('click', handleAddToken);
  document.getElementById('add-token-back-btn')?.addEventListener('click', async () => {
    await loadWalletData();
    showScreen('wallet-screen');
  });

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

  // Address spoofing controls
  document.getElementById('spoof-enabled-checkbox')?.addEventListener('change', handleSpoofEnabledChange);
  document.getElementById('save-spoof-btn')?.addEventListener('click', handleSaveSpoofConfig);

  // DeFi Interactor Module controls
  document.getElementById('save-defi-config-btn')?.addEventListener('click', handleSaveDeFiConfig);
}

/**
 * Show screen
 */
async function showScreen(screenId: string) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    currentScreen = screenId;
  }

  // Populate receive address when showing receive screen
  if (screenId === 'receive-screen') {
    try {
      const account = await sendMessage<any>('GET_CURRENT_ACCOUNT');
      const receiveAddressEl = document.getElementById('receive-address');
      if (receiveAddressEl && account?.address) {
        receiveAddressEl.textContent = account.address;
      }
    } catch (error) {
      console.error('Failed to load address:', error);
    }
  }
}

/**
 * Switch tab
 */
async function switchTab(tabName: string) {
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

  // Load networks when switching to networks tab
  if (tabName === 'networks') {
    await loadNetworks();
  }

  // Load tokens when switching to tokens tab
  if (tabName === 'tokens') {
    await loadTokens();
  }

  // Load spoof config and DeFi configs when switching to settings tab
  if (tabName === 'settings') {
    await loadSpoofConfig();
    await loadDeFiConfigs();
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
  const password = (document.getElementById('import-password') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('import-password-confirm') as HTMLInputElement).value;
  const errorEl = document.getElementById('import-error');

  // Check which import method is active
  const mnemonicFormVisible = (document.getElementById('import-mnemonic-form') as HTMLElement).style.display !== 'none';

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

    if (mnemonicFormVisible) {
      // Import via mnemonic
      const mnemonic = (document.getElementById('import-mnemonic') as HTMLTextAreaElement).value.trim();

      if (!mnemonic) {
        showElementError(errorEl, 'Please enter your recovery phrase');
        return;
      }

      await sendMessage('CREATE_WALLET', {
        password,
        mnemonic
      });
    } else {
      // Import via private key
      let privateKey = (document.getElementById('import-privatekey') as HTMLInputElement).value.trim();

      if (!privateKey) {
        showElementError(errorEl, 'Please enter your private key');
        return;
      }

      // Add 0x prefix if not present
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      await sendMessage('CREATE_WALLET_FROM_PRIVATE_KEY', {
        password,
        privateKey
      });
    }

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

    // Unlock wallet first
    await sendMessage('UNLOCK_WALLET', { password });

    // Show wallet screen immediately after unlock succeeds
    showScreen('wallet-screen');

    // Load wallet data in background - don't let RPC failures block unlock
    loadWalletData().catch(error => {
      console.error('Failed to load wallet data after unlock:', error);
      // Wallet is still unlocked, just show default values
    });
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
 * Handle reset wallet
 */
async function handleResetWallet() {
  console.log('Reset wallet button clicked!');

  try {
    await sendMessage('RESET_WALLET');
    console.log('Wallet reset successful');

    // Redirect to welcome screen
    showScreen('welcome-screen');
  } catch (error) {
    console.error('Reset wallet error:', error);
    showError((error as Error).message);
  }
}

/**
 * Load wallet data
 */
async function loadWalletData() {
  try {
    // Fetch account and network info (fast, no RPC needed)
    const [account, network] = await Promise.all([
      sendMessage<any>('GET_CURRENT_ACCOUNT'),
      sendMessage<any>('GET_CURRENT_NETWORK')
    ]);

    // Update account display
    const addressEl = document.getElementById('account-address');
    if (addressEl && account) {
      const shortAddress = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
      addressEl.textContent = shortAddress;
    }

    // Update network display
    const networkEl = document.getElementById('network-name');
    const symbolEl = document.getElementById('balance-symbol');
    if (networkEl && network) {
      networkEl.textContent = network.name;
    }
    if (symbolEl && network) {
      symbolEl.textContent = network.symbol;
    }

    // Balance removed - no RPC calls needed
    const balanceEl = document.getElementById('balance-amount');
    if (balanceEl) {
      balanceEl.textContent = '-';
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

/**
 * Handle send transaction
 */
async function handleSendTransaction() {
  const toAddress = (document.getElementById('send-to') as HTMLInputElement).value.trim();
  const amount = (document.getElementById('send-amount') as HTMLInputElement).value.trim();
  const gasLimit = (document.getElementById('send-gas') as HTMLInputElement).value.trim();
  const errorEl = document.getElementById('send-error');
  const successEl = document.getElementById('send-success');

  // Validation
  if (!toAddress || !toAddress.startsWith('0x') || toAddress.length !== 42) {
    showElementError(errorEl, 'Invalid recipient address');
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    showElementError(errorEl, 'Invalid amount');
    return;
  }

  try {
    hideElementError(errorEl);
    if (successEl) {
      successEl.classList.add('hidden');
    }

    // Get current account and network
    const account = await sendMessage<any>('GET_CURRENT_ACCOUNT');
    const network = await sendMessage<any>('GET_CURRENT_NETWORK');

    if (!account || !account.address) {
      showElementError(errorEl, 'No account selected');
      return;
    }

    // Build transaction
    const transaction: any = {
      to: toAddress,
      value: '0x' + (parseFloat(amount) * 1e18).toString(16),
      from: account.address
    };

    if (gasLimit && parseInt(gasLimit) > 0) {
      transaction.gasLimit = '0x' + parseInt(gasLimit).toString(16);
    }

    // Send transaction
    const result = await sendMessage<{ hash: string; from: string; to: string }>('SEND_TRANSACTION', {
      transaction,
      path: account.derivationPath
    });

    // Show success
    if (successEl) {
      successEl.textContent = `Transaction sent! Hash: ${result.hash.slice(0, 10)}...`;
      successEl.classList.remove('hidden');
    }

    // Clear inputs
    (document.getElementById('send-to') as HTMLInputElement).value = '';
    (document.getElementById('send-amount') as HTMLInputElement).value = '';
    (document.getElementById('send-gas') as HTMLInputElement).value = '';

  } catch (error) {
    showElementError(errorEl, (error as Error).message);
  }
}

/**
 * Copy receive address
 */
async function copyReceiveAddress() {
  try {
    const account = await sendMessage<any>('GET_CURRENT_ACCOUNT');
    if (account?.address) {
      await navigator.clipboard.writeText(account.address);

      const btn = document.getElementById('copy-receive-address-btn');
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
 * Load and display networks
 */
async function loadNetworks() {
  try {
    const [networks, currentNetwork] = await Promise.all([
      sendMessage<any[]>('GET_NETWORKS'),
      sendMessage<any>('GET_CURRENT_NETWORK')
    ]);

    const networksList = document.getElementById('networks-list');
    if (!networksList) return;

    networksList.innerHTML = '';

    networks.forEach((network, index) => {
      const isActive = currentNetwork && network.chainId === currentNetwork.chainId;

      const networkItem = document.createElement('div');
      networkItem.className = `network-item ${isActive ? 'active' : ''}`;
      networkItem.onclick = () => handleNetworkSwitch(index);

      networkItem.innerHTML = `
        <div class="network-item-info">
          <div class="network-item-name">${network.name}</div>
          <div class="network-item-chain">Chain ID: ${network.chainId} • ${network.symbol}</div>
        </div>
        ${isActive ? '<div class="network-item-badge">ACTIVE</div>' : ''}
      `;

      networksList.appendChild(networkItem);
    });
  } catch (error) {
    console.error('Failed to load networks:', error);
  }
}

/**
 * Handle network switch
 */
async function handleNetworkSwitch(networkIndex: number) {
  try {
    await sendMessage('SET_CURRENT_NETWORK', { index: networkIndex });
    await loadNetworks();
    await loadWalletData();
    showSuccess('Network switched successfully');
  } catch (error) {
    showError((error as Error).message);
  }
}

/**
 * Update default networks
 */
async function handleUpdateDefaultNetworks() {
  try {
    await sendMessage('UPDATE_DEFAULT_NETWORKS');
    await loadNetworks();
    showSuccess('Default networks updated successfully!');
  } catch (error) {
    showError((error as Error).message);
  }
}

/**
 * Handle add custom network
 */
async function handleAddNetwork() {
  const name = (document.getElementById('network-name') as HTMLInputElement).value.trim();
  const rpcUrl = (document.getElementById('network-rpc') as HTMLInputElement).value.trim();
  const chainId = (document.getElementById('network-chain-id') as HTMLInputElement).value.trim();
  const symbol = (document.getElementById('network-symbol') as HTMLInputElement).value.trim();
  const explorerUrl = (document.getElementById('network-explorer') as HTMLInputElement).value.trim();
  const errorEl = document.getElementById('add-network-error');
  const successEl = document.getElementById('add-network-success');

  // Validation
  if (!name) {
    showElementError(errorEl, 'Network name is required');
    return;
  }

  if (!rpcUrl || !rpcUrl.startsWith('http')) {
    showElementError(errorEl, 'Valid RPC URL is required');
    return;
  }

  if (!chainId || parseInt(chainId) <= 0) {
    showElementError(errorEl, 'Valid chain ID is required');
    return;
  }

  if (!symbol) {
    showElementError(errorEl, 'Currency symbol is required');
    return;
  }

  try {
    hideElementError(errorEl);
    if (successEl) {
      successEl.classList.add('hidden');
    }

    const network = {
      name,
      rpcUrl,
      chainId: parseInt(chainId),
      symbol,
      blockExplorerUrl: explorerUrl || undefined
    };

    await sendMessage('ADD_NETWORK', { network });

    // Show success
    if (successEl) {
      successEl.textContent = 'Network added successfully!';
      successEl.classList.remove('hidden');
    }

    // Clear inputs
    (document.getElementById('network-name') as HTMLInputElement).value = '';
    (document.getElementById('network-rpc') as HTMLInputElement).value = '';
    (document.getElementById('network-chain-id') as HTMLInputElement).value = '';
    (document.getElementById('network-symbol') as HTMLInputElement).value = '';
    (document.getElementById('network-explorer') as HTMLInputElement).value = '';

    // Go back to wallet after a delay
    setTimeout(async () => {
      await loadWalletData();
      showScreen('wallet-screen');
    }, 2000);

  } catch (error) {
    showElementError(errorEl, (error as Error).message);
  }
}

/**
 * Handle show mnemonic
 */
async function handleShowMnemonic() {
  try {
    const result = await sendMessage<{ mnemonic: string }>('GET_MNEMONIC');
    const mnemonicDisplay = document.getElementById('mnemonic-display-view');

    if (mnemonicDisplay && result?.mnemonic) {
      mnemonicDisplay.textContent = result.mnemonic;
      showScreen('show-mnemonic-screen');
    } else {
      showError('Failed to retrieve recovery phrase');
    }
  } catch (error) {
    showError((error as Error).message);
  }
}

/**
 * Copy mnemonic from view screen
 */
async function copyMnemonicView() {
  try {
    const mnemonicDisplay = document.getElementById('mnemonic-display-view');
    if (!mnemonicDisplay || !mnemonicDisplay.textContent) {
      return;
    }

    await navigator.clipboard.writeText(mnemonicDisplay.textContent);

    const btn = document.getElementById('copy-mnemonic-view-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to copy mnemonic:', error);
    showError('Failed to copy to clipboard');
  }
}

/**
 * Load and display tokens
 */
async function loadTokens() {
  try {
    const [currentNetwork, currentAccount, spoofConfig] = await Promise.all([
      sendMessage<any>('GET_CURRENT_NETWORK'),
      sendMessage<any>('GET_CURRENT_ACCOUNT'),
      sendMessage<{ enabled: boolean; spoofedAddress: string }>('GET_ADDRESS_SPOOF_CONFIG')
    ]);

    if (!currentNetwork || !currentAccount) {
      return;
    }

    const tokens = await sendMessage<any[]>('GET_TOKENS_FOR_CHAIN', {
      chainId: currentNetwork.chainId
    });

    const tokensListConnected = document.getElementById('tokens-list-connected');
    const tokensListSpoofed = document.getElementById('tokens-list-spoofed');
    const spoofedSection = document.getElementById('spoofed-tokens-section');

    if (!tokensListConnected) return;

    // Show/hide spoofed section based on config
    if (spoofConfig.enabled && spoofConfig.spoofedAddress && spoofedSection) {
      spoofedSection.style.display = 'block';
    } else if (spoofedSection) {
      spoofedSection.style.display = 'none';
    }

    if (tokens.length === 0) {
      tokensListConnected.innerHTML = '<div style="text-align: center; padding: 20px; color: #888; font-size: 13px;">No tokens added yet. Click "Add Token" to get started.</div>';
      if (tokensListSpoofed) {
        tokensListSpoofed.innerHTML = '';
      }
      return;
    }

    tokensListConnected.innerHTML = '<div style="font-size: 12px; color: #888; margin-bottom: 10px;">Loading balances...</div>';
    if (tokensListSpoofed) {
      tokensListSpoofed.innerHTML = '<div style="font-size: 12px; color: #888; margin-bottom: 10px;">Loading balances...</div>';
    }

    // Load token balances for connected address
    const connectedTokenElements: string[] = [];
    for (const token of tokens) {
      try {
        const balance = await sendMessage<{ balance: string; formatted: string }>('GET_TOKEN_BALANCE', {
          tokenAddress: token.address,
          walletAddress: currentAccount.address
        });

        const shortAddress = `${token.address.slice(0, 6)}...${token.address.slice(-4)}`;
        const formattedBalance = parseFloat(balance.formatted).toFixed(4);

        connectedTokenElements.push(`
          <div class="token-item">
            <div class="token-item-info">
              <div class="token-item-name">${token.name} (${token.symbol})</div>
              <div class="token-item-address">${shortAddress}</div>
            </div>
            <div class="token-item-balance">
              <div class="token-item-amount">${formattedBalance}</div>
              <div class="token-item-symbol">${token.symbol}</div>
            </div>
            <button class="token-item-remove" onclick="handleRemoveToken('${token.address}', ${token.chainId})">Remove</button>
          </div>
        `);
      } catch (error) {
        console.error(`Failed to load balance for ${token.symbol}:`, error);
      }
    }

    tokensListConnected.innerHTML = connectedTokenElements.join('');

    // Load token balances for spoofed address if enabled
    if (spoofConfig.enabled && spoofConfig.spoofedAddress && tokensListSpoofed) {
      const spoofedTokenElements: string[] = [];
      for (const token of tokens) {
        try {
          const balance = await sendMessage<{ balance: string; formatted: string }>('GET_TOKEN_BALANCE', {
            tokenAddress: token.address,
            walletAddress: spoofConfig.spoofedAddress
          });

          const shortAddress = `${token.address.slice(0, 6)}...${token.address.slice(-4)}`;
          const formattedBalance = parseFloat(balance.formatted).toFixed(4);

          spoofedTokenElements.push(`
            <div class="token-item">
              <div class="token-item-info">
                <div class="token-item-name">${token.name} (${token.symbol})</div>
                <div class="token-item-address">${shortAddress}</div>
              </div>
              <div class="token-item-balance">
                <div class="token-item-amount">${formattedBalance}</div>
                <div class="token-item-symbol">${token.symbol}</div>
              </div>
            </div>
          `);
        } catch (error) {
          console.error(`Failed to load spoofed balance for ${token.symbol}:`, error);
        }
      }

      tokensListSpoofed.innerHTML = spoofedTokenElements.join('');
    }
  } catch (error) {
    console.error('Failed to load tokens:', error);
  }
}

/**
 * Handle add token
 */
async function handleAddToken() {
  const address = (document.getElementById('token-address') as HTMLInputElement).value.trim();
  const symbol = (document.getElementById('token-symbol') as HTMLInputElement).value.trim();
  const name = (document.getElementById('token-name') as HTMLInputElement).value.trim();
  const decimals = (document.getElementById('token-decimals') as HTMLInputElement).value.trim();
  const errorEl = document.getElementById('add-token-error');
  const successEl = document.getElementById('add-token-success');

  // Validation
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    showElementError(errorEl, 'Valid token contract address is required');
    return;
  }

  if (!symbol) {
    showElementError(errorEl, 'Token symbol is required');
    return;
  }

  if (!name) {
    showElementError(errorEl, 'Token name is required');
    return;
  }

  if (!decimals || parseInt(decimals) < 0) {
    showElementError(errorEl, 'Valid decimals value is required');
    return;
  }

  try {
    hideElementError(errorEl);
    if (successEl) {
      successEl.classList.add('hidden');
    }

    const network = await sendMessage<any>('GET_CURRENT_NETWORK');
    if (!network) {
      showElementError(errorEl, 'No network selected');
      return;
    }

    const token = {
      address,
      symbol,
      name,
      decimals: parseInt(decimals),
      chainId: network.chainId
    };

    await sendMessage('ADD_TOKEN', { token });

    // Show success
    if (successEl) {
      successEl.textContent = 'Token added successfully!';
      successEl.classList.remove('hidden');
    }

    // Clear inputs
    (document.getElementById('token-address') as HTMLInputElement).value = '';
    (document.getElementById('token-symbol') as HTMLInputElement).value = '';
    (document.getElementById('token-name') as HTMLInputElement).value = '';
    (document.getElementById('token-decimals') as HTMLInputElement).value = '';

    // Go back to wallet after a delay
    setTimeout(async () => {
      await loadWalletData();
      showScreen('wallet-screen');
    }, 2000);

  } catch (error) {
    showElementError(errorEl, (error as Error).message);
  }
}

/**
 * Handle remove token
 */
async function handleRemoveToken(address: string, chainId: number) {
  try {
    const confirmed = confirm('Are you sure you want to remove this token?');
    if (!confirmed) return;

    await sendMessage('REMOVE_TOKEN', { address, chainId });
    await loadTokens();
  } catch (error) {
    showError((error as Error).message);
  }
}

// Make handleRemoveToken globally accessible
(window as any).handleRemoveToken = handleRemoveToken;

/**
 * Load spoof config
 */
async function loadSpoofConfig() {
  try {
    const config = await sendMessage<{ enabled: boolean; spoofedAddress: string }>('GET_ADDRESS_SPOOF_CONFIG');

    const enabledCheckbox = document.getElementById('spoof-enabled-checkbox') as HTMLInputElement;
    const addressInput = document.getElementById('spoof-address') as HTMLInputElement;
    const addressGroup = document.getElementById('spoof-address-group');
    const saveBtn = document.getElementById('save-spoof-btn');

    if (enabledCheckbox) {
      enabledCheckbox.checked = config.enabled;
    }

    if (addressInput) {
      addressInput.value = config.spoofedAddress || '';
    }

    // Always show address input and save button
    addressGroup?.style.setProperty('display', 'block');
    saveBtn?.style.setProperty('display', 'block');
  } catch (error) {
    console.error('Failed to load spoof config:', error);
  }
}

/**
 * Handle spoof enabled change
 */
function handleSpoofEnabledChange() {
  const enabledCheckbox = document.getElementById('spoof-enabled-checkbox') as HTMLInputElement;
  const addressGroup = document.getElementById('spoof-address-group');
  const saveBtn = document.getElementById('save-spoof-btn');

  // if (enabledCheckbox.checked) {
    addressGroup?.style.setProperty('display', 'block');
    saveBtn?.style.setProperty('display', 'block');
  // } else {
  //   addressGroup?.style.setProperty('display', 'none');
  //   saveBtn?.style.setProperty('display', 'block'); // Keep save button visible to save disabled state
  // }
}

/**
 * Handle save spoof config
 */
async function handleSaveSpoofConfig() {
  try {
    const enabledCheckbox = document.getElementById('spoof-enabled-checkbox') as HTMLInputElement;
    const addressInput = document.getElementById('spoof-address') as HTMLInputElement;

    const config = {
      enabled: enabledCheckbox.checked,
      spoofedAddress: addressInput.value.trim()
    };

    // Validate address if enabled
    if (config.enabled && !config.spoofedAddress) {
      alert('Please enter a spoofed address');
      return;
    }

    if (config.enabled && !config.spoofedAddress.startsWith('0x')) {
      alert('Address must start with 0x');
      return;
    }

    await sendMessage('SET_ADDRESS_SPOOF_CONFIG', config);

    // Show success message
    const saveBtn = document.getElementById('save-spoof-btn') as HTMLButtonElement;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✓ Saved!';
    saveBtn.style.background = '#28a745';

    setTimeout(() => {
      saveBtn.textContent = originalText || 'Save Spoofing Config';
      saveBtn.style.background = '';
    }, 2000);

    console.log('Spoof config saved:', config);
  } catch (error) {
    alert('Failed to save: ' + (error as Error).message);
  }
}

/**
 * Load DeFi Interactor configurations
 */
async function loadDeFiConfigs() {
  try {
    // Update current network info
    const currentNetwork = await sendMessage<any>('GET_CURRENT_NETWORK');
    const networkNameEl = document.getElementById('defi-current-network');
    const chainIdEl = document.getElementById('defi-current-chain-id');

    if (networkNameEl && currentNetwork) {
      networkNameEl.textContent = currentNetwork.name;
    }
    if (chainIdEl && currentNetwork) {
      chainIdEl.textContent = currentNetwork.chainId.toString();
    }

    const configs = await sendMessage<Array<{ moduleAddress: string; chainId: number; enabled: boolean }>>('GET_DEFI_INTERACTOR_CONFIGS');
    const configList = document.getElementById('defi-config-list');

    if (!configList) return;

    if (!configs || configs.length === 0) {
      configList.innerHTML = '<div style="text-align: center; padding: 15px; color: #888; font-size: 13px;">No configurations yet. Add one below.</div>';
      return;
    }

    const configElements = configs.map(config => {
      const shortAddress = `${config.moduleAddress.slice(0, 6)}...${config.moduleAddress.slice(-4)}`;
      const statusColor = config.enabled ? '#28a745' : '#888';
      const statusText = config.enabled ? 'ENABLED' : 'DISABLED';

      return `
        <div style="background: #f7f7f7; border: 2px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 3px;">Chain ID: ${config.chainId}</div>
              <div style="font-size: 11px; color: #888; font-family: 'Courier New', monospace;">${shortAddress}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">${statusText}</div>
              <button onclick="handleRemoveDeFiConfig(${config.chainId})" style="background: #dc3545; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    configList.innerHTML = configElements;
  } catch (error) {
    console.error('Failed to load DeFi configs:', error);
  }
}

/**
 * Handle save DeFi Interactor config
 */
async function handleSaveDeFiConfig() {
  try {
    const moduleAddress = (document.getElementById('defi-module-address') as HTMLInputElement).value.trim();
    const enabled = (document.getElementById('defi-enabled-checkbox') as HTMLInputElement).checked;

    // Validation
    if (!moduleAddress || !moduleAddress.startsWith('0x') || moduleAddress.length !== 42) {
      alert('Please enter a valid module contract address (0x...)');
      return;
    }

    // Get chain ID from current network
    const currentNetwork = await sendMessage<any>('GET_CURRENT_NETWORK');
    if (!currentNetwork || !currentNetwork.chainId) {
      alert('Could not determine current network. Please select a network first.');
      return;
    }

    const chainId = currentNetwork.chainId;

    const config = {
      moduleAddress,
      chainId,
      enabled
    };

    await sendMessage('SET_DEFI_INTERACTOR_CONFIG', { config });

    // Show success
    const saveBtn = document.getElementById('save-defi-config-btn') as HTMLButtonElement;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✓ Saved!';
    saveBtn.style.background = '#28a745';

    setTimeout(() => {
      saveBtn.textContent = originalText || 'Add/Update Configuration';
      saveBtn.style.background = '';
    }, 2000);

    // Clear inputs
    (document.getElementById('defi-module-address') as HTMLInputElement).value = '';
    (document.getElementById('defi-enabled-checkbox') as HTMLInputElement).checked = true;

    // Reload configs
    await loadDeFiConfigs();

    console.log('DeFi config saved:', config);
  } catch (error) {
    alert('Failed to save: ' + (error as Error).message);
  }
}

/**
 * Handle remove DeFi Interactor config
 */
async function handleRemoveDeFiConfig(chainId: number) {
  try {
    const confirmed = confirm(`Remove DeFi Interactor Module configuration for chain ${chainId}?`);
    if (!confirmed) return;

    await sendMessage('REMOVE_DEFI_INTERACTOR_CONFIG', { chainId });
    await loadDeFiConfigs();
  } catch (error) {
    alert('Failed to remove: ' + (error as Error).message);
  }
}

// Make handleRemoveDeFiConfig globally accessible
(window as any).handleRemoveDeFiConfig = handleRemoveDeFiConfig;

/**
 * Ledger state
 */
let ledgerAccounts: any[] = [];
let selectedLedgerAccounts: Set<number> = new Set();

/**
 * Handle Ledger device connection
 */
async function handleLedgerConnect() {
  try {
    // Show status
    const statusDiv = document.getElementById('ledger-status');
    const statusText = document.getElementById('ledger-status-text');
    const errorDiv = document.getElementById('ledger-error');
    const connectBtn = document.getElementById('ledger-connect-btn') as HTMLButtonElement;

    if (!statusDiv || !statusText || !errorDiv) return;

    errorDiv.classList.add('hidden');
    statusDiv.style.display = 'block';
    connectBtn.disabled = true;
    statusText.textContent = 'Requesting device permission...';

    // Check if WebHID is supported
    const supported = await sendMessage<{ supported: boolean }>('LEDGER_CHECK_SUPPORT');
    if (!supported.supported) {
      throw new Error('Ledger is not supported in this browser. Please use Chrome or Edge.');
    }

    // Request device
    statusText.textContent = 'Please select your Ledger device...';
    const deviceGranted = await sendMessage<boolean>('LEDGER_REQUEST_DEVICE');

    if (!deviceGranted) {
      throw new Error('Device permission denied. Please try again and select your Ledger device.');
    }

    // Derive addresses
    statusText.textContent = 'Reading addresses from device...\nPlease confirm on your Ledger if prompted.';
    const accounts = await sendMessage<any[]>('LEDGER_DERIVE_ADDRESSES', {
      basePath: "m/44'/60'/0'/0",
      count: 5
    });

    ledgerAccounts = accounts.map((acc, index) => ({
      ...acc,
      index,
      publicKey: '',
      signerType: 'ledger'
    }));

    // Show accounts
    displayLedgerAccounts();
    statusDiv.style.display = 'none';
    document.getElementById('ledger-accounts')!.style.display = 'block';
    document.getElementById('ledger-password-group')!.style.display = 'block';
    document.getElementById('ledger-submit-btn')!.style.display = 'block';
    connectBtn.style.display = 'none';

  } catch (error) {
    const errorDiv = document.getElementById('ledger-error');
    const statusDiv = document.getElementById('ledger-status');
    const connectBtn = document.getElementById('ledger-connect-btn') as HTMLButtonElement;

    if (errorDiv) {
      errorDiv.textContent = (error as Error).message;
      errorDiv.classList.remove('hidden');
    }

    if (statusDiv) {
      statusDiv.style.display = 'none';
    }

    connectBtn.disabled = false;
    console.error('Ledger connection failed:', error);
  }
}

/**
 * Display Ledger accounts for selection
 */
function displayLedgerAccounts() {
  const accountsList = document.getElementById('ledger-accounts-list');
  if (!accountsList) return;

  accountsList.innerHTML = '';

  ledgerAccounts.forEach((account, index) => {
    const accountDiv = document.createElement('div');
    accountDiv.style.cssText = 'background: #f7f7f7; border-radius: 8px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; cursor: pointer;';
    accountDiv.innerHTML = `
      <input type="checkbox" id="ledger-account-${index}" value="${index}" style="margin-right: 12px; cursor: pointer;">
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">Account ${index + 1}</div>
        <div style="font-size: 12px; color: #888; font-family: monospace;">${account.address}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${account.path}</div>
      </div>
    `;

    const checkbox = accountDiv.querySelector('input[type="checkbox"]') as HTMLInputElement;

    // Select first account by default
    if (index === 0) {
      checkbox.checked = true;
      selectedLedgerAccounts.add(index);
    }

    accountDiv.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });

    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        selectedLedgerAccounts.add(index);
      } else {
        selectedLedgerAccounts.delete(index);
      }
    });

    accountsList.appendChild(accountDiv);
  });
}

/**
 * Handle Ledger wallet creation
 */
async function handleLedgerSubmit() {
  try {
    const errorDiv = document.getElementById('ledger-error');
    const passwordInput = document.getElementById('ledger-password') as HTMLInputElement;

    if (!errorDiv || !passwordInput) return;

    errorDiv.classList.add('hidden');

    // Validate
    if (selectedLedgerAccounts.size === 0) {
      throw new Error('Please select at least one account');
    }

    const password = passwordInput.value.trim();
    if (!password) {
      throw new Error('Please enter a password');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Get selected accounts
    const accounts = Array.from(selectedLedgerAccounts)
      .map(index => ledgerAccounts[index])
      .sort((a, b) => a.index - b.index);

    // Create Ledger wallet
    const submitBtn = document.getElementById('ledger-submit-btn') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting up...';

    await sendMessage('CREATE_LEDGER_WALLET', {
      password,
      accounts
    });

    // Load wallet data and show wallet screen
    await loadWalletData();
    showScreen('wallet-screen');

    // Reset
    selectedLedgerAccounts.clear();
    ledgerAccounts = [];

  } catch (error) {
    const errorDiv = document.getElementById('ledger-error');
    if (errorDiv) {
      errorDiv.textContent = (error as Error).message;
      errorDiv.classList.remove('hidden');
    }

    const submitBtn = document.getElementById('ledger-submit-btn') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Complete Setup';
    }

    console.error('Ledger wallet creation failed:', error);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initialize);
