import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { useWallet, shortAddr, fmt, ADDRS } from "./hooks/useWallet";

// ═══ HEDERA BRAND COLORS (from hedera.com) ═══
const C = {
  bg: "#0c0a1a",       bgCard: "#11151d",     bgHover: "#181e2a",    bgInput: "#0e1219",
  border: "rgba(130,89,239,0.1)",  borderHover: "rgba(130,89,239,0.25)",
  text: "#ffffff",      textSec: "#9b9b9d",    textDim: "#55565a",
  purple: "#8259EF",    purpleLight: "#9778d1", purpleDeep: "#3d2db3",
  teal: "#4aeadc",      tealDark: "#33a7b5",
  green: "#00d082",     greenLight: "#7bdcb5",
  blue: "#2874fc",      blueLight: "#5aa6ff",
  pink: "#ee2c82",
  gradHero: "linear-gradient(135deg, #0c0a1a 0%, #201a72 50%, #0c0a1a 100%)",
  gradBtn: "linear-gradient(135deg, #8259EF 0%, #4aeadc 100%)",
  gradPurple: "linear-gradient(135deg, #8259EF 0%, #3d2db3 100%)",
};
const font = "'Syne', sans-serif";
const mono = "'Space Mono', monospace";

// ═══ Chart data ═══
const mkYield = (base: number, vol: number, n = 60) => Array.from({ length: n }, (_, i) => ({
  d: i,
  underlying: +(base + Math.sin(i * 0.2) * vol + (Math.random() - 0.5) * vol * 0.6).toFixed(2),
  implied: +(base + 0.8 + Math.sin(i * 0.15) * vol * 0.5 + (Math.random() - 0.5) * vol * 0.4).toFixed(2),
  fixed: base - 0.7,
}));
const mkPT = (start: number, n = 60) => Array.from({ length: n }, (_, i) => ({
  d: i,
  price: +Math.min(start + (1 - start) * (i / n) ** 0.55 + (Math.random() - 0.5) * 0.004, 1).toFixed(4),
  target: 1.0,
}));
const mkMini = (base: number, vol: number, n = 30) => Array.from({ length: n }, (_, i) => ({
  d: i, v: +(base + Math.sin(i * 0.3) * vol + (Math.random() - 0.5) * vol * 0.5).toFixed(2),
}));

const YIELD_DATA = [mkYield(14.2, 4.5), mkYield(5.4, 1.8)];
const PT_DATA = [mkPT(0.963), mkPT(0.987)];

// ═══ Markets ═══
interface Market {
  id: number; sym: string; name: string; protocol: string; maturity: string; daysLeft: number;
  tvl: string; vol: string; underlyingApy: number; fixedApy: number; longApy: number;
  impliedApy: number; ptPrice: number; ytPrice: number; tag: string; accent: string;
}
const MARKETS: Market[] = [
  { id: 0, sym: "HBAR-USDC LP", name: "SaucerSwap V2 LP", protocol: "SaucerSwap", maturity: "Jul 10, 2026", daysLeft: 90, tvl: "$1.8M", vol: "$142K", underlyingApy: 14.2, fixedApy: 11.8, longApy: 28.6, impliedApy: 13.1, ptPrice: 0.963, ytPrice: 0.037, tag: "LP", accent: C.teal },
  { id: 1, sym: "HBARX", name: "Stader Liquid Staking", protocol: "Stader Labs", maturity: "Jul 10, 2026", daysLeft: 90, tvl: "$920K", vol: "$58K", underlyingApy: 5.4, fixedApy: 4.9, longApy: 12.1, impliedApy: 5.8, ptPrice: 0.987, ytPrice: 0.013, tag: "LST", accent: C.purple },
];

interface Strategy {
  id: "pt" | "yt" | "lp"; title: string; subtitle: string; color: string;
  risk: string; desc: string; details: string[];
}
const STRATEGIES: Strategy[] = [
  { id: "pt", title: "Fixed yield", subtitle: "Buy PT", color: C.teal, risk: "Low",
    desc: "Lock in guaranteed fixed APY. Buy PT at a discount, redeem 1:1 at maturity.",
    details: ["Buy PT at discount (e.g. 0.963 SY)", "Redeem 1:1 at maturity for guaranteed profit", "No exposure to rate volatility", "Best for: conservative yield farmers"] },
  { id: "yt", title: "Long yield", subtitle: "Buy YT", color: C.purple, risk: "High",
    desc: "Leveraged bet on rising rates. Small capital, amplified returns if rates increase.",
    details: ["Buy YT for a fraction of underlying", "Earn ALL yield on the full position", "If rates rise — outsized returns (up to 30x)", "Best for: yield speculators"] },
  { id: "lp", title: "Provide liquidity", subtitle: "Add LP", color: C.blue, risk: "Medium",
    desc: "Provide SY + PT to earn 0.3% swap fees. Minimal IL at maturity due to time-decay curve.",
    details: ["Deposit SY + PT into AMM pool", "Earn 0.3% on every swap", "Near-zero impermanent loss at maturity", "Remove liquidity directly from AMM anytime"] },
];

// ═══ Icons ═══
function IconShield({ size = 40, color = C.teal }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><path d="M20 4L6 10V18C6 27.1 12.04 35.52 20 38C27.96 35.52 34 27.1 34 18V10L20 4Z" stroke={color} strokeWidth="2" fill={`${color}10`} /><path d="M15 20L18 23L26 15" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function IconRocket({ size = 40, color = C.purple }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><path d="M20 6C20 6 14 12 14 22C14 26 16 30 20 34C24 30 26 26 26 22C26 12 20 6 20 6Z" stroke={color} strokeWidth="2" fill={`${color}10`} /><circle cx="20" cy="20" r="3" fill={color} /><path d="M14 22C10 22 8 26 8 26L14 24" stroke={color} strokeWidth="1.5" /><path d="M26 22C30 22 32 26 32 26L26 24" stroke={color} strokeWidth="1.5" /></svg>;
}
function IconAtom({ size = 40, color = C.blue }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="20" rx="14" ry="6" stroke={color} strokeWidth="1.5" /><ellipse cx="20" cy="20" rx="14" ry="6" stroke={color} strokeWidth="1.5" transform="rotate(60 20 20)" /><ellipse cx="20" cy="20" rx="14" ry="6" stroke={color} strokeWidth="1.5" transform="rotate(120 20 20)" /><circle cx="20" cy="20" r="3" fill={color} /></svg>;
}
function FissionLogo({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke="url(#lg)" strokeWidth="1.5" /><circle cx="14" cy="14" r="4" fill={C.purple} /><line x1="14" y1="3" x2="14" y2="25" stroke={C.purple} strokeWidth="0.8" opacity="0.2" /><line x1="3" y1="14" x2="25" y2="14" stroke={C.teal} strokeWidth="0.8" opacity="0.2" /><defs><linearGradient id="lg" x1="3" y1="3" x2="25" y2="25"><stop stopColor={C.purple}/><stop offset="1" stopColor={C.teal}/></linearGradient></defs></svg>;
}
function getIcon(id: string, size = 40) {
  if (id === "pt") return <IconShield size={size} color={C.teal} />;
  if (id === "yt") return <IconRocket size={size} color={C.purple} />;
  return <IconAtom size={size} color={C.blue} />;
}

// ═══ Shared styles ═══
const cardStyle = (): React.CSSProperties => ({ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, transition: "all 0.25s ease" });
const btnPrimary: React.CSSProperties = { background: C.gradBtn, color: "#0c0a1a", border: "none", borderRadius: 12, padding: "14px 28px", fontFamily: font, fontWeight: 600, fontSize: 15, cursor: "pointer", width: "100%" };
const btnOutline = (c = C.purple): React.CSSProperties => ({ background: "transparent", color: c, border: `1px solid ${c}40`, borderRadius: 10, padding: "10px 20px", fontFamily: font, fontWeight: 500, fontSize: 14, cursor: "pointer" });
const inputStyle: React.CSSProperties = { background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontFamily: mono, fontSize: 16, padding: "12px 16px", outline: "none", width: "100%" };
const tagStyle = (c: string): React.CSSProperties => ({ background: `${c}15`, color: c, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, fontFamily: font });
const ChartTooltip = ({ active, payload, label }: any) => {
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
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.textSec, fontSize: 22, cursor: "pointer", padding: 4 }}>x</button>
      </div>
      {children}
    </div>
  </div>;
}

// ═══ MAIN APP ═══
type Page = "landing" | "markets" | "trade";

export default function App() {
  const { wallet, balances, connect, disconnect } = useWallet();
  const [page, setPage] = useState<Page>("landing");
  const [selMarket, setSelMarket] = useState(0);
  const [selStrategy, setSelStrategy] = useState<"pt" | "yt" | "lp">("pt");
  const [tradeAmt, setTradeAmt] = useState("");
  const [showTx, setShowTx] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  const market = MARKETS[selMarket];
  const strategy = STRATEGIES.find(s => s.id === selStrategy)!;

  const preview = useMemo(() => {
    const amt = parseFloat(tradeAmt) || 0;
    if (amt === 0) return { out: "0", rate: "0", impact: "0.00" };
    if (selStrategy === "pt") return { out: (amt / market.ptPrice).toFixed(4), rate: market.ptPrice.toFixed(4), impact: (0.15 + amt * 0.02).toFixed(2) };
    if (selStrategy === "yt") return { out: (amt / market.ytPrice).toFixed(2), rate: market.ytPrice.toFixed(4), impact: (0.3 + amt * 0.05).toFixed(2) };
    return { out: amt.toFixed(4), rate: "1.0000", impact: "0.00" };
  }, [tradeAmt, selStrategy, market]);

  const handleTrade = () => {
    if (!wallet.connected) { connect(); return; }
    setTxStatus("pending"); setShowTx(true);
    setTimeout(() => setTxStatus("success"), 2500);
  };

  // ═══ NAV BAR (shared) ═══
  const Nav = ({ showBack = false }: { showBack?: boolean }) => (
    <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setPage("landing")}>
          <FissionLogo size={28} />
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>Fission</span>
        </div>
        {showBack && <>
          <span style={{ color: C.textDim }}>/</span>
          <span onClick={() => setPage("markets")} style={{ color: C.textSec, fontSize: 14, cursor: "pointer" }}>Markets</span>
          {page === "trade" && <><span style={{ color: C.textDim }}>/</span><span style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{market.sym}</span></>}
        </>}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {page !== "landing" && <span onClick={() => setPage("markets")} style={{ color: page === "markets" ? C.purple : C.textDim, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Markets</span>}
        {wallet.connected ? (
          <button onClick={disconnect} style={{ ...btnOutline(C.purple), padding: "6px 14px", fontSize: 12 }}>
            <span style={{ color: C.green, marginRight: 6, fontSize: 8 }}>&#9679;</span>{shortAddr(wallet.address)}
          </button>
        ) : (
          <button onClick={connect} style={{ ...btnPrimary, width: "auto", padding: "8px 20px", fontSize: 13 }}>Connect</button>
        )}
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
        <p style={{ color: C.textSec, fontSize: 18, lineHeight: 1.6, maxWidth: 540, margin: "24px auto 40px" }}>
          Tokenize future yield from SaucerSwap LPs and HBARX staking into tradeable Principal and Yield tokens.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setPage("markets")} style={{ ...btnPrimary, width: "auto", padding: "16px 40px", fontSize: 16, borderRadius: 14 }}>Explore markets</button>
          <button onClick={() => window.open("https://github.com/penguinpecker/fission-protocol", "_blank")} style={{ ...btnOutline(C.textSec), padding: "16px 32px", fontSize: 16, borderRadius: 14 }}>View contracts</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 80, background: C.border, borderRadius: 16, overflow: "hidden" }}>
          {[
            { label: "Total value locked", value: "$2.72M", sub: "SaucerSwap + HBARX" },
            { label: "Markets", value: "2", sub: "SaucerSwap LP, HBARX" },
            { label: "Best fixed yield", value: "11.8%", sub: "HBAR-USDC LP" },
            { label: "Chain", value: "Hedera", sub: "Hashgraph consensus" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.bgCard, padding: 28, textAlign: "center" }}>
              <div style={{ color: C.textSec, fontSize: 11, fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text, fontFamily: mono }}>{s.value}</div>
              <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 80, textAlign: "left", maxWidth: 900, margin: "80px auto 0" }}>
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
        <div style={{ margin: "80px auto", maxWidth: 900 }}>
          <h2 style={{ fontSize: 28, fontWeight: 600, color: C.text, textAlign: "center", marginBottom: 40 }}>Why Hedera</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[
              { icon: "~$0.001", label: "Per transaction", sub: "Fixed USD-pegged fees" },
              { icon: "3-5s", label: "Finality", sub: "Deterministic, not probabilistic" },
              { icon: "0", label: "MEV / front-running", sub: "Fair ordering by default" },
              { icon: "aBFT", label: "Security", sub: "Hashgraph consensus" },
            ].map((a, i) => (
              <div key={i} style={{ ...cardStyle(), padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, background: C.gradBtn, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: mono }}>{a.icon}</div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 500, marginTop: 8 }}>{a.label}</div>
                <div style={{ color: C.textDim, fontSize: 11, marginTop: 4 }}>{a.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "40px 0 60px", borderTop: `1px solid ${C.border}`, marginTop: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, fontSize: 13, color: C.textDim }}>
            <span>FissionCore: <a href="https://hashscan.io/mainnet/contract/0.0.10429842" target="_blank" style={{ color: C.purple, textDecoration: "none" }}>0.0.10429842</a></span>
            <span>FissionAMM: <a href="https://hashscan.io/mainnet/contract/0.0.10429844" target="_blank" style={{ color: C.purple, textDecoration: "none" }}>0.0.10429844</a></span>
            <span>FissionRouter: <a href="https://hashscan.io/mainnet/contract/0.0.10429846" target="_blank" style={{ color: C.purple, textDecoration: "none" }}>0.0.10429846</a></span>
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
          {MARKETS.map((m, i) => {
            const mini = mkMini(m.underlyingApy, m.underlyingApy * 0.3);
            return (
              <div key={m.id} onClick={() => { setSelMarket(i); setPage("trade"); }} style={{ ...cardStyle(), padding: 0, cursor: "pointer", overflow: "hidden" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${m.accent}30`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border.replace(")", "").split(",").slice(0, 3).join(",") + ",0.1)"; }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 120px", alignItems: "center", padding: "20px 24px", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${m.accent}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: m.accent, fontFamily: mono }}>{m.tag.charAt(0)}</span>
                    </div>
                    <div><div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{m.sym}</div><div style={{ fontSize: 12, color: C.textSec }}>{m.protocol} · {m.daysLeft}d</div></div>
                    <span style={tagStyle(m.accent)}>{m.tag}</span>
                  </div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Fixed APY</div><div style={{ fontSize: 18, fontWeight: 700, color: C.teal, fontFamily: mono }}>{m.fixedApy}%</div></div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Long yield APY</div><div style={{ fontSize: 18, fontWeight: 700, color: C.purple, fontFamily: mono }}>{m.longApy}%</div></div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>TVL</div><div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: mono }}>{m.tvl}</div></div>
                  <div><div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>Underlying</div><div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: mono }}>{m.underlyingApy}%</div></div>
                  <div style={{ height: 40 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={mini}><Area type="monotone" dataKey="v" stroke={m.accent} fill={`${m.accent}15`} strokeWidth={1.5} dot={false} /></AreaChart></ResponsiveContainer></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══ TRADE ═══
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
            </div>
            <div style={{ color: C.textSec, fontSize: 13 }}>{market.name} · Matures {market.maturity} · {market.daysLeft} days left</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: C.border, borderRadius: 14, overflow: "hidden", marginBottom: 28 }}>
          {[
            { l: "PT price", v: `$${market.ptPrice}`, c: C.text },
            { l: "Fixed APY", v: `${market.fixedApy}%`, c: C.teal },
            { l: "Implied APY", v: `${market.impliedApy}%`, c: C.text },
            { l: "Long yield APY", v: `${market.longApy}%`, c: C.purple },
            { l: "TVL", v: market.tvl, c: C.text },
          ].map((s, i) => (
            <div key={i} style={{ background: C.bgCard, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: mono }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ ...cardStyle(), padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>Yield rates</h3>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.textDim }}>
                  <span><span style={{ color: market.accent }}>&#9679;</span> Underlying</span>
                  <span><span style={{ color: C.purple }}>&#9679;</span> Implied</span>
                  <span style={{ color: C.teal }}>&#8212; Fixed</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={YIELD_DATA[selMarket]}>
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} tickFormatter={v => v + "%"} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="underlying" stroke={market.accent} fill={`${market.accent}10`} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="implied" stroke={C.purple} strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="fixed" stroke={C.teal} strokeWidth={1} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...cardStyle(), padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>PT price convergence</h3>
                <div style={{ fontSize: 11, color: C.textDim }}><span style={{ color: C.teal }}>&#9679;</span> PT price &nbsp; <span style={{ color: C.textDim }}>&#8212;</span> Par ($1.00)</div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={PT_DATA[selMarket]}>
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0.94, 1.01]} tick={{ fontSize: 10, fill: C.textDim }} axisLine={false} tickLine={false} tickFormatter={v => "$" + v.toFixed(2)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="price" stroke={C.teal} fill={`${C.teal}10`} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="target" stroke={C.textDim} strokeWidth={1} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Strategy</div>
              <div style={{ display: "flex", gap: 6 }}>
                {STRATEGIES.map(s => (
                  <button key={s.id} onClick={() => setSelStrategy(s.id)}
                    style={{ flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s",
                      background: selStrategy === s.id ? `${s.color}15` : "transparent",
                      border: `1px solid ${selStrategy === s.id ? `${s.color}40` : C.border}`,
                      color: selStrategy === s.id ? s.color : C.textSec,
                      fontFamily: font, fontSize: 13, fontWeight: 500 }}>
                    {s.subtitle}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: `${strategy.color}08`, border: `1px solid ${strategy.color}12` }}>
                <div style={{ fontSize: 12, color: strategy.color, fontWeight: 500, marginBottom: 4 }}>{strategy.title}</div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{strategy.desc}</div>
              </div>
            </div>

            <div style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                {selStrategy === "lp" ? "Add liquidity" : selStrategy === "pt" ? "Buy PT (fixed yield)" : "Buy YT (long yield)"}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.textSec }}>You pay (SY)</span>
                  <span style={{ fontSize: 12, color: C.textDim }}>Balance: {wallet.connected ? fmt(balances["HBAR"] || "0") : "---"}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <input type="number" value={tradeAmt} onChange={e => setTradeAmt(e.target.value)} placeholder="0.00" style={inputStyle} />
                  <button onClick={() => setTradeAmt("100")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: `${C.purple}15`, color: C.purple, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>MAX</button>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.bgInput, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontSize: 16 }}>&#8595;</div>
              </div>
              <div style={{ marginBottom: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>You receive ({selStrategy === "lp" ? "LP tokens" : selStrategy === "pt" ? "PT" : "YT"})</div>
                <div style={{ ...inputStyle, background: `${strategy.color}08`, borderColor: `${strategy.color}20`, color: strategy.color, fontWeight: 600 }}>{preview.out}</div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 16 }}>
                {[
                  { l: "Exchange rate", v: `1 SY = ${preview.rate} ${selStrategy === "pt" ? "PT" : selStrategy === "yt" ? "YT" : "LP"}` },
                  { l: "Price impact", v: `${preview.impact}%` },
                  { l: "Fee", v: "0.3%" },
                  { l: "Maturity", v: market.maturity },
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
                {!wallet.connected ? "Connect wallet" : !tradeAmt || parseFloat(tradeAmt) <= 0 ? "Enter amount" : selStrategy === "lp" ? `Add ${tradeAmt} liquidity` : selStrategy === "pt" ? `Buy ${preview.out} PT` : `Buy ${preview.out} YT`}
              </button>
              {selStrategy === "lp" && <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, textAlign: "center" }}>
                Remove liquidity: call AMM.removeLiquidity() directly
              </div>}
            </div>

            <div style={{ ...cardStyle(), padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Strategy details</div>
              {strategy.details.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", alignItems: "flex-start" }}>
                  <span style={{ color: strategy.color, fontSize: 10, marginTop: 4 }}>&#9679;</span>
                  <span style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>{d}</span>
                </div>
              ))}
            </div>

            <div style={{ ...cardStyle(), padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Direct contract actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Claim yield (YT holders)", action: "Core.claimYield()", note: "Call FissionCore directly" },
                  { label: "Remove LP", action: "AMM.removeLiquidity()", note: "Call FissionAMM directly" },
                  { label: "Merge PT+YT back to SY", action: "Core.merge()", note: "Call FissionCore directly" },
                  { label: "Redeem PT at maturity", action: "Core.redeemPT()", note: "After Jul 10, 2026" },
                ].map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                    <div><div style={{ fontSize: 13, color: C.textSec }}>{a.label}</div><div style={{ fontSize: 11, color: C.textDim }}>{a.note}</div></div>
                    <span style={{ fontSize: 11, color: C.purple, fontFamily: mono }}>{a.action}</span>
                  </div>
                ))}
              </div>
            </div>
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
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
              {selStrategy === "lp" ? `Added ${tradeAmt} liquidity` : selStrategy === "pt" ? `Bought ${preview.out} PT at ${market.fixedApy}% fixed APY` : `Bought ${preview.out} YT at ${market.longApy}% long yield APY`}
            </div>
            <button onClick={() => window.open("https://hashscan.io/mainnet", "_blank")} style={{ ...btnOutline(C.purple), fontSize: 13 }}>View on HashScan</button>
          </>}
          {txStatus === "error" && <>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.pink}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <span style={{ fontSize: 28, color: C.pink }}>!</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>Transaction failed</div>
            <div style={{ fontSize: 13, color: C.textSec }}>Check your wallet and try again.</div>
          </>}
        </div>
      </Modal>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
