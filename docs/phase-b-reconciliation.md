# Phase B conflict reconciliation

PR #7 and PR #8 independently implemented the Phase B migration from the same Phase A base. PR #7 reached `main` first, so merging both implementations unchanged would have left duplicate engine support modules and duplicate baseline runners.

The conflict was resolved by retaining the already-validated implementation on `main` as the canonical TypeScript engine. PR #8's independent implementation was used as a parity check rather than being layered on top as a second engine.

Both implementations validated the same conditions:

- 100 simulated seasons
- seed `20260723`
- the Phase A metric definitions and population standard deviation
- no React UI changes
- no changes to `legacy/index.html`
- no changes to the localStorage save-data format

The independently recorded results matched the Phase A baseline after stored rounding:

| Metric | Mean | Population standard deviation |
| --- | ---: | ---: |
| Batting average | 0.221309 | 0.005742 |
| ERA | 4.221261 | 0.282428 |
| Home runs | 3117.99 | 243.897 |
| Stolen-base success rate | 0.621848 | 0.061481 |
| Walk rate | 0.073970 | 0.004831 |

This reconciliation deliberately avoids keeping parallel files such as two player-generation modules, two special-ability modules, or two new-engine baseline pipelines. The implementation currently on `main` remains the single source of truth.