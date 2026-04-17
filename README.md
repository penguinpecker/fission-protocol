# Fission Protocol

**Yield tokenization on Hedera.** Split yield-bearing DeFi tokens into tradeable Principal Tokens (PT) and Yield Tokens (YT) using a Pendle V2-style time-decay AMM.

**Live:** [fission-hedera.vercel.app](https://fission-hedera.vercel.app)  
**Chain:** Hedera Mainnet (Chain ID 295)  
**All contracts verified on [HashScan](https://hashscan.io)**

---

## Deployed Contracts (Hedera Mainnet)

| Contract | Hedera ID | Verified |
|----------|-----------|----------|
| MathLib | [0.0.10438386](https://hashscan.io/mainnet/contract/0.0.10438386) | ✅ Full match |
| FissionCore | [0.0.10438400](https://hashscan.io/mainnet/contract/0.0.10438400) | ✅ Full match |
| FissionAMM | [0.0.10438414](https://hashscan.io/mainnet/contract/0.0.10438414) | ✅ Full match |
| FissionRouter | [0.0.10438427](https://hashscan.io/mainnet/contract/0.0.10438427) | ✅ Full match |
| SY_SaucerSwapLP | [0.0.10439073](https://hashscan.io/mainnet/contract/0.0.10439073) | ✅ Full match |
| SY_HBARX | [0.0.10438458](https://hashscan.io/mainnet/contract/0.0.10438458) | ✅ Full match |

## Live Markets

| ID | Underlying | Maturity | Pool |
|----|------------|----------|------|
| 0 | SaucerSwap HBAR-USDC LP | Jul 16, 2026 | — |
| 1 | HBARX Staking | Jul 16, 2026 | — |
| 5 | SaucerSwap HBAR-USDC (seeded) | Jul 16, 2026 | ✅ Initialized |

---

## How It Works

Fission splits any yield-bearing token into two components:

- **PT (Principal Token)** — Buy at a discount, redeem 1:1 at maturity. Locks in a fixed yield.
- **YT (Yield Token)** — Receives all variable yield until maturity. Leveraged exposure to rates.

```
User deposits SY (yield-bearing token)
         │
         ▼
    FissionCore.split()
         │
    ┌────┴────┐
    ▼         ▼
   PT         YT
 (fixed)   (variable)
    │         │
    ▼         ▼
 Trade on   Collect yield
 FissionAMM  via claimYield()
    │
    ▼
 PT → $1.00 at maturity (time-decay AMM convergence)
```

### Strategies

| Strategy | Action | Risk | Best For |
|----------|--------|------|----------|
| Fixed yield | Buy PT | Low | Lock in guaranteed APY |
| Long yield | Buy YT | High | Bet on rising rates |
| Split | Mint PT+YT | Medium | LP or sell one side |

---

## Architecture

```
┌─────────────┐     ┌──────────────┐
│ SaucerSwap  │     │   HBARX      │
│  LP Token   │     │  (Stader)    │
└──────┬──────┘     └──────┬───────┘
       │                   │
       ▼                   ▼
┌──────────────────────────────────┐
│    Standardized Yield (SY)       │
│    Adapters with postRate oracle │
│  SY_SaucerSwapLP    SY_HBARX    │
└──────────────┬───────────────────┘
               │
               ▼
      ┌────────────────┐
      │  FissionCore   │ ← split / merge / redeem / claimYield
      └───┬────────┬───┘
          │        │
     ┌────┘        └────┐
     ▼                  ▼
┌────────┐        ┌────────┐
│   PT   │        │   YT   │
│(ERC-20)│        │(ERC-20)│
└───┬────┘        └────────┘
    │
    ▼
┌───────────────┐
│  FissionAMM   │ ← Pendle V2 logit time-decay curve
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ FissionRouter │ ← buyPT, buyYT, depositAndSplit, addLiquidity
└───────────────┘
```

## Contract Details

| Contract | Lines | Purpose |
|----------|-------|---------|
| **MathLib** | 159 | Pendle V2 AMM math — lnWad, expWad, implied rate, PT pricing |
| **FissionCore** | 237 | Yield tokenization engine: split, merge, redeem, yield accrual |
| **FissionAMM** | 275 | Time-decay AMM: constant-product → constant-sum at maturity |
| **FissionRouter** | 149 | User-facing: buyPT, buyYT, depositAndSplit, addLiquidity |
| **PrincipalToken** | 47 | ERC-20 PT, mint/burn controlled by Core |
| **YieldToken** | 46 | ERC-20 YT, mint/burn controlled by Core |
| **SY_SaucerSwapLP** | 129 | SY adapter with keeper-posted exchange rate (rate-capped, time-gated) |
| **SY_HBARX** | 105 | SY adapter for Stader HBARX liquid staking |

### Security Hardening

- `Ownable2Step` — two-step ownership transfer
- `Pausable` — global + per-market pause
- `ReentrancyGuard` — on all state-changing functions
- Guardian role — can pause without being owner
- Rate caps — max 10% yield index move per update, 5% per SY postRate
- Market creation cooldown — 1 hour between new markets
- Minimum liquidity lock — prevents dust attacks
- Deadline enforcement — on all swap operations
- Emergency withdraw — owner can rescue stuck tokens

### AMM Math

The AMM uses a logit-based time-decay curve (same as Pendle V2):

```
impliedRate = exp(logit(proportion) / (scalarRoot × timeToExpiry)) - 1
ptPrice = exp(-impliedRate × timeToExpiry)
```

- Far from maturity → constant-product behavior (wide spread)
- Near maturity → constant-sum behavior (PT converges to $1.00)

### Yield Flow

```
Keeper bot (hourly)
  │
  ├→ postRate() on SY adapters (rate-capped, time-gated)
  │
  └→ updateYieldIndex() on FissionCore
       │
       └→ _accrueYield() for YT holders
            │
            └→ earned = ytBalance × (currentIndex - userLastIndex) / 1e18
                 │
                 └→ claimYield() to withdraw
```

### User-Callable vs Direct

| Function | Call via |
|----------|---------|
| Split SY → PT+YT | FissionCore.split() |
| Buy PT | FissionRouter.buyPT() |
| Buy YT | FissionRouter.buyYT() |
| Add liquidity | FissionRouter.addLiquidity() |
| Claim yield | FissionCore.claimYield() (direct) |
| Redeem PT | FissionCore.redeemPT() (direct) |
| Merge PT+YT → SY | FissionCore.merge() (direct) |
| Remove liquidity | FissionAMM.removeLiquidity() (direct) |

---

## Frontend

Built with React + TypeScript + Vite + Recharts. Black/white/silver monochrome theme.

- **Fonts:** Outfit, JetBrains Mono, Instrument Serif
- **Wallet:** MetaMask or HashPack (both inject `window.ethereum`)
- **Chain reads:** `fetchMarketData`, `fetchPoolData`, `fetchMarketCount` via Hashio JSON-RPC
- **Transactions:** Real contract calls with approve flows, HashScan tx links
- **Auto-refresh:** 30-second polling for on-chain data

### Pages

1. **Landing** — Hero, stats from chain, strategy explainer
2. **Markets** — List of yield markets with APY, TVL, mini charts
3. **Trade** — Strategy selector, swap form, yield/PT charts, user positions

---

## Setup

### Prerequisites

- Node.js 18+
- Hedera account with ECDSA key
- MetaMask or HashPack wallet

### Contracts

```bash
cd contracts
npm install
cp .env.example .env
# Fill in DEPLOYER_ACCOUNT_ID and DEPLOYER_PRIVATE_KEY
npx hardhat compile
node redeploy-all.mjs       # Deploy all contracts (~50 HBAR)
node create-market1.mjs     # Create HBARX market (after 1hr cooldown)
node seed-pool-auto.mjs     # Seed AMM pool with liquidity
node verify-hashscan.mjs    # Verify contracts on HashScan
node update-frontend-addrs.mjs  # Update frontend with new addresses
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # Local dev server
npx tsc --noEmit            # Type check
npx vite build              # Production build
```

### Keeper Bot

```bash
cd contracts
node keeper.mjs             # Runs hourly rate updates
```

Rate sources: SaucerSwap API, Stader API, Hedera Mirror Node (with fallbacks).

---

## Scripts

| Script | Purpose |
|--------|---------|
| `redeploy-all.mjs` | Deploy all 6 contracts + create Market 0 |
| `create-market1.mjs` | Create Market 1 (HBARX) after cooldown |
| `seed-pool-auto.mjs` | Deploy seed token, SY, market, seed AMM pool |
| `keeper.mjs` | Hourly rate updates with real data feeds |
| `verify-hashscan.mjs` | Verify all contracts on HashScan via Sourcify |
| `update-frontend-addrs.mjs` | Patch useWallet.ts + App.tsx with new addresses |

---

## Hedera-Specific Notes

- Contracts deploy via **Hedera SDK `ContractCreateFlow`** (not Hardhat deploy — Hashio RPC fails with `INSUFFICIENT_TX_FEE` for deployments)
- Hardhat is used **only as a Solidity compiler**
- ECDSA accounts use **Ethereum-style addresses** as `msg.sender`, not Hedera long-zero format
- Key derivation: `mnemonic.toStandardECDSAsecp256k1PrivateKey('', 0)`
- SY adapters use a **postRate oracle pattern** — keeper posts rates, not read from token balances (SaucerSwap V2 uses NFT positions, uncollected fees aren't readable on-chain)
- No MEV/front-running — Hedera has fair transaction ordering
- Fixed gas fees ~$0.001 per transaction

## Tech Stack

- **Contracts:** Solidity 0.8.24, OpenZeppelin 5.x, Hardhat
- **Frontend:** React, TypeScript, Vite, Recharts, ethers.js v6
- **Deployment:** Hedera SDK, `ContractCreateFlow`
- **Wallet:** MetaMask / HashPack via `window.ethereum`
- **Hosting:** Vercel
- **Explorer:** HashScan (Sourcify-verified)

## License

MIT
