import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const HEDERA_TESTNET_RPC = process.env.HEDERA_TESTNET_RPC || "https://testnet.hashio.io/api";
const HEDERA_MAINNET_RPC = process.env.HEDERA_MAINNET_RPC || "https://mainnet.hashio.io/api";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hederaTestnet: {
      url: HEDERA_TESTNET_RPC,
      accounts: [DEPLOYER_KEY],
      chainId: 296,
      timeout: 120000,
    },
    hederaMainnet: {
      url: HEDERA_MAINNET_RPC,
      accounts: [DEPLOYER_KEY],
      chainId: 295,
      timeout: 120000,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
