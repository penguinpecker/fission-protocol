import { useState, useMemo, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { useWallet, shortAddr, fmt, ADDRS, fetchMarketData, fetchPoolData, fetchMarketCount, fetchTokenBalance, fetchUnclaimed, fetchLPBalance, executeSplit, executeBuyPT, executeBuyYT, executeClaimYield, executeRedeemPT, executeMerge, MarketData, PoolData } from "./hooks/useWallet";

// ═══ HEDERA BRAND COLORS ═══
const C = {
  bg: "#0c0a1a", bgCard: "#11151d", bgHover: "#181e2a", bgInput: "#0e1219",
  border: "rgba(130,89,239,0.1)", borderHover: "rgba(130,89,239,0.25)",
  text: "#ffffff", textSec: "#9b9b9d", textDim: "#55565a",
  purple: "#8259EF", purpleLight: "#9778d1", purpleDeep: "#3d2db3",
  teal: "#4aeadc", tealDark: "#33a7b5",
  green: "#00d082", greenLight: "#7bdcb5",
  blue: "#2874fc", blueLight: "#5aa6ff",
  pink: "#ee2c82",
  gradBtn: "linear-gradient(135deg, #8259EF 0%, #4aeadc 100%)",
  gradPurple: "linear-gradient(135deg, #8259EF 0%, #3d2db3 100%)",
};
const font = "'Syne', sans-serif";
const mono = "'Space Mono', monospace";

const mkYield = (base: number, vol: number, n = 60) => Array.from({ length: n }, (_, i) => ({
  d: i, underlying: +(base + Math.sin(i * 0.2) * vol + (Math.random() - 0.5) * vol * 0.6).toFixed(2),
  implied: +(base + 0.8 + Math.sin(i * 0.15) * vol * 0.5 + (Math.random() - 0.5) * vol * 0.4).toFixed(2), fixed: base - 0.7,
}));
const mkPT = (start: number, n = 60) => Array.from({ length: n }, (_, i) => ({
  d: i, price: +Math.min(start + (1 - start) * (i / n) ** 0.55 + (Math.random() - 0.5) * 0.004, 1).toFixed(4), target: 1.0,
}));
const mkMini = (base: number, vol: number, n = 30) => Array.from({ length: n }, (_, i) => ({
  d: i, v: +(base + Math.sin(i * 0.3) * vol + (Math.random() - 0.5) * vol * 0.5).toFixed(2),
}));

// ═══ Static market config (fallback when chain is unreachable) ═══
interface MarketConfig { id: number; sym: string; name: string; protocol: string; tag: string; accent: string; fallbackApy: number; }
const MARKET_CFG: MarketConfig[] = [
  { id: 0, sym: "HBAR-USDC LP", name: "SaucerSwap V2 LP", protocol: "SaucerSwap", tag: "LP", accent: C.teal, fallbackApy: 14.2 },
  { id: 1, sym: "HBARX", name: "Stader Liquid Staking", protocol: "Stader Labs", tag: "LST", accent: C.purple, fallbackApy: 5.4 },
];

interface Strategy { id: "pt" | "yt" | "split"; title: string; subtitle: string; color: string; risk: string; desc: string; details: string[]; }
const STRATEGIES: Strategy[] = [
  { id: "pt", title: "Fixed yield", subtitle: "Buy PT", color: C.teal, risk: "Low", desc: "Lock in guaranteed fixed APY. Buy PT at a discount, redeem 1:1 at maturity.", details: ["Buy PT at discount (e.g. 0.963 SY)", "Redeem 1:1 at maturity", "No rate volatility exposure", "Best for: conservative yield farmers"] },
  { id: "yt", title: "Long yield", subtitle: "Buy YT", color: C.purple, risk: "High", desc: "Leveraged bet on rising rates. Small capital, amplified returns.", details: ["Buy YT for a fraction of underlying", "Earn ALL yield on the full position", "Outsized returns if rates rise", "Best for: yield speculators"] },
  { id: "split", title: "Split SY", subtitle: "Mint PT+YT", color: C.blue, risk: "Medium", desc: "Deposit SY to mint equal PT + YT. Sell one side or LP with both.", details: ["Deposit SY → receive equal PT + YT", "Sell PT for fixed yield exposure", "Sell YT to monetize future yield", "Merge back to SY anytime"] },
];

// ═══ Icons ═══
function FissionLogo({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke="url(#lg)" strokeWidth="1.5" /><circle cx="14" cy="14" r="4" fill={C.purple} /><line x1="14" y1="3" x2="14" y2="25" stroke={C.purple} strokeWidth="0.8" opacity="0.2" /><line x1="3" y1="14" x2="25" y2="14" stroke={C.teal} strokeWidth="0.8" opacity="0.2" /><defs><linearGradient id="lg" x1="3" y1="3" x2="25" y2="25"><stop stopColor={C.purple}/><stop offset="1" stopColor={C.teal}/></linearGradient></defs></svg>;
}
function getIcon(id: string, size = 40) {
  const colors: Record<string, string> = { pt: C.teal, yt: C.purple, split: C.blue };
  const c = colors[id] || C.blue;
  if (id === "pt") return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><path d="M20 4L6 10V18C6 27.1 12.04 35.52 20 38C27.96 35.52 34 27.1 34 18V10L20 4Z" stroke={c} strokeWidth="2" fill={`${c}10`} /><path d="M15 20L18 23L26 15" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (id === "yt") return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><path d="M20 6C20 6 14 12 14 22C14 26 16 30 20 34C24 30 26 26 26 22C26 12 20 6 20 6Z" stroke={c} strokeWidth="2" fill={`${c}10`} /><circle cx="20" cy="20" r="3" fill={c} /></svg>;
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="20" rx="14" ry="6" stroke={c} strokeWidth="1.5" /><ellipse cx="20" cy="20" rx="14" ry="6" stroke={c} strokeWidth="1.5" transform="rotate(60 20 20)" /><ellipse cx="20" cy="20" rx="14" ry="6" stroke={c} strokeWidth="1.5" transform="rotate(120 20 20)" /><circle cx="20" cy="20" r="3" fill={c} /></svg>;
}

const cardStyle = (): React.CSSProperties => ({ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, transition: "all 0.25s ease" });
const btnPrimary: React.CSSProperties = { background: C.gradBtn, color: "#0c0a1a", border: "none", borderRadius: 12, padding: "14px 28px", fontFamily: font, fontWeight: 600, fontSize: 15, cursor: "pointer", width: "100%" };
const btnOutline = (c = C.purple): React.CSSProperties => ({ background: "transparent", color: c, border: `1px solid ${c}40`, borderRadius: 10, padding: "10px 20px", fontFamily: font, fontWeight: 500, fontSize: 14, cursor: "pointer" });
const inputStyle: React.CSSProperties = { background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontFamily: mono, fontSize: 16, padding: "12px 16px", outline: "none", width: "100%" };
const tagStyle = (c: string): React.CSSProperties => ({ background: `${c}15`, color: c, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, fontFamily: font });

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: mono }}>
    <div style={{ color: C.textSec, marginBottom: 4 }}>Day {label}</div>
    {payload.map((p: any, i: number) => <div key={i} style={{ color: p.color }}>{p.dataKey}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{p.dataKey !== 'price' && p.dataKey !== 'target' ? '%' : ''}</div>)}
  </div>;
};

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
    <div style={{ position: "absolute", inset: 0, background: "rgba(12,10,26,0.9)", backdropFilter: "blur(8px)" }} />
    <div onClick={e => e.stopPropagation()} style={{ position: "relative", ...cardStyle(), padding: 28, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontFamily: font, fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.textSec, fontSize: 22, cursor: "pointer" }}>x</button>
      </div>
      {children}
    </div>
  </div>;
}

// ═══ MAIN APP ═══
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

  // ═══ ON-CHAIN STATE ═══
  const [chainMarkets, setChainMarkets] = useState<(MarketData | null)[]>([]);
  const [chainPools, setChainPools] = useState<(PoolData | null)[]>([]);
  const [userBalances, setUserBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Load chain data on mount and every 30s
  const loadChainData = useCallback(async () => {
    try {
      const count = await fetchMarketCount();
      const markets: (MarketData | null)[] = [];
      const pools: (PoolData | null)[] = [];
      for (let i = 0; i < Math.min(count, MARKET_CFG.length); i++) {
        markets.push(await fetchMarketData(i));
        pools.push(await fetchPoolData(i));
      }
      // Fill remaining with null
      while (markets.length < MARKET_CFG.length) { markets.push(null); pools.push(null); }
      setChainMarkets(markets);
      setChainPools(pools);
    } catch (e) { console.error("Chain read failed:", e); }
    setLoading(false);
  }, []);

  const loadUserBalances = useCallback(async () => {
    if (!wallet.address) return;
    const b: Record<string, string> = {};
    for (let i = 0; i < MARKET_CFG.length; i++) {
      const m = chainMarkets[i];
      if (!m) continue;
      b[`sy_${i}`] = await fetchTokenBalance(m.sy, wallet.address);
      b[`pt_${i}`] = await fetchTokenBalance(m.pt, wallet.address);
      b[`yt_${i}`] = await fetchTokenBalance(m.yt, wallet.address);
      b[`lp_${i}`] = await fetchLPBalance(i, wallet.address);
      b[`unclaimed_${i}`] = await fetchUnclaimed(i, wallet.address);
    }
    setUserBalances(b);
  }, [wallet.address, chainMarkets]);

  useEffect(() => { loadChainData(); const iv = setInterval(loadChainData, 30000); return () => clearInterval(iv); }, [loadChainData]);
  useEffect(() => { if (wallet.connected && chainMarkets.length > 0) loadUserBalances(); }, [wallet.connected, chainMarkets, loadUserBalances]);

  // ═══ Derived market data (chain or fallback) ═══
  const getMarketDisplay = (i: number) => {
    const cfg = MARKET_CFG[i];
    const cm = chainMarkets[i];
    const cp = chainPools[i];
    const daysLeft = cm ? Math.max(0, Math.floor((cm.maturity - Date.now() / 1000) / 86400)) : 90;
    const maturityStr = cm ? new Date(cm.maturity * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Jul 10, 2026";
    const tvl = cm ? `$${fmt(parseFloat(cm.totalSYLocked) * 0.1, 0)}` : "$0"; // rough USD estimate
    const poolInit = cp?.initialized ?? false;
    const ptPrice = poolInit ? parseFloat(cp!.ptPrice) : 0.97;
    const impliedApy = poolInit ? parseFloat(cp!.impliedAPY) : cfg.fallbackApy;
    const fixedApy = poolInit ? (((1 / ptPrice - 1) * 365 / daysLeft) * 100) : cfg.fallbackApy - 2;
    const longApy = poolInit ? impliedApy * 2.5 : cfg.fallbackApy * 2;
    return { ...cfg, daysLeft, maturity: maturityStr, tvl, ptPrice, impliedApy, fixedApy: +fixedApy.toFixed(1), longApy: +longApy.toFixed(1), ytPrice: +(1 - ptPrice).toFixed(4), poolInit, underlyingApy: cfg.fallbackApy };
  };

  const market = getMarketDisplay(selMarket);
  const strategy = STRATEGIES.find(s => s.id === selStrategy)!;

  const preview = useMemo(() => {
    const amt = parseFloat(tradeAmt) || 0;
    if (amt === 0) return { out: "0", rate: "0", impact: "0.00" };
    if (selStrategy === "pt") return { out: (amt / market.ptPrice).toFixed(4), rate: market.ptPrice.toFixed(4), impact: (0.15 + amt * 0.02).toFixed(2) };
    if (selStrategy === "yt") return { out: (amt / market.ytPrice).toFixed(2), rate: market.ytPrice.toFixed(4), impact: (0.3 + amt * 0.05).toFixed(2) };
    return { out: amt.toFixed(4), rate: "1.0000", impact: "0.00" };
  }, [tradeAmt, selStrategy, market]);

  // ═══ REAL TRADE EXECUTION ═══
  const handleTrade = async () => {
    if (!wallet.connected) { connect(); return; }
    if (!wallet.signer) return;
    const amt = parseFloat(tradeAmt);
    if (!amt || amt <= 0) return;

    setTxStatus("pending"); setShowTx(true); setTxHash(""); setTxError("");

    try {
      let hash: string | null = null;
      if (selStrategy === "split") {
        hash = await executeSplit(wallet.signer, selMarket, tradeAmt);
      } else if (selStrategy === "pt") {
        if (!market.poolInit) { setTxError("AMM pool not initialized — no liquidity to trade against"); setTxStatus("error"); return; }
        hash = await executeBuyPT(wallet.signer, selMarket, tradeAmt);
      } else if (selStrategy === "yt") {
        if (!market.poolInit) { setTxError("AMM pool not initialized — no liquidity to trade against"); setTxStatus("error"); return; }
        hash = await executeBuyYT(wallet.signer, selMarket, tradeAmt);
      }
      if (hash) { setTxHash(hash); setTxStatus("success"); refreshBalances(); loadUserBalances(); }
      else { setTxError("Transaction reverted — check your SY balance and approvals"); setTxStatus("error"); }
    } catch (e: any) {
      setTxError(e.message || "Unknown error"); setTxStatus("error");
    }
  };

  // ═══ NAV ═══
  const Nav = ({ showBack = false }: { showBack?: boolean }) => (
    <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setPage("landing")}>
          <FissionLogo /><span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Fission</span>
        </div>
        {showBack && <><span style={{ color: C.textDim }}>/</span><span onClick={() => setPage("markets")} style={{ color: C.textSec, fontSize: 14, cursor: "pointer" }}>Markets</span>
          {page === "trade" && <><span style={{ color: C.textDim }}>/</span><span style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{market.sym}</span></>}</>}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {page !== "landing" && <span onClick={() => setPage("markets")} style={{ color: page === "markets" ? C.purple : C.textDim, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Markets</span>}
        {wallet.connected ? (
          <button onClick={disconnect} style={{ ...btnOutline(C.purple), padding: "6px 14px", fontSize: 12 }}><span style={{ color: C.green, marginRight: 6, fontSize: 8 }}>&#9679;</span>{shortAddr(wallet.address)}</button>
        ) : (<button onClick={connect} style={{ ...btnPrimary, width: "auto", padding: "8px 20px", fontSize: 13 }}>Connect</button>)}
      </div>
    </nav>
  );

  // ═══ LANDING ═══
  if (page === "landing") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font }}>
      <Nav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 40px 60px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 20, background: `${C.purple}10`, border: `1px solid ${C.purple}20`, marginBottom: 28 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
          <span style={{ color: C.purple, fontSize: 13, fontWeight: 500 }}>Live on Hedera Mainnet</span>
        </div>
        <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, color: C.text, margin: "0 auto", maxWidth: 700, letterSpacing: -1.5 }}>
          Split yield.<br /><span style={{ background: C.gradBtn, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Trade time.</span>
        </h1>
        <p style={{ color: C.textSec, fontSize: 18, lineHeight: 1.6, maxWidth: 540, margin: "24px auto 40px" }}>Tokenize future yield from SaucerSwap LPs and HBARX staking into tradeable Principal and Yield tokens.</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button onClick={() => setPage("markets")} style={{ ...btnPrimary, width: "auto", padding: "16px 40px", fontSize: 16, borderRadius: 14 }}>Explore markets</button>
          <button onClick={() => window.open("https://github.com/penguinpecker/fission-protocol")} style={{ ...btnOutline(C.textSec), padding: "16px 32px", fontSize: 16, borderRadius: 14 }}>View contracts</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 80, background: C.border, borderRadius: 16, overflow: "hidden" }}>
          {[
            { l: "Markets on-chain", v: loading ? "..." : `${chainMarkets.filter(m => m?.initialized).length}`, s: "Reading from FissionCore" },
            { l: "Market 0 status", v: chainMarkets[0]?.initialized ? "Active" : loading ? "..." : "---", s: chainPools[0]?.initialized ? `Pool: ${fmt(chainPools[0]!.reserveSY, 0)} SY` : "Pool not seeded" },
            { l: "Best fixed yield", v: `${getMarketDisplay(0).fixedApy}%`, s: "HBAR-USDC LP" },
            { l: "Chain", v: "Hedera", s: "Hashgraph consensus" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.bgCard, padding: 28, textAlign: "center" }}>
              <div style={{ color: C.textSec, fontSize: 11, fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2 }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text, fontFamily: mono }}>{s.v}</div>
              <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>{s.s}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 80, maxWidth: 900, margin: "80px auto 0" }}>
          <h2 style={{ fontSize: 28, fontWeight: 600, color: C.text, textAlign: "center", marginBottom: 48 }}>How Fission works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {STRATEGIES.map(s => (
              <div key={s.id} style={{ ...cardStyle(), padding: 28 }}>
                {getIcon(s.id)}
                <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: "16px 0 8px" }}>{s.title}</h3>
                <span style={tagStyle(s.color)}>{s.risk} risk</span>
                <p style={{ color: C.textSec, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "40px 0 60px", borderTop: `1px solid ${C.border}`, marginTop: 80 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, fontSize: 13, color: C.textDim }}>
            {[["FissionCore", "0.0.10429842"], ["FissionAMM", "0.0.10429844"], ["FissionRouter", "0.0.10429846"]].map(([n, id]) => (
              <span key={n}>{n}: <a href={`https://hashscan.io/mainnet/contract/${id}`} target="_blank" style={{ color: C.purple, textDecoration: "none" }}>{id}</a></span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );

  // ═══ MARKETS ═══
  if (page === "markets") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font }}>
      <Nav showBack />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: C.text, marginBottom: 8 }}>Yield markets</h1>
        <p style={{ color: C.textSec, fontSize: 14, marginBottom: 32 }}>Split yield-bearing Hedera DeFi tokens into tradeable Principal and Yield components.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {MARKET_CFG.map((cfg, i) => {
            const m = getMarketDisplay(i);
            const cm = chainMarkets[i];
            const mini = mkMini(m.underlyingApy, m.underlyingApy * 0.3);
            return (
              <div key={i} onClick={() => { setSelMarket(i); setPage("trade"); }} style={{ ...cardStyle(), padding: 0, cursor: "pointer", overflow: "hidden" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${cfg.accent}30`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(130,89,239,0.1)")}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 120px", alignItems: "center", padding: "20px 24px", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${cfg.accent}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: cfg.accent, fontFamily: mono }}>{cfg.tag.charAt(0)}</span>
                    </div>
                    <div><div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{cfg.sym}</div><div style={{ fontSize: 12, color: C.textSec }}>{cfg.protocol} · {m.daysLeft}d</div></div>
                    <span style={tagStyle(cfg.accent)}>{cfg.tag}</span>
                    {cm?.initialized && !m.poolInit && <span style={tagStyle(C.pink)}>No pool</span>}
                    {!cm?.initialized && <span style={tagStyle(C.textDim)}>Pending</span>}
                  </div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Fixed APY</div><div style={{ fontSize: 18, fontWeight: 700, color: C.teal, fontFamily: mono }}>{m.fixedApy}%</div></div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Long yield APY</div><div style={{ fontSize: 18, fontWeight: 700, color: C.purple, fontFamily: mono }}>{m.longApy}%</div></div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Locked</div><div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: mono }}>{cm ? fmt(cm.totalSYLocked, 2) + " SY" : "---"}</div></div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Underlying</div><div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: mono }}>{m.underlyingApy}%</div></div>
                  <div style={{ height: 40 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={mini}><Area type="monotone" dataKey="v" stroke={cfg.accent} fill={`${cfg.accent}15`} strokeWidth={1.5} dot={false} /></AreaChart></ResponsiveContainer></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══ TRADE ═══
  const cm = chainMarkets[selMarket];
  const cp = chainPools[selMarket];
  const YIELD_DATA_M = [mkYield(14.2, 4.5), mkYield(5.4, 1.8)];
  const PT_DATA_M = [mkPT(market.ptPrice), mkPT(0.987)];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font }}>
      <Nav showBack />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `${market.accent}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: market.accent, fontFamily: mono }}>{market.tag.charAt(0)}</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>{market.sym}</h1>
              <span style={tagStyle(market.accent)}>{market.tag}</span>
              {!market.poolInit && <span style={tagStyle(C.pink)}>Pool not initialized</span>}
            </div>
            <div style={{ color: C.textSec, fontSize: 13 }}>{market.name} · Matures {market.maturity} · {market.daysLeft} days left</div>
          </div>
        </div>

        {/* On-chain stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: C.border, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
          {[
            { l: "PT price", v: `$${market.ptPrice.toFixed(4)}`, c: C.text },
            { l: "Fixed APY", v: `${market.fixedApy}%`, c: C.teal },
            { l: "Implied APY", v: market.poolInit ? `${market.impliedApy.toFixed(1)}%` : "---", c: C.text },
            { l: "Long yield APY", v: `${market.longApy}%`, c: C.purple },
            { l: "SY locked", v: cm ? fmt(cm.totalSYLocked, 2) : "0", c: C.text },
          ].map((s, i) => (
            <div key={i} style={{ background: C.bgCard, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: mono }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* User balances row */}
        {wallet.connected && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 24 }}>
            {[
              { l: "Your SY", v: userBalances[`sy_${selMarket}`] || "0" },
              { l: "Your PT", v: userBalances[`pt_${selMarket}`] || "0" },
              { l: "Your YT", v: userBalances[`yt_${selMarket}`] || "0" },
              { l: "Your LP", v: userBalances[`lp_${selMarket}`] || "0" },
              { l: "Unclaimed yield", v: userBalances[`unclaimed_${selMarket}`] || "0" },
            ].map((b, i) => (
              <div key={i} style={{ background: `${C.purple}08`, borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>{b.l}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: mono }}>{fmt(b.v, 4)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
          {/* Charts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ ...cardStyle(), padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>Yield rates</h3>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.textDim }}>
                  <span><span style={{ color: market.accent }}>&#9679;</span> Underlying</span>
                  <span><span style={{ color: C.purple }}>&#9679;</span> Implied</span>
                  <span style={{ color: C.teal }}>&#8212; Fixed</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={YIELD_DATA_M[selMarket]}>
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} tickFormatter={v => v + "%"} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="underlying" stroke={market.accent} fill={`${market.accent}10`} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="implied" stroke={C.purple} strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="fixed" stroke={C.teal} strokeWidth={1} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...cardStyle(), padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 16px" }}>PT price convergence</h3>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={PT_DATA_M[selMarket]}>
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0.94, 1.01]} tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} tickFormatter={v => "$" + v.toFixed(2)} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="price" stroke={C.teal} fill={`${C.teal}10`} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="target" stroke={C.textDim} strokeWidth={1} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trade panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Strategy</div>
              <div style={{ display: "flex", gap: 6 }}>
                {STRATEGIES.map(s => (
                  <button key={s.id} onClick={() => setSelStrategy(s.id)} style={{
                    flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                    background: selStrategy === s.id ? `${s.color}15` : "transparent",
                    border: `1px solid ${selStrategy === s.id ? `${s.color}40` : C.border}`,
                    color: selStrategy === s.id ? s.color : C.textSec, fontFamily: font, fontSize: 13, fontWeight: 500,
                  }}>{s.subtitle}</button>
                ))}
              </div>
              {selStrategy !== "split" && !market.poolInit && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: `${C.pink}08`, border: `1px solid ${C.pink}15` }}>
                  <div style={{ fontSize: 12, color: C.pink, fontWeight: 500 }}>AMM pool not initialized — swaps unavailable</div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Use "Mint PT+YT" (Split) instead, or seed initial liquidity first.</div>
                </div>
              )}
            </div>

            <div style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                {selStrategy === "split" ? "Split SY into PT + YT" : selStrategy === "pt" ? "Buy PT (fixed yield)" : "Buy YT (long yield)"}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.textSec }}>You pay (SY)</span>
                  <span style={{ fontSize: 12, color: C.textDim }}>Balance: {wallet.connected ? fmt(userBalances[`sy_${selMarket}`] || "0") : "---"}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <input type="number" value={tradeAmt} onChange={e => setTradeAmt(e.target.value)} placeholder="0.00" style={inputStyle} />
                  {wallet.connected && userBalances[`sy_${selMarket}`] && (
                    <button onClick={() => setTradeAmt(userBalances[`sy_${selMarket}`] || "0")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: `${C.purple}15`, color: C.purple, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>MAX</button>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.bgInput, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontSize: 16 }}>&#8595;</div>
              </div>
              <div style={{ marginBottom: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>You receive ({selStrategy === "split" ? "PT + YT" : selStrategy === "pt" ? "PT" : "YT"})</div>
                <div style={{ ...inputStyle, background: `${strategy.color}08`, borderColor: `${strategy.color}20`, color: strategy.color, fontWeight: 600 }}>{preview.out}</div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 16 }}>
                {[
                  { l: "Exchange rate", v: `1 SY = ${preview.rate} ${selStrategy === "pt" ? "PT" : selStrategy === "yt" ? "YT" : "PT+YT"}` },
                  { l: "Price impact", v: selStrategy === "split" ? "0%" : `${preview.impact}%` },
                  { l: "Fee", v: selStrategy === "split" ? "None" : "0.3%" },
                  { l: "Source", v: selStrategy === "split" ? "FissionCore.split()" : selStrategy === "pt" ? "Router.buyPT()" : "Router.buyYT()" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 12, color: C.textDim }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: C.textSec, fontFamily: mono }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleTrade} style={{
                ...btnPrimary,
                background: selStrategy === "pt" ? `linear-gradient(135deg, ${C.teal} 0%, ${C.tealDark} 100%)` : selStrategy === "yt" ? C.gradPurple : `linear-gradient(135deg, ${C.blue} 0%, ${C.blueLight} 100%)`,
                opacity: tradeAmt && parseFloat(tradeAmt) > 0 ? 1 : 0.5,
              }}>
                {!wallet.connected ? "Connect wallet" : !tradeAmt || parseFloat(tradeAmt) <= 0 ? "Enter amount" :
                  selStrategy === "split" ? `Split ${tradeAmt} SY` :
                  !market.poolInit ? "Pool not initialized" :
                  selStrategy === "pt" ? `Buy ${preview.out} PT` : `Buy ${preview.out} YT`}
              </button>
            </div>

            {/* User positions */}
            {wallet.connected && (
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Your actions</div>
                {parseFloat(userBalances[`unclaimed_${selMarket}`] || "0") > 0 && (
                  <button onClick={() => wallet.signer && executeClaimYield(wallet.signer, selMarket)} style={{ ...btnOutline(C.green), width: "100%", marginBottom: 8, fontSize: 13 }}>
                    Claim {fmt(userBalances[`unclaimed_${selMarket}`])} yield
                  </button>
                )}
                {parseFloat(userBalances[`pt_${selMarket}`] || "0") > 0 && cm?.isMatured && (
                  <button onClick={() => wallet.signer && executeRedeemPT(wallet.signer, selMarket, userBalances[`pt_${selMarket}`])} style={{ ...btnOutline(C.teal), width: "100%", marginBottom: 8, fontSize: 13 }}>
                    Redeem {fmt(userBalances[`pt_${selMarket}`])} PT (matured)
                  </button>
                )}
                {parseFloat(userBalances[`pt_${selMarket}`] || "0") > 0 && parseFloat(userBalances[`yt_${selMarket}`] || "0") > 0 && (
                  <button onClick={() => wallet.signer && executeMerge(wallet.signer, selMarket, Math.min(parseFloat(userBalances[`pt_${selMarket}`]), parseFloat(userBalances[`yt_${selMarket}`])).toString())} style={{ ...btnOutline(C.blue), width: "100%", fontSize: 13 }}>
                    Merge PT+YT back to SY
                  </button>
                )}
                {!parseFloat(userBalances[`unclaimed_${selMarket}`] || "0") && !parseFloat(userBalances[`pt_${selMarket}`] || "0") && (
                  <div style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: 8 }}>No positions in this market yet</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={showTx} onClose={() => { setShowTx(false); setTxStatus("idle"); }} title="Transaction">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          {txStatus === "pending" && <>
            <div style={{ width: 56, height: 56, border: `3px solid ${C.purple}30`, borderTopColor: C.purple, borderRadius: "50%", margin: "0 auto 20px", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>Confirming transaction</div>
            <div style={{ fontSize: 13, color: C.textSec }}>Waiting for Hedera consensus...</div>
          </>}
          {txStatus === "success" && <>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.green}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 14L12 18L20 10" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>Transaction confirmed</div>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
              {selStrategy === "split" ? `Split ${tradeAmt} SY into PT + YT` : selStrategy === "pt" ? `Bought ${preview.out} PT` : `Bought ${preview.out} YT`}
            </div>
            {txHash && <div style={{ fontSize: 11, color: C.textDim, fontFamily: mono, marginBottom: 16, wordBreak: "break-all" }}>{txHash}</div>}
            <button onClick={() => window.open(`https://hashscan.io/mainnet/transaction/${txHash}`)} style={{ ...btnOutline(C.purple), fontSize: 13 }}>View on HashScan</button>
          </>}
          {txStatus === "error" && <>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.pink}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <span style={{ fontSize: 28, color: C.pink }}>!</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>Transaction failed</div>
            <div style={{ fontSize: 13, color: C.textSec, wordBreak: "break-word" }}>{txError || "Check your balance and try again."}</div>
          </>}
        </div>
      </Modal>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
