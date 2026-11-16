# Launch Observatory
An offline token launch radar ranking every eligible protocol that records no token in the sealed DefiLlama snapshot. Includes filters, top farms, trading comparables, and protocol-specific farming plans.

radar-2 implied value = max(1, round(TVL × calibratedMultiple × growth × maturity × breadth)). The multiple is the median live market-cap/TVL ratio within [0.02, 10], falling back to 0.25 below ten samples. Growth = 1 + 0.5 tanh(7d/50). Maturity = 0.55 + 0.45 ln(1+min(age,1095))/ln(1096), unknown age 365 days. Breadth = 1 + 0.05 min(max(chains−1,0),5). Signal combines value percentile (50%), growth (30%) and maturity (20%). These are model claims, not launch forecasts or prices.

Run with Node 22.18+:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json
```

Open out/dashboard/index.html. No dependencies or network required. MIT licensed; LICENSE created by make.fun init. The vendored dossier library is supplied by the competition kit.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cffilham-jpg/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01) on make.fun.
