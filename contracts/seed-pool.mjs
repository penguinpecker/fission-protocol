import { Client, ContractExecuteTransaction, ContractCallQuery, AccountId, PrivateKey, Hbar, ContractFunctionParameters, ContractId } from "@hashgraph/sdk";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const accountId = AccountId.fromString(process.env.DEPLOYER_ACCOUNT_ID);
const privateKey = PrivateKey.fromStringECDSA(process.env.DEPLOYER_PRIVATE_KEY);
const client = Client.forMainnet();
client.setOperator(accountId, privateKey);
client.setDefaultMaxTransactionFee(new Hbar(20));

const addrs = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json"));
const coreId = ContractId.fromSolidityAddress(addrs.FissionCore);
const ammId = ContractId.fromSolidityAddress(addrs.FissionAMM);
const syLpId = ContractId.fromSolidityAddress(addrs.SY_SaucerSwapLP);

const deployerEvmAddr = "0x" + accountId.toSolidityAddress();

// ═══ CONFIG ═══
const MARKET_ID = 0;             // Market 0: SaucerSwap LP
const SEED_AMOUNT = "1000000";   // 1e6 wei = small seed (adjust based on your LP balance)
// For real seeding, use a larger amount like "1000000000000000000" (1e18 = 1 full token)

console.log("═══ SEED AMM POOL ═══\n");
console.log("Market:", MARKET_ID);
console.log("Core:", coreId.toString());
console.log("AMM:", ammId.toString());
console.log("SY:", syLpId.toString());
console.log("Seed amount:", SEED_AMOUNT, "wei\n");

async function approve(tokenAddr, spenderAddr, amount) {
  console.log(`  Approving ${tokenAddr} → ${spenderAddr}...`);
  const tokenId = ContractId.fromSolidityAddress(tokenAddr);
  const tx = new ContractExecuteTransaction()
    .setContractId(tokenId)
    .setGas(500000)
    .setFunction("approve", new ContractFunctionParameters()
      .addAddress(spenderAddr)
      .addUint256(amount));
  const response = await tx.execute(client);
  await response.getReceipt(client);
  console.log("    Approved ✓");
}

// ═══ STEP 1: DEPOSIT LP TOKENS INTO SY ADAPTER ═══
// You must have SaucerSwap HBAR-USDC LP tokens in your wallet first.
// If you don't, go to SaucerSwap, provide HBAR+USDC liquidity, get LP tokens.

console.log("Step 1: Deposit LP tokens into SY adapter...\n");
console.log("  ⚠️  You need SaucerSwap HBAR-USDC LP tokens in your wallet.");
console.log("  If you don't have them, add liquidity on SaucerSwap first.\n");

try {
  // Approve LP token to SY adapter
  const lpTokenAddr = "0xc5b707348da504e9be1bd4e21525459830e7b11d";
  await approve(lpTokenAddr, addrs.SY_SaucerSwapLP, BigInt(SEED_AMOUNT));

  // Deposit LP → SY
  console.log("  Depositing LP into SY adapter...");
  const depositTx = new ContractExecuteTransaction()
    .setContractId(syLpId)
    .setGas(1000000)
    .setFunction("deposit", new ContractFunctionParameters()
      .addAddress(deployerEvmAddr)  // receiver
      .addUint256(BigInt(SEED_AMOUNT)));
  const depositResp = await depositTx.execute(client);
  await depositResp.getReceipt(client);
  console.log("    SY tokens received ✓\n");
} catch (e) {
  console.log("  Deposit failed:", e.message);
  console.log("  Make sure you have LP tokens. Skipping to next step...\n");
}

// ═══ STEP 2: SPLIT SY INTO PT + YT ═══
console.log("Step 2: Split SY into PT + YT via FissionCore...\n");

try {
  // Approve SY to Core
  await approve(addrs.SY_SaucerSwapLP, addrs.FissionCore, BigInt(SEED_AMOUNT));

  // Split
  console.log("  Splitting SY...");
  const splitTx = new ContractExecuteTransaction()
    .setContractId(coreId)
    .setGas(2000000)
    .setFunction("split", new ContractFunctionParameters()
      .addUint256(MARKET_ID)
      .addUint256(BigInt(SEED_AMOUNT)));
  const splitResp = await splitTx.execute(client);
  await splitResp.getReceipt(client);
  console.log("    PT + YT minted ✓\n");
} catch (e) {
  console.log("  Split failed:", e.message, "\n");
}

// ═══ STEP 3: GET PT AND SY ADDRESSES FROM MARKET ═══
console.log("Step 3: Reading market data to get PT address...\n");

let ptAddr, syAddr;
try {
  const query = new ContractCallQuery()
    .setContractId(coreId)
    .setGas(500000)
    .setFunction("getMarket", new ContractFunctionParameters().addUint256(MARKET_ID));
  const result = await query.execute(client);
  // Market struct: (sy, pt, yt, maturity, scalarRoot, totalSYLocked, yieldIndex, initialized)
  syAddr = "0x" + result.getBytes32(0).slice(12).toString("hex");
  ptAddr = "0x" + result.getBytes32(1).slice(12).toString("hex");
  console.log("  SY:", syAddr);
  console.log("  PT:", ptAddr, "\n");
} catch (e) {
  console.log("  Market read failed:", e.message, "\n");
  process.exit(1);
}

// ═══ STEP 4: INITIALIZE AMM POOL ═══
// Need some SY tokens too — split gives us PT+YT but we need SY for the pool
// So we need to deposit more LP → SY first, or use a portion of what we have
// For simplicity: deposit more LP, keep half as SY, split half into PT+YT

console.log("Step 4: Initialize AMM pool (owner only)...\n");

try {
  const halfAmount = BigInt(SEED_AMOUNT) / 2n;
  
  // Approve SY to AMM
  await approve(addrs.SY_SaucerSwapLP, addrs.FissionAMM, halfAmount);
  // Approve PT to AMM  
  await approve(ptAddr, addrs.FissionAMM, halfAmount);

  // initializePool(marketId, syAmt, ptAmt, feeBps)
  console.log("  Initializing pool...");
  const initTx = new ContractExecuteTransaction()
    .setContractId(ammId)
    .setGas(3000000)
    .setFunction("initializePool", new ContractFunctionParameters()
      .addUint256(MARKET_ID)
      .addUint256(halfAmount)
      .addUint256(halfAmount)
      .addUint256(30));  // 0.3% fee
  const initResp = await initTx.execute(client);
  await initResp.getReceipt(client);
  console.log("    AMM pool initialized ✓\n");
} catch (e) {
  console.log("  Pool init failed:", e.message);
  console.log("  This could mean insufficient SY/PT balance. Check your balances.\n");
}

console.log("═══ DONE ═══");
console.log("The AMM should now show as initialized in the frontend.");
console.log("Buy PT and Buy YT buttons should work after the pool is seeded.");
