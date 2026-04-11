import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";

const MAINNET_RPC = "https://mainnet.hashio.io/api";
const CHAIN_IDS = { testnet: 296, mainnet: 295 };
const TARGET_CHAIN = CHAIN_IDS.mainnet;

export const ADDRS = {
  CORE: "0x00000000000000000000000000000000009f2592",
  AMM: "0x00000000000000000000000000000000009f2594",
  ROUTER: "0x00000000000000000000000000000000009f2596",
  SY_SAUCERSWAP: "0x00000000000000000000000000000000009f2598",
  SY_HBARX: "0x00000000000000000000000000000000009f259a",
  WHBAR: "0x0000000000000000000000000000000000163b5a",
  USDC: "0x000000000000000000000000000000000006f89a",
  HBARX: "0x00000000000000000000000000000000000cba44",
};

export const CORE_ABI = [
  "function split(uint256 marketId, uint256 amount) external",
  "function merge(uint256 marketId, uint256 amount) external",
  "function redeemPT(uint256 marketId, uint256 amount) external",
  "function claimYield(uint256 marketId) external returns (uint256)",
  "function getMarket(uint256 marketId) view returns (tuple(address sy, address pt, address yt, uint256 maturity, uint256 scalarRoot, uint256 totalSYLocked, uint256 yieldIndex, bool initialized))",
  "function isMatured(uint256 marketId) view returns (bool)",
  "function marketCount() view returns (uint256)",
  "function getUnclaimed(uint256 marketId, address user) view returns (uint256)",
];

export const AMM_ABI = [
  "function swapPTForSY(uint256 marketId, uint256 ptIn, uint256 minSYOut) external returns (uint256)",
  "function swapSYForPT(uint256 marketId, uint256 syIn, uint256 minPTOut) external returns (uint256)",
  "function addLiquidity(uint256 marketId, uint256 syAmt, uint256 ptAmt, address receiver) external returns (uint256)",
  "function removeLiquidity(uint256 marketId, uint256 lpAmt) external returns (uint256, uint256)",
  "function getPool(uint256 marketId) view returns (tuple(uint256 reserveSY, uint256 reservePT, uint256 lpSupply, uint256 scalarRoot, uint256 maturity, uint256 feeBps, uint256 totalFees, bool initialized))",
  "function getPTPrice(uint256 marketId) view returns (uint256)",
  "function getImpliedAPY(uint256 marketId) view returns (uint256)",
  "function getLPBalance(uint256 marketId, address user) view returns (uint256)",
  "function quotePTForSY(uint256 marketId, uint256 ptIn) view returns (uint256)",
  "function quoteSYForPT(uint256 marketId, uint256 syIn) view returns (uint256)",
];

export const ROUTER_ABI = [
  "function depositAndSplit(uint256 marketId, uint256 underlyingAmount, uint256 deadline) external returns (uint256, uint256)",
  "function buyPT(uint256 marketId, uint256 syAmount, uint256 minPTOut, uint256 deadline) external returns (uint256)",
  "function buyYT(uint256 marketId, uint256 syAmount, uint256 minYTOut, uint256 deadline) external returns (uint256)",
  "function addLiquidity(uint256 marketId, uint256 syAmt, uint256 ptAmt, uint256 deadline) external returns (uint256)",
  "function redeemAndWithdraw(uint256 marketId, uint256 ptAmount, uint256 deadline) external returns (uint256)",
];

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

export interface WalletState {
  address: string;
  chainId: number;
  connected: boolean;
  connecting: boolean;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: "", chainId: 0, connected: false, connecting: false,
    provider: null, signer: null,
  });
  const [balances, setBalances] = useState<Record<string, string>>({});

  const connect = useCallback(async () => {
    if (!(window as any).ethereum) {
      alert("Install MetaMask or HashPack to connect");
      return;
    }
    setWallet(w => ({ ...w, connecting: true }));
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      if (chainId !== TARGET_CHAIN) {
        try {
          await provider.send("wallet_switchEthereumChain", [
            { chainId: "0x" + TARGET_CHAIN.toString(16) },
          ]);
        } catch (e: any) {
          if (e.code === 4902) {
            await provider.send("wallet_addEthereumChain", [{
              chainId: "0x" + TARGET_CHAIN.toString(16),
              chainName: "Hedera Mainnet",
              nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
              rpcUrls: [MAINNET_RPC],
              blockExplorerUrls: ["https://hashscan.io/mainnet"],
            }]);
          }
        }
      }
      setWallet({ address, chainId, connected: true, connecting: false, provider, signer });
    } catch {
      setWallet(w => ({ ...w, connecting: false }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({ address: "", chainId: 0, connected: false, connecting: false, provider: null, signer: null });
    setBalances({});
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!wallet.provider || !wallet.address) return;
    const b: Record<string, string> = {};
    try {
      const bal = await wallet.provider.getBalance(wallet.address);
      b["HBAR"] = ethers.formatEther(bal);
    } catch { b["HBAR"] = "0"; }
    setBalances(b);
  }, [wallet.provider, wallet.address]);

  useEffect(() => {
    if (wallet.connected) refreshBalances();
  }, [wallet.connected, refreshBalances]);

  return { wallet, balances, connect, disconnect, refreshBalances };
}

export function shortAddr(a: string) { return a ? a.slice(0, 6) + "..." + a.slice(-4) : ""; }
export function fmt(val: string | number, dp = 4): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n) || n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: 2 });
}
