import { Client, ContractCreateFlow, ContractExecuteTransaction, AccountId, PrivateKey, Hbar, ContractFunctionParameters, ContractId } from "@hashgraph/sdk";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const accountId = AccountId.fromString(process.env.DEPLOYER_ACCOUNT_ID);
const privateKey = PrivateKey.fromStringECDSA(process.env.DEPLOYER_PRIVATE_KEY);

const client = Client.forMainnet();
client.setOperator(accountId, privateKey);
client.setDefaultMaxTransactionFee(new Hbar(50));

const addrs = JSON.parse(fs.readFileSync("./deployed-addresses.json"));
const coreId = ContractId.fromSolidityAddress(addrs.FissionCore);

// Real mainnet token addresses
const TOKENS = {
  SAUCERSWAP_LP: "0xc5b707348da504e9be1bd4e21525459830e7b11d",
  HBARX: "0x00000000000000000000000000000000000cba44",
  BONZO_BUSDC: "0xB7687538c7f4CAD022d5e97CC778d0b46457c5DB",
  BONZO_POOL: "0x236897c518996163E7b313aD21D1C9fCC7BA1afc",
};

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
  console.log(`  Creating market: ${marketName}...`);
  
  // 90 days from now
  const maturity = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
  
  const params = new ContractFunctionParameters()
    .addAddress(syAddr)           // sy address
    .addUint256(maturity)         // maturity timestamp
    .addUint256(scalarRoot);      // scalar root
  
  const tx = new ContractExecuteTransaction()
    .setContractId(coreId)
    .setGas(5000000)
    .setFunction("createMarket", params);
  
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  console.log(`    Market created (maturity: ${new Date(maturity * 1000).toISOString().split("T")[0]})`);
  return maturity;
}

// Load SY adapter artifacts
const sySaucerArt = JSON.parse(fs.readFileSync("./artifacts/contracts/adapters/SY_SaucerSwapLP.sol/SY_SaucerSwapLP.json"));
const syHbarxArt = JSON.parse(fs.readFileSync("./artifacts/contracts/adapters/SY_HBARX.sol/SY_HBARX.json"));
const syBonzoArt = JSON.parse(fs.readFileSync("./artifacts/contracts/adapters/SY_BonzoLend.sol/SY_BonzoLend.json"));

console.log("═══ SETTING UP FISSION MARKETS ═══\n");
console.log("Core contract:", coreId.toString(), "\n");

// 1. Deploy SY adapters
console.log("Step 1: Deploying SY adapters...\n");

const sySaucerParams = new ContractFunctionParameters()
  .addString("Fission SY-SaucerSwap HBAR/USDC")
  .addString("fSY-SS")
  .addAddress(TOKENS.SAUCERSWAP_LP)
  .addAddress(TOKENS.SAUCERSWAP_LP);  // pool = LP token for V2
const sySaucer = await deployContract("SY_SaucerSwapLP", sySaucerArt.bytecode, sySaucerParams);

const syHbarxParams = new ContractFunctionParameters()
  .addAddress(TOKENS.HBARX)
  .addAddress(TOKENS.HBARX);  // stader contract = HBARX token itself for now
const syHbarx = await deployContract("SY_HBARX", syHbarxArt.bytecode, syHbarxParams);

const syBonzoParams = new ContractFunctionParameters()
  .addString("Fission SY-Bonzo USDC")
  .addString("fSY-bUSDC")
  .addAddress(TOKENS.BONZO_BUSDC)
  .addAddress(TOKENS.BONZO_POOL);
const syBonzo = await deployContract("SY_BonzoLend", syBonzoArt.bytecode, syBonzoParams);

// 2. Create markets on FissionCore
console.log("\nStep 2: Creating markets on FissionCore...\n");

// Wait for cooldown between market creations (1 hour in contract)
// For first deploy this won't be an issue

const m0 = await createMarket("SaucerSwap HBAR-USDC LP", sySaucer.evmAddr, 100);

// Need to wait 1 hour between market creations due to cooldown
console.log("\n  ⚠️  Market cooldown is 1 hour between creations.");
console.log("  Market 0 (SaucerSwap) created successfully.");
console.log("  Run this script again later to create markets 1 & 2,");
console.log("  or temporarily reduce MARKET_COOLDOWN in FissionCore before deploying.\n");

// Save everything
const fullAddrs = {
  ...addrs,
  SY_SaucerSwapLP: sySaucer.evmAddr,
  SY_HBARX: syHbarx.evmAddr,
  SY_BonzoLend: syBonzo.evmAddr,
  markets: [
    { id: 0, name: "SaucerSwap HBAR-USDC LP", sy: sySaucer.evmAddr, maturity: m0, scalarRoot: 100 },
    { id: 1, name: "HBARX Staking (pending cooldown)", sy: syHbarx.evmAddr, scalarRoot: 150 },
    { id: 2, name: "Bonzo USDC Lending (pending cooldown)", sy: syBonzo.evmAddr, scalarRoot: 80 },
  ],
};

fs.writeFileSync("./deployed-addresses.json", JSON.stringify(fullAddrs, null, 2));
console.log("═══ SETUP COMPLETE ═══");
console.log("\nAll addresses saved to deployed-addresses.json");
console.log(JSON.stringify(fullAddrs, null, 2));
