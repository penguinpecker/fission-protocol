import { Client, ContractCreateFlow, ContractExecuteTransaction, ContractCallQuery, AccountId, PrivateKey, Hbar, ContractFunctionParameters, ContractId } from "@hashgraph/sdk";
import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const accountId = AccountId.fromString(process.env.DEPLOYER_ACCOUNT_ID);
const privateKey = PrivateKey.fromStringECDSA(process.env.DEPLOYER_PRIVATE_KEY);
const client = Client.forMainnet();
client.setOperator(accountId, privateKey);
client.setDefaultMaxTransactionFee(new Hbar(20));

// ECDSA accounts on Hedera use the ETH-style address as msg.sender, NOT the long-zero format
const deployerEvmAddr = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY).address;
const addrs = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json"));
const coreId = ContractId.fromSolidityAddress(addrs.FissionCore);
const ammId = ContractId.fromSolidityAddress(addrs.FissionAMM);

function u(val) { return typeof val === "bigint" ? val.toString() : String(val); }

console.log("═══ FISSION POOL SEEDING v3 ═══\n");

// ═══ STEP 1: Deploy SeedToken ═══
console.log("Step 1: Deploy SeedToken (1000 fUSDC minted to deployer)...");
const seedArt = JSON.parse(fs.readFileSync("./artifacts/contracts/SeedToken.sol/SeedToken.json"));
const s1 = await new ContractCreateFlow().setBytecode(seedArt.bytecode).setGas(4000000).execute(client);
const seedId = (await s1.getReceipt(client)).contractId;
const seedEvm = "0x" + seedId.toSolidityAddress();
console.log(`  SeedToken: ${seedId} (${seedEvm}) ✓\n`);

// ═══ STEP 2: Deploy SY adapter ═══
console.log("Step 2: Deploy SY adapter (underlying = SeedToken)...");
const syArt = JSON.parse(fs.readFileSync("./artifacts/contracts/adapters/SY_SaucerSwapLP.sol/SY_SaucerSwapLP.json"));
const syParams = new ContractFunctionParameters()
  .addString("Fission SY-SaucerSwap HBAR/USDC").addString("fSY-SS")
  .addAddress(seedEvm).addAddress(seedEvm).addAddress(deployerEvmAddr);
const s2 = await new ContractCreateFlow().setBytecode(syArt.bytecode).setGas(8000000).setConstructorParameters(syParams).execute(client);
const syId = (await s2.getReceipt(client)).contractId;
const syEvm = "0x" + syId.toSolidityAddress();
console.log(`  SY: ${syId} (${syEvm}) ✓\n`);

// ═══ STEP 3: Wait cooldown + create market ═══
console.log("Step 3: Create market...");
try {
  const q = await new ContractCallQuery().setContractId(coreId).setGas(100000).setFunction("lastMarketCreation").execute(client);
  const last = Number(q.getUint256(0));
  const now = Math.floor(Date.now() / 1000);
  const wait = (last + 3600) - now;
  if (wait > 0) {
    console.log(`  Cooldown: ${Math.ceil(wait/60)} min remaining. Waiting...`);
    for (let i = 0; i < Math.ceil(wait/60) + 1; i++) {
      await new Promise(r => setTimeout(r, 60000));
      process.stdout.write(`  ${i+1}m `);
    }
    console.log("");
  }
} catch(e) { console.log("  Cooldown check skipped:", e.message?.slice(0,40)); }

const maturity = Math.floor(Date.now() / 1000) + 90 * 86400;
const ct = await new ContractExecuteTransaction().setContractId(coreId).setGas(5000000)
  .setFunction("createMarket", new ContractFunctionParameters()
    .addAddress(syEvm).addUint256(u(maturity)).addUint256(u(100))).execute(client);
await ct.getReceipt(client);
console.log(`  Market created (maturity: ${new Date(maturity*1000).toISOString().split("T")[0]}) ✓`);

// Get market ID
const cntQ = await new ContractCallQuery().setContractId(coreId).setGas(100000).setFunction("marketCount").execute(client);
const mktId = Number(cntQ.getUint256(0)) - 1;
console.log(`  Market ID: ${mktId}`);

// Get PT/YT
const mQ = await new ContractCallQuery().setContractId(coreId).setGas(200000)
  .setFunction("getMarket", new ContractFunctionParameters().addUint256(u(mktId))).execute(client);
const dec = ethers.AbiCoder.defaultAbiCoder().decode(
  ["address","address","address","uint256","uint256","uint256","uint256","bool"], mQ.bytes);
const ptEvm = dec[1]; const ytEvm = dec[2];
console.log(`  PT: ${ptEvm}\n  YT: ${ytEvm}\n`);

// ═══ Known amounts (no RPC reads needed — rate is 1:1 at start) ═══
// SeedToken: deployer has 1000e18
// Plan: deposit 400 → SY (get 400 SY), split all → 400 PT + 400 YT
//        deposit 400 more → SY (get 400 SY)
//        init pool with 400 SY + 400 PT
const AMT = ethers.parseEther("400").toString();

// ═══ STEP 4: Approve SeedToken → SY, deposit ═══
console.log("Step 4: Deposit 400 fUSDC → SY...");
await (await new ContractExecuteTransaction().setContractId(seedId).setGas(500000)
  .setFunction("approve", new ContractFunctionParameters().addAddress(syEvm).addUint256(AMT)).execute(client)).getReceipt(client);
await (await new ContractExecuteTransaction().setContractId(syId).setGas(1000000)
  .setFunction("deposit", new ContractFunctionParameters().addAddress(deployerEvmAddr).addUint256(AMT)).execute(client)).getReceipt(client);
console.log("  400 SY received ✓\n");

// ═══ STEP 5: Approve SY → Core, split ═══
console.log("Step 5: Split 400 SY → 400 PT + 400 YT...");
await (await new ContractExecuteTransaction().setContractId(syId).setGas(500000)
  .setFunction("approve", new ContractFunctionParameters().addAddress(addrs.FissionCore).addUint256(AMT)).execute(client)).getReceipt(client);
await (await new ContractExecuteTransaction().setContractId(coreId).setGas(2000000)
  .setFunction("split", new ContractFunctionParameters().addUint256(u(mktId)).addUint256(AMT)).execute(client)).getReceipt(client);
console.log("  Split complete ✓\n");

// ═══ STEP 6: Deposit 400 more fUSDC → SY (for pool SY side) ═══
console.log("Step 6: Deposit 400 more fUSDC → SY...");
await (await new ContractExecuteTransaction().setContractId(seedId).setGas(500000)
  .setFunction("approve", new ContractFunctionParameters().addAddress(syEvm).addUint256(AMT)).execute(client)).getReceipt(client);
await (await new ContractExecuteTransaction().setContractId(syId).setGas(1000000)
  .setFunction("deposit", new ContractFunctionParameters().addAddress(deployerEvmAddr).addUint256(AMT)).execute(client)).getReceipt(client);
console.log("  400 SY received ✓\n");

// ═══ STEP 7: Approve SY + PT → AMM, initialize pool ═══
console.log("Step 7: Initialize AMM pool (400 SY + 400 PT)...");
// Approve SY → AMM
await (await new ContractExecuteTransaction().setContractId(syId).setGas(500000)
  .setFunction("approve", new ContractFunctionParameters().addAddress(addrs.FissionAMM).addUint256(AMT)).execute(client)).getReceipt(client);
// Approve PT → AMM (PT is a contract, need ContractId)
const ptContractId = ContractId.fromSolidityAddress(ptEvm);
await (await new ContractExecuteTransaction().setContractId(ptContractId).setGas(500000)
  .setFunction("approve", new ContractFunctionParameters().addAddress(addrs.FissionAMM).addUint256(AMT)).execute(client)).getReceipt(client);
// Init pool
await (await new ContractExecuteTransaction().setContractId(ammId).setGas(3000000)
  .setFunction("initializePool", new ContractFunctionParameters()
    .addUint256(u(mktId)).addUint256(AMT).addUint256(AMT).addUint256(u(30))).execute(client)).getReceipt(client);
console.log("  AMM pool initialized ✓\n");

// ═══ STEP 8: Update addresses ═══
console.log("Step 8: Save addresses + update frontend...");
addrs.SeedToken = seedEvm;
addrs.SeedTokenId = seedId.toString();
addrs.SY_SaucerSwapLP = syEvm;
addrs.SY_SaucerSwapLPId = syId.toString();
addrs.SeededMarketId = mktId;
addrs.markets.push({ id: mktId, name: "SaucerSwap HBAR-USDC (seeded)", sy: syEvm, pt: ptEvm, yt: ytEvm, maturity, scalarRoot: 100, poolInitialized: true });
fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addrs, null, 2));

try {
  let w = fs.readFileSync("../frontend/src/hooks/useWallet.ts", "utf-8");
  w = w.replace(/export const ADDRS = \{[\s\S]*?\};/, `export const ADDRS = {
  CORE: "${addrs.FissionCore}",
  AMM: "${addrs.FissionAMM}",
  ROUTER: "${addrs.FissionRouter}",
  SY_SAUCERSWAP: "${syEvm}",
  SY_HBARX: "${addrs.SY_HBARX}",
  WHBAR: "0x0000000000000000000000000000000000163b5a",
  USDC: "0x000000000000000000000000000000000006f89a",
  HBARX: "0x00000000000000000000000000000000000cba44",
};`);
  fs.writeFileSync("../frontend/src/hooks/useWallet.ts", w);
  console.log("  useWallet.ts updated ✓");
} catch(e) { console.log("  useWallet.ts: " + e.message?.slice(0,50)); }

try {
  let a = fs.readFileSync("../frontend/src/App.tsx", "utf-8");
  a = a.replace(/\{ id: 0, sym: "HBAR-USDC LP"/, `{ id: ${mktId}, sym: "HBAR-USDC LP"`);
  fs.writeFileSync("../frontend/src/App.tsx", a);
  console.log("  App.tsx market ID updated ✓");
} catch(e) { console.log("  App.tsx: " + e.message?.slice(0,50)); }

console.log(`\n═══ POOL SEEDED ═══`);
console.log(`SeedToken: ${seedId} (${seedEvm})`);
console.log(`SY:        ${syId} (${syEvm})`);
console.log(`Market:    ${mktId}`);
console.log(`PT:        ${ptEvm}`);
console.log(`YT:        ${ytEvm}`);
console.log(`Pool:      INITIALIZED ✓`);
console.log(`\nPush frontend:`);
console.log(`  cd ../frontend && npx tsc --noEmit && npx vite build`);
console.log(`  cd .. && git add -A && git commit -m "Pool seeded" && git push origin main`);
