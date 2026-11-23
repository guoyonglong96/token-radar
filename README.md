# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/guoyonglong96/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/guoyonglong96/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (model radar-3) ranks all 198 pre-token protocols in the sealed DefiLlama snapshot by implied value and shows a seven-step farm plan for each, in a filterable dashboard with a live model sandbox.

Model radar-3 fits its value curve at run time (OLS on the snapshot's 128 traded protocols) and picks its growth, maturity and breadth adjustments by a 48-combination grid search on five held-out folds; the dashboard shows the fit, the grid, the ablation, the per-stratum ledger and the calibration table under "Fitted, not asserted".

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=mv53hp7j&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
