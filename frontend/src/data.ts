export interface Market {
  id: number; sym: string; name: string; protocol: string; maturity: string;
  fixedApy: number; longApy: number; impliedApy: number; underlyingApy: number;
  ptPrice: number; ytPrice: number; accent: string; tag: string;
  tvl: number; vol24h: number; ptSupply: number; ytSupply: number;
}
export const MARKETS: Market[] = [
  { id: 0, sym: "xSTRK", name: "Endur Staked STRK", protocol: "Endur", maturity: "2026-06-08", fixedApy: 5.8, longApy: 14.3, impliedApy: 7.2, underlyingApy: 6.5, ptPrice: 0.9712, ytPrice: 0.0288, accent: "#5C94FF", tag: "STRK", tvl: 2450000, vol24h: 185200, ptSupply: 1200000, ytSupply: 1200000 },
  { id: 1, sym: "xLBTC", name: "Endur Staked LBTC", protocol: "Endur", maturity: "2026-06-08", fixedApy: 4.6, longApy: 22.7, impliedApy: 8.4, underlyingApy: 5.1, ptPrice: 0.977, ytPrice: 0.023, accent: "#F7931A", tag: "BTC", tvl: 890000, vol24h: 67400, ptSupply: 420000, ytSupply: 420000 },
];
export const mkYield = (base: number, vol: number, n = 60) =>
  Array.from({ length: n }, (_, i) => ({ d: i, underlying: +(base + Math.sin(i*0.2)*vol + (Math.random()-0.5)*vol*0.6).toFixed(2), implied: +(base+0.8+Math.sin(i*0.15)*vol*0.5+(Math.random()-0.5)*vol*0.4).toFixed(2), fixed: base-0.7 }));
export const mkPT = (start: number, n = 60) =>
  Array.from({ length: n }, (_, i) => ({ d: i, price: +Math.min(start+(1-start)*(i/n)**0.55+(Math.random()-0.5)*0.004, 1).toFixed(4), target: 1.0 }));
export const YIELD_DATA = [mkYield(6.5, 2.2), mkYield(5.1, 3.5)];
export const PT_DATA = [mkPT(0.942), mkPT(0.955)];
export const TOKEN_LIST = [
  { sym: "xSTRK", name: "Endur Staked STRK" },
  { sym: "STRK", name: "Starknet" },
  { sym: "ETH", name: "Ether" },
  { sym: "xLBTC", name: "Endur Staked LBTC" },
];
export const daysTo = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 864e5));
export const fmt = (n: number) => n >= 1e6 ? "$" + (n/1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n/1e3).toFixed(1) + "K" : "$" + n;
