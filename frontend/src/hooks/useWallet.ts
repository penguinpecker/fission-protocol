import { useState, useCallback, useEffect } from "react";
import { connect, disconnect } from "get-starknet";
import { RpcProvider, Contract, type AccountInterface } from "starknet";

const RPC_URL = "https://starknet-mainnet.public.blastapi.io";
const provider = new RpcProvider({ nodeUrl: RPC_URL });

const ADDRS = {
  CORE: "0x00373485f84822c3dcdfbfc273ab262f1ff529c81d5dfbe7115b3bd7489043d8",
  AMM: "0x0777c8b2e7f0d9ca61a551e3c80f99583829541877af8ce8e2722f94914aa09a",
  SY: "0x047da6255df8fd148894bb3fcae5a224171233b269a282f58fc87f5832c48dd5",
  PT: "0x04281f4bc5d18c466ce802698164df38d98b0606ff0e96811af212e1c7861c39",
  YT: "0x03a3b605a66dbb9753142fe971423e480d61b6503aae8954d81c6344b3250f20",
  XSTRK: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

export { ADDRS };

const ERC20_ABI = [
  { name: "balance_of", type: "function", inputs: [{ name: "account", type: "felt" }], outputs: [{ name: "balance", type: "Uint256" }], stateMutability: "view" },
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "felt" }, { name: "amount", type: "Uint256" }], outputs: [{ name: "success", type: "felt" }] },
] as const;

function fmt(raw: bigint, dec = 18, dp = 4): string {
  const d = BigInt(10 ** dec);
  const w = raw / d;
  const f = ((raw % d) * BigInt(10 ** dp)) / d;
  return `${w}.${f.toString().padStart(dp, "0")}`;
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export interface WalletState {
  address: string;
  shortAddress: string;
  connected: boolean;
  account: AccountInterface | null;
  balances: {
    xSTRK: string; STRK: string; ETH: string;
    SY: string; PT: string; YT: string;
  };
  loading: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: "", shortAddress: "", connected: false, account: null,
    balances: { xSTRK: "0", STRK: "0", ETH: "0", SY: "0", PT: "0", YT: "0" },
    loading: false,
  });

  const fetchBalances = useCallback(async (addr: string) => {
    try {
      const read = async (token: string) => {
        const c = new Contract(ERC20_ABI as any, token, provider);
        const res = await c.balance_of(addr);
        return BigInt(res.toString());
      };
      const [xstrk, strk, eth, sy, pt, yt] = await Promise.all([
        read(ADDRS.XSTRK), read(ADDRS.STRK), read(ADDRS.ETH),
        read(ADDRS.SY), read(ADDRS.PT), read(ADDRS.YT),
      ]);
      setState(s => ({
        ...s,
        balances: {
          xSTRK: fmt(xstrk), STRK: fmt(strk), ETH: fmt(eth),
          SY: fmt(sy), PT: fmt(pt), YT: fmt(yt),
        },
      }));
    } catch (e) {
      console.error("Balance fetch error:", e);
    }
  }, []);

  const doConnect = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const starknet = await connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
      if (!starknet) { setState(s => ({ ...s, loading: false })); return; }
      await starknet.enable();
      const addr = starknet.selectedAddress || "";
      setState(s => ({
        ...s, address: addr, shortAddress: shortAddr(addr),
        connected: true, account: starknet.account as any, loading: false,
      }));
      fetchBalances(addr);
    } catch (e) {
      console.error("Connect error:", e);
      setState(s => ({ ...s, loading: false }));
    }
  }, [fetchBalances]);

  const doDisconnect = useCallback(async () => {
    await disconnect();
    setState({
      address: "", shortAddress: "", connected: false, account: null,
      balances: { xSTRK: "0", STRK: "0", ETH: "0", SY: "0", PT: "0", YT: "0" },
      loading: false,
    });
  }, []);

  // Auto-refresh balances every 30s when connected
  useEffect(() => {
    if (!state.connected || !state.address) return;
    const id = setInterval(() => fetchBalances(state.address), 30000);
    return () => clearInterval(id);
  }, [state.connected, state.address, fetchBalances]);

  return { ...state, connect: doConnect, disconnect: doDisconnect, fetchBalances };
}
