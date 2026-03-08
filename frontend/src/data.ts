// Fission Protocol — Market data, chart generators, types

export interface Market {
  id: number; sym: string; name: string; protocol: string; maturity: string;
  tvl: number; vol24h: number; fixedApy: number; longApy: number;
  impliedApy: number; underlyingApy: number; ptPrice: number; ytPrice: number;
  ptSupply: number; ytSupply: number; accent: string; tag: string;
}

export const MARKETS: Market[] = [
  { id: 0, sym: "xSTRK", name: "Endur Staked STRK", protocol: "Endur", maturity: "2026-06-08",
    tvl: 2450000, vol24h: 185200, fixedApy: 5.8, longApy: 14.3, impliedApy: 7.2,
    underlyingApy: 6.5, ptPrice: 0.9712, ytPrice: 0.0288, ptSupply: 1200000, ytSupply: 1200000,
    accent: "#5C94FF", tag: "STRK" },
  { id: 1, sym: "xLBTC", name: "Endur Staked LBTC", protocol: "Endur", maturity: "2026-06-08",
    tvl: 890000, vol24h: 67400, fixedApy: 4.6, longApy: 22.7, impliedApy: 8.4,
    underlyingApy: 5.1, ptPrice: 0.977, ytPrice: 0.023, ptSupply: 420000, ytSupply: 420000,
    accent: "#F7931A", tag: "BTC" },
];

export const mkYield = (base: number, vol: number, n = 60) =>
  Array.from({ length: n }, (_, i) => ({
    d: i,
    underlying: +(base + Math.sin(i*0.2)*vol + (Math.random()-0.5)*vol*0.6).toFixed(2),
    implied: +(base + 0.8 + Math.sin(i*0.15)*vol*0.5 + (Math.random()-0.5)*vol*0.4).toFixed(2),
    fixed: base - 0.7,
  }));

export const mkPT = (start: number, n = 60) =>
  Array.from({ length: n }, (_, i) => ({
    d: i,
    price: +Math.min(start + (1-start)*(i/n)**0.55 + (Math.random()-0.5)*0.004, 1).toFixed(4),
    target: 1.0,
  }));

export const YIELD_DATA = [mkYield(6.5, 2.2), mkYield(5.1, 3.5)];
export const PT_DATA = [mkPT(0.942), mkPT(0.955)];

export const TOKENS = [
  { sym: "STRK", name: "Starknet", bal: "12,450.00" },
  { sym: "ETH", name: "Ether", bal: "2.45" },
  { sym: "USDC", name: "USD Coin", bal: "5,200.00" },
  { sym: "xSTRK", name: "Endur Staked STRK", bal: "1,250.00" },
  { sym: "xLBTC", name: "Endur Staked LBTC", bal: "0.42" },
  { sym: "WBTC", name: "Wrapped Bitcoin", bal: "0.15" },
  { sym: "LBTC", name: "Lombard BTC", bal: "0.38" },
];

export const POSITIONS = [
  { token: "PT-xSTRK", amount: "500.00", value: "$486.20", apy: "5.8%", color: "#34D399", market: 0 },
  { token: "YT-xSTRK", amount: "500.00", value: "$14.40", apy: "14.3%", color: "#F7931A", market: 0 },
  { token: "PT-xLBTC", amount: "0.25", value: "$21,450", apy: "4.6%", color: "#34D399", market: 1 },
  { token: "LP-xSTRK", amount: "320.00", value: "$318.50", apy: "4.2%", color: "#5C94FF", market: 0 },
];

export const daysTo = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5));
export const fmt = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n}`;
