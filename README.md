<div align="center">

# ⚛️ Fission Protocol

### Yield Tokenization for Starknet

**Split yield-bearing assets into Principal Tokens (PT) and Yield Tokens (YT)**

Lock fixed yield • Speculate on rates • Provide liquidity

[**Launch App →**](https://fission-protocol.vercel.app) · [**Contracts on Voyager**](#deployed-contracts)

---

</div>

## Overview

Fission is a **Pendle-like yield tokenization protocol** built natively on Starknet. It takes yield-bearing assets like **xSTRK** (Endur liquid staking) and splits them into two tradeable tokens:

- **PT (Principal Token)** — Redeemable 1:1 for the underlying at maturity. Buy at a discount to lock a fixed yield.
- **YT (Yield Token)** — Captures all variable staking rewards until maturity. Leveraged long on yield rates.

Users can trade PT and YT on Fission's built-in AMM, or provide SY/PT liquidity to earn swap fees.

### One-Click Flow

Fission accepts raw **STRK** and handles everything in a single atomic transaction:

```
STRK → Endur Stake → xSTRK → SY Wrap → Split → PT + YT
```

6 contract calls, 1 wallet popup, ~0.15 STRK gas. Powered by Starknet's native account abstraction multicall.

---

## Architecture

```
User deposits STRK
    │
    ▼
┌─────────────────────────────────┐
│   Endur (xSTRK)                 │  STRK → xSTRK liquid staking
│   0x028d709c...954b0a           │  ~6.5% APY from Starknet staking
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│   SY-xSTRK (Standardized Yield)│  Wraps xSTRK with exchange_rate()
│   0x03d7988a...56560            │  Standardized interface for Core
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│   FissionCore                   │  split() → mints PT + YT
│   0x05cd0b5b...45e8             │  merge(), redeem_pt(), claim_yield()
└──────┬──────────────┬───────────┘
       │              │
       ▼              ▼
┌─────────────┐ ┌─────────────┐
│  PT-xSTRK   │ │  YT-xSTRK   │
│  0x031479ec │ │  0x057025e0  │
│  Fixed Yield│ │  Variable   │
│  7.2% APY   │ │  14.3% APY  │
└──────┬──────┘ └─────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   FissionAMM (PT/SY Pool)       │  swap_sy_for_pt(), swap_pt_for_sy()
│   0x03063b4b...43c6             │  add/remove liquidity
└─────────────────────────────────┘
```

---

## Deployed Contracts

All contracts are deployed on **Starknet Mainnet** and verified on [Walnut](https://app.walnut.dev).

| Contract | Address | Verified |
|----------|---------|----------|
| **FissionCore v3** | [`0x05cd0b5b58bad5c15b09404797866e1fde74eea86d0b9db6f95f59c9237e45e8`](https://voyager.online/contract/0x05cd0b5b58bad5c15b09404797866e1fde74eea86d0b9db6f95f59c9237e45e8) | ✅ [Walnut](https://app.walnut.dev/verification/status/34e42f4c-7d26-484d-9fe1-e77fe758620d) |
| **SY-xSTRK** | [`0x03d7988a09d99faf667e10972bcb67a222e69cbc601cff75f1c4584d28356560`](https://voyager.online/contract/0x03d7988a09d99faf667e10972bcb67a222e69cbc601cff75f1c4584d28356560) | ✅ [Walnut](https://app.walnut.dev/verification/status/614a0598-4fc5-43be-826f-2d1762f41066) |
| **PT-xSTRK** | [`0x031479ec546f1793777615b919fa089d17b937a4228ea816134fa78bfac9d9a2`](https://voyager.online/contract/0x031479ec546f1793777615b919fa089d17b937a4228ea816134fa78bfac9d9a2) | ✅ [Walnut](https://app.walnut.dev/verification/status/5bcf93b9-dfa0-4e2f-aeac-6bdd6d907a1d) |
| **YT-xSTRK** | [`0x057025e04427eb4d04281acc9d09c09328eb496df13e12e1159ebddd10dd1bc9`](https://voyager.online/contract/0x057025e04427eb4d04281acc9d09c09328eb496df13e12e1159ebddd10dd1bc9) | ✅ [Walnut](https://app.walnut.dev/verification/status/f96b5a64-9dc6-4d3d-9c87-1a294e31593a) |
| **FissionAMM** | [`0x03063b4bee616d11ef15d124fe2a94193a54db577cf00795b8953b54bd5543c6`](https://voyager.online/contract/0x03063b4bee616d11ef15d124fe2a94193a54db577cf00795b8953b54bd5543c6) | ✅ [Walnut](https://app.walnut.dev/verification/status/d676657e-e2fc-47bc-acbe-75e47035b06a) |

### Market #0 — xSTRK (Endur)

| Parameter | Value |
|-----------|-------|
| Underlying | xSTRK (Endur Liquid Staking) |
| Base APY | ~6.5% (Starknet staking rewards) |
| Maturity | June 8, 2026 |
| Market ID | 0 |
| Creation TX | [`0x02b9ca8b...`](https://voyager.online/tx/0x02b9ca8b9e436711fbe273335d40fa1c3abc4d23c5c86bfe32e6d58a577a1596) |

### Key External Contracts

| Contract | Address |
|----------|---------|
| STRK Token | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| xSTRK (Endur) | `0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a` |
| ETH | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` |

---

## How It Works

### For Users

**Fixed Yield (Buy PT)**
Buy PT at a discount (e.g., 0.982 SY). At maturity, redeem 1:1 for the underlying. The discount is your guaranteed fixed yield — no matter what happens to staking rates.

**Long Yield (Buy YT)**
YT captures all variable staking rewards until maturity. If staking rates go up, your YT earns more. Effective leverage = 1 / YT_price. High risk, high reward.

**Split & LP**
Split SY into PT + YT. Provide PT + SY as liquidity to the AMM and earn swap fees from traders.

### For the Protocol

1. User deposits STRK → Endur stakes it → receives xSTRK
2. xSTRK wraps into SY (Standardized Yield) with an exchange rate that tracks real staking rewards
3. Core.split() locks SY and mints equal PT + YT to the user
4. PT trades on the SY/PT AMM — price determines implied fixed APY
5. YT price is implicit: `YT_price = 1 - PT_price`
6. At maturity: PT redeems 1:1, YT stops accruing, positions settle

---

## Smart Contract Details

### Cairo Contracts (v2.8.5 / Scarb)

| File | Description | Key Functions |
|------|-------------|---------------|
| `standardized_yield.cairo` | ERC20 wrapper with yield tracking | `deposit`, `redeem`, `exchange_rate`, `approve`, `transfer` |
| `fission_core.cairo` | Split/merge engine, yield distribution | `split`, `merge`, `redeem_pt`, `claim_yield`, `create_market` |
| `principal_token.cairo` | PT token (ERC20 + maturity + mint/burn) | `approve`, `transfer`, `mint`, `burn`, `get_maturity` |
| `yield_token.cairo` | YT token (ERC20 + yield index tracking) | `approve`, `transfer`, `mint`, `burn`, `set_user_yield_index` |
| `fission_amm.cairo` | Constant product PT/SY AMM | `swap_sy_for_pt`, `swap_pt_for_sy`, `add_liquidity`, `remove_liquidity` |

### Entrypoint Counts (Verified On-Chain)

| Contract | External Entrypoints |
|----------|---------------------|
| FissionCore | 15 |
| SY-xSTRK | 10 |
| PT-xSTRK | 8 |
| YT-xSTRK | 10 |
| FissionAMM | 10 |

---

## Frontend

**Live:** [fission-protocol.vercel.app](https://fission-protocol.vercel.app)

### Pages

| Page | Description |
|------|-------------|
| **Landing** | Hero, protocol stats, CTA |
| **Markets** | xSTRK market card with APY, TVL, maturity. xLBTC (Coming Soon) |
| **Strategy** | Choose Fixed Yield (PT), Long Yield (YT), or Split & LP |
| **Trade** | Deposit + split in one click. STRK/xSTRK toggle. Charts, route display |
| **Swap** | Trade between any tokens (STRK, xSTRK, SY, PT, YT) — 9 supported pairs |
| **Dashboard** | Portfolio balances, active positions with APY |

### Wallet Integration

- **Library:** `get-starknet` v4 + `starknet.js` v9 `WalletAccount`
- **Supported:** Braavos, ArgentX
- **RPC:** Alchemy (reads + fee estimation), wallet handles signing
- **Session:** Auto-reconnect on page refresh via `neverAsk`
- **Multicall:** Up to 6 contract calls in a single atomic transaction

### Swap Pairs

| From → To | Route | Calls |
|-----------|-------|-------|
| PT ↔ SY | AMM swap | 2 |
| xSTRK → SY | Wrap | 2 |
| SY → xSTRK | Unwrap | 1 |
| xSTRK → PT | Wrap + AMM | 4 |
| PT → xSTRK | AMM + unwrap | 2 |
| STRK → xSTRK | Endur stake | 2 |
| STRK → SY | Stake + wrap | 4 |
| STRK → PT | Stake + wrap + AMM | 6 |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Cairo 2.8.5 |
| Contract Build | Scarb |
| Deployment | sncast (Starknet Foundry) |
| Verification | Walnut |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + Inline styles |
| Charts | Recharts |
| Wallet | get-starknet v4 + starknet.js v9 WalletAccount |
| RPC | Alchemy |
| Hosting | Vercel |
| Network | Starknet Mainnet |

---

## Quick Start

### Build Contracts

```bash
cd contracts
scarb build
```

### Run Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev          # http://localhost:5173
npm run build        # Production build
```

### Deploy Contracts

```bash
cd contracts
sncast --account deployer declare --network mainnet --contract-name StandardizedYield
sncast --account deployer deploy --network mainnet --class-hash <CLASS_HASH> --arguments '...'
# Repeat for each contract
```

---

## Example Transaction

**STRK → PT + YT (6-call multicall)**

TX: [`0x6aca350b...`](https://voyager.online/tx/0x6aca350b970b36bca8addb53fcc3359977b0645ceb4e62117a580726030cd35) — Confirmed on L1

```
Call 1: STRK.approve(xSTRK, 1.0)        → Allow Endur to take STRK
Call 2: xSTRK.deposit(1.0, wallet)       → Stake via Endur, receive xSTRK
Call 3: xSTRK.approve(SY, 1.0)          → Allow SY to take xSTRK
Call 4: SY.deposit(1.0)                  → Wrap xSTRK → SY shares
Call 5: SY.approve(Core, 1.0)           → Allow Core to take SY
Call 6: Core.split(market_0, 1.0)       → Split SY → mint PT + YT
```

Gas: ~0.15 STRK

---

## License

MIT
