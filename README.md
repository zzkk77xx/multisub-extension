# Crypto Wallet Extension

A secure, multi-chain cryptocurrency wallet Chrome extension built with TypeScript and modern web technologies.

## Features

- **BIP39 Mnemonic Generation**: Generate secure 12-word recovery phrases
- **BIP44 HD Wallet**: Hierarchical Deterministic wallet with multiple account support
- **Multi-Chain Support**: Ethereum, Polygon, BNB Chain, Arbitrum, and custom networks
- **EIP-1193 Provider**: Full Web3 provider injection for DApp compatibility
- **Secure Storage**: AES-GCM encryption with PBKDF2 key derivation
- **Chrome Extension Manifest V3**: Built with the latest Chrome extension standards

## Security Features

- Password-protected wallet with PBKDF2 (100,000 iterations)
- AES-GCM encryption for sensitive data
- Encrypted mnemonic storage
- Session-based unlocking
- Never exposes private keys to web pages

## Standards Compliance

- **BIP39**: Mnemonic code for generating deterministic keys
- **BIP44**: Multi-account hierarchy for deterministic wallets
  - Default path: `m/44'/60'/0'/0/{index}` for Ethereum
  - Customizable coin types for other chains
- **EIP-1193**: Ethereum Provider JavaScript API
- **Chrome Manifest V3**: Latest extension platform

## Installation

### Development

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build
```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development Mode (with hot reload)

```bash
npm run dev
```

This will watch for file changes and rebuild automatically.

## Project Structure

```
crypto-wallet-extension/
├── src/
│   ├── core/
│   │   ├── wallet.ts          # BIP39/BIP44 wallet implementation
│   │   └── crypto.ts          # Encryption utilities
│   ├── services/
│   │   └── storage.ts         # Chrome storage service
│   ├── background/
│   │   └── background.ts      # Service worker
│   ├── content/
│   │   ├── content.ts         # Content script
│   │   └── inject.ts          # EIP-1193 provider
│   └── popup/
│       ├── popup.html         # Popup UI
│       └── popup.ts           # Popup logic
├── public/
│   └── manifest.json          # Extension manifest
└── webpack.config.js          # Build configuration
```

## Usage

### Creating a Wallet

1. Click the extension icon
2. Click "Create New Wallet"
3. Enter a strong password
4. Save your 12-word recovery phrase securely
5. Your wallet is ready!

### Importing a Wallet

1. Click "Import Existing Wallet"
2. Enter your 12 or 24-word recovery phrase
3. Create a password
4. Your wallet is restored

### Resetting the Wallet

If you need to start fresh or fix issues:

1. Open the extension
2. Go to the "Settings" tab
3. Scroll to the "Danger Zone"
4. Click "Reset Wallet"
5. Confirm twice (this is irreversible!)
6. Create a new wallet or import an existing one

**⚠️ Important**: Save your recovery phrase before resetting! This action deletes all wallet data permanently.

See `RESET_WALLET_GUIDE.md` for detailed instructions.

### Using with DApps

The wallet automatically injects a Web3 provider into web pages, making it compatible with:
- Uniswap
- OpenSea
- Aave
- And any other DApp that supports EIP-1193

### Supported Networks

Default networks:
- Ethereum Mainnet
- Polygon
- BNB Smart Chain
- Arbitrum One

You can add custom networks through the wallet interface.

## API Reference

### Background Messages

The extension supports the following message types:

- `CREATE_WALLET`: Create a new wallet
- `UNLOCK_WALLET`: Unlock with password
- `LOCK_WALLET`: Lock the wallet
- `GET_WALLET_STATUS`: Get wallet state
- `ADD_ACCOUNT`: Derive a new account
- `GET_ACCOUNTS`: Get all accounts
- `GET_BALANCE`: Get address balance
- `SIGN_MESSAGE`: Sign a message
- `SEND_TRANSACTION`: Sign and broadcast transaction

### EIP-1193 Provider Methods

The injected `window.ethereum` provider supports:

- `eth_requestAccounts`: Request account access
- `eth_accounts`: Get connected accounts
- `eth_chainId`: Get current chain ID
- `personal_sign`: Sign a message
- `eth_sendTransaction`: Send a transaction
- `wallet_switchEthereumChain`: Switch networks
- `wallet_addEthereumChain`: Add custom network

## Security Considerations

### For Users

- Never share your recovery phrase with anyone
- Use a strong, unique password
- Keep your recovery phrase backed up securely
- This is a demonstration wallet - use at your own risk for production

### For Developers

- Private keys never leave the extension context
- All sensitive data is encrypted at rest
- Session keys are stored in memory only
- Web Crypto API used for all cryptographic operations
- Content Security Policy enforced

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Code Structure

The wallet is built with a clean architecture:

1. **Core Layer**: Pure wallet logic (BIP39/BIP44)
2. **Service Layer**: Chrome storage and encryption
3. **Background Layer**: Message handling and coordination
4. **UI Layer**: Popup interface

## BIP44 Derivation Paths

Default paths for supported chains:

- Ethereum: `m/44'/60'/0'/0/{index}`
- Polygon: `m/44'/60'/0'/0/{index}` (same as Ethereum)
- BNB Chain: `m/44'/60'/0'/0/{index}` (EVM compatible)
- Custom chains: Configurable coin type

## Contributing

This is a demonstration project. For production use, additional features needed:

- Transaction history
- Token support (ERC-20, ERC-721)
- Gas estimation
- Address book
- Multiple language support
- Hardware wallet integration
- Recovery phrase verification
- Phishing protection
- Permission management for DApps

## License

MIT

## Disclaimer

This wallet is provided as-is for educational and development purposes. Use at your own risk. Always verify transactions before signing. Never store large amounts of cryptocurrency in a browser extension wallet.
