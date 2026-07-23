# Phase C UI architecture

The Vite application now uses the Phase B TypeScript engine directly.

- `components/screens` owns screen-specific presentation and local navigation state.
- `components/widgets` contains reusable roster, standings, player-detail, and box-score views.
- `state/gameState.tsx` owns application-wide state and calls engine functions.
- `state/storage.ts` preserves the `npb_sim_v3_restored` key and migrates legacy special abilities.
- `state/offseason.ts` contains UI orchestration helpers ported from the legacy screen flow.

No files under `src/engine` or `src/data` are changed in Phase C. Probability formulas and game-balance behavior remain owned by the Phase B engine.
