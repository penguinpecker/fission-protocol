import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Fission Protocol with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR");

  // 1. Deploy MathLib
  console.log("\n1. Deploying MathLib...");
  const MathLib = await ethers.getContractFactory("MathLib");
  const mathLib = await MathLib.deploy();
  await mathLib.waitForDeployment();
  const mathAddr = await mathLib.getAddress();
  console.log("   MathLib:", mathAddr);

  // 2. Deploy FissionCore
  console.log("2. Deploying FissionCore...");
  const FissionCore = await ethers.getContractFactory("FissionCore");
  const core = await FissionCore.deploy(deployer.address); // deployer = guardian
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log("   FissionCore:", coreAddr);

  // 3. Deploy FissionAMM
  console.log("3. Deploying FissionAMM...");
  const FissionAMM = await ethers.getContractFactory("FissionAMM", {
    libraries: { MathLib: mathAddr },
  });
  const amm = await FissionAMM.deploy(coreAddr, deployer.address); // deployer = guardian
  await amm.waitForDeployment();
  const ammAddr = await amm.getAddress();
  console.log("   FissionAMM:", ammAddr);

  // 4. Deploy FissionRouter
  console.log("4. Deploying FissionRouter...");
  const FissionRouter = await ethers.getContractFactory("FissionRouter");
  const router = await FissionRouter.deploy(coreAddr, ammAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("   FissionRouter:", routerAddr);

  console.log("\n═══ DEPLOYMENT COMPLETE ═══");
  console.log({
    MathLib: mathAddr,
    FissionCore: coreAddr,
    FissionAMM: ammAddr,
    FissionRouter: routerAddr,
  });

  // Write addresses to file for frontend
  const fs = require("fs");
  const addresses = {
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    MathLib: mathAddr,
    FissionCore: coreAddr,
    FissionAMM: ammAddr,
    FissionRouter: routerAddr,
  };
  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to deployed-addresses.json");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
