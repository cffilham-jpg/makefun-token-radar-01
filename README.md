# Launch Observatory / radar-5

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An offline conditional-value radar: 198 ranked protocols, 40/40 watchlist records. Eligibility, accounting priority and launch signal are unchanged from radar-4. No entry network calls.

## Model selection

All candidates refit from scratch in each of 98 leave-one-out folds, including family offsets. Fixed priors are never trained. A adds log chain count to Huber; B blends the Huber/family curve with the median ratio of five nearest same-family peers (curve-only below two peers); C uses ten L1 IRLS reweights from OLS, weights 1/max(abs(residual), 0.1 × MAD scale).

| Candidate | Full LOO median miss | Within 3× | Spearman | Decision |
|---|---:|---:|---:|---|
| A | 2.7931× | 54.08% | 0.5335 | Rejected |
| B | 3.6818× | 44.90% | 0.4751 | Rejected |
| C | 2.6229× | 55.10% | 0.5403 | Adopted |

C is adopted: its median beats radar-4's 2.8388×, within-3× exceeds 51%, and correlation exceeds 0.54. A fails correlation; B fails all three bars. This is a blind-fold comparison, not an in-sample selection.

## Value construction

l1-log-log-irls: exp(7.1164 + 0.5220 × ln(TVL)), weighted R² 0.5776, n=98. Comparables require positive cap and TVL, cap/TVL in [0.02,10], and non-CEX category. Median cap/TVL 0.3134; fewer than ten comps use 0.25.

Family residual means shrink by eight pseudo-tokens:

| Family | n | Log offset | Multiple |
|---|---:|---:|---:|
| Infra & chains | 16 | 0.5727 | 1.7730 |
| Lending & CDP | 13 | -0.2119 | 0.8091 |
| Other | 13 | 0.0776 | 1.0807 |
| RWA & stables | 10 | -0.0845 | 0.9190 |
| Staking | 7 | -0.4632 | 0.6293 |
| Trading | 22 | 0.1131 | 1.1197 |
| Vaults & yield | 17 | -0.3422 | 0.7102 |

Growth = 1 + 0.25 tanh(change_7d/50). Maturity = 0.85 + 0.15 log1p(min(age,1095))/log1p(1095); unknown age is 365. Breadth = 1 + 0.02 min(max(chains−1,0),5). Value is max(1, round(curve × family × growth × maturity × breadth)). Sort descending, slug ascending on ties. Same-name traded siblings are flagged without changing value. Nearest peers use same-family log-TVL distance, ties by slug.

## Blind validation

| Variant | Median miss | Mean absolute log error | Within 3× | Spearman |
|---|---:|---:|---:|---:|
| flat | 3.3868× | 1.2474 | 40.82% | 0.5286 |
| curve | 3.0118× | 1.1451 | 50.00% | 0.4981 |
| family | 2.6329× | 1.1100 | 54.08% | 0.5443 |
| full | 2.6229× | 1.1132 | 55.10% | 0.5403 |

Priors slightly improve median miss but worsen mean absolute log error and rank correlation.

holdout: n=29, median absolute log error 1.2192 (3.3843×), within 2× 34.48%.

time_split: n=37, median absolute log error 0.7834 (2.1888×), within 2× 40.54%.

200 fixed-seed mulberry32 refits: slope P10–P90 0.4048–0.6475, intercept 4.8462–9.1462. Each refit reranks every row. Detail bands are P10–P90 expanded to contain the point; board mini-bars are P25–P75. These are conditional fit intervals, not forecast price intervals.

Rank examples: Steakhouse Financial: #1, P10–P90 1–2; Sentora Curator: #2, P10–P90 2–3; Gauntlet: #3, P10–P90 3–5.

## Farmer economics

Every plan deposits $1,000, returned on exit if withdrawals remain available: principal at risk, not spent. Choose the cheapest of the first three listed chains, matching names case-insensitively by substring (BNB aliases BSC). Planning gas per action:

| Chain | USD |
|---|---:|
| Ethereum | 3.00 |
| Arbitrum | 0.05 |
| Base | 0.05 |
| Optimism | 0.05 |
| BSC | 0.10 |
| Polygon | 0.05 |
| Solana | 0.02 |
| Avalanche | 0.10 |
| zkSync Era | 0.10 |
| Linea | 0.05 |
| Scroll | 0.05 |
| Blast | 0.05 |
| Mode | 0.05 |
| Mantle | 0.05 |
| default | 0.50 |

Hold 90 days for age <180, 60 for age <365, otherwise 30. Actions = 3 + ceil(hold/7). Gas = actions × chain gas. Forgone yield assumes 4% annual T-bill return: 1000 × 0.04 × hold/365. Cash cost = gas + forgone yield.

Assume 10% of launch value distributed pro rata to depositors: slice = 0.10 × value × 1000/TVL. Net = slice − cash cost; low-end net replaces value with P10 band low. Break-even odds = min(1,cash cost/slice), not a launch forecast. Break-even value = round(cash cost/(0.10 × 1000/TVL)).

Pays-from deposit = ceil(gas/[0.10 × value/TVL − 0.04 × hold/365]), at least $1. If the bracket is nonpositive, no deposit pays. Net/hour divides by hands-on minutes/60, floored at one minute; holding is not active time.

Verdicts are definitional and evaluated in order: robust if low-end net ≥0; farm if point net ≥0; thin if slice > gas; skip otherwise. Distribution: {"thin":15,"farm":13,"robust":155,"skip":15}.

Gauntlet (farm, Base): slice $3.91 − gas $0.40 − forgone $3.29 = net $0.22; low net $-1.24, pays from $643, break-even value $58179853, odds 94.32%.

Symbiotic (skip, Ethereum): slice $11.98 − gas $24.00 − forgone $3.29 = net $-15.31; low net $-18.98, pays from $2762, break-even value $69289755, odds 100.00%.

Plans have 8–9 timed, costed steps: fresh offline wallet, named core action, budget/log, TVL stop, weekly check, second-chain or points research, exit rehearsal and claim safety. A weekly check's listed active minutes count once; additional activity adds time and fees.

## Run and review

Node 22.18+; no dependencies:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/radar-out-a node main.ts --input /home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json
node /home/hatch/workspace/makefun/validate-radar.mjs /tmp/radar-out-a
node /home/hatch/workspace/makefun/audit-radar.mjs /tmp/radar-out-a
node /home/hatch/workspace/makefun/radar-shots-v4.mjs /tmp/radar-out-a
```

Open the output dashboard/index.html. Browser impliedOf and netOf recompute every value, rank, verdict and net. Search, category/chain/signal/watchlist/verdict filters, net/hour sorting, trading anchors, keyboard detail and Escape work offline.

Hash holdout and listing-cohort splits are cross-sectional, not historical backtests. TVL can overlap, listing age is tracking age, records no token is not proof of absence. Farming can lose principal and fees; launch, rewards and allocation are unconfirmed. Never pay to claim. MIT licensed. The supplied dossier library is unchanged.
