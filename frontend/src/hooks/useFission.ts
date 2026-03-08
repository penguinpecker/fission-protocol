import { useAccount, useReadContract, useSendTransaction } from "@starknet-react/core";
import { useCallback } from "react";
import { CONTRACTS, TOKENS, ERC20_ABI, SY_ABI, CORE_ABI, AMM_ABI } from "../contracts";

const MARKET_ID = 0;

export function formatU256(val: any, decimals = 18): string {
  if (!val) return "0";
  try {
    const n = typeof val === "bigint" ? val : BigInt(String(val));
    const divisor = BigInt(10 ** decimals);
    const whole = n / divisor;
    const frac = n % divisor;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fracStr}`;
  } catch { return "0"; }
}

function toU256(amount: string, decimals = 18): { low: string; high: string } {
  try {
    const parts = amount.split(".");
    const whole = parts[0] || "0";
    const frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    const raw = BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac);
    return { low: (raw & ((1n << 128n) - 1n)).toString(), high: (raw >> 128n).toString() };
  } catch {
    return { low: "0", high: "0" };
  }
}

export function useTokenBalance(tokenAddress: string) {
  const { address } = useAccount();
  const { data, isLoading, refetch } = useReadContract({
    address: tokenAddress as any,
    abi: ERC20_ABI,
    functionName: "balance_of",
    args: address ? [address] : undefined,
    enabled: !!address,
    watch: true,
  });
  return { balance: data as bigint | undefined, isLoading, refetch };
}

export function useAllBalances() {
  const xstrk = useTokenBalance(TOKENS.XSTRK);
  const strk = useTokenBalance(TOKENS.STRK);
  const eth = useTokenBalance(TOKENS.ETH);
  const sy = useTokenBalance(CONTRACTS.SY_XSTRK);
  const pt = useTokenBalance(CONTRACTS.PT_XSTRK);
  const yt = useTokenBalance(CONTRACTS.YT_XSTRK);
  return {
    xSTRK: { ...xstrk, formatted: formatU256(xstrk.balance) },
    STRK: { ...strk, formatted: formatU256(strk.balance) },
    ETH: { ...eth, formatted: formatU256(eth.balance) },
    SY: { ...sy, formatted: formatU256(sy.balance) },
    PT: { ...pt, formatted: formatU256(pt.balance) },
    YT: { ...yt, formatted: formatU256(yt.balance) },
    refetchAll: () => { xstrk.refetch(); strk.refetch(); eth.refetch(); sy.refetch(); pt.refetch(); yt.refetch(); },
  };
}

export function useExchangeRate() {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.SY_XSTRK as any,
    abi: SY_ABI,
    functionName: "exchange_rate",
    watch: true,
  });
  return { rate: data as bigint | undefined, isLoading };
}

export function useTotalLocked() {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.FISSION_CORE as any,
    abi: CORE_ABI,
    functionName: "get_total_locked",
    args: [MARKET_ID],
    watch: true,
  });
  return { totalLocked: data as bigint | undefined, isLoading };
}

export function useUnclaimedYield() {
  const { address } = useAccount();
  const { data, refetch } = useReadContract({
    address: CONTRACTS.FISSION_CORE as any,
    abi: CORE_ABI,
    functionName: "get_unclaimed",
    args: address ? [MARKET_ID, address] : undefined,
    enabled: !!address,
    watch: true,
  });
  return { unclaimed: data as bigint | undefined, refetch };
}

export function usePTPrice() {
  const { data } = useReadContract({
    address: CONTRACTS.FISSION_AMM as any,
    abi: AMM_ABI,
    functionName: "get_pt_price",
    args: [MARKET_ID],
    watch: true,
  });
  return data as bigint | undefined;
}

export function useFissionTransactions() {
  const { sendAsync, isPending } = useSendTransaction({} as any);
  const { address } = useAccount();

  const depositToSY = useCallback(async (amount: string) => {
    if (!address) throw new Error("Not connected");
    const u = toU256(amount);
    return sendAsync([
      { contractAddress: TOKENS.XSTRK, entrypoint: "approve", calldata: [CONTRACTS.SY_XSTRK, u.low, u.high] },
      { contractAddress: CONTRACTS.SY_XSTRK, entrypoint: "deposit", calldata: [u.low, u.high] },
    ]);
  }, [address, sendAsync]);

  const split = useCallback(async (amount: string) => {
    if (!address) throw new Error("Not connected");
    const u = toU256(amount);
    return sendAsync([
      { contractAddress: CONTRACTS.SY_XSTRK, entrypoint: "approve", calldata: [CONTRACTS.FISSION_CORE, u.low, u.high] },
      { contractAddress: CONTRACTS.FISSION_CORE, entrypoint: "split", calldata: [String(MARKET_ID), u.low, u.high] },
    ]);
  }, [address, sendAsync]);

  const merge = useCallback(async (amount: string) => {
    if (!address) throw new Error("Not connected");
    const u = toU256(amount);
    return sendAsync([
      { contractAddress: CONTRACTS.FISSION_CORE, entrypoint: "merge", calldata: [String(MARKET_ID), u.low, u.high] },
    ]);
  }, [address, sendAsync]);

  const redeemPT = useCallback(async (amount: string) => {
    if (!address) throw new Error("Not connected");
    const u = toU256(amount);
    return sendAsync([
      { contractAddress: CONTRACTS.FISSION_CORE, entrypoint: "redeem_pt", calldata: [String(MARKET_ID), u.low, u.high] },
    ]);
  }, [address, sendAsync]);

  const claimYield = useCallback(async () => {
    if (!address) throw new Error("Not connected");
    return sendAsync([
      { contractAddress: CONTRACTS.FISSION_CORE, entrypoint: "claim_yield", calldata: [String(MARKET_ID)] },
    ]);
  }, [address, sendAsync]);

  const swapSYForPT = useCallback(async (amount: string, minOut = "0") => {
    if (!address) throw new Error("Not connected");
    const u = toU256(amount);
    const m = toU256(minOut);
    return sendAsync([
      { contractAddress: CONTRACTS.SY_XSTRK, entrypoint: "approve", calldata: [CONTRACTS.FISSION_AMM, u.low, u.high] },
      { contractAddress: CONTRACTS.FISSION_AMM, entrypoint: "swap_sy_for_pt", calldata: [String(MARKET_ID), u.low, u.high, m.low, m.high] },
    ]);
  }, [address, sendAsync]);

  const swapPTForSY = useCallback(async (amount: string, minOut = "0") => {
    if (!address) throw new Error("Not connected");
    const u = toU256(amount);
    const m = toU256(minOut);
    return sendAsync([
      { contractAddress: CONTRACTS.PT_XSTRK, entrypoint: "approve", calldata: [CONTRACTS.FISSION_AMM, u.low, u.high] },
      { contractAddress: CONTRACTS.FISSION_AMM, entrypoint: "swap_pt_for_sy", calldata: [String(MARKET_ID), u.low, u.high, m.low, m.high] },
    ]);
  }, [address, sendAsync]);

  const addLiquidity = useCallback(async (syAmount: string, ptAmount: string) => {
    if (!address) throw new Error("Not connected");
    const sy = toU256(syAmount);
    const pt = toU256(ptAmount);
    return sendAsync([
      { contractAddress: CONTRACTS.SY_XSTRK, entrypoint: "approve", calldata: [CONTRACTS.FISSION_AMM, sy.low, sy.high] },
      { contractAddress: CONTRACTS.PT_XSTRK, entrypoint: "approve", calldata: [CONTRACTS.FISSION_AMM, pt.low, pt.high] },
      { contractAddress: CONTRACTS.FISSION_AMM, entrypoint: "add_liquidity", calldata: [String(MARKET_ID), sy.low, sy.high, pt.low, pt.high] },
    ]);
  }, [address, sendAsync]);

  return { depositToSY, split, merge, redeemPT, claimYield, swapSYForPT, swapPTForSY, addLiquidity, isPending };
}
