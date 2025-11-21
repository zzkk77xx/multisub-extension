# Quick Start Guide

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This will create a `dist` folder with the compiled extension.

### 3. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `dist` folder from this project

### 4. Start Using

1. Click the extension icon in your Chrome toolbar
2. Create a new wallet or import an existing one
3. Start using Web3 DApps!

## Development Mode

For active development with auto-rebuild:

```bash
npm run dev
```

This will watch for file changes and rebuild automatically. You'll need to:
1. Refresh the extension in `chrome://extensions/`
2. Reload any open tabs where you're testing

## Testing with a DApp

### Simple Test Page

Create a test HTML file:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Web3 Test</title>
</head>
<body>
  <h1>Crypto Wallet Test</h1>
  <button id="connect">Connect Wallet</button>
  <button id="sign">Sign Message</button>
  <div id="output"></div>

  <script>
    const output = document.getElementById('output');

    document.getElementById('connect').onclick = async () => {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        output.innerHTML = `Connected: ${accounts[0]}`;
      } catch (error) {
        output.innerHTML = `Error: ${error.message}`;
      }
    };

    document.getElementById('sign').onclick = async () => {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts'
        });
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: ['Hello Web3!', accounts[0]]
        });
        output.innerHTML = `Signature: ${signature}`;
      } catch (error) {
        output.innerHTML = `Error: ${error.message}`;
      }
    };
  </script>
</body>
</html>
```

Open this file in Chrome and test the wallet functionality!

## Common Issues

### Icons Not Showing

The extension needs icon files. See `public/icons/README.md` for how to create them.

### Build Errors

Make sure you have Node.js 16+ installed:
```bash
node --version
```

### Extension Not Loading

Check the Chrome developer console for errors:
1. Go to `chrome://extensions/`
2. Click "Errors" under your extension
3. Look for error messages

## Next Steps

- Test with real DApps like Uniswap or OpenSea
- Add custom networks in the wallet settings
- Explore the code in `src/` to customize functionality
- Read the full README.md for API documentation

## Security Reminder

This is a demonstration wallet. For production use:
- Always verify all code you run
- Never store large amounts of crypto in a browser extension
- Use hardware wallets for significant holdings
- Keep your recovery phrase secure and offline
