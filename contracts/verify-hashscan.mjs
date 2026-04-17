import fs from "fs";
import path from "path";

/**
 * Generates metadata.json files for HashScan verification.
 * 
 * HashScan uses Sourcify for verification. For contracts with OpenZeppelin
 * dependencies, the easiest method is to upload the compiler metadata JSON
 * that Hardhat generates in artifacts/build-info/.
 * 
 * USAGE:
 *   1. npx hardhat compile    (must compile first)
 *   2. node verify-hashscan.mjs
 *   3. Go to https://hashscan.io/mainnet/contract/CONTRACT_ID
 *   4. Click "Verify Contract"
 *   5. Upload the metadata.json AND all source files from the generated folder
 * 
 * OR use the Sourcify API directly (automated, also done by this script).
 */

// Load deployed addresses
let addrs;
try {
  addrs = JSON.parse(fs.readFileSync("./deployed-addresses-v2.json"));
} catch {
  console.error("No deployed-addresses-v2.json. Run redeploy-all.mjs first.");
  process.exit(1);
}

const CONTRACTS_TO_VERIFY = [
  { name: "MathLib", addr: addrs.MathLib, id: addrs.MathLibId, source: "contracts/libs/MathLib.sol" },
  { name: "FissionCore", addr: addrs.FissionCore, id: addrs.FissionCoreId, source: "contracts/FissionCore.sol" },
  { name: "FissionAMM", addr: addrs.FissionAMM, id: addrs.FissionAMMId, source: "contracts/FissionAMM.sol" },
  { name: "FissionRouter", addr: addrs.FissionRouter, id: addrs.FissionRouterId, source: "contracts/FissionRouter.sol" },
  { name: "SY_SaucerSwapLP", addr: addrs.SY_SaucerSwapLP, id: addrs.SY_SaucerSwapLPId, source: "contracts/adapters/SY_SaucerSwapLP.sol" },
  { name: "SY_HBARX", addr: addrs.SY_HBARX, id: addrs.SY_HBARXId, source: "contracts/adapters/SY_HBARX.sol" },
];

console.log("═══ HASHSCAN CONTRACT VERIFICATION ═══\n");

// ═══ STEP 1: Find build-info for metadata ═══
const buildInfoDir = "./artifacts/build-info";
if (!fs.existsSync(buildInfoDir)) {
  console.error("No build-info found. Run: npx hardhat compile");
  process.exit(1);
}

const buildFiles = fs.readdirSync(buildInfoDir).filter(f => f.endsWith(".json"));
if (buildFiles.length === 0) {
  console.error("No build artifacts. Run: npx hardhat compile");
  process.exit(1);
}

// Read the build info (contains all source code + compiler settings)
const buildInfo = JSON.parse(fs.readFileSync(path.join(buildInfoDir, buildFiles[0])));

// ═══ STEP 2: Extract metadata for each contract ═══
const outDir = "./verification";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

for (const contract of CONTRACTS_TO_VERIFY) {
  console.log(`\n${contract.name}:`);
  console.log(`  Address: ${contract.addr}`);
  console.log(`  Hedera ID: ${contract.id}`);

  // Find the contract's metadata in build output
  const sourceKey = contract.source;
  const contractOutput = buildInfo.output?.contracts?.[sourceKey]?.[contract.name];

  if (!contractOutput) {
    console.log(`  ⚠️  Not found in build artifacts. Skipping.`);
    continue;
  }

  // The metadata JSON is what Sourcify needs
  const metadata = contractOutput.metadata;
  const contractDir = path.join(outDir, contract.name);
  if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir);

  // Write metadata.json
  if (typeof metadata === "string") {
    fs.writeFileSync(path.join(contractDir, "metadata.json"), metadata);
  } else {
    fs.writeFileSync(path.join(contractDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  }

  // Also copy all source files that this contract needs
  const metadataParsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  const sources = metadataParsed.sources || {};
  for (const [sourcePath, sourceInfo] of Object.entries(sources)) {
    // Try to find source in build input
    const sourceContent = buildInfo.input?.sources?.[sourcePath]?.content;
    if (sourceContent) {
      const destPath = path.join(contractDir, sourcePath);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, sourceContent);
    }
  }

  console.log(`  ✓ Metadata + sources saved to ${contractDir}/`);
}

// ═══ STEP 3: Try automated verification via Sourcify API ═══
console.log("\n\n═══ ATTEMPTING AUTOMATED VERIFICATION ═══\n");

const SOURCIFY_URL = "https://server-verify.hashscan.io";
const CHAIN_ID = "295"; // Hedera Mainnet

for (const contract of CONTRACTS_TO_VERIFY) {
  const contractDir = path.join(outDir, contract.name);
  const metadataPath = path.join(contractDir, "metadata.json");

  if (!fs.existsSync(metadataPath)) {
    console.log(`${contract.name}: skipped (no metadata)`);
    continue;
  }

  console.log(`Verifying ${contract.name} (${contract.addr})...`);

  try {
    // Build multipart form data manually
    const boundary = "----FissionVerify" + Date.now();
    const metadata = fs.readFileSync(metadataPath, "utf-8");

    // Collect all source files
    const sourceFiles = [];
    function collectFiles(dir, prefix = "") {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          collectFiles(path.join(dir, entry.name), path.join(prefix, entry.name));
        } else if (entry.name.endsWith(".sol") || entry.name === "metadata.json") {
          sourceFiles.push({
            name: path.join(prefix, entry.name),
            content: fs.readFileSync(path.join(dir, entry.name), "utf-8"),
          });
        }
      }
    }
    collectFiles(contractDir);

    // Build the request body
    let body = "";
    // Add address
    body += `--${boundary}\r\nContent-Disposition: form-data; name="address"\r\n\r\n${contract.addr}\r\n`;
    // Add chain
    body += `--${boundary}\r\nContent-Disposition: form-data; name="chain"\r\n\r\n${CHAIN_ID}\r\n`;
    // Add files
    for (const file of sourceFiles) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n${file.content}\r\n`;
    }
    body += `--${boundary}--\r\n`;

    const res = await fetch(`${SOURCIFY_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: body,
    });

    const result = await res.json();
    if (result.result && result.result[0]?.status === "perfect") {
      console.log(`  ✓ Full match — verified on HashScan!`);
    } else if (result.result && result.result[0]?.status === "partial") {
      console.log(`  ~ Partial match — verified (metadata hash differs)`);
    } else {
      console.log(`  ✗ Verification failed:`, JSON.stringify(result).slice(0, 200));
      console.log(`  → Manual verify: https://hashscan.io/mainnet/contract/${contract.id}`);
      console.log(`    Upload files from: ${contractDir}/`);
    }
  } catch (e) {
    console.log(`  ✗ API error: ${e.message}`);
    console.log(`  → Manual verify: https://hashscan.io/mainnet/contract/${contract.id}`);
    console.log(`    Upload files from: ${contractDir}/`);
  }
}

console.log("\n═══ VERIFICATION COMPLETE ═══\n");
console.log("If automated verification failed for any contract, do it manually:");
console.log("1. Go to https://hashscan.io/mainnet/contract/CONTRACT_ID");
console.log("2. Click 'Verify Contract'");
console.log("3. Upload metadata.json from the verification/CONTRACT_NAME/ folder");
console.log("4. Upload all .sol source files from the same folder");
console.log("5. Click Verify\n");
