import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  const addrs = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));

  console.log("Setting up Fission markets...\n");

  const core = await ethers.getContractAt("FissionCore", addrs.FissionCore);

  // ── Deploy SY adapters ──
  // For testnet: deploy mock SY tokens. For mainnet: point to real SaucerSwap/HBARX/Bonzo

  // 1. SY-SaucerSwapLP (HBAR-USDC pool)
  console.log("Deploying SY-SaucerSwapLP...");
  const SY_SS = await ethers.getContractFactory("SY_SaucerSwapLP");
  const sySS = await SY_SS.deploy(
    "Fission SY-SaucerSwap HBAR/USDC",
    "fSY-SS-HBAR-USDC",
    process.env.SAUCERSWAP_HBAR_USDC_POOL || deployer.address, // mock on testnet
    process.env.SAUCERSWAP_ROUTER || deployer.address
  );
  await sySS.waitForDeployment();
  const sySSAddr = await sySS.getAddress();
  console.log("  SY-SaucerSwapLP:", sySSAddr);

  // 2. SY-HBARX
  console.log("Deploying SY-HBARX...");
  const SY_HX = await ethers.getContractFactory("SY_HBARX");
  const syHX = await SY_HX.deploy(
    process.env.HBARX_TOKEN || deployer.address,
    process.env.STADER_CONTRACT || deployer.address
  );
  await syHX.waitForDeployment();
  const syHXAddr = await syHX.getAddress();
  console.log("  SY-HBARX:", syHXAddr);

  // 3. SY-BonzoLend (USDC lending)
  console.log("Deploying SY-BonzoLend...");
  const SY_BZ = await ethers.getContractFactory("SY_BonzoLend");
  const syBZ = await SY_BZ.deploy(
    "Fission SY-Bonzo USDC",
    "fSY-bUSDC",
    process.env.BONZO_BUSDC || deployer.address,
    process.env.BONZO_POOL || deployer.address
  );
  await syBZ.waitForDeployment();
  const syBZAddr = await syBZ.getAddress();
  console.log("  SY-BonzoLend:", syBZAddr);

  // ── Create markets ──
  const NINETY_DAYS = 90 * 24 * 60 * 60;
  const maturity = Math.floor(Date.now() / 1000) + NINETY_DAYS;
  const SCALAR_ROOT = 100; // tuning param

  console.log("\nCreating Market 0: SaucerSwap HBAR-USDC LP...");
  const tx0 = await core.createMarket(sySSAddr, maturity, SCALAR_ROOT);
  await tx0.wait();
  console.log("  Market 0 created (maturity:", new Date(maturity * 1000).toISOString(), ")");

  console.log("Creating Market 1: HBARX Staking...");
  const tx1 = await core.createMarket(syHXAddr, maturity, 150); // higher scalar = less sensitive
  await tx1.wait();
  console.log("  Market 1 created");

  console.log("Creating Market 2: Bonzo USDC Lending...");
  const tx2 = await core.createMarket(syBZAddr, maturity, 80);
  await tx2.wait();
  console.log("  Market 2 created");

  // Save full deployment info
  const fullAddrs = {
    ...addrs,
    SY_SaucerSwapLP: sySSAddr,
    SY_HBARX: syHXAddr,
    SY_BonzoLend: syBZAddr,
    markets: [
      { id: 0, name: "SaucerSwap HBAR-USDC LP", sy: sySSAddr, maturity },
      { id: 1, name: "HBARX Staking", sy: syHXAddr, maturity },
      { id: 2, name: "Bonzo USDC Lending", sy: syBZAddr, maturity },
    ],
  };
  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(fullAddrs, null, 2));
  console.log("\n═══ MARKETS SETUP COMPLETE ═══");
  console.log(JSON.stringify(fullAddrs.markets, null, 2));
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
