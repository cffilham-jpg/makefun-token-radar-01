# Launch Observatory / radar-4

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Offline radar: 198 ranked protocols, 40/40 watchlist coverage. Eligibility remains unchanged.

## Value and validation

Huber log-log IRLS fits the snapshot's 98 positive-cap comparables (cap/TVL 0.02–10, non-CEX). Three reweights use c=1.345 and MAD scale. The curve is exp(5.145144 + 0.636012 × ln(TVL)), weighted R² 0.345724. Family mean residuals shrink by eight pseudo-tokens. Median cap/TVL is 0.313379; fewer than ten comps fall back to 0.25.

Growth = 1 + 0.25 tanh(change_7d/50); maturity = 0.85 + 0.15 ln(1+min(age,1095))/ln(1096); breadth = 1 + 0.02 min(max(chains−1,0),5). Unknown age is 365 days. Multiply the family-adjusted curve by these priors, round and floor at $1. Original launch signal weighting and tiers are preserved.

LOO refits every training fold, including flat medians and family offsets:

| Model | Median miss | Mean absolute log error | Within 3× | Spearman |
|---|---:|---:|---:|---:|
| flat | 3.3868× | 1.2474 | 40.82% | 0.5286 |
| curve | 3.0522× | 1.1571 | 48.98% | 0.5053 |
| family | 2.8569× | 1.1277 | 51.02% | 0.5438 |
| full | 2.8388× | 1.1304 | 51.02% | 0.5449 |

holdout: 29 tests, median absolute log error 1.0993 (3.0019× miss), within 2× 34.48%.

time_split: 37 tests, median absolute log error 0.7313 (2.0777× miss), within 2× 48.65%.

The 200 fixed-seed mulberry32 bootstrap refits produce slope P10–P90 0.5267–0.7320, intercept 3.4489–7.0099. Per-row value bands include the point estimate. They describe conditional fit uncertainty, not future prices. Hash and listing-cohort tests are cross-sectional, not historical backtests.

## Farming assumptions

Capital tiers are $250/$150/$100/$50 for TVL ≥$1B/≥$100M/≥$10M/below. Hold windows are 90/60/30 days for age <180/<365/otherwise. Planned actions are 3 + ceil(hold/7), at $10 gas per action. Total planned spend includes capital and gas. Principal may be recoverable; fees are spent.

Break-even share = total spend / band-low value. Round verdict cutoffs: farm ≤0.00003, thin ≤0.00009, else skip. Distribution: {"farm":82,"thin":101,"skip":15}. These are stated research cutoffs, not fitted equal-sized buckets.

Assume 10% airdrop allocation, explicitly not a snapshot fact. Slice if launch = 0.10 × implied value × capital / TVL; net = slice − planned spend; break-even odds = min(1, spend/slice). Net per hour divides net by active plan minutes, counting a weekly check once rather than treating the hold as active work. No launch chance is predicted. Plans include offline wallet setup, core action, budget/log, a stop at 90% of current TVL, weekly stop review, points/second-chain research, exit rehearsal and claim safety.

## Run

Node 22.18+; no dependencies or entry network calls:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input /home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json
```

Open out/dashboard/index.html. The board shows formula, scatter and blind ablation; every value recomputes in the browser. Full-page details show peers and the complete costed plan. Search, category/chain/signal/verdict filters and value/TVL/growth/age/rank/break-even/net-hour sorts work offline.

Records no token is not proof of absence. TVL can overlap, listing age is tracking age, and farming can lose principal and fees. No launch, reward or allocation is guaranteed. Never pay to claim. MIT licensed; the supplied dossier library remains unchanged.
