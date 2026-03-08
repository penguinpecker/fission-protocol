import { useState, useCallback, useEffect } from "react";
import { hash } from "starknet";

const RPC = "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/BQZCAx-0XGUVdVEvVRi7U";

export const ADDRS = {
  CORE: "0x05cd0b5b58bad5c15b09404797866e1fde74eea86d0b9db6f95f59c9237e45e8",
  AMM: "0x03063b4bee616d11ef15d124fe2a94193a54db577cf00795b8953b54bd5543c6",
  SY: "0x03d7988a09d99faf667e10972bcb67a222e69cbc601cff75f1c4584d28356560",
  PT: "0x031479ec546f1793777615b919fa089d17b937a4228ea816134fa78bfac9d9a2",
  YT: "0x057025e04427eb4d04281acc9d09c09328eb496df13e12e1159ebddd10dd1bc9",
  XSTRK: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

async function rpcCall(token: string, fnName: string, calldata: string[]): Promise<string[]> {
  const sel = hash.getSelectorFromName(fnName);
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "starknet_call", params: [{ contract_address: token, entry_point_selector: sel, calldata }, "latest"] }),
  });
  const json = await res.json();
  if (json.error || !json.result) return [];
  return json.result;
}

async function readBalance(token: string, addr: string): Promise<bigint> {
  for (const fn of ["balance_of", "balanceOf"]) {
    try {
      const r = await rpcCall(token, fn, [addr]);
      if (r.length > 0) return BigInt(r[0]) + ((r.length > 1 ? BigInt(r[1]) : 0n) << 128n);
    } catch { continue; }
  }
  return 0n;
}

function fmt(raw: bigint, dec = 18, dp = 4): string {
  if (raw === 0n) return "0";
  const d = BigInt(10 ** dec);
  const w = raw / d;
  const f = ((raw % d) * BigInt(10 ** dp)) / d;
  return w.toString() + "." + f.toString().padStart(dp, "0");
}

function shortAddr(a: string) { return a ? a.slice(0, 6) + "..." + a.slice(-4) : ""; }

function toU256Calldata(amount: string, decimals = 18): string[] {
  const parts = amount.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  const raw = BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac);
  const low = raw & ((1n << 128n) - 1n);
  const high = raw >> 128n;
  return ["0x" + low.toString(16), "0x" + high.toString(16)];
}

export interface WalletState {
  address: string; shortAddress: string; connected: boolean; starknet: any;
  balances: { xSTRK: string; STRK: string; ETH: string; SY: string; PT: string; YT: string };
  loading: boolean; lastTxHash: string;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: "", shortAddress: "", connected: false, starknet: null,
    balances: { xSTRK: "0", STRK: "0", ETH: "0", SY: "0", PT: "0", YT: "0" },
    loading: false, lastTxHash: "",
  });

  const fetchBalances = useCallback(async (addr: string) => {
    try {
      const [xstrk, strk, eth, sy, pt, yt] = await Promise.all([
        readBalance(ADDRS.XSTRK, addr), readBalance(ADDRS.STRK, addr), readBalance(ADDRS.ETH, addr),
        readBalance(ADDRS.SY, addr), readBalance(ADDRS.PT, addr), readBalance(ADDRS.YT, addr),
      ]);
      setState(s => ({ ...s, balances: { xSTRK: fmt(xstrk), STRK: fmt(strk), ETH: fmt(eth), SY: fmt(sy), PT: fmt(pt), YT: fmt(yt) } }));
    } catch (e) { console.error("Balance fetch error:", e); }
  }, []);

  const connectWallet = useCallback(async (sn: any) => {
    const accounts: string[] = await sn.request({ type: "wallet_requestAccounts" });
    const addr = accounts[0] || "";
    setState(s => ({ ...s, address: addr, shortAddress: shortAddr(addr), connected: true, starknet: sn, loading: false }));
    if (addr) fetchBalances(addr);
  }, [fetchBalances]);

  const doConnect = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const gsn = await import("get-starknet");
      const sn = await gsn.connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
      if (!sn) { setState(s => ({ ...s, loading: false })); return; }
      await connectWallet(sn);
    } catch (e) { console.error("Connect error:", e); setState(s => ({ ...s, loading: false })); }
  }, [connectWallet]);

  const doDisconnect = useCallback(async () => {
    try { const gsn = await import("get-starknet"); await gsn.disconnect({ clearLastWallet: true }); } catch {}
    setState({ address: "", shortAddress: "", connected: false, starknet: null, balances: { xSTRK: "0", STRK: "0", ETH: "0", SY: "0", PT: "0", YT: "0" }, loading: false, lastTxHash: "" });
  }, []);

  // Auto-reconnect
  useEffect(() => {
    (async () => {
      try {
        const gsn = await import("get-starknet");
        const sn = await gsn.connect({ modalMode: "neverAsk" });
        if (sn) await connectWallet(sn);
      } catch {}
    })();
  }, [connectWallet]);

  // Refresh balances every 30s
  useEffect(() => {
    if (!state.connected || !state.address) return;
    const id = setInterval(() => fetchBalances(state.address), 30000);
    return () => clearInterval(id);
  }, [state.connected, state.address, fetchBalances]);

  // ── TRANSACTION: uses wallet_addInvokeTransaction (SNIP wallet API) ──
  // This is the ONLY correct way to send txs through Braavos/ArgentX.
  // Does NOT use account.execute() which requires provider and breaks.
  const sendTx = useCallback(async (calls: { contractAddress: string; entrypoint: string; calldata: string[] }[]): Promise<string> => {
    if (!state.starknet) throw new Error("Not connected");

    // SNIP wallet API format
    const snipCalls = calls.map(c => ({
      contract_address: c.contractAddress,
      entrypoint: c.entrypoint,
      calldata: c.calldata,
    }));

    console.log("Sending tx with calls:", JSON.stringify(snipCalls, null, 2));

    const result: any = await state.starknet.request({
      type: "wallet_addInvokeTransaction",
      params: { calls: snipCalls },
    });

    const txHash = result?.transaction_hash || (typeof result === "string" ? result : "");
    console.log("Tx result:", result, "hash:", txHash);

    if (txHash) {
      setState(s => ({ ...s, lastTxHash: txHash }));
      setTimeout(() => fetchBalances(state.address), 8000);
    }
    return txHash;
  }, [state.starknet, state.address, fetchBalances]);

  // ── Convenience methods ──

  // Deposit xSTRK → SY (approve xSTRK then deposit)
  const depositToSY = useCallback(async (amount: string) => {
    const u = toU256Calldata(amount);
    return sendTx([
      { contractAddress: ADDRS.XSTRK, entrypoint: "approve", calldata: [ADDRS.SY, ...u] },
      { contractAddress: ADDRS.SY, entrypoint: "deposit", calldata: u },
    ]);
  }, [sendTx]);

  // Full flow: xSTRK → deposit SY → split PT+YT (atomic 4-call multicall)
  const depositAndSplit = useCallback(async (amount: string) => {
    const u = toU256Calldata(amount);
    return sendTx([
      { contractAddress: ADDRS.XSTRK, entrypoint: "approve", calldata: [ADDRS.SY, ...u] },
      { contractAddress: ADDRS.SY, entrypoint: "deposit", calldata: u },
      { contractAddress: ADDRS.SY, entrypoint: "approve", calldata: [ADDRS.CORE, ...u] },
      { contractAddress: ADDRS.CORE, entrypoint: "split", calldata: ["0x0", ...u] },
    ]);
  }, [sendTx]);

  // Split SY → PT + YT (requires SY balance)
  const split = useCallback(async (amount: string) => {
    const u = toU256Calldata(amount);
    return sendTx([
      { contractAddress: ADDRS.SY, entrypoint: "approve", calldata: [ADDRS.CORE, ...u] },
      { contractAddress: ADDRS.CORE, entrypoint: "split", calldata: ["0x0", ...u] },
    ]);
  }, [sendTx]);

  // Swap SY → PT via AMM (requires SY balance + AMM liquidity)
  const swapSYForPT = useCallback(async (amount: string) => {
    const u = toU256Calldata(amount);
    return sendTx([
      { contractAddress: ADDRS.SY, entrypoint: "approve", calldata: [ADDRS.AMM, ...u] },
      { contractAddress: ADDRS.AMM, entrypoint: "swap_sy_for_pt", calldata: ["0x0", ...u, "0x0", "0x0"] },
    ]);
  }, [sendTx]);

  // Claim yield
  const claimYield = useCallback(async () => {
    return sendTx([
      { contractAddress: ADDRS.CORE, entrypoint: "claim_yield", calldata: ["0x0"] },
    ]);
  }, [sendTx]);

  return {
    ...state, connect: doConnect, disconnect: doDisconnect, fetchBalances,
    sendTx, depositToSY, depositAndSplit, split, swapSYForPT, claimYield,
  };
}
