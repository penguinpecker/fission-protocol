import { Client, ContractCreateFlow, ContractExecuteTransaction, AccountId, PrivateKey, Hbar, ContractFunctionParameters, ContractId } from "@hashgraph/sdk";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// ═══ CONFIG ═══
const accountId = AccountId.fromString(process.env.DEPLOYER_ACCOUNT_ID);
const privateKey = PrivateKey.fromStringECDSA(process.env.DEPLOYER_PRIVATE_KEY);
const client = Client.forMainnet();
client.setOperator(accountId, privateKey);
client.setDefaultMaxTransactionFee(new Hbar(50));

const deployerEvmAddr = "0x" + accountId.toSolidityAddress();

// Real Hedera mainnet token addresses
const TOKENS = {
  SAUCERSWAP_LP: "0xc5b707348da504e9be1bd4e21525459830e7b11d",
  HBARX: "0x00000000000000000000000000000000000cba44",
};

// ═══ HELPERS ═══
async function deployContract(name, bytecodeHex, params) {
  console.log(`  Deploying ${name}...`);
  const tx = new ContractCreateFlow()
    .setBytecode(bytecodeHex)
    .setGas(8000000);
  if (params) tx.setConstructorParameters(params);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  const contractId = receipt.contractId;
  const evmAddr = "0x" + contractId.toSolidityAddress();
  console.log(`    ${name}: ${contractId} (${evmAddr})`);
  return { contractId, evmAddr };
}

async function createMarket(marketName, syAddr, scalarRoot) {
  // 90 days from now
  const maturity = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
  console.log(`  Creating market: ${marketName}...`);
  console.log(`    SY: ${syAddr}`);
  console.log(`    Maturity: ${new Date(maturity * 1000).toISOString().split("T")[0]}`);
  console.log(`    ScalarRoot: ${scalarRoot}`);
  
  const params = new ContractFunctionParameters()
    .addAddress(syAddr)
    .addUint256(maturity)
    .addUint256(scalarRoot);
  
  const tx = new ContractExecuteTransaction()
    .setContractId(coreContractId)
    .setGas(5000000)
    .setFunction("createMarket", params);
  
  const response = await tx.execute(client);
  await response.getReceipt(client);
  console.log(`    ✓ Market created\n`);
  return maturity;
}

// ═══ LOAD ARTIFACTS ═══
console.log("═══ FISSION PROTOCOL — FULL REDEPLOY (FIXED CONTRACTS) ═══\n");
console.log("Deployer:", deployerEvmAddr);
console.log("Network: Hedera Mainnet\n");

const mathArt = JSON.parse(fs.readFileSync("./artifacts/contracts/libs/MathLib.sol/MathLib.json"));
const coreArt = JSON.parse(fs.readFileSync("./artifacts/contracts/FissionCore.sol/FissionCore.json"));
const ammArt = JSON.parse(fs.readFileSync("./artifacts/contracts/FissionAMM.sol/FissionAMM.json"));
const routerArt = JSON.parse(fs.readFileSync("./artifacts/contracts/FissionRouter.sol/FissionRouter.json"));
const sySaucerArt = JSON.parse(fs.readFileSync("./artifacts/contracts/adapters/SY_SaucerSwapLP.sol/SY_SaucerSwapLP.json"));
const syHbarxArt = JSON.parse(fs.readFileSync("./artifacts/contracts/adapters/SY_HBARX.sol/SY_HBARX.json"));

// ═══ STEP 1: DEPLOY CORE CONTRACTS ═══
console.log("Step 1: Deploying core contracts...\n");

const math = await deployContract("MathLib", mathArt.bytecode);

// FissionCore(address guardian_)
const coreParams = new ContractFunctionParameters().addAddress(deployerEvmAddr);
const core = await deployContract("FissionCore", coreArt.bytecode, coreParams);

// FissionAMM(address core_, address guardian_)
const ammParams = new ContractFunctionParameters()
  .addAddress(core.evmAddr)
  .addAddress(deployerEvmAddr);
const amm = await deployContract("FissionAMM", ammArt.bytecode, ammParams);

// FissionRouter(address core_, address amm_)
const routerParams = new ContractFunctionParameters()
  .addAddress(core.evmAddr)
  .addAddress(amm.evmAddr);
const router = await deployContract("FissionRouter", routerArt.bytecode, routerParams);

// ═══ STEP 2: DEPLOY SY ADAPTERS ═══
console.log("\nStep 2: Deploying SY adapters (fixed — with postRate oracle pattern)...\n");

// SY_SaucerSwapLP(name, symbol, lpToken, pool, keeper)
const sySaucerParams = new ContractFunctionParameters()
  .addString("Fission SY-SaucerSwap HBAR/USDC")
  .addString("fSY-SS")
  .addAddress(TOKENS.SAUCERSWAP_LP)
  .addAddress(TOKENS.SAUCERSWAP_LP)  // pool = LP token for V2
  .addAddress(deployerEvmAddr);       // keeper = deployer initially
const sySaucer = await deployContract("SY_SaucerSwapLP", sySaucerArt.bytecode, sySaucerParams);

// SY_HBARX(hbarx, stader, keeper)
const syHbarxParams = new ContractFunctionParameters()
  .addAddress(TOKENS.HBARX)
  .addAddress(TOKENS.HBARX)           // stader contract = HBARX for now
  .addAddress(deployerEvmAddr);       // keeper = deployer initially
const syHbarx = await deployContract("SY_HBARX", syHbarxArt.bytecode, syHbarxParams);

// ═══ STEP 3: CREATE MARKETS ═══
console.log("\nStep 3: Creating markets...\n");

// Store core contract ID globally for createMarket helper
let coreContractId = core.contractId;

let maturity0, maturity1;

// Market 0: SaucerSwap HBAR-USDC LP (scalarRoot = 100)
try {
  maturity0 = await createMarket("SaucerSwap HBAR-USDC LP", sySaucer.evmAddr, 100);
} catch (e) {
  console.log(`  Market 0 failed: ${e.message}\n`);
}

// Market 1: HBARX (scalarRoot = 150) — will fail due to 1hr cooldown
try {
  maturity1 = await createMarket("HBARX Staking", syHbarx.evmAddr, 150);
} catch (e) {
  console.log(`  Market 1 failed (expected — 1hr cooldown): ${e.message}`);
  console.log(`  Run this to create Market 1 after 1 hour:`);
  console.log(`  node create-market1.mjs\n`);
}

// ═══ SAVE ADDRESSES ═══
const addresses = {
  MathLib: math.evmAddr,
  MathLibId: math.contractId.toString(),
  FissionCore: core.evmAddr,
  FissionCoreId: core.contractId.toString(),
  FissionAMM: amm.evmAddr,
  FissionAMMId: amm.contractId.toString(),
  FissionRouter: router.evmAddr,
  FissionRouterId: router.contractId.toString(),
  SY_SaucerSwapLP: sySaucer.evmAddr,
  SY_SaucerSwapLPId: sySaucer.contractId.toString(),
  SY_HBARX: syHbarx.evmAddr,
  SY_HBARXId: syHbarx.contractId.toString(),
  deployer: deployerEvmAddr,
  markets: [
    { id: 0, name: "SaucerSwap HBAR-USDC LP", sy: sySaucer.evmAddr, maturity: maturity0, scalarRoot: 100 },
    { id: 1, name: "HBARX Staking", sy: syHbarx.evmAddr, maturity: maturity1 || "pending cooldown", scalarRoot: 150 },
  ],
};

fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));

console.log("\n═══ DEPLOYMENT COMPLETE ═══\n");
console.log("Addresses saved to deployed-addresses-v2.json\n");
console.log(JSON.stringify(addresses, null, 2));

console.log("\n═══ NEXT STEPS ═══");
console.log("1. Wait 1 hour, then run: node create-market1.mjs");
console.log("2. Update frontend/src/hooks/useWallet.ts with new addresses");
console.log("3. Seed AMM pool with liquidity");
console.log("4. Verify contracts on HashScan");
