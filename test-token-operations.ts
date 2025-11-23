/**
 * Test script for token approve and transfer operations
 *
 * This script tests:
 * 1. Direct ERC20 token approve
 * 2. Direct ERC20 token transfer
 * 3. DeFi Interactor Module wrapped transfer
 *
 * Usage:
 *   npx ts-node test-token-operations.ts
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

// Configuration
const CONFIG = {
  // Network RPC (change to your network)
  rpcUrl: process.env.RPC_URL || "https://rpc.sepolia.org",
  chainId: 11155111, // Sepolia

  // Your wallet private key (DO NOT COMMIT THIS!)
  // For testing, you can use a test wallet with small amounts
  privateKey: process.env.PRIVATE_KEY || "",

  // Token to test with (example: a test ERC20 on Sepolia)
  tokenAddress: process.env.TOKEN_ADDRESS || "",

  // Recipient address for transfer test
  recipientAddress: process.env.RECIPIENT_ADDRESS || "",

  // Spender address for approve test (can be any address)
  spenderAddress: process.env.SPENDER_ADDRESS || "",

  // Safe wallet address (holds the tokens for module transfer)
  safeAddress: process.env.SAFE_ADDRESS || "",

  // DeFi Interactor Module address (optional, for module tests)
  defiModuleAddress: process.env.DEFI_MODULE_ADDRESS || "",

  // Aave V3 Pool address (Sepolia)
  aavePoolAddress:
    process.env.AAVE_POOL_ADDRESS ||
    "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",

  // aToken address (optional, will be fetched if not provided)
  aTokenAddress: process.env.ATOKEN_ADDRESS || "",

  decimals: 8,

  // Amount to approve/transfer (in smallest unit, e.g., wei)
  amount: "1000000", // 0.01 token with 8 decimals
};

// ERC20 ABI
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// DeFi Interactor Module ABI
const DEFI_MODULE_ABI = [
  "function transferToken(address token, address recipient, uint256 amount) external returns (bool success)",
  "function approveProtocol(address token, address target, uint256 amount) external",
  "function executeOnProtocol(address target, bytes calldata data) external returns (bytes memory result)",
  "function hasRole(address member, uint16 roleId) view returns (bool)",
  "function allowedAddresses(address subAccount, address target) view returns (bool)",
  "function DEFI_TRANSFER_ROLE() view returns (uint16)",
  "function DEFI_EXECUTE_ROLE() view returns (uint16)",
];

// Aave V3 Pool ABI (Sepolia)
const AAVE_POOL_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
];

/**
 * Validate configuration
 */
function validateConfig(): boolean {
  const errors: string[] = [];

  if (!CONFIG.privateKey) {
    errors.push("PRIVATE_KEY environment variable not set");
  }
  if (!CONFIG.tokenAddress) {
    errors.push("TOKEN_ADDRESS environment variable not set");
  }
  if (!CONFIG.recipientAddress) {
    errors.push("RECIPIENT_ADDRESS environment variable not set");
  }
  if (!CONFIG.spenderAddress) {
    errors.push("SPENDER_ADDRESS environment variable not set");
  }

  if (errors.length > 0) {
    console.error("❌ Configuration errors:");
    errors.forEach((err) => console.error(`   - ${err}`));
    console.error("\nSet environment variables like:");
    console.error('  export PRIVATE_KEY="0x..."');
    console.error('  export TOKEN_ADDRESS="0x..."');
    console.error('  export RECIPIENT_ADDRESS="0x..."');
    console.error('  export SPENDER_ADDRESS="0x..."');
    console.error('  export DEFI_MODULE_ADDRESS="0x..." # optional');
    return false;
  }

  return true;
}

/**
 * Get token information
 */
async function getTokenInfo(
  token: ethers.Contract
): Promise<{ name: string; symbol: string; decimals: number }> {
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);

  return { name, symbol, decimals };
}

/**
 * Test 1: Direct token approve
 */
async function testApprove(
  token: ethers.Contract,
  wallet: ethers.Wallet,
  spender: string,
  amount: string
): Promise<boolean> {
  console.log("\n📝 Test 1: Direct Token Approve");
  console.log("=".repeat(50));

  try {
    // Check current allowance
    const signerAddress = wallet.address;
    const currentAllowance = await token.allowance(signerAddress, spender);
    console.log(
      `Current allowance: ${ethers.formatUnits(
        currentAllowance,
        await token.decimals()
      )}`
    );

    // Approve
    console.log(
      `Approving ${ethers.formatUnits(
        amount,
        await token.decimals()
      )} tokens to ${spender}...`
    );
    const tx = await token.approve(spender, amount);
    console.log(`Transaction hash: ${tx.hash}`);

    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`✅ Approved! Gas used: ${receipt.gasUsed.toString()}`);

    // Verify new allowance
    const newAllowance = await token.allowance(signerAddress, spender);
    console.log(
      `New allowance: ${ethers.formatUnits(
        newAllowance,
        await token.decimals()
      )}`
    );

    return true;
  } catch (error) {
    console.error("❌ Approve failed:", (error as Error).message);
    return false;
  }
}

/**
 * Test 2: Direct token transfer
 */
async function testTransfer(
  token: ethers.Contract,
  wallet: ethers.Wallet,
  recipient: string,
  amount: string
): Promise<boolean> {
  console.log("\n💸 Test 2: Direct Token Transfer");
  console.log("=".repeat(50));

  try {
    // Check balances before
    const signerAddress = wallet.address;
    const balanceBefore = await token.balanceOf(signerAddress);
    const recipientBalanceBefore = await token.balanceOf(recipient);

    console.log(
      `Your balance: ${ethers.formatUnits(
        balanceBefore,
        await token.decimals()
      )}`
    );
    console.log(
      `Recipient balance: ${ethers.formatUnits(
        recipientBalanceBefore,
        await token.decimals()
      )}`
    );

    // Transfer
    console.log(
      `\nTransferring ${ethers.formatUnits(
        amount,
        await token.decimals()
      )} tokens to ${recipient}...`
    );
    const tx = await token.transfer(recipient, amount);
    console.log(`Transaction hash: ${tx.hash}`);
    console.log(`Transaction data: ${tx.data}`);

    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`✅ Transferred! Gas used: ${receipt.gasUsed.toString()}`);

    // Check balances after
    const balanceAfter = await token.balanceOf(signerAddress);
    const recipientBalanceAfter = await token.balanceOf(recipient);

    console.log(
      `\nYour new balance: ${ethers.formatUnits(
        balanceAfter,
        await token.decimals()
      )}`
    );
    console.log(
      `Recipient new balance: ${ethers.formatUnits(
        recipientBalanceAfter,
        await token.decimals()
      )}`
    );

    return true;
  } catch (error) {
    console.error("❌ Transfer failed:", (error as Error).message);
    return false;
  }
}

/**
 * Test 3: DeFi Interactor Module transfer (from Safe wallet)
 */
async function testModuleTransfer(
  provider: ethers.Provider,
  wallet: ethers.Wallet,
  tokenAddress: string,
  moduleAddress: string,
  safeAddress: string,
  recipient: string,
  amount: string
): Promise<boolean> {
  console.log("\n🔒 Test 3: DeFi Interactor Module Transfer (from Safe)");
  console.log("=".repeat(50));

  if (!moduleAddress) {
    console.log("⏭️  Skipped (DEFI_MODULE_ADDRESS not set)");
    return false;
  }

  if (!safeAddress) {
    console.log("⏭️  Skipped (SAFE_ADDRESS not set)");
    return false;
  }

  try {
    const module = new ethers.Contract(moduleAddress, DEFI_MODULE_ABI, wallet);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    // Check if wallet has DEFI_TRANSFER_ROLE
    console.log("Checking permissions...");
    const TRANSFER_ROLE = 2; // DEFI_TRANSFER_ROLE constant
    const hasRole = await module.hasRole(wallet.address, TRANSFER_ROLE);

    if (!hasRole) {
      console.log(
        `❌ Wallet ${wallet.address} does not have DEFI_TRANSFER_ROLE`
      );
      console.log("   Ask the Safe owner to grant the role using:");
      console.log(`   module.grantRole("${wallet.address}", ${TRANSFER_ROLE})`);
      return false;
    }
    console.log("✅ Has DEFI_TRANSFER_ROLE");

    // Check balances before (Safe wallet and recipient)
    const safeBalanceBefore = await token.balanceOf(safeAddress);
    const recipientBalanceBefore = await token.balanceOf(recipient);
    const decimals = await token.decimals();

    console.log("\nBalances before transfer:");
    console.log(
      `Safe wallet (${safeAddress}): ${ethers.formatUnits(
        safeBalanceBefore,
        decimals
      )}`
    );
    console.log(
      `Recipient (${recipient}): ${ethers.formatUnits(
        recipientBalanceBefore,
        decimals
      )}`
    );

    if (safeBalanceBefore === BigInt(0)) {
      console.log("\n⚠️  WARNING: Safe wallet has 0 tokens!");
      console.log(
        "   The Safe needs to have tokens for the module to transfer them."
      );
      console.log("   Transfer some tokens to the Safe first.");
      return false;
    }

    // Transfer through module
    console.log(
      `\nTransferring ${ethers.formatUnits(
        amount,
        decimals
      )} tokens via module...`
    );
    console.log(`From: Safe wallet (${safeAddress})`);
    console.log(`To: ${recipient}`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`Amount: ${amount}`);

    const tx = await module.transferToken(tokenAddress, recipient, amount);
    console.log(`\nTransaction hash: ${tx.hash}`);
    console.log(
      `Transaction from: ${wallet.address} (your wallet calling the module)`
    );

    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(
      `✅ Transferred via module! Gas used: ${receipt.gasUsed.toString()}`
    );

    // Check balances after
    const safeBalanceAfter = await token.balanceOf(safeAddress);
    const recipientBalanceAfter = await token.balanceOf(recipient);

    console.log("\nBalances after transfer:");
    console.log(
      `Safe wallet: ${ethers.formatUnits(safeBalanceAfter, decimals)}`
    );
    console.log(
      `Recipient: ${ethers.formatUnits(recipientBalanceAfter, decimals)}`
    );

    // Verify the transfer worked correctly
    const safeChange = safeBalanceBefore - safeBalanceAfter;
    const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
    const expectedAmount = BigInt(amount);

    console.log("\nChanges:");
    console.log(`Safe: -${ethers.formatUnits(safeChange, decimals)}`);
    console.log(`Recipient: +${ethers.formatUnits(recipientChange, decimals)}`);

    // Compare as strings to avoid type issues
    if (
      safeChange.toString() === expectedAmount.toString() &&
      recipientChange.toString() === expectedAmount.toString()
    ) {
      console.log("✅ Transfer amounts verified!");
    }

    return true;
  } catch (error) {
    console.error("❌ Module transfer failed:", (error as Error).message);
    if ((error as any).data) {
      console.error("Error data:", (error as any).data);
    }
    return false;
  }
}

/**
 * Helper: Check current Aave allowance
 */
async function checkAaveAllowance(
  provider: ethers.Provider,
  tokenAddress: string,
  safeAddress: string,
  aavePoolAddress: string
): Promise<void> {
  console.log("\n🔍 Checking Aave Pool Allowance");
  console.log("=".repeat(50));

  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await token.decimals();
    const symbol = await token.symbol();

    const allowance = await token.allowance(safeAddress, aavePoolAddress);

    console.log(`Token: ${symbol} (${tokenAddress})`);
    console.log(`Safe: ${safeAddress}`);
    console.log(`Spender (Aave Pool): ${aavePoolAddress}`);
    console.log(
      `\nCurrent Allowance: ${ethers.formatUnits(
        allowance,
        decimals
      )} ${symbol}`
    );

    if (allowance === 0n) {
      console.log("ℹ️  No approval set. Pool cannot spend Safe's tokens.");
    } else {
      console.log(
        `✅ Pool can spend up to ${ethers.formatUnits(
          allowance,
          decimals
        )} ${symbol}`
      );
    }
  } catch (error) {
    console.error("❌ Failed to check allowance:", (error as Error).message);
  }
}

/**
 * Test 4: Aave V3 Supply through DeFi Interactor Module
 */
async function testAaveSupply(
  provider: ethers.Provider,
  wallet: ethers.Wallet,
  tokenAddress: string,
  moduleAddress: string,
  safeAddress: string,
  aavePoolAddress: string,
  amount: string
): Promise<boolean> {
  console.log("\n💰 Test 4: Aave V3 Supply (from Safe via Module)");
  console.log("=".repeat(50));

  if (!moduleAddress) {
    console.log("⏭️  Skipped (DEFI_MODULE_ADDRESS not set)");
    return false;
  }

  if (!safeAddress) {
    console.log("⏭️  Skipped (SAFE_ADDRESS not set)");
    return false;
  }

  try {
    const module = new ethers.Contract(moduleAddress, DEFI_MODULE_ABI, wallet);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const aavePool = new ethers.Contract(
      aavePoolAddress,
      AAVE_POOL_ABI,
      provider
    );

    // Check if wallet has required roles
    console.log("Checking permissions...");
    const TRANSFER_ROLE = 2;
    const EXECUTE_ROLE = 1;

    const hasTransferRole = await module.hasRole(wallet.address, TRANSFER_ROLE);
    const hasExecuteRole = await module.hasRole(wallet.address, EXECUTE_ROLE);

    console.log(`  DEFI_TRANSFER_ROLE (2): ${hasTransferRole ? "✅" : "❌"}`);
    console.log(`  DEFI_EXECUTE_ROLE (1):  ${hasExecuteRole ? "✅" : "❌"}`);

    if (!hasExecuteRole) {
      console.log(
        `\n❌ Wallet ${wallet.address} does not have DEFI_EXECUTE_ROLE (role 1)`
      );
      console.log(
        "   The approveProtocol() function requires DEFI_EXECUTE_ROLE."
      );
      console.log("   Ask the Safe owner to grant it:");
      console.log(`   module.grantRole("${wallet.address}", 1)`);
      return false;
    }

    // Check if Aave pool is whitelisted
    const isAaveAllowed = await module.allowedAddresses(
      wallet.address,
      aavePoolAddress
    );
    console.log(`  Aave Pool whitelisted:   ${isAaveAllowed ? "✅" : "❌"}`);

    if (!isAaveAllowed) {
      console.log(`\n❌ Aave Pool is not whitelisted for ${wallet.address}`);
      console.log("   Ask the Safe owner to whitelist it:");
      console.log(
        `   module.setAllowedAddress("${wallet.address}", "${aavePoolAddress}", true)`
      );
      return false;
    }

    console.log("✅ All permissions verified!");

    // Check Safe's token balance
    const safeBalanceBefore = await token.balanceOf(safeAddress);
    const decimals = await token.decimals();

    console.log(
      `\nSafe token balance: ${ethers.formatUnits(safeBalanceBefore, decimals)}`
    );

    if (safeBalanceBefore === BigInt(0)) {
      console.log("⚠️  WARNING: Safe wallet has 0 tokens!");
      return false;
    }

    // Check current allowance for Aave pool
    const currentAllowance = await token.allowance(
      safeAddress,
      aavePoolAddress
    );
    console.log(
      `Current Aave Pool allowance: ${ethers.formatUnits(
        currentAllowance,
        decimals
      )}`
    );
    if (currentAllowance > 0n) {
      console.log(
        `  ℹ️  Pool already has approval for ${ethers.formatUnits(
          currentAllowance,
          decimals
        )} tokens`
      );
    }

    // Get Safe's position on Aave before
    const accountDataBefore = await aavePool.getUserAccountData(safeAddress);
    console.log(`\nAave position before:`);
    console.log(
      `  Total Collateral: ${ethers.formatUnits(
        accountDataBefore.totalCollateralBase,
        8
      )} USD`
    );
    console.log(
      `  Total Debt: ${ethers.formatUnits(
        accountDataBefore.totalDebtBase,
        8
      )} USD`
    );

    // Step 1: Approve Aave pool to spend tokens via module
    console.log(`\nStep 1: Approving Aave pool to spend tokens...`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Spender (Aave Pool): ${aavePoolAddress}`);
    console.log(`  Amount: ${ethers.formatUnits(amount, decimals)}`);

    const approveTx = await module.approveProtocol(
      tokenAddress,
      aavePoolAddress,
      amount
    );
    console.log(`  Approval TX: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`  ✅ Approved!`);

    // Step 2: Supply to Aave via executeOnProtocol
    console.log(`\nStep 2: Supplying to Aave...`);
    console.log(`  Amount: ${ethers.formatUnits(amount, decimals)}`);
    console.log(`  On behalf of: ${safeAddress} (Safe)`);

    // Encode the supply call
    const supplyData = aavePool.interface.encodeFunctionData("supply", [
      tokenAddress, // asset
      amount, // amount
      safeAddress, // onBehalfOf (Safe wallet)
      0, // referralCode
    ]);

    console.log(tokenAddress, amount, safeAddress);
    console.log(`  Encoded data: ${supplyData}`);

    const supplyTx = await module.executeOnProtocol(
      aavePoolAddress,
      supplyData
    );
    console.log(`  Supply TX: ${supplyTx.hash}`);

    console.log("  Waiting for confirmation...");
    const receipt = await supplyTx.wait();
    console.log(`  ✅ Supplied! Gas used: ${receipt.gasUsed.toString()}`);

    // Check Safe's position on Aave after
    const accountDataAfter = await aavePool.getUserAccountData(safeAddress);
    console.log(`\nAave position after:`);
    console.log(
      `  Total Collateral: ${ethers.formatUnits(
        accountDataAfter.totalCollateralBase,
        8
      )} USD`
    );
    console.log(
      `  Total Debt: ${ethers.formatUnits(
        accountDataAfter.totalDebtBase,
        8
      )} USD`
    );

    const collateralChange =
      accountDataAfter.totalCollateralBase -
      accountDataBefore.totalCollateralBase;
    console.log(
      `  Collateral change: +${ethers.formatUnits(collateralChange, 8)} USD`
    );

    // Check Safe's token balance after
    const safeBalanceAfter = await token.balanceOf(safeAddress);
    const tokenChange = safeBalanceBefore - safeBalanceAfter;

    console.log(`\nToken balance change:`);
    console.log(`  Before: ${ethers.formatUnits(safeBalanceBefore, decimals)}`);
    console.log(`  After: ${ethers.formatUnits(safeBalanceAfter, decimals)}`);
    console.log(`  Supplied: ${ethers.formatUnits(tokenChange, decimals)}`);

    if (tokenChange.toString() === amount) {
      console.log("✅ Supply amounts verified!");
    }

    // Check remaining allowance for Aave pool
    const remainingAllowance = await token.allowance(
      safeAddress,
      aavePoolAddress
    );
    console.log(
      `\nRemaining allowance for Aave Pool: ${ethers.formatUnits(
        remainingAllowance,
        decimals
      )}`
    );

    return true;
  } catch (error) {
    console.error("❌ Aave supply failed:", (error as Error).message);
    if ((error as any).data) {
      console.error("Error data:", (error as any).data);
    }
    if ((error as any).reason) {
      console.error("Reason:", (error as any).reason);
    }
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log("🧪 Token Operations Test Suite");
  console.log("=".repeat(50));

  // Validate configuration
  if (!validateConfig()) {
    process.exit(1);
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);

  console.log(`\n📍 Network: ${CONFIG.rpcUrl}`);
  console.log(`📍 Chain ID: ${CONFIG.chainId}`);
  console.log(`👛 Wallet: ${wallet.address}`);

  // Get network info
  const network = await provider.getNetwork();
  console.log(`✅ Connected to chain: ${network.chainId}`);

  // Setup token contract
  const token = new ethers.Contract(CONFIG.tokenAddress, ERC20_ABI, wallet);

  // Get token info
  console.log("\n📊 Token Information:");
  const tokenInfo = await getTokenInfo(token);
  console.log(`   Name: ${tokenInfo.name}`);
  console.log(`   Symbol: ${tokenInfo.symbol}`);
  console.log(`   Decimals: ${tokenInfo.decimals}`);
  console.log(`   Address: ${CONFIG.tokenAddress}`);

  // Check wallet balance
  const balance = await token.balanceOf(wallet.address);
  console.log(
    `   Your balance: ${ethers.formatUnits(balance, tokenInfo.decimals)} ${
      tokenInfo.symbol
    }`
  );

  if (balance === BigInt(0)) {
    console.log(
      "\n⚠️  Warning: Your balance is 0. You need some tokens to test transfers."
    );
  }

  // Run tests
  const results = {
    approve: false,
    transfer: false,
    moduleTransfer: false,
    aaveSupply: false,
  };

  // // Test 1: Approve
  // results.approve = await testApprove(
  //   token,
  //   wallet,
  //   CONFIG.spenderAddress,
  //   CONFIG.amount
  // );

  // // Test 2: Transfer
  // results.transfer = await testTransfer(
  //   token,
  //   wallet,
  //   CONFIG.recipientAddress,
  //   CONFIG.amount
  // );

  // // Test 3: Module Transfer (optional)
  // if (CONFIG.defiModuleAddress && CONFIG.safeAddress) {
  //   results.moduleTransfer = await testModuleTransfer(
  //     provider,
  //     wallet,
  //     CONFIG.tokenAddress,
  //     CONFIG.defiModuleAddress,
  //     CONFIG.safeAddress,
  //     CONFIG.recipientAddress,
  //     CONFIG.amount
  //   );
  // }

  // Check current Aave allowance (optional)
  if (CONFIG.safeAddress && CONFIG.aavePoolAddress) {
    await checkAaveAllowance(
      provider,
      CONFIG.tokenAddress,
      CONFIG.safeAddress,
      CONFIG.aavePoolAddress
    );
  }

  // Test 4: Aave Supply (optional)
  if (
    CONFIG.defiModuleAddress &&
    CONFIG.safeAddress &&
    CONFIG.aavePoolAddress
  ) {
    results.aaveSupply = await testAaveSupply(
      provider,
      wallet,
      CONFIG.tokenAddress,
      CONFIG.defiModuleAddress,
      CONFIG.safeAddress,
      CONFIG.aavePoolAddress,
      CONFIG.amount
    );
  }

  // Summary
  console.log("\n📋 Test Summary");
  console.log("=".repeat(50));
  console.log(`Approve:          ${results.approve ? "✅ PASS" : "⏭️  SKIP"}`);
  console.log(`Transfer:         ${results.transfer ? "✅ PASS" : "⏭️  SKIP"}`);
  if (CONFIG.defiModuleAddress) {
    console.log(
      `Module Transfer:  ${results.moduleTransfer ? "✅ PASS" : "⏭️  SKIP"}`
    );
  }
  if (CONFIG.aavePoolAddress) {
    console.log(
      `Aave Supply:      ${results.aaveSupply ? "✅ PASS" : "❌ FAIL"}`
    );
  }

  const passCount = Object.values(results).filter(Boolean).length;
  const totalTests = Object.values(results).length;
  console.log(`\nTotal: ${passCount}/${totalTests} tests passed`);

  process.exit(passCount === totalTests ? 0 : 1);
}

// Run tests
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
