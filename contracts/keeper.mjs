import { Client, ContractCallQuery, ContractExecuteTransaction, AccountId, PrivateKey, Hbar, ContractFunctionParameters, ContractId } from "@hashgraph/sdk";
import dotenv from "dotenv";
dotenv.config();

// ═══ CONFIG ═══
const INTERVAL_MS = 60 * 60 * 1000;  // 1 hour between updates
const accountId = AccountId.fromString(process.env.DEPLOYER_ACCOUNT_ID);
const privateKey = PrivateKey.fromStringECDSA(process.env.DEPLOYER_PRIVATE_KEY);

const client = Client.forMainnet();
client.setOperator(accountId, privateKey);
client.setDefaultMaxTransactionFee(new Hbar(5));

// Contract IDs from deployment
const CORE_ID = ContractId.fromSolidityAddress("0x00000000000000000000000000000000009f2592");
const SY_SAUCER_ID = ContractId.fromSolidityAddress("0x00000000000000000000000000000000009f2598");
const SY_HBARX_ID = ContractId.fromSolidityAddress("0x00000000000000000000000000000000009f259a");

// ═══ RATE SIMULATION ═══
// In production, replace these with actual reads from SaucerSwap pool + Stader contract
// For now, simulate realistic rate increases

let saucerRate = 1_000_000_000_000_000_000n;  // 1e18 (starts at 1:1)
let hbarxRate = 1_000_000_000_000_000_000n;

function simulateSaucerRateIncrease() {
  // SaucerSwap LP earns ~14% APY from swap fees
  // Per hour: 14% / 365 / 24 = 0.0016% per hour
  const hourlyIncrease = saucerRate * 16n / 1_000_000n;
  saucerRate += hourlyIncrease;
  // Add some variance (+/- 30%)
  const variance = hourlyIncrease * BigInt(Math.floor(Math.random() * 60 - 30)) / 100n;
  saucerRate += variance;
  return saucerRate;
}

function simulateHbarxRateIncrease() {
  // HBARX earns ~5.4% APY from staking rewards
  // Per hour: 5.4% / 365 / 24 = 0.00062% per hour
  const hourlyIncrease = hbarxRate * 6n / 1_000_000n;
  hbarxRate += hourlyIncrease;
  return hbarxRate;
}

// ═══ CONTRACT CALLS ═══

async function postRateToSY(syId, name, newRate) {
  try {
    console.log(`  Posting rate to ${name}: ${newRate.toString()}`);
    const tx = new ContractExecuteTransaction()
      .setContractId(syId)
      .setGas(500000)
      .setFunction("postRate", new ContractFunctionParameters()
        .addUint256(newRate));
    const response = await tx.execute(client);
    await response.getReceipt(client);
    console.log(`    ${name} rate updated ✓`);
    return true;
  } catch (e) {
    console.log(`    ${name} rate update failed: ${e.message}`);
    return false;
  }
}

async function updateYieldIndex(marketId) {
  try {
    console.log(`  Updating yield index for market ${marketId}...`);
    const tx = new ContractExecuteTransaction()
      .setContractId(CORE_ID)
      .setGas(500000)
      .setFunction("updateYieldIndex", new ContractFunctionParameters()
        .addUint256(marketId));
    const response = await tx.execute(client);
    await response.getReceipt(client);
    console.log(`    Market ${marketId} yield index updated ✓`);
    return true;
  } catch (e) {
    console.log(`    Market ${marketId} yield index failed: ${e.message}`);
    return false;
  }
}

// ═══ MAIN LOOP ═══

async function runUpdate() {
  const now = new Date().toISOString();
  console.log(`\n═══ KEEPER UPDATE: ${now} ═══`);
  
  // 1. Post rates to SY adapters
  const saucerNewRate = simulateSaucerRateIncrease();
  await postRateToSY(SY_SAUCER_ID, "SY_SaucerSwapLP", saucerNewRate);

  const hbarxNewRate = simulateHbarxRateIncrease();
  await postRateToSY(SY_HBARX_ID, "SY_HBARX", hbarxNewRate);

  // 2. Update yield indices on FissionCore
  await updateYieldIndex(0);  // Market 0: SaucerSwap
  // await updateYieldIndex(1);  // Market 1: HBARX (uncomment after creating market 1)

  console.log("  Done. Next update in 1 hour.\n");
}

// Initial run
console.log("Fission Keeper Bot started");
console.log("Core:", CORE_ID.toString());
console.log("SY_SaucerSwap:", SY_SAUCER_ID.toString());
console.log("SY_HBARX:", SY_HBARX_ID.toString());
console.log("Update interval:", INTERVAL_MS / 1000 / 60, "minutes");

await runUpdate();

// Schedule recurring updates
setInterval(runUpdate, INTERVAL_MS);

// Keep alive
console.log("Keeper running. Press Ctrl+C to stop.");
