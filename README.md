# Fission Protocol ⚛️

**Pendle-like Yield Tokenization for Bitcoin on Starknet**

Split yield-bearing BTC and STRK positions into tradeable Principal Tokens (PT) and Yield Tokens (YT). Lock in fixed yield, speculate on variable rates, or earn swap fees — with optional privacy via Tongo confidential transfers.

**RE{DEFINE} Hackathon** — Bitcoin Track + Privacy Track

---

## Project Structure

```
fission-protocol/
├── contracts/           # Cairo smart contracts (Scarb)
│   ├── Scarb.toml
│   └── src/
│       ├── lib.cairo
│       ├── interfaces/ifission.cairo       # All protocol interfaces
│       ├── core/
│       │   ├── standardized_yield.cairo    # SY wrapper for xSTRK/xLBTC
│       │   └── fission_core.cairo          # Split/merge/redeem engine
│       ├── tokens/
│       │   ├── principal_token.cairo       # PT (ERC20 + maturity)
│       │   └── yield_token.cairo           # YT (ERC20 + yield tracking)
│       ├── amm/fission_amm.cairo           # Time-decay AMM for PT/SY
│       └── mocks/mock_yield_bearing.cairo  # Mock for testing
├── frontend/            # React + TypeScript + Tailwind + shadcn/ui
│   ├── src/
│   │   ├── App.tsx      # Full app (Markets, Trade, Dashboard, all modals)
│   │   ├── data.ts      # Market data, types, utilities
│   │   ├── index.css    # Starknet brand theme (IBM Plex Sans, #0C0C4F navy)
│   │   └── components/ui/  # 40+ shadcn/ui components
│   ├── package.json
│   └── vite.config.ts
├── deploy.sh            # Starknet mainnet deploy script
└── README.md
```

## Markets

| Market | Underlying | Base APY | With Incentives | Contract |
|--------|-----------|----------|-----------------|----------|
| **xSTRK** | Endur Staked STRK | ~6.5% | Up to 15%+ | `0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a` |
| **xLBTC** | Endur Staked LBTC | ~5% | Up to 30% (Vesu multiply) | Endur BTC staking |

## Quick Start

### Contracts

```bash
cd contracts
scarb build        # Compile Cairo contracts
snforge test       # Run tests
```

### Frontend

```bash
cd frontend
pnpm install       # Install deps
pnpm dev           # Dev server → http://localhost:5173
pnpm build         # Production build
```

### Deploy to Starknet Mainnet

```bash
chmod +x deploy.sh
./deploy.sh mainnet
```

## How It Works

1. **Deposit** yield-bearing token (xSTRK or xLBTC) into SY wrapper
2. **Split** SY into equal amounts of PT + YT tokens
3. **Trade** PT on the time-decay AMM (buy PT = lock fixed yield)
4. **Trade** YT for leveraged yield exposure (buy YT = long yield)
5. **Provide liquidity** to earn swap fees with minimal IL at maturity
6. **Redeem** PT 1:1 for underlying after maturity
7. **Claim** accrued yield from YT holdings anytime
8. **Shield** positions with Tongo for confidential balances (optional)

## Frontend Screens

- **Markets** — Grid with sort (TVL/APY/Volume), market rows, click to trade
- **Trade** — Market selector, yield curve chart, PT convergence chart, 4-tab trade panel (Fixed/Long Yield/LP/Mint)
- **Dashboard** — Portfolio value, positions table, accrued yield, claim button
- **Wallet Connect Modal** — Argent X, Braavos, Xverse, MetaMask Snap
- **Slippage Settings** — Auto presets + custom + deadline
- **Token Selector** — Search, quick pills, balances
- **Tx Review Modal** — Full route, fees, min received, price impact
- **Tx Status Toast** — Pending/success/error with Starkscan link
- **APY Breakdown Tooltip** — Component yield sources
- **Keep YT Mode** — LP tab toggle (Pendle feature)
- **Tongo Shield** — Privacy toggle

## Tech Stack

| Layer | Tool |
|-------|------|
| Contracts | Cairo + OpenZeppelin Cairo Contracts |
| Build | Scarb 2.8.3+ |
| Test | Starknet Foundry (snforge) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (40+ components) |
| Charts | Recharts |
| Icons | Lucide React |
| Theme | Starknet brand (#0C0C4F, IBM Plex Sans) |
| Privacy | Tongo SDK (ElGamal confidential ERC20) |

## Hackathon Alignment

### Bitcoin Track ✅
- Tokenized BTC yield representation
- BTC yield vault
- Vault curator/manager system
- Leverage looping for BTC

### Privacy Track ✅
- Private yield on BTC (via Tongo)
- Private yield on stables (via Tongo)

## License

MIT
