
import { useState, useMemo } from "react";
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip as Tip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings, ChevronDown, ArrowDown, Search, Check, ExternalLink, Shield, Info, X, Wallet, BarChart3, TrendingUp, LayoutDashboard, RefreshCw, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { MARKETS, YIELD_DATA, PT_DATA, TOKENS, POSITIONS, daysTo, fmt, type Market } from "./data";

/* ══════════════════════════════════════════════════════════════════════════
   FISSION PROTOCOL — Complete DeFi Frontend
   Every screen + modal from Pendle, themed with Starknet brand
   ══════════════════════════════════════════════════════════════════════════ */

// ── WALLET CONNECT MODAL ──────────────────────────────────────────────────
function WalletModal({ open, onClose, onConnect }: { open: boolean; onClose: () => void; onConnect: () => void }) {
  const wallets = [
    { name: "Argent X (Ready)", desc: "Most popular on Starknet", icon: "🔷" },
    { name: "Braavos", desc: "Smart wallet with 2FA", icon: "🛡" },
    { name: "Xverse", desc: "Bitcoin + Starknet", icon: "₿" },
    { name: "MetaMask Snap", desc: "Via Starknet snap", icon: "🦊" },
  ];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0C0C2E] border-primary/10 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Connect Wallet</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-3">Select a wallet to connect to Fission Protocol on Starknet Mainnet.</div>
        <div className="space-y-1.5">
          {wallets.map(w => (
            <button key={w.name} onClick={onConnect} className="w-full flex items-center gap-3 p-3 rounded-lg border border-primary/5 hover:border-primary/15 hover:bg-primary/5 transition-all text-left">
              <span className="text-lg w-8 text-center">{w.icon}</span>
              <div><div className="text-sm font-medium">{w.name}</div><div className="text-xs text-muted-foreground">{w.desc}</div></div>
            </button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground text-center mt-2">By connecting, you agree to Fission's Terms of Service</div>
      </DialogContent>
    </Dialog>
  );
}

// ── SLIPPAGE SETTINGS POPOVER ─────────────────────────────────────────────
function SlippageSettings() {
  const [slippage, setSlippage] = useState(0.5);
  const [deadline, setDeadline] = useState(30);
  const [custom, setCustom] = useState(false);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded-md hover:bg-primary/5 transition-colors"><Settings size={14} className="text-muted-foreground" /></button>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-[#0C0C2E] border-primary/10 p-4" align="end">
        <div className="text-sm font-semibold mb-3">Transaction Settings</div>
        <div className="text-xs text-muted-foreground mb-2">Slippage Tolerance</div>
        <div className="flex gap-1.5 mb-3">
          {[0.1, 0.5, 1.0].map(v => (
            <button key={v} onClick={() => { setSlippage(v); setCustom(false); }}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${!custom && slippage === v ? "bg-primary/15 text-primary border border-primary/20" : "bg-secondary border border-transparent hover:border-primary/10"}`}>
              {v}%
            </button>
          ))}
          <button onClick={() => setCustom(true)}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${custom ? "bg-primary/15 text-primary border border-primary/20" : "bg-secondary border border-transparent hover:border-primary/10"}`}>
            Custom
          </button>
        </div>
        {custom && (
          <div className="flex items-center gap-2 mb-3">
            <Input type="number" value={slippage} onChange={e => setSlippage(+e.target.value)} className="h-8 text-xs bg-[#080826] border-primary/10" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}
        {slippage > 3 && <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mb-2"><AlertTriangle size={10} />High slippage may result in unfavorable rates</div>}
        <div className="text-xs text-muted-foreground mb-2">Transaction Deadline</div>
        <div className="flex items-center gap-2">
          <Input type="number" value={deadline} onChange={e => setDeadline(+e.target.value)} className="h-8 w-20 text-xs bg-[#080826] border-primary/10" />
          <span className="text-xs text-muted-foreground">minutes</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── TOKEN SELECTOR MODAL ──────────────────────────────────────────────────
function TokenSelector({ open, onClose, onSelect, current }: { open: boolean; onClose: () => void; onSelect: (s: string) => void; current: string }) {
  const [search, setSearch] = useState("");
  const filtered = TOKENS.filter(t => t.sym.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0C0C2E] border-primary/10 max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Select Token</DialogTitle></DialogHeader>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or symbol" className="pl-9 h-9 text-sm bg-[#080826] border-primary/10" />
        </div>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {["STRK", "ETH", "USDC", "xSTRK", "xLBTC"].map(s => (
            <button key={s} onClick={() => { onSelect(s); onClose(); }} className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-primary/10 hover:border-primary/20 transition-colors">{s}</button>
          ))}
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {filtered.map(t => (
            <button key={t.sym} onClick={() => { onSelect(t.sym); onClose(); }}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-primary/5 transition-all ${t.sym === current ? "bg-primary/5" : ""}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">{t.sym[0]}</div>
                <div><div className="text-sm font-medium text-left">{t.sym}</div><div className="text-[10px] text-muted-foreground">{t.name}</div></div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono">{t.bal}</div>
                {t.sym === current && <Check size={12} className="text-primary ml-auto" />}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── TX REVIEW MODAL ───────────────────────────────────────────────────────
function TxReview({ open, onClose, onConfirm, data }: { open: boolean; onClose: () => void; onConfirm: () => void; data: { payAmt: string; payToken: string; rcvAmt: string; rcvToken: string; apy: number; apyColor: string; priceImpact: string; fee: string; route: string; minReceived: string } }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0C0C2E] border-primary/10 max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Review Transaction</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#080826] rounded-lg p-3 border border-primary/5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">You Pay</div>
            <div className="flex justify-between items-center">
              <span className="text-lg font-mono font-semibold">{data.payAmt}</span>
              <span className="text-sm font-semibold">{data.payToken}</span>
            </div>
          </div>
          <div className="flex justify-center"><ArrowDown size={16} className="text-muted-foreground" /></div>
          <div className="bg-[#080826] rounded-lg p-3 border border-primary/5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">You Receive</div>
            <div className="flex justify-between items-center">
              <span className="text-lg font-mono font-semibold" style={{ color: data.apyColor }}>{data.rcvAmt}</span>
              <span className="text-sm font-semibold" style={{ color: data.apyColor }}>{data.rcvToken}</span>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            {[["APY", `${data.apy}%`, data.apyColor], ["Price Impact", data.priceImpact, "#34D399"], ["Route", data.route, ""], ["Min Received", data.minReceived, ""], ["Fee", data.fee, ""]].map(([l, v, c]) => (
              <div key={l as string} className="flex justify-between py-1 border-b border-primary/5 last:border-0">
                <span className="text-muted-foreground">{l}</span>
                <span className="font-mono font-medium" style={{ color: (c as string) || undefined }}>{v}</span>
              </div>
            ))}
          </div>
          <Button onClick={onConfirm} className="w-full bg-sn-grad hover:opacity-90 text-white font-semibold">Confirm Transaction</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── TX STATUS TOAST ───────────────────────────────────────────────────────
function TxToast({ status, hash, onClose }: { status: "pending" | "success" | "error"; hash?: string; onClose: () => void }) {
  if (!status) return null;
  const cfg = { pending: { icon: <Loader2 size={16} className="animate-spin text-primary" />, title: "Transaction Pending", desc: "Confirming on Starknet...", bg: "border-primary/20" },
    success: { icon: <CheckCircle2 size={16} className="text-yield" />, title: "Transaction Confirmed", desc: hash ? `${hash.slice(0,10)}...${hash.slice(-6)}` : "Success", bg: "border-yield/20" },
    error: { icon: <X size={16} className="text-destructive" />, title: "Transaction Failed", desc: "Please try again", bg: "border-destructive/20" },
  }[status];
  return (
    <div className={`fixed bottom-4 right-4 z-50 bg-[#0C0C2E] border ${cfg.bg} rounded-lg p-3 min-w-[280px] shadow-xl animate-in slide-in-from-bottom-4`}>
      <div className="flex items-start gap-2.5">
        {cfg.icon}
        <div className="flex-1"><div className="text-sm font-medium">{cfg.title}</div><div className="text-xs text-muted-foreground font-mono">{cfg.desc}</div></div>
        <button onClick={onClose}><X size={12} className="text-muted-foreground" /></button>
      </div>
      {hash && <a href={`https://starkscan.co/tx/${hash}`} target="_blank" className="flex items-center gap-1 text-[10px] text-primary mt-2 hover:underline"><ExternalLink size={10} />View on Starkscan</a>}
    </div>
  );
}

// ── APY BREAKDOWN TOOLTIP ─────────────────────────────────────────────────
function APYBreakdown({ m }: { m: Market }) {
  return (
    <TooltipProvider>
      <Tip>
        <TooltipTrigger><Info size={12} className="text-muted-foreground hover:text-primary cursor-help" /></TooltipTrigger>
        <TooltipContent className="bg-[#0C0C2E] border-primary/10 p-3 max-w-[200px]">
          <div className="text-xs font-semibold mb-2">APY Breakdown</div>
          {[["Base Staking", `${(m.underlyingApy * 0.6).toFixed(1)}%`], ["STRK Rewards", `${(m.underlyingApy * 0.3).toFixed(1)}%`], ["BTCFi Bonus", `${(m.underlyingApy * 0.1).toFixed(1)}%`], ["Total Underlying", `${m.underlyingApy}%`]].map(([l, v], i) => (
            <div key={i} className={`flex justify-between text-[10px] py-0.5 ${i === 3 ? "border-t border-primary/10 mt-1 pt-1 font-semibold" : "text-muted-foreground"}`}>
              <span>{l}</span><span className="font-mono">{v}</span>
            </div>
          ))}
        </TooltipContent>
      </Tip>
    </TooltipProvider>
  );
}

// ── CHART TOOLTIP ─────────────────────────────────────────────────────────
const ChartTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0C0C2E] border border-primary/10 rounded-md p-2 text-[11px] font-mono">
      {payload.map((p: any, i: number) => <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}</div>)}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  // Global state
  const [page, setPage] = useState<"markets" | "trade" | "dashboard">("trade");
  const [mkt, setMkt] = useState(0);
  const [tab, setTab] = useState("fixed");
  const [chart, setChart] = useState("apy");
  const [amt, setAmt] = useState("");
  const [wallet, setWallet] = useState(false);
  const [walletModal, setWalletModal] = useState(false);
  const [tokenModal, setTokenModal] = useState(false);
  const [txReview, setTxReview] = useState(false);
  const [txStatus, setTxStatus] = useState<"pending" | "success" | "error" | null>(null);
  const [payToken, setPayToken] = useState("xSTRK");
  const [slippage] = useState(0.5);
  const [keepYT, setKeepYT] = useState(false);
  const [sortBy, setSortBy] = useState<"tvl" | "fixedApy" | "longApy" | "vol24h">("tvl");
  const [earnMode, setEarnMode] = useState(false);

  const m = MARKETS[mkt];
  const days = daysTo(m.maturity);

  const out = useMemo(() => {
    const a = parseFloat(amt); if (!a) return "0.0000";
    return tab === "fixed" ? (a / m.ptPrice).toFixed(4) : tab === "yield" ? (a / m.ytPrice).toFixed(4) : tab === "mint" ? a.toFixed(4) : (a * 0.985).toFixed(4);
  }, [amt, tab, m]);

  const rcvToken = tab === "fixed" ? `PT-${m.sym}` : tab === "yield" ? `YT-${m.sym}` : tab === "mint" ? `PT+YT` : `LP-${m.sym}`;
  const apy = tab === "fixed" ? m.fixedApy : tab === "yield" ? m.longApy : tab === "mint" ? 0 : 4.2;
  const apyColor = tab === "fixed" ? "#34D399" : tab === "yield" ? "#F7931A" : "#5C94FF";
  const priceImpact = parseFloat(amt) > 10000 ? 1.2 : parseFloat(amt) > 1000 ? 0.15 : 0.01;

  const doTx = () => {
    setTxReview(false); setTxStatus("pending");
    setTimeout(() => { setTxStatus("success"); setAmt(""); }, 2500);
  };

  const sortedMarkets = [...MARKETS].sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy]);

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* ── NAV ── */}
      <header className="flex items-center justify-between px-5 h-14 border-b border-primary/[0.06] sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPage("trade")}>
            <svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="#5C94FF" strokeWidth="1.5"/><circle cx="10" cy="10" r="3" fill="#F7931A"/><line x1="10" y1="2" x2="10" y2="18" stroke="#5C94FF" strokeWidth="1" opacity="0.3"/><line x1="2" y1="10" x2="18" y2="10" stroke="#5C94FF" strokeWidth="1" opacity="0.3"/></svg>
            <span className="text-[15px] font-bold tracking-tight">fission</span>
          </div>
          <nav className="flex items-center gap-0.5 bg-secondary/50 rounded-md p-0.5">
            {([["trade", BarChart3], ["markets", TrendingUp], ["dashboard", LayoutDashboard]] as const).map(([p, Icon]) => (
              <button key={p} onClick={() => setPage(p as any)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${page === p ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon size={13} />{p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </nav>
          {/* Earn/Trade toggle */}
          <div className="flex items-center gap-2 text-xs">
            <span className={earnMode ? "text-muted-foreground" : "font-medium"}>Trade</span>
            <Switch checked={earnMode} onCheckedChange={setEarnMode} className="h-4 w-7" />
            <span className={!earnMode ? "text-muted-foreground" : "font-medium"}>Earn</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-yield" /><span className="text-[10px] text-muted-foreground">Mainnet</span></div>
          <Button onClick={() => wallet ? setWallet(false) : setWalletModal(true)} variant={wallet ? "outline" : "default"} size="sm" className={`text-xs h-8 ${!wallet ? "bg-sn-grad border-0" : ""}`}>
            {wallet ? <><Wallet size={12} className="mr-1.5" />0x7a3f…e91d</> : "Connect Wallet"}
          </Button>
        </div>
      </header>

      {/* ── TICKER BAR ── */}
      <div className="flex gap-6 px-5 py-2 border-b border-primary/[0.04] text-xs overflow-x-auto">
        {[["TVL", "$3.34M"], ["24h Vol", "$252K"], ["Markets", "2"], ["BTC Staked", "1,790", "#F7931A"], ["STRK Staked", "310M", "#5C94FF"]].map(([l, v, c]) => (
          <div key={l as string} className="flex gap-1.5 items-center whitespace-nowrap">
            <span className="text-muted-foreground">{l}</span>
            <span className="font-mono font-medium" style={{ color: (c as string) || undefined }}>{v}</span>
          </div>
        ))}
        <div className="ml-auto"><button className="p-1 hover:bg-primary/5 rounded transition-colors"><RefreshCw size={11} className="text-muted-foreground" /></button></div>
      </div>

      {/* ══════ MARKETS PAGE ══════ */}
      {page === "markets" && (
        <div className="max-w-5xl mx-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All Markets</h2>
            <div className="flex gap-1.5">
              {(["tvl", "fixedApy", "longApy", "vol24h"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${sortBy === s ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5"}`}>
                  {s === "tvl" ? "TVL" : s === "fixedApy" ? "Fixed APY" : s === "longApy" ? "Long Yield" : "Volume"}
                </button>
              ))}
            </div>
          </div>
          <div className="border border-primary/[0.06] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-primary/[0.06] bg-secondary/30">
              <span>Market</span><span>Fixed APY</span><span>Long Yield</span><span>Implied APY</span><span>TVL</span><span>Volume (24h)</span><span>Maturity</span>
            </div>
            {sortedMarkets.map(mk => (
              <button key={mk.id} onClick={() => { setMkt(mk.id); setPage("trade"); }} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_80px] gap-2 px-4 py-3.5 w-full text-left hover:bg-primary/[0.03] transition-all border-b border-primary/[0.04] last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: `${mk.accent}12`, color: mk.accent }}>{mk.sym[0]}</div>
                  <div><div className="text-sm font-medium">{mk.sym}</div><div className="text-[10px] text-muted-foreground">{mk.protocol} · {mk.name}</div></div>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-1" style={{ color: mk.accent, borderColor: `${mk.accent}30` }}>{mk.tag}</Badge>
                </div>
                <span className="text-yield font-mono text-sm font-medium self-center">{mk.fixedApy}%</span>
                <span className="text-btc font-mono text-sm font-medium self-center">{mk.longApy}%</span>
                <span className="font-mono text-sm self-center" style={{ color: mk.accent }}>{mk.impliedApy}%</span>
                <span className="font-mono text-sm self-center">{fmt(mk.tvl)}</span>
                <span className="font-mono text-sm self-center text-muted-foreground">{fmt(mk.vol24h)}</span>
                <span className="text-xs text-coral self-center font-mono">{daysTo(mk.maturity)}d</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════ TRADE PAGE ══════ */}
      {page === "trade" && (
        <div className="flex max-w-[1280px] mx-auto p-5 gap-4" style={{ flexWrap: "wrap" }}>
          {/* LEFT COLUMN */}
          <div className="flex-1 min-w-[520px] flex flex-col gap-3">
            {/* Market selector */}
            <div className="flex gap-px bg-primary/[0.04] rounded-lg overflow-hidden">
              {MARKETS.map(mk => (
                <button key={mk.id} onClick={() => setMkt(mk.id)} className={`flex-1 p-3.5 text-left transition-all ${mkt === mk.id ? "bg-card" : "bg-background hover:bg-card/50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-semibold ${mkt === mk.id ? "" : "text-muted-foreground"}`}>{mk.sym}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5" style={{ color: mk.accent, borderColor: `${mk.accent}30` }}>{mk.tag}</Badge>
                  </div>
                  <div className="flex gap-4">
                    <div><div className="text-[9px] text-muted-foreground uppercase tracking-wider">Fixed</div><div className="text-yield font-mono text-sm font-semibold">{mk.fixedApy}%</div></div>
                    <div><div className="text-[9px] text-muted-foreground uppercase tracking-wider">Long</div><div className="text-btc font-mono text-sm font-semibold">{mk.longApy}%</div></div>
                    <div><div className="text-[9px] text-muted-foreground uppercase tracking-wider">TVL</div><div className="font-mono text-xs">{fmt(mk.tvl)}</div></div>
                  </div>
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-card rounded-lg border border-primary/[0.06] p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{m.sym}</span>
                  <span className="text-xs text-muted-foreground">{chart === "apy" ? "Yield History" : "PT Convergence"} · 60d</span>
                  <APYBreakdown m={m} />
                </div>
                <div className="flex gap-px bg-secondary/50 rounded p-0.5">
                  {(["apy", "pt"] as const).map(c => (
                    <button key={c} onClick={() => setChart(c)} className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${chart === c ? "bg-primary/10 text-foreground" : "text-muted-foreground"}`}>
                      {c === "apy" ? "APY" : "PT Price"}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={190}>
                {chart === "apy" ? (
                  <ComposedChart data={YIELD_DATA[mkt]}>
                    <defs>
                      <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5C94FF" stopOpacity={0.12}/><stop offset="100%" stopColor="#5C94FF" stopOpacity={0}/></linearGradient>
                      <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F7931A" stopOpacity={0.1}/><stop offset="100%" stopColor="#F7931A" stopOpacity={0}/></linearGradient>
                    </defs>
                    <XAxis dataKey="d" tick={false} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill: "#4E4E6A", fontSize: 10, fontFamily: "'IBM Plex Mono'" }} axisLine={false} tickLine={false} width={28} unit="%"/>
                    <Tooltip content={<ChartTip/>}/>
                    <Area dataKey="underlying" name="Underlying" stroke="#5C94FF" fill="url(#gu)" strokeWidth={1.5} dot={false}/>
                    <Area dataKey="implied" name="Implied" stroke="#F7931A" fill="url(#gi)" strokeWidth={1.5} dot={false}/>
                    <Line dataKey="fixed" name="Fixed" stroke="#34D399" strokeWidth={1} strokeDasharray="4 3" dot={false}/>
                  </ComposedChart>
                ) : (
                  <ComposedChart data={PT_DATA[mkt]}>
                    <defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={m.accent} stopOpacity={0.12}/><stop offset="100%" stopColor={m.accent} stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="d" tick={false} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill: "#4E4E6A", fontSize: 10, fontFamily: "'IBM Plex Mono'" }} axisLine={false} tickLine={false} width={36} domain={[0.93, 1.01]}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Line dataKey="target" name="Redemption" stroke="#4E4E6A" strokeWidth={1} strokeDasharray="4 3" dot={false}/>
                    <Area dataKey="price" name="PT Price" stroke={m.accent} fill="url(#gp)" strokeWidth={1.5} dot={false}/>
                  </ComposedChart>
                )}
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 pt-1">
                {chart === "apy"
                  ? [["Underlying", "#5C94FF"], ["Implied", "#F7931A"], ["Fixed", "#34D399"]].map(([n, c]) => (
                    <div key={n} className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="w-2.5 h-[2px] rounded-full" style={{ background: c }}/>{n}</div>))
                  : [["PT-"+m.sym, m.accent], ["Maturity", "#4E4E6A"]].map(([n, c]) => (
                    <div key={n} className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="w-2.5 h-[2px] rounded-full" style={{ background: c }}/>{n}</div>))
                }
              </div>
            </div>

            {/* Market details grid */}
            <div className="bg-card rounded-lg border border-primary/[0.06] p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-3">Market Details</div>
              <div className="grid grid-cols-3 gap-3">
                {[["PT Price", `${m.ptPrice} SY`, ""], ["YT Price", `${m.ytPrice} SY`, ""], ["Maturity", `${days}d left`, "#E97880"],
                  ["Underlying APY", `${m.underlyingApy}%`, "#5C94FF"], ["Implied APY", `${m.impliedApy}%`, "#F7931A"], ["24h Volume", fmt(m.vol24h), ""],
                  ["PT Supply", `${(m.ptSupply/1e3).toFixed(0)}K`, ""], ["YT Supply", `${(m.ytSupply/1e3).toFixed(0)}K`, ""], ["Protocol", "Endur", ""],
                ].map(([l, v, c], i) => (
                  <div key={i}>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{l}</div>
                    <div className="text-xs font-mono font-medium" style={{ color: (c as string) || undefined }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Trade Panel */}
          <div className="w-[360px] min-w-[310px]">
            <div className="bg-card rounded-lg border border-primary/[0.06] sticky top-16">
              {/* Trade tabs */}
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full grid grid-cols-4 bg-transparent border-b border-primary/[0.06] rounded-none h-auto p-0">
                  {[["fixed", "Fixed", "#34D399"], ["yield", "Long Yield", "#F7931A"], ["lp", "LP", "#5C94FF"], ["mint", "Mint", "#E97880"]].map(([id, label, color]) => (
                    <TabsTrigger key={id} value={id} className="rounded-none border-b-2 border-transparent data-[state=active]:border-current data-[state=active]:bg-transparent py-2.5 text-xs font-semibold" style={{ color: tab === id ? color : undefined }}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="p-4">
                  {/* Context banner */}
                  <div className="text-[11px] text-muted-foreground leading-relaxed mb-3 p-2.5 bg-secondary/30 rounded-md">
                    {tab === "fixed" && <>Buy PT-{m.sym} at {m.ptPrice} SY. Redeem 1:1 at maturity → <span className="text-yield font-semibold">{m.fixedApy}% fixed</span>.</>}
                    {tab === "yield" && <>Buy YT-{m.sym} for leveraged yield. <span className="text-btc font-semibold">{m.longApy}% APY</span> if rates hold.</>}
                    {tab === "lp" && <>Provide SY+PT liquidity. Earn 0.3% swap fees. Minimal IL at maturity.</>}
                    {tab === "mint" && <>Deposit SY to mint equal PT + YT tokens. Split your yield-bearing position.</>}
                  </div>

                  {/* Pay input */}
                  <div className="bg-[#080826] rounded-md p-3 border border-primary/[0.05] mb-1.5">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">You pay</span>
                      <span className="text-[10px] text-muted-foreground cursor-pointer" onClick={() => setAmt("1250")}>
                        Bal: <span className="text-foreground/70 font-mono">1,250.00</span> <span className="text-primary font-semibold ml-0.5">MAX</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={amt} onChange={e => setAmt(e.target.value)} placeholder="0.00" type="number" className="flex-1 bg-transparent border-none outline-none text-lg font-mono font-medium" />
                      <button onClick={() => setTokenModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-background rounded border border-primary/[0.08] text-xs font-semibold hover:border-primary/20 transition-colors">
                        {payToken}<ChevronDown size={12} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-center py-0.5">
                    <div className="w-6 h-6 rounded bg-[#080826] border border-primary/[0.06] flex items-center justify-center">
                      <ArrowDown size={12} className="text-muted-foreground" />
                    </div>
                  </div>

                  {/* Receive output */}
                  <div className="bg-[#080826] rounded-md p-3 border border-primary/[0.05] mb-3">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">You receive</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-lg font-mono font-medium" style={{ color: apyColor }}>{out}</span>
                      <div className="ml-auto px-2.5 py-1.5 rounded border text-xs font-semibold" style={{ color: apyColor, borderColor: `${apyColor}25`, background: `${apyColor}08` }}>
                        {rcvToken}
                      </div>
                    </div>
                  </div>

                  {/* Keep YT toggle (LP tab only) */}
                  {tab === "lp" && (
                    <div className="flex items-center justify-between p-2.5 bg-secondary/30 rounded-md mb-3">
                      <div><div className="text-xs font-medium">Keep YT Mode</div><div className="text-[10px] text-muted-foreground">Avoid price impact, receive YT separately</div></div>
                      <Switch checked={keepYT} onCheckedChange={setKeepYT} />
                    </div>
                  )}

                  {/* Rate details */}
                  <div className="mb-3 text-xs">
                    {[[tab === "mint" ? "Operation" : "APY", tab === "mint" ? "Split SY → PT+YT" : `${apy}%`, tab === "mint" ? "" : apyColor],
                      ["Price Impact", `${priceImpact < 0.1 ? "<0.01" : priceImpact.toFixed(2)}%`, priceImpact > 1 ? "#F7931A" : "#34D399"],
                      ["Min Received", `${(parseFloat(out || "0") * (1 - slippage/100)).toFixed(4)} ${rcvToken}`, ""],
                      ["Route", `${payToken} → SY → ${rcvToken}`, ""],
                      ["Fee", "0.30%", ""],
                    ].map(([l, v, c], i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-primary/[0.04] last:border-0">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="font-mono font-medium" style={{ color: (c as string) || undefined }}>{v}</span>
                      </div>
                    ))}
                    {priceImpact > 1 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mt-1"><AlertTriangle size={10}/>High price impact. Consider reducing trade size.</div>
                    )}
                  </div>

                  {/* Settings + Action */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted-foreground">Slippage: {slippage}%</span>
                    <SlippageSettings />
                  </div>

                  <Button onClick={() => wallet ? setTxReview(true) : setWalletModal(true)}
                    className="w-full h-10 font-semibold text-sm text-white"
                    style={{ background: wallet ? apyColor : undefined }}
                    variant={wallet ? "default" : "default"}
                  >
                    {!wallet ? <span className="bg-sn-grad bg-clip-text">Connect Wallet</span> : tab === "fixed" ? "Lock Fixed Yield" : tab === "yield" ? "Long Yield" : tab === "mint" ? "Mint PT + YT" : "Add Liquidity"}
                  </Button>

                  {/* Tongo shield */}
                  <button className="w-full mt-2 p-2.5 rounded-md border border-primary/[0.06] flex items-center gap-2 hover:border-primary/15 transition-colors text-left">
                    <Shield size={14} className="text-[#303093]" />
                    <div><div className="text-[11px] font-semibold text-[#303093]">Shield with Tongo</div><div className="text-[10px] text-muted-foreground">Hide position · Confidential ERC20</div></div>
                  </button>
                </div>
              </Tabs>
            </div>

            {/* Positions (when connected) */}
            {wallet && (
              <div className="bg-card rounded-lg border border-primary/[0.06] mt-3 p-4">
                <div className="text-xs font-semibold text-muted-foreground mb-2.5">Your Positions</div>
                {POSITIONS.map((p, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-primary/[0.04] last:border-0">
                    <div><div className="text-xs font-medium">{p.token}</div><div className="text-[10px] text-muted-foreground font-mono">{p.amount}</div></div>
                    <div className="text-right"><div className="text-xs font-mono">{p.value}</div><div className="text-[10px] font-mono font-medium" style={{ color: p.color }}>{p.apy}</div></div>
                  </div>
                ))}
                <div className="flex justify-between mt-2.5 p-2 bg-secondary/30 rounded">
                  <span className="text-[10px] text-muted-foreground">Unclaimed Yield</span>
                  <span className="text-xs text-yield font-mono font-semibold">12.45 SY-xSTRK</span>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2 text-yield border-yield/20 hover:bg-yield/5 text-xs">Claim All Yield</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ DASHBOARD PAGE ══════ */}
      {page === "dashboard" && (
        <div className="max-w-4xl mx-auto p-5">
          {!wallet ? (
            <div className="text-center py-20">
              <Wallet size={32} className="mx-auto text-muted-foreground mb-3" />
              <div className="text-lg font-semibold mb-2">Connect Your Wallet</div>
              <div className="text-sm text-muted-foreground mb-4">View your positions, accrued yield, and transaction history.</div>
              <Button onClick={() => setWalletModal(true)} className="bg-sn-grad">Connect Wallet</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Dashboard</h2>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Portfolio Value</div>
                  <div className="text-2xl font-mono font-bold">$22,269.10</div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[["Total Deposited", "$22,000", ""], ["Unrealized PnL", "+$269.10", "#34D399"], ["Unclaimed Yield", "12.45 SY", "#34D399"], ["Active Positions", "4", ""]].map(([l, v, c], i) => (
                  <div key={i} className="bg-card rounded-lg border border-primary/[0.06] p-3">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{l}</div>
                    <div className="text-sm font-mono font-semibold" style={{ color: (c as string) || undefined }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Positions table */}
              <div className="bg-card rounded-lg border border-primary/[0.06]">
                <div className="px-4 py-3 border-b border-primary/[0.06] flex items-center justify-between">
                  <span className="text-sm font-semibold">Active Positions</span>
                  <Button variant="outline" size="sm" className="text-yield border-yield/20 hover:bg-yield/5 text-xs h-7">Claim All Yield</Button>
                </div>
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 text-[9px] text-muted-foreground uppercase tracking-wider border-b border-primary/[0.04]">
                  <span>Position</span><span>Amount</span><span>Value</span><span>APY</span><span>Market</span>
                </div>
                {POSITIONS.map((p, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-primary/[0.04] last:border-0 hover:bg-primary/[0.02] transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: `${p.color}12`, color: p.color }}>{p.token.slice(0,2)}</div>
                      <span className="text-sm font-medium">{p.token}</span>
                    </div>
                    <span className="text-xs font-mono self-center">{p.amount}</span>
                    <span className="text-xs font-mono self-center">{p.value}</span>
                    <span className="text-xs font-mono font-medium self-center" style={{ color: p.color }}>{p.apy}</span>
                    <span className="text-xs text-muted-foreground self-center">{MARKETS[p.market].sym}</span>
                  </div>
                ))}
              </div>

              {/* Claim section */}
              <div className="bg-card rounded-lg border border-primary/[0.06] p-4">
                <div className="text-sm font-semibold mb-3">Accrued Yield</div>
                <div className="flex items-center justify-between p-3 bg-yield/8 border border-yield/15 rounded-lg">
                  <div>
                    <div className="text-xs text-muted-foreground">Claimable from YT-xSTRK</div>
                    <div className="text-lg font-mono font-bold text-yield">12.45 SY-xSTRK</div>
                    <div className="text-[10px] text-muted-foreground">≈ $12.08</div>
                  </div>
                  <Button className="bg-yield hover:bg-yield/90 text-black font-semibold">Claim Yield</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-primary/[0.04] px-5 py-4 mt-10 flex justify-between items-center flex-wrap gap-2">
        <span className="text-xs font-bold tracking-tight">fission</span>
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          {["Docs", "GitHub", "Twitter", "Discord"].map(l => <a key={l} href="#" className="hover:text-foreground transition-colors">{l}</a>)}
        </div>
        <span className="text-[10px] text-muted-foreground">Starknet Mainnet · RE&#123;DEFINE&#125; Hackathon</span>
      </footer>

      {/* ── MODALS ── */}
      <WalletModal open={walletModal} onClose={() => setWalletModal(false)} onConnect={() => { setWallet(true); setWalletModal(false); }} />
      <TokenSelector open={tokenModal} onClose={() => setTokenModal(false)} onSelect={setPayToken} current={payToken} />
      <TxReview open={txReview} onClose={() => setTxReview(false)} onConfirm={doTx}
        data={{ payAmt: amt || "0", payToken, rcvAmt: out, rcvToken, apy, apyColor, priceImpact: `${priceImpact < 0.1 ? "<0.01" : priceImpact.toFixed(2)}%`, fee: "0.30%", route: `${payToken} → SY → ${rcvToken}`, minReceived: `${(parseFloat(out || "0") * (1 - slippage/100)).toFixed(4)} ${rcvToken}` }} />
      {txStatus && <TxToast status={txStatus} hash="0x04a8f3c2e91d7b6a5f8e2c1d3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2" onClose={() => setTxStatus(null)} />}
    </div>
  );
}
