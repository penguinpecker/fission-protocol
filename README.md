# Fission Protocol

**Yield tokenization on Hedera.** Split yield-bearing DeFi tokens into tradeable Principal (PT) and Yield (YT) tokens.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ SaucerSwap  │     │   HBARX      │     │ Bonzo Lend   │
│  LP Token   │     │  (Stader)    │     │  (bUSDC)     │
└──────┬──────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │
       ▼                   ▼                    ▼
┌──────────────────────────────────────────────────────┐
│              Standardized Yield (SY) Adapters        │
│  SY_SaucerSwapLP   SY_HBARX       SY_BonzoLend      │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  FissionCore   │
                  │  split / merge │
                  │  redeem / yield│
                  └───┬────────┬───┘
                      │        │
                 ┌────┘        └────┐
                 ▼                  ▼
          ┌────────────┐    ┌────────────┐
          │     PT     │    │     YT     │
          │  (ERC-20)  │    │  (ERC-20)  │
          └─────┬──────┘    └────────────┘
                │
                ▼
        ┌───────────────┐
        │  FissionAMM   │
        │  Time-decay   │
        │  logit curve  │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ FissionRouter │
        │  One-click    │
        │  user flows   │
        └───────────────┘
```

## Contracts

| Contract | Purpose |
|----------|---------|
| `MathLib.sol` | Pendle V2 logit curve AMM math — lnWad, expWad, implied rate, PT pricing, swap calculations |
| `FissionCore.sol` | Split SY → PT+YT, merge, redeem at maturity, yield accrual via index tracking |
| `FissionAMM.sol` | Time-decay AMM — constant-product at start, constant-sum at maturity |
| `FissionRouter.sol` | One-click flows: depositAndSplit, buyPT, buyYT, addLiquidity, redeemAndWithdraw |
| `PrincipalToken.sol` | ERC-20 PT — redeemable 1:1 for SY at maturity |
| `YieldToken.sol` | ERC-20 YT — receives all yield until maturity, decays to 0 |
| `SY_SaucerSwapLP.sol` | Standardized Yield adapter for SaucerSwap V2 LP tokens |
| `SY_HBARX.sol` | Standardized Yield adapter for Stader HBARX liquid staking |
| `SY_BonzoLend.sol` | Standardized Yield adapter for Bonzo Finance USDC lending |

## AMM Math

The AMM uses a **logit-based time-decay curve** (same as Pendle V2):

```
impliedRate = exp(logit(proportion) / (scalarRoot * timeToExpiry)) - 1
ptPrice = exp(-impliedRate * timeToExpiry)
```

Where:
- `proportion` = PT_reserve / (PT_reserve + SY_reserve)
- `scalarRoot` = curve sensitivity parameter (50-200)
- `timeToExpiry` = seconds until maturity / seconds per year

This makes the AMM behave like:
- **Far from maturity**: constant-product (wide spread, normal price discovery)
- **Near maturity**: constant-sum (tight spread, PT converges to $1.00)

## Quick Start

### Contracts

```bash
# Contracts
cd contracts && npm install && npm run compile
# Edit .env with your Hedera ECDSA private key
npm run deploy        # deploys to mainnet
npm run setup         # creates markets on mainnet
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Hedera-Specific Notes

- Contracts deploy via **Hashio JSON-RPC relay** (EVM-compatible)
- Works with **MetaMask** (add Hedera testnet) or **HashPack** wallet
- Hedera testnet chainId: `296`, mainnet: `295`
- Fixed transaction fees (~$0.001 per tx)
- No MEV/front-running due to Hedera's fair ordering
- Future: migrate PT/YT to HTS tokens via system contract precompile (0x167)

## Markets

| Market | Underlying | Yield Source | Est. APY Range |
|--------|-----------|-------------|----------------|
| SaucerSwap HBAR-USDC | LP token | Swap fees | 8-22% |
| HBARX (Stader) | HBARX | Staking rewards | 2.5-5.6% |
| Bonzo USDC | bUSDC | Lending interest | 3-9% |

## Grant Milestones (Hedera Thrive S2)

- **Milestone 1** (Testnet): Deploy all contracts on Hedera testnet. Demo video showing split/trade/redeem.
- **Milestone 2** (Mainnet): Launch with SaucerSwap LP market. HashPack integration.
- **Milestone 3** (Traction): $20K+ TVL, 200+ MAU, 25K+ monthly transactions.
- **Milestone 4** (Adoption): Add HBARX + Bonzo markets. $40K+ TVL, 400+ MAU, 50K+ txns.

## License

MIT
