# Launch Observatory / radar-3

An offline token launch radar: **198 ranked protocols, 40/40 watchlist coverage**, with the original eligibility rules and growth, maturity and breadth multipliers preserved.

The value model fits ordinary least squares to ln(market cap) versus ln(TVL) on positive-cap, positive-TVL non-CEX comparables with cap/TVL in [0.02,10]. Implied value is max(1, round(exp(intercept + slope × ln(TVL)) × growth × maturity × breadth)). Median cap/TVL remains reported; fewer than ten comps uses 0.25. Invalid or nonpositive fitted slopes fall back to the median-multiple curve.

Validation uses a deterministic slug-hash holdout and a median-listing-date cohort split, each fitting only its training records. The latter is a cross-sectional cohort test, not a historical backtest. The dashboard reports test counts, median absolute natural-log error and within-factor-two accuracy. A fixed-seed mulberry32 bootstrap refits 200 samples; row bands use p10/p90 refitted values, expanded if needed to include the point estimate. Bands measure conditional fit uncertainty, not future prices.

Growth = 1 + 0.5 tanh(7d/50). Maturity = 0.55 + 0.45 ln(1+min(age,1095))/ln(1096), unknown age 365 days. Breadth = 1 + 0.05 min(max(chains−1,0),5). Signal combines value percentile (50%), growth (30%) and maturity (20%).

Farm planning assumptions: capital $250/$150/$100/$50 by TVL ≥$1B/≥$100M/≥$10M/below; hold 90/60/30 days by age <180/<365/otherwise. Actions = 2 + ceil(hold/7) + 1, with gas estimated at $10 each. Total planned spend includes capital plus gas. Break-even share = total / band-low implied value: the fraction of band-low implied value a farmer must capture to cover the stated farm cost. Verdicts: farm ≤0.00002 (0.002%); thin ≤0.00006 (0.006%); otherwise skip. These round thresholds are the model’s own stated cutoffs, not snapshot facts, promised allocations or expected payouts. Dashboard threshold text reads the model summary. Capital may be recovered; gas is spent. Plans contain 7–9 steps with offline wallet safety, category-specific core action, budget/log, weekly cadence, second-chain research or points, exit rehearsal and final claim safety.

Run with Node 22.18+:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input /home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json
```

Open out/dashboard/index.html. No dependencies, network, paid APIs or live prices. The model tab includes the fitted curve, full diagnostics and a local log–log scatter. Board filters include verdict and break-even sorting; every detail recomputes the board value at full precision.

“Records no token” is not proof of absence. TVL may overlap or include wrapped capital. Listing age is tracking age. Implied value is this entry's own claim, not a price, launch forecast or airdrop guarantee. MIT licensed; the vendored dossier library is supplied by the competition kit.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01) on make.fun.
