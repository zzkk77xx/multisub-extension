/**
 * Content script - bridges communication between inject script and background
 * Runs in an isolated world with access to chrome APIs
 */

console.log('[Crypto Wallet] Content script starting...');

// Inject the provider script into the page ASAP
function injectProvider() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      console.log('[Crypto Wallet] Provider script loaded');
      script.remove();
    };
    script.onerror = function(error) {
      console.error('[Crypto Wallet] Failed to load provider script:', error);
    };

    const target = document.head || document.documentElement;
    if (target) {
      target.insertBefore(script, target.firstChild);
    } else {
      console.error('[Crypto Wallet] No injection target found');
    }
  } catch (error) {
    console.error('[Crypto Wallet] Injection error:', error);
  }
}

// Inject immediately
injectProvider();

/**
 * Listen for messages from the injected script
 */
window.addEventListener('message', async (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;

  // Only process our provider messages
  if (event.data?.type?.startsWith('CRYPTO_WALLET_')) {
    const { type, payload, id } = event.data;

    try {
      // Forward to background script
      const response = await chrome.runtime.sendMessage({
        type: type.replace('CRYPTO_WALLET_', ''),
        payload
      });

      // Send response back to page
      window.postMessage({
        type: 'CRYPTO_WALLET_RESPONSE',
        id,
        response
      }, '*');
    } catch (error) {
      // Send error back to page
      window.postMessage({
        type: 'CRYPTO_WALLET_RESPONSE',
        id,
        response: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }, '*');
    }
  }
});

console.log('Crypto Wallet content script loaded');
