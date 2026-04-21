import { useState, useMemo, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import {
  useWallet, shortAddr, fmt, ADDRS,
  fetchMarketData, fetchPoolData, fetchMarketCount,
  fetchTokenBalance, fetchUnclaimed, fetchLPBalance,
  executeSplit, executeBuyPT, executeBuyYT,
  executeClaimYield, executeRedeemPT, executeMerge,
  MarketData, PoolData,
} from "./hooks/useWallet";

// ═══ BLACK / WHITE / SILVER PALETTE ═══
const C = {
  bg: "#09090b", bgCard: "#111113", bgHover: "#18181b",
  bgInput: "#0c0c0e", bgElevated: "#161618",
  border: "rgba(255,255,255,0.06)", borderHover: "rgba(255,255,255,0.12)",
  borderActive: "rgba(255,255,255,0.2)",
  text: "#fafafa", textSec: "#a1a1aa", textDim: "#52525b",
  silver: "#c0c0c8", silverLight: "#d4d4dc", silverDark: "#71717a",
  white: "#ffffff", accent: "#e4e4e7",
  success: "#a1e6a1", error: "#f87171", pink: "#f87171",
  fixed: "#e4e4e7", long: "#a1a1aa", split: "#71717a",
};
const font = "'Outfit', sans-serif";
const mono = "'JetBrains Mono', 'SF Mono', monospace";
const serif = "'Instrument Serif', 'Times New Roman', serif";

// ═══ FISSION ATOM LOGO ═══
function FissionLogo({ size = 30, color = "#ffffff", strokeW }: { size?: number; color?: string; strokeW?: number }) {
  const sw = strokeW || (size > 50 ? 3.2 : size > 24 ? 4.2 : 4.5);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="50" rx="40" ry="15" transform="rotate(-20 50 50)" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray="175" strokeDashoffset="16" />
      <ellipse cx="50" cy="50" rx="40" ry="15" transform="rotate(45 50 50)" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray="175" strokeDashoffset="16" />
      <ellipse cx="50" cy="50" rx="40" ry="15" transform="rotate(110 50 50)" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray="175" strokeDashoffset="16" />
      <circle cx="50" cy="50" r={size > 50 ? 4.5 : 5.5} fill={color} />
    </svg>
  );
}

const mkYield = (base: number, vol: number, n = 60) => Array.from({ length: n }, (_, i) => ({ d: i, underlying: +(base + Math.sin(i * 0.2) * vol + (Math.random() - 0.5) * vol * 0.6).toFixed(2), implied: +(base + 0.8 + Math.sin(i * 0.15) * vol * 0.5 + (Math.random() - 0.5) * vol * 0.4).toFixed(2), fixed: base - 0.7 }));
const mkPT = (start: number, n = 60) => Array.from({ length: n }, (_, i) => ({ d: i, price: +Math.min(start + (1 - start) * (i / n) ** 0.55 + (Math.random() - 0.5) * 0.004, 1).toFixed(4), target: 1.0 }));
const mkMini = (base: number, vol: number, n = 30) => Array.from({ length: n }, (_, i) => ({ d: i, v: +(base + Math.sin(i * 0.3) * vol + (Math.random() - 0.5) * vol * 0.5).toFixed(2) }));

interface MarketConfig { id: number; sym: string; name: string; protocol: string; tag: string; fallbackApy: number; }
const MARKET_CFG: MarketConfig[] = [
  { id: 5, sym: "HBAR-USDC LP", name: "SaucerSwap V2 LP", protocol: "SaucerSwap", tag: "LP", fallbackApy: 14.2 },
  { id: 1, sym: "HBARX", name: "Stader Liquid Staking", protocol: "Stader Labs", tag: "LST", fallbackApy: 5.4 },
];

interface Strategy { id: "pt" | "yt" | "split"; title: string; subtitle: string; risk: string; desc: string; }
const STRATEGIES: Strategy[] = [
  { id: "pt", title: "Fixed yield", subtitle: "Buy PT", risk: "Low", desc: "Lock in guaranteed fixed APY. Buy PT at a discount, redeem 1:1 at maturity." },
  { id: "yt", title: "Long yield", subtitle: "Buy YT", risk: "High", desc: "Leveraged bet on rising rates. Small capital, amplified returns." },
  { id: "split", title: "Split SY", subtitle: "Mint PT+YT", risk: "Medium", desc: "Deposit SY to mint equal PT + YT. Sell one side or LP with both." },
];
const CONTRACTS = [["FissionCore", "0.0.10438400"], ["FissionAMM", "0.0.10438414"], ["FissionRouter", "0.0.10438427"]];

function StrategyIcon({ id, size = 36 }: { id: string; size?: number }) {
  const c = C.silverLight;
  if (id === "pt") return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><path d="M20 4L6 10V18C6 27.1 12.04 35.52 20 38C27.96 35.52 34 27.1 34 18V10L20 4Z" stroke={c} strokeWidth="1.5" /><path d="M15 20L18 23L26 15" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (id === "yt") return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><path d="M20 6C20 6 14 12 14 22C14 26 16 30 20 34C24 30 26 26 26 22C26 12 20 6 20 6Z" stroke={c} strokeWidth="1.5" /><circle cx="20" cy="20" r="2.5" fill={c} /></svg>;
  return <FissionLogo size={size} color={c} />;
}

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (<div style={{ background: C.bgCard, border: `1px solid ${C.borderHover}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: mono }}>
    <div style={{ color: C.textDim, marginBottom: 4 }}>Day {label}</div>
    {payload.map((p: any, i: number) => <div key={i} style={{ color: p.color }}>{p.dataKey}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}{p.dataKey !== "price" && p.dataKey !== "target" ? "%" : ""}</div>)}
  </div>);
};

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (<div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }} />
    <div onClick={e => e.stopPropagation()} style={{ position: "relative", background: C.bgCard, borderRadius: 16, border: `1px solid ${C.borderHover}`, padding: 28, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, color: C.text, margin: 0, fontStyle: "italic" }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>
      {children}
    </div>
  </div>);
}

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{background:${C.bg}}::selection{background:rgba(255,255,255,0.15)}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}.card-hover{transition:all .3s ease}.card-hover:hover{border-color:rgba(255,255,255,0.12)!important;transform:translateY(-1px)}.market-row{transition:all .25s ease}.market-row:hover{border-color:rgba(255,255,255,0.15)!important;background:${C.bgHover}!important}.strat-btn{transition:all .2s ease}.strat-btn:hover{border-color:rgba(255,255,255,0.2)!important;background:rgba(255,255,255,0.04)!important}.trade-btn{transition:all .15s ease}.trade-btn:hover{opacity:.88!important}.action-btn{transition:all .2s ease}.action-btn:hover{background:rgba(255,255,255,0.06)!important;border-color:rgba(255,255,255,0.2)!important}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}input:focus{border-color:rgba(255,255,255,0.2)!important}`;

type Page = "landing" | "markets" | "trade";

export default function App() {
  const { wallet, balances, connect, disconnect, refreshBalances } = useWallet();
  const [page, setPage] = useState<Page>("landing");
  const [selMarket, setSelMarket] = useState(0);
  const [selStrategy, setSelStrategy] = useState<"pt" | "yt" | "split">("pt");
  const [tradeAmt, setTradeAmt] = useState("");
  const [showTx, setShowTx] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState("");
  const [chainMarkets, setChainMarkets] = useState<(MarketData | null)[]>([]);
  const [chainPools, setChainPools] = useState<(PoolData | null)[]>([]);
  const [userBalances, setUserBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadChainData = useCallback(async () => {
    try {
      const count = await fetchMarketCount();
      const markets: (MarketData | null)[] = []; const pools: (PoolData | null)[] = [];
      for (let i = 0; i < MARKET_CFG.length; i++) { const mid = MARKET_CFG[i].id; if (mid < count) { markets.push(await fetchMarketData(mid)); pools.push(await fetchPoolData(mid)); } else { markets.push(null); pools.push(null); } }
      setChainMarkets(markets); setChainPools(pools);
    } catch (e) { console.error("Chain read failed:", e); }
    setLoading(false);
  }, []);

  const loadUserBalances = useCallback(async () => {
    if (!wallet.address) return;
    const b: Record<string, string> = {};
    for (let i = 0; i < MARKET_CFG.length; i++) {
      const m = chainMarkets[i]; if (!m) continue;
      const mid = MARKET_CFG[i].id;
      b[`sy_${i}`] = await fetchTokenBalance(m.sy, wallet.address);
      b[`pt_${i}`] = await fetchTokenBalance(m.pt, wallet.address);
      b[`yt_${i}`] = await fetchTokenBalance(m.yt, wallet.address);
      b[`lp_${i}`] = await fetchLPBalance(mid, wallet.address);
      b[`unclaimed_${i}`] = await fetchUnclaimed(mid, wallet.address);
    }
    setUserBalances(b);
  }, [wallet.address, chainMarkets]);

  useEffect(() => { loadChainData(); const iv = setInterval(loadChainData, 30000); return () => clearInterval(iv); }, [loadChainData]);
  useEffect(() => { if (wallet.connected && chainMarkets.length > 0) loadUserBalances(); }, [wallet.connected, chainMarkets, loadUserBalances]);

  const getMarketDisplay = (i: number) => {
    const cfg = MARKET_CFG[i]; const cm = chainMarkets[i]; const cp = chainPools[i];
    const daysLeft = cm ? Math.max(0, Math.floor((cm.maturity - Date.now() / 1000) / 86400)) : 90;
    const maturityStr = cm ? new Date(cm.maturity * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Jul 10, 2026";
    const poolInit = cp?.initialized ?? false;
    const ptPrice = poolInit ? parseFloat(cp!.ptPrice) : 0.97;
    const impliedApy = poolInit ? parseFloat(cp!.impliedAPY) : cfg.fallbackApy;
    const fixedApy = poolInit ? (((1 / ptPrice - 1) * 365 / daysLeft) * 100) : cfg.fallbackApy - 2;
    const longApy = poolInit ? impliedApy * 2.5 : cfg.fallbackApy * 2;
    return { ...cfg, daysLeft, maturity: maturityStr, ptPrice, impliedApy, fixedApy: +fixedApy.toFixed(1), longApy: +longApy.toFixed(1), ytPrice: +(1 - ptPrice).toFixed(4), poolInit, underlyingApy: cfg.fallbackApy, isMatured: cm?.isMatured ?? false };
  };

  const market = getMarketDisplay(selMarket);
  const marketId = MARKET_CFG[selMarket].id; // actual on-chain market ID
  const strategy = STRATEGIES.find(s => s.id === selStrategy)!;
  const preview = useMemo(() => {
    const amt = parseFloat(tradeAmt) || 0;
    if (!amt) return { out: "0", rate: "0", impact: "0.00" };
    if (selStrategy === "pt") return { out: (amt / market.ptPrice).toFixed(4), rate: market.ptPrice.toFixed(4), impact: (0.15 + amt * 0.02).toFixed(2) };
    if (selStrategy === "yt") return { out: (amt / market.ytPrice).toFixed(2), rate: market.ytPrice.toFixed(4), impact: (0.3 + amt * 0.05).toFixed(2) };
    return { out: amt.toFixed(4), rate: "1.0000", impact: "0.00" };
  }, [tradeAmt, selStrategy, market]);

  const handleTrade = async () => {
    if (!wallet.connected) { connect(); return; } if (!wallet.signer) return;
    const amt = parseFloat(tradeAmt); if (!amt || amt <= 0) return;
    setTxStatus("pending"); setShowTx(true); setTxHash(""); setTxError("");
    try {
      let hash: string | null = null;
      if (selStrategy === "split") { hash = await executeSplit(wallet.signer, marketId, tradeAmt); }
      else if (selStrategy === "pt") { if (!market.poolInit) { setTxError("AMM pool not initialized"); setTxStatus("error"); return; } hash = await executeBuyPT(wallet.signer, marketId, tradeAmt); }
      else if (selStrategy === "yt") { if (!market.poolInit) { setTxError("AMM pool not initialized"); setTxStatus("error"); return; } hash = await executeBuyYT(wallet.signer, marketId, tradeAmt); }
      if (hash) { setTxHash(hash); setTxStatus("success"); refreshBalances(); loadUserBalances(); }
      else { setTxError("Transaction reverted — check your SY balance and approvals"); setTxStatus("error"); }
    } catch (e: any) { setTxError(e.message || "Unknown error"); setTxStatus("error"); }
  };
  const handleClaimYield = async () => { if (!wallet.signer) return; setTxStatus("pending"); setShowTx(true); setTxHash(""); setTxError(""); try { const h = await executeClaimYield(wallet.signer, marketId); if (h) { setTxHash(h); setTxStatus("success"); loadUserBalances(); } else { setTxError("Claim failed"); setTxStatus("error"); } } catch (e: any) { setTxError(e.message); setTxStatus("error"); } };
  const handleRedeemPT = async () => { if (!wallet.signer) return; setTxStatus("pending"); setShowTx(true); setTxHash(""); setTxError(""); try { const h = await executeRedeemPT(wallet.signer, marketId, userBalances[`pt_${selMarket}`]); if (h) { setTxHash(h); setTxStatus("success"); loadUserBalances(); } else { setTxError("Redeem failed"); setTxStatus("error"); } } catch (e: any) { setTxError(e.message); setTxStatus("error"); } };
  const handleMerge = async () => { if (!wallet.signer) return; const a = Math.min(parseFloat(userBalances[`pt_${selMarket}`] || "0"), parseFloat(userBalances[`yt_${selMarket}`] || "0")).toString(); setTxStatus("pending"); setShowTx(true); setTxHash(""); setTxError(""); try { const h = await executeMerge(wallet.signer, marketId, a); if (h) { setTxHash(h); setTxStatus("success"); loadUserBalances(); } else { setTxError("Merge failed"); setTxStatus("error"); } } catch (e: any) { setTxError(e.message); setTxStatus("error"); } };

  const Nav = ({ showBack = false }: { showBack?: boolean }) => (
    <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 32px", borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(12px)", background: "rgba(9,9,11,0.8)", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }} onClick={() => setPage("landing")}><FissionLogo size={26} /><span style={{ fontSize: 17, fontWeight: 600, color: C.text, fontFamily: font, letterSpacing: -0.3 }}>Fission</span></div>
        {showBack && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: C.textDim, fontSize: 13 }}>/</span><span onClick={() => setPage("markets")} style={{ color: C.textSec, fontSize: 13, cursor: "pointer", fontFamily: font }}>Markets</span>{page === "trade" && <><span style={{ color: C.textDim, fontSize: 13 }}>/</span><span style={{ color: C.text, fontSize: 13, fontWeight: 500, fontFamily: font }}>{market.sym}</span></>}</div>}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {page !== "landing" && <span onClick={() => setPage("markets")} style={{ color: page === "markets" ? C.white : C.textDim, fontSize: 13, cursor: "pointer", fontWeight: 500, fontFamily: font }}>Markets</span>}
        {wallet.connected ? <button onClick={disconnect} style={{ background: "rgba(255,255,255,0.04)", color: C.text, border: `1px solid ${C.borderHover}`, borderRadius: 10, padding: "6px 14px", fontFamily: mono, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: C.success }} />{shortAddr(wallet.address)}</button>
        : <button className="trade-btn" onClick={connect} style={{ background: C.white, color: C.bg, border: "none", borderRadius: 10, padding: "8px 20px", fontFamily: font, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Connect</button>}
      </div>
    </nav>
  );

  // ═══ LANDING ═══
  if (page === "landing") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text }}><style>{CSS}</style><Nav />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.025, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 40px 60px", textAlign: "center" }}>
          <div style={{ marginBottom: 40, animation: "fadeUp 0.7s ease-out" }}><div style={{ display: "inline-block", position: "relative" }}><FissionLogo size={88} color="rgba(255,255,255,0.9)" strokeW={3.2} /><div style={{ position: "absolute", inset: -30, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)", pointerEvents: "none" }} /></div></div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 20, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, marginBottom: 28, animation: "fadeUp 0.7s ease-out 0.08s both" }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.success, animation: "pulse 2s infinite" }} /><span style={{ color: C.textSec, fontSize: 12, fontWeight: 500, letterSpacing: 0.5 }}>Live on Hedera Mainnet</span></div>
          <h1 style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.05, color: C.text, margin: "0 auto", maxWidth: 700, letterSpacing: -2, fontFamily: font, animation: "fadeUp 0.7s ease-out 0.14s both" }}>Split yield.<br /><span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, background: "linear-gradient(135deg, #ffffff 0%, #71717a 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Trade time.</span></h1>
          <p style={{ color: C.textSec, fontSize: 17, lineHeight: 1.65, maxWidth: 500, margin: "26px auto 40px", fontWeight: 300, animation: "fadeUp 0.7s ease-out 0.2s both" }}>Tokenize future yield from SaucerSwap LPs and HBARX staking into tradeable Principal and Yield tokens.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", animation: "fadeUp 0.7s ease-out 0.26s both" }}><button className="trade-btn" onClick={() => setPage("markets")} style={{ background: C.white, color: C.bg, border: "none", borderRadius: 12, padding: "15px 36px", fontFamily: font, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Explore markets</button><button onClick={() => window.open("https://github.com/penguinpecker/fission-protocol")} style={{ background: "transparent", color: C.textSec, border: `1px solid ${C.borderHover}`, borderRadius: 12, padding: "15px 28px", fontFamily: font, fontWeight: 500, fontSize: 15, cursor: "pointer" }}>View contracts</button></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 80, background: C.border, borderRadius: 16, overflow: "hidden", animation: "fadeUp 0.7s ease-out 0.35s both" }}>
            {[{ l: "Markets on-chain", v: loading ? "..." : `${chainMarkets.filter(m => m?.initialized).length}`, s: "Reading from FissionCore" }, { l: "Market 0 status", v: chainMarkets[0]?.initialized ? "Active" : loading ? "..." : "---", s: chainPools[0]?.initialized ? `Pool: ${fmt(chainPools[0]!.reserveSY, 0)} SY` : "Pool not seeded" }, { l: "Best fixed yield", v: `${getMarketDisplay(0).fixedApy}%`, s: "HBAR-USDC LP" }, { l: "Network", v: "Hedera", s: "Hashgraph consensus" }].map((s, i) => (
              <div key={i} style={{ background: C.bgCard, padding: "26px 20px", textAlign: "center" }}><div style={{ color: C.textDim, fontSize: 10, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 2 }}>{s.l}</div><div style={{ fontSize: 26, fontWeight: 600, color: C.text, fontFamily: mono, letterSpacing: -1 }}>{s.v}</div><div style={{ color: C.textDim, fontSize: 11, marginTop: 8 }}>{s.s}</div></div>
            ))}
          </div>
          <div style={{ marginTop: 96, animation: "fadeUp 0.7s ease-out 0.45s both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 56 }}><div style={{ height: 1, width: 40, background: C.border }} /><h2 style={{ fontSize: 12, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 3 }}>How it works</h2><div style={{ height: 1, width: 40, background: C.border }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {STRATEGIES.map(s => (<div key={s.id} className="card-hover" style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, textAlign: "left", cursor: "default" }}><div style={{ marginBottom: 20, opacity: 0.6 }}><StrategyIcon id={s.id} /></div><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><h3 style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{s.title}</h3><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: C.textSec, fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.risk}</span></div><p style={{ color: C.textSec, fontSize: 14, lineHeight: 1.6, fontWeight: 300 }}>{s.desc}</p></div>))}
            </div>
          </div>
          <div style={{ padding: "48px 0 60px", borderTop: `1px solid ${C.border}`, marginTop: 96 }}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 16 }}><FissionLogo size={14} color={C.textDim} /><span style={{ fontSize: 12, color: C.textDim }}>Fission Protocol</span></div>
            <div style={{ display: "flex", justifyContent: "center", gap: 28, fontSize: 11, color: C.textDim, fontFamily: mono }}>{CONTRACTS.map(([n, id]) => <span key={n}>{n}: <a href={`https://hashscan.io/mainnet/contract/${id}`} target="_blank" rel="noreferrer" style={{ color: C.silverDark, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>{id}</a></span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ═══ MARKETS ═══
  if (page === "markets") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text }}><style>{CSS}</style><Nav showBack />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 40 }}><h1 style={{ fontSize: 32, fontWeight: 300, color: C.text, marginBottom: 8, letterSpacing: -1 }}>Yield <span style={{ fontFamily: serif, fontStyle: "italic" }}>markets</span></h1><p style={{ color: C.textDim, fontSize: 14, fontWeight: 300 }}>Split yield-bearing Hedera DeFi tokens into tradeable Principal and Yield components.</p></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MARKET_CFG.map((cfg, i) => { const m = getMarketDisplay(i); const cm = chainMarkets[i]; const mini = mkMini(m.underlyingApy, m.underlyingApy * 0.3); return (
            <div key={i} className="market-row" onClick={() => { setSelMarket(i); setPage("trade"); }} style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, cursor: "pointer", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1fr 1fr 110px", alignItems: "center", padding: "18px 24px", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}><FissionLogo size={22} color={C.silverLight} /></div>
                  <div><div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{cfg.sym}</div><div style={{ fontSize: 12, color: C.textDim }}>{cfg.protocol} · {m.daysLeft}d</div></div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: C.textSec, fontFamily: mono, letterSpacing: 0.5 }}>{cfg.tag}</span>
                  {cm?.initialized && !m.poolInit && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(248,113,113,0.08)", color: C.error, fontFamily: mono }}>No pool</span>}
                  {!cm?.initialized && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.03)", color: C.textDim, fontFamily: mono }}>Pending</span>}
                </div>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Fixed APY</div><div style={{ fontSize: 18, fontWeight: 700, color: C.white, fontFamily: mono }}>{m.fixedApy}%</div></div>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Long yield</div><div style={{ fontSize: 18, fontWeight: 700, color: C.silver, fontFamily: mono }}>{m.longApy}%</div></div>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Locked</div><div style={{ fontSize: 15, fontWeight: 600, color: C.textSec, fontFamily: mono }}>{cm ? fmt(cm.totalSYLocked, 2) + " SY" : "---"}</div></div>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Underlying</div><div style={{ fontSize: 15, fontWeight: 600, color: C.textSec, fontFamily: mono }}>{m.underlyingApy}%</div></div>
                <div style={{ height: 36 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={mini}><Area type="monotone" dataKey="v" stroke={C.silverDark} fill="rgba(255,255,255,0.03)" strokeWidth={1.5} dot={false} /></AreaChart></ResponsiveContainer></div>
              </div>
            </div>); })}
        </div>
      </div>
    </div>
  );

  // ═══ TRADE ═══
  const cm = chainMarkets[selMarket]; const cp = chainPools[selMarket];
  const YIELD_DATA_M = [mkYield(14.2, 4.5), mkYield(5.4, 1.8)];
  const PT_DATA_M = [mkPT(market.ptPrice), mkPT(0.987)];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text }}><style>{CSS}</style><Nav showBack />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}><FissionLogo size={28} color={C.silverLight} /></div>
          <div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><h1 style={{ fontSize: 24, fontWeight: 600, color: C.text, margin: 0, letterSpacing: -0.5 }}>{market.sym}</h1><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: C.textSec, fontFamily: mono }}>{market.tag}</span>{!market.poolInit && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(248,113,113,0.08)", color: C.error, fontFamily: mono }}>Pool not initialized</span>}</div><div style={{ color: C.textDim, fontSize: 13 }}>{market.name} · Matures {market.maturity} · {market.daysLeft} days left</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: C.border, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
          {[{ l: "PT price", v: `$${market.ptPrice.toFixed(4)}`, c: C.text }, { l: "Fixed APY", v: `${market.fixedApy}%`, c: C.white }, { l: "Implied APY", v: market.poolInit ? `${market.impliedApy.toFixed(1)}%` : "---", c: C.textSec }, { l: "Long yield APY", v: `${market.longApy}%`, c: C.silver }, { l: "SY locked", v: cm ? fmt(cm.totalSYLocked, 2) : "0", c: C.textSec }].map((s, i) => (
            <div key={i} style={{ background: C.bgCard, padding: "16px 20px" }}><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{s.l}</div><div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: mono, letterSpacing: -0.5 }}>{s.v}</div></div>
          ))}
        </div>
        {wallet.connected && (<div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 24 }}>
          {[{ l: "Your SY", v: userBalances[`sy_${selMarket}`] || "0" }, { l: "Your PT", v: userBalances[`pt_${selMarket}`] || "0" }, { l: "Your YT", v: userBalances[`yt_${selMarket}`] || "0" }, { l: "Your LP", v: userBalances[`lp_${selMarket}`] || "0" }, { l: "Unclaimed yield", v: userBalances[`unclaimed_${selMarket}`] || "0" }].map((b, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{b.l}</div><div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: mono }}>{fmt(b.v, 4)}</div></div>
          ))}</div>)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card-hover" style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><h3 style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Yield rates</h3><div style={{ display: "flex", gap: 16, fontSize: 11, color: C.textDim }}><span><span style={{ color: C.silverLight }}>●</span> Underlying</span><span><span style={{ color: C.silverDark }}>●</span> Implied</span><span>┄ Fixed</span></div></div>
              <ResponsiveContainer width="100%" height={200}><ComposedChart data={YIELD_DATA_M[selMarket]}><XAxis dataKey="d" tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v + "%"} /><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="underlying" stroke={C.silverLight} fill="rgba(255,255,255,0.03)" strokeWidth={1.5} dot={false} /><Line type="monotone" dataKey="implied" stroke={C.silverDark} strokeWidth={1.5} dot={false} /><Line type="monotone" dataKey="fixed" stroke={C.textDim} strokeWidth={1} strokeDasharray="4 4" dot={false} /></ComposedChart></ResponsiveContainer>
            </div>
            <div className="card-hover" style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>PT price convergence</h3>
              <ResponsiveContainer width="100%" height={180}><ComposedChart data={PT_DATA_M[selMarket]}><XAxis dataKey="d" tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} /><YAxis domain={[0.94, 1.01]} tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} tickFormatter={(v: number) => "$" + v.toFixed(2)} /><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="price" stroke={C.white} fill="rgba(255,255,255,0.04)" strokeWidth={1.5} dot={false} /><Line type="monotone" dataKey="target" stroke={C.textDim} strokeWidth={1} strokeDasharray="4 4" dot={false} /></ComposedChart></ResponsiveContainer>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18 }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>Strategy</div>
              <div style={{ display: "flex", gap: 4 }}>{STRATEGIES.map(s => (<button key={s.id} className="strat-btn" onClick={() => setSelStrategy(s.id)} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: selStrategy === s.id ? "rgba(255,255,255,0.06)" : "transparent", border: `1px solid ${selStrategy === s.id ? "rgba(255,255,255,0.15)" : C.border}`, color: selStrategy === s.id ? C.white : C.textDim, fontFamily: font, fontSize: 13, fontWeight: 500 }}>{s.subtitle}</button>))}</div>
              {selStrategy !== "split" && !market.poolInit && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)" }}><div style={{ fontSize: 12, color: C.error, fontWeight: 500 }}>AMM pool not initialized — swaps unavailable</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Use "Mint PT+YT" (Split) instead, or seed initial liquidity first.</div></div>}
            </div>
            <div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18 }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 14, textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>{selStrategy === "split" ? "Split SY into PT + YT" : selStrategy === "pt" ? "Buy PT — Fixed yield" : "Buy YT — Long yield"}</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 12, color: C.textSec }}>You pay (SY)</span><span style={{ fontSize: 12, color: C.textDim }}>Balance: {wallet.connected ? fmt(userBalances[`sy_${selMarket}`] || "0") : "---"}</span></div>
                <div style={{ position: "relative" }}>
                  <input type="number" value={tradeAmt} onChange={e => setTradeAmt(e.target.value)} placeholder="0.00" style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontFamily: mono, fontSize: 16, padding: "13px 16px", outline: "none", width: "100%", transition: "border-color 0.2s" }} />
                  {wallet.connected && userBalances[`sy_${selMarket}`] && <button onClick={() => setTradeAmt(userBalances[`sy_${selMarket}`] || "0")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.04)", color: C.textSec, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: mono }}>MAX</button>}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: C.bgInput, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 14 }}>↓</div></div>
              <div style={{ marginBottom: 14, marginTop: 6 }}><div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>You receive ({selStrategy === "split" ? "PT + YT" : selStrategy === "pt" ? "PT" : "YT"})</div><div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: mono, fontSize: 16, padding: "13px 16px", fontWeight: 500 }}>{preview.out}</div></div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 14 }}>
                {[{ l: "Exchange rate", v: `1 SY = ${preview.rate} ${selStrategy === "pt" ? "PT" : selStrategy === "yt" ? "YT" : "PT+YT"}` }, { l: "Price impact", v: selStrategy === "split" ? "0%" : `${preview.impact}%` }, { l: "Fee", v: selStrategy === "split" ? "None" : "0.3%" }, { l: "Source", v: selStrategy === "split" ? "FissionCore.split()" : selStrategy === "pt" ? "Router.buyPT()" : "Router.buyYT()" }].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span style={{ fontSize: 11, color: C.textDim }}>{r.l}</span><span style={{ fontSize: 11, color: C.textSec, fontFamily: mono }}>{r.v}</span></div>
                ))}
              </div>
              <button className="trade-btn" onClick={handleTrade} style={{ background: C.white, color: C.bg, border: "none", borderRadius: 10, padding: "14px 28px", fontFamily: font, fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%", opacity: tradeAmt && parseFloat(tradeAmt) > 0 ? 1 : 0.4 }}>
                {!wallet.connected ? "Connect wallet" : !tradeAmt || parseFloat(tradeAmt) <= 0 ? "Enter amount" : selStrategy === "split" ? `Split ${tradeAmt} SY` : !market.poolInit ? "Pool not initialized" : selStrategy === "pt" ? `Buy ${preview.out} PT` : `Buy ${preview.out} YT`}
              </button>
            </div>
            {wallet.connected && (<div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: 16 }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>Your actions</div>
              {parseFloat(userBalances[`unclaimed_${selMarket}`] || "0") > 0 && <button className="action-btn" onClick={handleClaimYield} style={{ background: "rgba(161,230,161,0.04)", color: C.success, border: "1px solid rgba(161,230,161,0.12)", borderRadius: 10, padding: "10px 16px", fontFamily: font, fontWeight: 500, fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 8 }}>Claim {fmt(userBalances[`unclaimed_${selMarket}`])} yield</button>}
              {parseFloat(userBalances[`pt_${selMarket}`] || "0") > 0 && market.isMatured && <button className="action-btn" onClick={handleRedeemPT} style={{ background: "rgba(255,255,255,0.02)", color: C.white, border: `1px solid ${C.borderHover}`, borderRadius: 10, padding: "10px 16px", fontFamily: font, fontWeight: 500, fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 8 }}>Redeem {fmt(userBalances[`pt_${selMarket}`])} PT (matured)</button>}
              {parseFloat(userBalances[`pt_${selMarket}`] || "0") > 0 && parseFloat(userBalances[`yt_${selMarket}`] || "0") > 0 && <button className="action-btn" onClick={handleMerge} style={{ background: "rgba(255,255,255,0.02)", color: C.silver, border: `1px solid ${C.borderHover}`, borderRadius: 10, padding: "10px 16px", fontFamily: font, fontWeight: 500, fontSize: 13, cursor: "pointer", width: "100%" }}>Merge PT+YT back to SY</button>}
              {!parseFloat(userBalances[`unclaimed_${selMarket}`] || "0") && !parseFloat(userBalances[`pt_${selMarket}`] || "0") && <div style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: 8 }}>No positions in this market yet</div>}
            </div>)}
          </div>
        </div>
      </div>
      <Modal open={showTx} onClose={() => { setShowTx(false); setTxStatus("idle"); }} title="Transaction">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          {txStatus === "pending" && <><div style={{ width: 48, height: 48, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: C.white, borderRadius: "50%", margin: "0 auto 20px", animation: "spin 1s linear infinite" }} /><div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 8 }}>Confirming transaction</div><div style={{ fontSize: 13, color: C.textDim }}>Waiting for Hedera consensus...</div></>}
          {txStatus === "success" && <><div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(161,230,161,0.08)", border: "1px solid rgba(161,230,161,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><svg width="24" height="24" viewBox="0 0 28 28" fill="none"><path d="M8 14L12 18L20 10" stroke={C.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div><div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 8 }}>Transaction confirmed</div><div style={{ fontSize: 13, color: C.textDim, marginBottom: 4 }}>{selStrategy === "split" ? `Split ${tradeAmt} SY into PT + YT` : selStrategy === "pt" ? `Bought ${preview.out} PT` : `Bought ${preview.out} YT`}</div>{txHash && <div style={{ fontSize: 11, color: C.textDim, fontFamily: mono, marginBottom: 16, wordBreak: "break-all" }}>{txHash}</div>}{txHash && <button onClick={() => window.open(`https://hashscan.io/mainnet/transaction/${txHash}`)} style={{ background: "transparent", color: C.textSec, border: `1px solid ${C.borderHover}`, borderRadius: 8, padding: "8px 16px", fontFamily: font, fontSize: 13, cursor: "pointer" }}>View on HashScan</button>}</>}
          {txStatus === "error" && <><div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><span style={{ fontSize: 24, color: C.error }}>!</span></div><div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 8 }}>Transaction failed</div><div style={{ fontSize: 13, color: C.textSec, wordBreak: "break-word" }}>{txError || "Check your balance and try again."}</div></>}
        </div>
      </Modal>
    </div>
  );
}
