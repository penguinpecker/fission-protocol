import fs from "fs";

// Read deployed addresses
let addrs;
try {
  addrs = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json"));
} catch {
  console.error("No deployed-addresses-v2.json. Run redeploy-all.mjs first.");
  process.exit(1);
}

const walletPath = "../frontend/src/hooks/useWallet.ts";
let content = fs.readFileSync(walletPath, "utf-8");

// Replace address block
const oldBlock = /export const ADDRS = \{[\s\S]*?\};/;
const newBlock = `export const ADDRS = {
  CORE: "${addrs.FissionCore}",
  AMM: "${addrs.FissionAMM}",
  ROUTER: "${addrs.FissionRouter}",
  SY_SAUCERSWAP: "${addrs.SY_SaucerSwapLP}",
  SY_HBARX: "${addrs.SY_HBARX}",
  WHBAR: "0x0000000000000000000000000000000000163b5a",
  USDC: "0x000000000000000000000000000000000006f89a",
  HBARX: "0x00000000000000000000000000000000000cba44",
};`;

if (oldBlock.test(content)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(walletPath, content);
  console.log("✓ useWallet.ts updated with new addresses:\n");
  console.log(`  CORE:           ${addrs.FissionCore}`);
  console.log(`  AMM:            ${addrs.FissionAMM}`);
  console.log(`  ROUTER:         ${addrs.FissionRouter}`);
  console.log(`  SY_SAUCERSWAP:  ${addrs.SY_SaucerSwapLP}`);
  console.log(`  SY_HBARX:       ${addrs.SY_HBARX}`);
  console.log(`\nHedera IDs (for HashScan):`);
  console.log(`  Core:    ${addrs.FissionCoreId}`);
  console.log(`  AMM:     ${addrs.FissionAMMId}`);
  console.log(`  Router:  ${addrs.FissionRouterId}`);
  console.log(`  SY_SS:   ${addrs.SY_SaucerSwapLPId}`);
  console.log(`  SY_HBX:  ${addrs.SY_HBARXId}`);
} else {
  console.error("Could not find ADDRS block in useWallet.ts");
}

// Also update App.tsx footer contract links
const appPath = "../frontend/src/App.tsx";
let appContent = fs.readFileSync(appPath, "utf-8");

const oldContracts = /const CONTRACTS = \[.*?\];/s;
const newContracts = `const CONTRACTS = [["FissionCore", "${addrs.FissionCoreId}"], ["FissionAMM", "${addrs.FissionAMMId}"], ["FissionRouter", "${addrs.FissionRouterId}"]];`;

if (oldContracts.test(appContent)) {
  appContent = appContent.replace(oldContracts, newContracts);
  fs.writeFileSync(appPath, appContent);
  console.log("\n✓ App.tsx contract IDs updated for HashScan footer links");
} else {
  console.log("\n⚠️  Could not find CONTRACTS array in App.tsx — update manually");
}
