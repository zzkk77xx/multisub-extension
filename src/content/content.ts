/**
 * Content script - bridges communication between inject script and background
 * Runs in an isolated world with access to chrome APIs
 */

// Inject the provider script into the page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  // Clean up after injection
  script.remove();
};
(document.head || document.documentElement).appendChild(script);

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
