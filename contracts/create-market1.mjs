import { Client, ContractExecuteTransaction, AccountId, PrivateKey, Hbar, ContractFunctionParameters, ContractId } from "@hashgraph/sdk";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const accountId = AccountId.fromString(process.env.DEPLOYER_ACCOUNT_ID);
const privateKey = PrivateKey.fromStringECDSA(process.env.DEPLOYER_PRIVATE_KEY);
const client = Client.forMainnet();
client.setOperator(accountId, privateKey);
client.setDefaultMaxTransactionFee(new Hbar(10));

const addrs = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json"));
const coreId = ContractId.fromSolidityAddress(addrs.FissionCore);

const maturity = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

console.log("Creating Market 1: HBARX Staking...");
console.log("Core:", coreId.toString());
console.log("SY_HBARX:", addrs.SY_HBARX);
console.log("Maturity:", new Date(maturity * 1000).toISOString().split("T")[0]);

try {
  const tx = new ContractExecuteTransaction()
    .setContractId(coreId)
    .setGas(5000000)
    .setFunction("createMarket", new ContractFunctionParameters()
      .addAddress(addrs.SY_HBARX)
      .addUint256(maturity)
      .addUint256(150));
  const response = await tx.execute(client);
  await response.getReceipt(client);
  console.log("  Market 1 created ✓");

  // Update addresses file
  addrs.markets[1].maturity = maturity;
  fs.writeFileSync("./deployed-addresses-v2.json", JSON.stringify(addrs, null, 2));
  console.log("  Addresses file updated");
} catch (e) {
  console.log("  Failed:", e.message);
  console.log("  If cooldown error, wait 1 hour from Market 0 creation and try again.");
}
