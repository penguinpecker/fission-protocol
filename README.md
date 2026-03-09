<div align="center">


# Fission Protocol

### Yield Tokenization for Starknet

**Split yield-bearing assets into Principal Tokens (PT) and Yield Tokens (YT)**

Lock fixed yield • Speculate on rates • Provide liquidity

[**Launch App →**](https://fission-protocol.vercel.app) · [**Contracts on Voyager**](#deployed-contracts)

---

</div>

## Why Fission

Starknet's liquid staking ecosystem is growing — xSTRK from Endur earns ~6.5% APY, xLBTC derivatives offer BTC yield exposure. But today, if you hold these assets, you're locked into whatever the variable rate gives you. There's no way to lock a fixed rate, no way to get leveraged yield exposure, and no secondary market for yield itself.

Fission fixes this by tokenizing yield into two composable primitives:

**Principal Tokens (PT)** represent the underlying asset stripped of its yield. PT-xSTRK trades at a discount to xSTRK and converges to 1:1 at maturity — the discount is your guaranteed fixed APY. Institutions and risk-averse users buy PT to lock predictable returns regardless of rate volatility.

**Yield Tokens (YT)** represent the right to collect all variable staking rewards from the underlying until maturity. YT-xSTRK gives leveraged exposure to xSTRK staking rates — if you believe rates will increase, YT amplifies your upside. Near maturity, YT leverage can exceed 100x.

Together, PT and YT create a yield market where users can express directional views on STRK and BTC staking rates, hedge yield risk, or earn swap fees as liquidity providers — all fully on-chain on Starknet with atomic multicall execution.

### Supported Assets

| Asset | Source | Type | Status |
|-------|--------|------|--------|
| xSTRK | Endur | STRK liquid staking (~6.5% APY) | Live |
| xLBTC | Endur | BTC liquid staking | Coming Soon |

---

## How It Works

### One-Click Flow

Fission accepts raw STRK and handles everything in a single atomic transaction:

```
STRK → Endur Stake → xSTRK → SY Wrap → Split → PT + YT
```

6 contract calls, 1 wallet popup, ~0.15 STRK gas. Powered by Starknet's native account abstraction multicall.

### Strategies

**Fixed Yield (Buy PT)** — Buy PT at a discount (e.g., 0.982 SY). At maturity, redeem 1:1 for the underlying. The discount is your guaranteed fixed yield — no matter what happens to staking rates.

**Long Yield (Buy YT)** — YT captures all variable staking rewards until maturity. If staking rates go up, your YT earns more. Effective leverage = 1 / YT_price. High risk, high reward.

**Split & LP** — Split SY into PT + YT. Provide PT + SY as liquidity to the AMM and earn swap fees from traders.

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

All contracts are deployed on **Starknet Mainnet** and verified on Walnut.

| Contract | Address | Link |
|----------|---------|------|
| FissionCore | `0x05cd0b5b58bad5c15b09404797866e1fde74eea86d0b9db6f95f59c9237e45e8` | [Voyager](https://voyager.online/contract/0x05cd0b5b58bad5c15b09404797866e1fde74eea86d0b9db6f95f59c9237e45e8) |
| SY-xSTRK | `0x03d7988a09d99faf667e10972bcb67a222e69cbc601cff75f1c4584d28356560` | [Voyager](https://voyager.online/contract/0x03d7988a09d99faf667e10972bcb67a222e69cbc601cff75f1c4584d28356560) |
| PT-xSTRK | `0x031479ec546f1793777615b919fa089d17b937a4228ea816134fa78bfac9d9a2` | [Voyager](https://voyager.online/contract/0x031479ec546f1793777615b919fa089d17b937a4228ea816134fa78bfac9d9a2) |
| YT-xSTRK | `0x057025e04427eb4d04281acc9d09c09328eb496df13e12e1159ebddd10dd1bc9` | [Voyager](https://voyager.online/contract/0x057025e04427eb4d04281acc9d09c09328eb496df13e12e1159ebddd10dd1bc9) |
| FissionAMM | `0x03063b4bee616d11ef15d124fe2a94193a54db577cf00795b8953b54bd5543c6` | [Voyager](https://voyager.online/contract/0x03063b4bee616d11ef15d124fe2a94193a54db577cf00795b8953b54bd5543c6) |

---

## Smart Contracts

Cairo 2.8.5 contracts built with Scarb, deployed via sncast.

| File | Description | Key Functions |
|------|-------------|---------------|
| `standardized_yield.cairo` | ERC20 wrapper with yield tracking | `deposit`, `redeem`, `exchange_rate`, `approve`, `transfer` |
| `fission_core.cairo` | Split/merge engine, yield distribution | `split`, `merge`, `redeem_pt`, `claim_yield`, `create_market` |
| `principal_token.cairo` | PT token (ERC20 + maturity + mint/burn) | `approve`, `transfer`, `mint`, `burn`, `get_maturity` |
| `yield_token.cairo` | YT token (ERC20 + yield index tracking) | `approve`, `transfer`, `mint`, `burn`, `set_user_yield_index` |
| `fission_amm.cairo` | Constant product PT/SY AMM | `swap_sy_for_pt`, `swap_pt_for_sy`, `add_liquidity`, `remove_liquidity` |

---

## Frontend

**Live:** [fission-protocol.vercel.app](https://fission-protocol.vercel.app)

### Pages

| Page | Description |
|------|-------------|
| Markets | xSTRK market with APY, TVL, maturity. xLBTC coming soon. |
| Strategy | Choose Fixed Yield (PT), Long Yield (YT), or Split & LP |
| Trade | Deposit + split in one click. STRK/xSTRK toggle. Route display. |
| Swap | Trade between STRK, xSTRK, SY, PT, YT — 9 supported pairs |
| Dashboard | Portfolio balances and active positions |

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

### Wallet Integration

- `get-starknet` v4 + `starknet.js` v9 `WalletAccount`
- Braavos and ArgentX supported
- Alchemy RPC for reads + fee estimation
- Up to 6 contract calls in a single atomic multicall

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Cairo 2.8.5 |
| Build | Scarb |
| Deploy | sncast (Starknet Foundry) |
| Verification | Walnut |
| Frontend | React 19 + TypeScript + Vite |
| Wallet | get-starknet v4 + starknet.js v9 |
| RPC | Alchemy |
| Hosting | Vercel |
| Network | Starknet Mainnet |

---

## Quick Start

### Contracts

```bash
cd contracts
scarb build
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

---

## Example Transaction

**STRK → PT + YT** — [View on Voyager](https://voyager.online/tx/0x6aca350b970b36bca8addb53fcc3359977b0645ceb4e62117a580726030cd35)

```
Call 1: STRK.approve(xSTRK, 1.0)
Call 2: xSTRK.deposit(1.0, wallet)       ← Endur stake
Call 3: xSTRK.approve(SY, 1.0)
Call 4: SY.deposit(1.0)                  ← Wrap to SY
Call 5: SY.approve(Core, 1.0)
Call 6: Core.split(market_0, 1.0)        ← Mint PT + YT
```

Confirmed on L1. Gas: ~0.15 STRK.

---

## License

MIT
