import { useState, useCallback, useEffect, useRef } from "react";
import { ethers } from "ethers";

const MAINNET_RPC = "https://mainnet.hashio.io/api";
const TARGET_CHAIN = 295;

export const ADDRS = {
  CORE: "0x00000000000000000000000000000000009f4700",
  AMM: "0x00000000000000000000000000000000009f470e",
  ROUTER: "0x00000000000000000000000000000000009f471b",
  SY_SAUCERSWAP: "0x00000000000000000000000000000000009f49a1",
  SY_HBARX: "0x00000000000000000000000000000000009f473a",
  WHBAR: "0x0000000000000000000000000000000000163b5a",
  USDC: "0x000000000000000000000000000000000006f89a",
  HBARX: "0x00000000000000000000000000000000000cba44",
};

const CORE_ABI = [
  "function split(uint256 marketId, uint256 amount) external",
  "function merge(uint256 marketId, uint256 amount) external",
  "function redeemPT(uint256 marketId, uint256 amount) external",
  "function claimYield(uint256 marketId) external returns (uint256)",
  "function getMarket(uint256 marketId) view returns (tuple(address sy, address pt, address yt, uint256 maturity, uint256 scalarRoot, uint256 totalSYLocked, uint256 yieldIndex, bool initialized))",
  "function isMatured(uint256 marketId) view returns (bool)",
  "function marketCount() view returns (uint256)",
  "function getUnclaimed(uint256 marketId, address user) view returns (uint256)",
];

const AMM_ABI = [
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

const ROUTER_ABI = [
  "function buyPT(uint256 marketId, uint256 syAmount, uint256 minPTOut, uint256 deadline) external returns (uint256)",
  "function buyYT(uint256 marketId, uint256 syAmount, uint256 minYTOut, uint256 deadline) external returns (uint256)",
  "function depositAndSplit(uint256 marketId, uint256 underlyingAmount, uint256 deadline) external returns (uint256, uint256)",
  "function redeemAndWithdraw(uint256 marketId, uint256 ptAmount, uint256 deadline) external returns (uint256)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const SY_ABI = [
  "function deposit(address receiver, uint256 amount) external returns (uint256)",
  "function redeem(address receiver, uint256 shares) external returns (uint256)",
  "function exchangeRate() view returns (uint256)",
  "function underlying() view returns (address)",
];

// ═══ Read-only provider for chain queries ═══
const readProvider = new ethers.JsonRpcProvider(MAINNET_RPC, undefined, { batchMaxCount: 1 });
const coreRead = new ethers.Contract(ADDRS.CORE, CORE_ABI, readProvider);
const ammRead = new ethers.Contract(ADDRS.AMM, AMM_ABI, readProvider);

export interface MarketData {
  sy: string; pt: string; yt: string;
  maturity: number; scalarRoot: number;
  totalSYLocked: string; yieldIndex: string;
  initialized: boolean; isMatured: boolean;
}

export interface PoolData {
  reserveSY: string; reservePT: string; lpSupply: string;
  feeBps: number; totalFees: string;
  initialized: boolean; ptPrice: string; impliedAPY: string;
}

export interface WalletState {
  address: string; chainId: number; connected: boolean; connecting: boolean;
  provider: ethers.BrowserProvider | null; signer: ethers.Signer | null;
}

// ═══ READ FUNCTIONS (no wallet needed) ═══

export async function fetchMarketData(marketId: number): Promise<MarketData | null> {
  try {
    const m = await coreRead.getMarket(marketId);
    const matured = await coreRead.isMatured(marketId);
    return {
      sy: m.sy, pt: m.pt, yt: m.yt,
      maturity: Number(m.maturity),
      scalarRoot: Number(m.scalarRoot),
      totalSYLocked: ethers.formatEther(m.totalSYLocked),
      yieldIndex: ethers.formatEther(m.yieldIndex),
      initialized: m.initialized,
      isMatured: matured,
    };
  } catch { return null; }
}

export async function fetchPoolData(marketId: number): Promise<PoolData | null> {
  try {
    const p = await ammRead.getPool(marketId);
    if (!p.initialized) return { reserveSY: "0", reservePT: "0", lpSupply: "0", feeBps: 0, totalFees: "0", initialized: false, ptPrice: "1.0", impliedAPY: "0" };
    const ptPrice = await ammRead.getPTPrice(marketId);
    const apy = await ammRead.getImpliedAPY(marketId);
    return {
      reserveSY: ethers.formatEther(p.reserveSY),
      reservePT: ethers.formatEther(p.reservePT),
      lpSupply: ethers.formatEther(p.lpSupply),
      feeBps: Number(p.feeBps),
      totalFees: ethers.formatEther(p.totalFees),
      initialized: p.initialized,
      ptPrice: ethers.formatEther(ptPrice),
      impliedAPY: (Number(ethers.formatEther(apy)) * 100).toFixed(2),
    };
  } catch { return null; }
}

export async function fetchTokenBalance(token: string, user: string): Promise<string> {
  try {
    const c = new ethers.Contract(token, ERC20_ABI, readProvider);
    const bal = await c.balanceOf(user);
    const dec = await c.decimals().catch(() => 18);
    return ethers.formatUnits(bal, dec);
  } catch { return "0"; }
}

export async function fetchMarketCount(): Promise<number> {
  try { return Number(await coreRead.marketCount()); } catch { return 0; }
}

export async function fetchUnclaimed(marketId: number, user: string): Promise<string> {
  try { return ethers.formatEther(await coreRead.getUnclaimed(marketId, user)); } catch { return "0"; }
}

export async function fetchLPBalance(marketId: number, user: string): Promise<string> {
  try { return ethers.formatEther(await ammRead.getLPBalance(marketId, user)); } catch { return "0"; }
}

// ═══ WRITE FUNCTIONS (need wallet) ═══

export async function approveToken(signer: ethers.Signer, token: string, spender: string, amount: bigint): Promise<boolean> {
  try {
    const c = new ethers.Contract(token, ERC20_ABI, signer);
    const tx = await c.approve(spender, amount);
    await tx.wait();
    return true;
  } catch { return false; }
}

export async function executeSplit(signer: ethers.Signer, marketId: number, amount: string): Promise<string | null> {
  try {
    const core = new ethers.Contract(ADDRS.CORE, CORE_ABI, signer);
    const amt = ethers.parseEther(amount);
    // First approve SY to Core
    const market = await coreRead.getMarket(marketId);
    await approveToken(signer, market.sy, ADDRS.CORE, amt);
    const tx = await core.split(marketId, amt);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e: any) { console.error("Split failed:", e); return null; }
}

export async function executeBuyPT(signer: ethers.Signer, marketId: number, syAmount: string, slippageBps = 100): Promise<string | null> {
  try {
    const router = new ethers.Contract(ADDRS.ROUTER, ROUTER_ABI, signer);
    const amt = ethers.parseEther(syAmount);
    const minOut = amt * BigInt(10000 - slippageBps) / 10000n;
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min
    const market = await coreRead.getMarket(marketId);
    await approveToken(signer, market.sy, ADDRS.ROUTER, amt);
    const tx = await router.buyPT(marketId, amt, minOut, deadline);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e: any) { console.error("BuyPT failed:", e); return null; }
}

export async function executeBuyYT(signer: ethers.Signer, marketId: number, syAmount: string, slippageBps = 300): Promise<string | null> {
  try {
    const router = new ethers.Contract(ADDRS.ROUTER, ROUTER_ABI, signer);
    const amt = ethers.parseEther(syAmount);
    const minOut = amt * BigInt(10000 - slippageBps) / 10000n;
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const market = await coreRead.getMarket(marketId);
    await approveToken(signer, market.sy, ADDRS.ROUTER, amt);
    const tx = await router.buyYT(marketId, amt, minOut, deadline);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e: any) { console.error("BuyYT failed:", e); return null; }
}

export async function executeClaimYield(signer: ethers.Signer, marketId: number): Promise<string | null> {
  try {
    const core = new ethers.Contract(ADDRS.CORE, CORE_ABI, signer);
    const tx = await core.claimYield(marketId);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e: any) { console.error("ClaimYield failed:", e); return null; }
}

export async function executeRedeemPT(signer: ethers.Signer, marketId: number, amount: string): Promise<string | null> {
  try {
    const core = new ethers.Contract(ADDRS.CORE, CORE_ABI, signer);
    const amt = ethers.parseEther(amount);
    const market = await coreRead.getMarket(marketId);
    await approveToken(signer, market.pt, ADDRS.CORE, amt);
    const tx = await core.redeemPT(marketId, amt);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e: any) { console.error("RedeemPT failed:", e); return null; }
}

export async function executeMerge(signer: ethers.Signer, marketId: number, amount: string): Promise<string | null> {
  try {
    const core = new ethers.Contract(ADDRS.CORE, CORE_ABI, signer);
    const amt = ethers.parseEther(amount);
    const market = await coreRead.getMarket(marketId);
    await approveToken(signer, market.pt, ADDRS.CORE, amt);
    await approveToken(signer, market.yt, ADDRS.CORE, amt);
    const tx = await core.merge(marketId, amt);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e: any) { console.error("Merge failed:", e); return null; }
}

// ═══ WALLET HOOK ═══

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: "", chainId: 0, connected: false, connecting: false, provider: null, signer: null,
  });
  const [balances, setBalances] = useState<Record<string, string>>({});

  const connect = useCallback(async () => {
    if (!(window as any).ethereum) { alert("Install MetaMask or HashPack"); return; }
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
          await provider.send("wallet_switchEthereumChain", [{ chainId: "0x" + TARGET_CHAIN.toString(16) }]);
        } catch (e: any) {
          if (e.code === 4902) {
            await provider.send("wallet_addEthereumChain", [{
              chainId: "0x" + TARGET_CHAIN.toString(16), chainName: "Hedera Mainnet",
              nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
              rpcUrls: [MAINNET_RPC], blockExplorerUrls: ["https://hashscan.io/mainnet"],
            }]);
          }
        }
      }
      setWallet({ address, chainId, connected: true, connecting: false, provider, signer });
    } catch { setWallet(w => ({ ...w, connecting: false })); }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({ address: "", chainId: 0, connected: false, connecting: false, provider: null, signer: null });
    setBalances({});
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!wallet.provider || !wallet.address) return;
    const b: Record<string, string> = {};
    try { b["HBAR"] = ethers.formatEther(await wallet.provider.getBalance(wallet.address)); } catch { b["HBAR"] = "0"; }
    setBalances(b);
  }, [wallet.provider, wallet.address]);

  useEffect(() => { if (wallet.connected) refreshBalances(); }, [wallet.connected, refreshBalances]);

  return { wallet, balances, connect, disconnect, refreshBalances };
}

export function shortAddr(a: string) { return a ? a.slice(0, 6) + "..." + a.slice(-4) : ""; }
export function fmt(val: string | number, dp = 4): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n) || n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: Math.min(2, dp) });
}
