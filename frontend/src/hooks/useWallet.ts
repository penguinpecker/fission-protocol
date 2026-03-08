import { useState, useCallback, useEffect } from "react";
import { hash } from "starknet";

const RPC = "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/BQZCAx-0XGUVdVEvVRi7U";

export const ADDRS = {
  CORE: "0x00373485f84822c3dcdfbfc273ab262f1ff529c81d5dfbe7115b3bd7489043d8",
  AMM: "0x0777c8b2e7f0d9ca61a551e3c80f99583829541877af8ce8e2722f94914aa09a",
  SY: "0x047da6255df8fd148894bb3fcae5a224171233b269a282f58fc87f5832c48dd5",
  PT: "0x04281f4bc5d18c466ce802698164df38d98b0606ff0e96811af212e1c7861c39",
  YT: "0x03a3b605a66dbb9753142fe971423e480d61b6503aae8954d81c6344b3250f20",
  XSTRK: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

async function rpcCall(token: string, fnName: string, calldata: string[]): Promise<string[]> {
  const sel = hash.getSelectorFromName(fnName);
  const body = {
    jsonrpc: "2.0", id: 1, method: "starknet_call",
    params: [{ contract_address: token, entry_point_selector: sel, calldata }, "latest"],
  };
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log("RPC result for", fnName, "on", token.slice(0,10), ":", JSON.stringify(json));
  if (json.error || !json.result) return [];
  return json.result;
}

async function readBalance(token: string, addr: string): Promise<bigint> {
  for (const fn of ["balance_of", "balanceOf"]) {
    try {
      const result = await rpcCall(token, fn, [addr]);
      if (result.length > 0) {
        const low = BigInt(result[0]);
        const high = result.length > 1 ? BigInt(result[1]) : 0n;
        return low + (high << 128n);
      }
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

function shortAddr(a: string) {
  return a ? a.slice(0, 6) + "..." + a.slice(-4) : "";
}

export interface WalletState {
  address: string;
  shortAddress: string;
  connected: boolean;
  starknet: any;
  balances: { xSTRK: string; STRK: string; ETH: string; SY: string; PT: string; YT: string };
  loading: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: "", shortAddress: "", connected: false, starknet: null,
    balances: { xSTRK: "0", STRK: "0", ETH: "0", SY: "0", PT: "0", YT: "0" },
    loading: false,
  });

  const fetchBalances = useCallback(async (addr: string) => {
    try {
      const [xstrk, strk, eth, sy, pt, yt] = await Promise.all([
        readBalance(ADDRS.XSTRK, addr), readBalance(ADDRS.STRK, addr), readBalance(ADDRS.ETH, addr),
        readBalance(ADDRS.SY, addr), readBalance(ADDRS.PT, addr), readBalance(ADDRS.YT, addr),
      ]);
      console.log("Raw balances:", { xstrk, strk, eth, sy, pt, yt });
      setState(s => ({ ...s, balances: {
        xSTRK: fmt(xstrk), STRK: fmt(strk), ETH: fmt(eth),
        SY: fmt(sy), PT: fmt(pt), YT: fmt(yt),
      }}));
    } catch (e) { console.error("Balance fetch error:", e); }
  }, []);

  const doConnect = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const gsn = await import("get-starknet");
      const sn = await gsn.connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
      if (!sn) { setState(s => ({ ...s, loading: false })); return; }
      const accounts: string[] = await sn.request({ type: "wallet_requestAccounts" });
      const addr = accounts[0] || "";
      console.log("Connected wallet:", addr);
      setState(s => ({
        ...s, address: addr, shortAddress: shortAddr(addr),
        connected: true, starknet: sn, loading: false,
      }));
      if (addr) fetchBalances(addr);
    } catch (e) {
      console.error("Connect error:", e);
      setState(s => ({ ...s, loading: false }));
    }
  }, [fetchBalances]);

  const doDisconnect = useCallback(async () => {
    try {
      const gsn = await import("get-starknet");
      await gsn.disconnect({ clearLastWallet: true });
    } catch {}
    setState({
      address: "", shortAddress: "", connected: false, starknet: null,
      balances: { xSTRK: "0", STRK: "0", ETH: "0", SY: "0", PT: "0", YT: "0" },
      loading: false,
    });
  }, []);

  useEffect(() => {
    if (!state.connected || !state.address) return;
    const id = setInterval(() => fetchBalances(state.address), 30000);
    return () => clearInterval(id);
  }, [state.connected, state.address, fetchBalances]);

  return { ...state, connect: doConnect, disconnect: doDisconnect, fetchBalances };
}
