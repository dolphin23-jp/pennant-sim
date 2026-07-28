import type {
  AccumulatedStats,
  AtBatLogEntry,
  BatterStats,
  GameState,
  PitcherStats,
  PlayerStats,
  Team,
  TeamKey,
} from './types';
export const createBatterStats = (name: string): BatterStats => ({
  type: 'bat',
  name,
  g: 0,
  pa: 0,
  ab: 0,
  h: 0,
  s: 0,
  d: 0,
  t: 0,
  hr: 0,
  bb: 0,
  k: 0,
  rbi: 0,
  sb: 0,
  cs: 0,
  bnt: 0,
  sf: 0,
  r: 0,
  hbp: 0,
  gdp: 0,
  e: 0,
});
export const createPitcherStats = (name: string): PitcherStats => ({
  type: 'pit',
  name,
  g: 0,
  gs: 0,
  w: 0,
  l: 0,
  sv: 0,
  hld: 0,
  bs: 0,
  ip3: 0,
  h: 0,
  bb: 0,
  k: 0,
  er: 0,
  pc: 0,
  r: 0,
  hbp: 0,
  hr: 0,
  bf: 0,
});
// Walks, hit-by-pitches and sacrifices are plate appearances but not at-bats.
const NON_AT_BAT_RESULTS = new Set(['BB', 'HBP', 'SH', 'SF']);

function applyBattingEvent(stats: BatterStats, entry: AtBatLogEntry): void {
  const running = entry.result === 'SB' || entry.result === 'CS';
  if (!running) stats.pa += 1;
  if (!running && !NON_AT_BAT_RESULTS.has(entry.result)) stats.ab += 1;
  if (entry.result === 'SH') stats.bnt += 1;
  if (entry.result === 'SF') stats.sf += 1;
  if (entry.result === 'BB') stats.bb += 1;
  if (['1B', '2B', '3B', 'HR'].includes(entry.result)) {
    stats.h += 1;
    if (entry.result === '1B') stats.s += 1;
    if (entry.result === '2B') stats.d += 1;
    if (entry.result === '3B') stats.t += 1;
    if (entry.result === 'HR') stats.hr += 1;
  }
  if (entry.result === 'K') stats.k += 1;
  if (entry.result === 'SB') stats.sb += 1;
  if (entry.result === 'CS') stats.cs += 1;
  if (entry.result === 'HBP') stats.hbp += 1;
  if (entry.result === 'DP') stats.gdp += 1;
  stats.rbi += entry.rbi || 0;
}
// Every out the defence records counts toward innings pitched, including sacrifices and
// runners thrown out stealing. A double play is gated to fewer than two outs upstream,
// so its two outs can never overrun the inning.
const SINGLE_OUT_RESULTS = new Set(['K', 'GO', 'FO', 'SH', 'SF', 'CS']);

function applyPitchingEvent(stats: PitcherStats, entry: AtBatLogEntry): void {
  // Steal attempts are baserunning events logged against the pitcher, not pitches, so
  // they must not inflate the pitch count.
  const running = entry.result === 'SB' || entry.result === 'CS';
  if (!running) {
    stats.pc += entry.pc || 3;
    stats.bf += 1;
  }
  if (['1B', '2B', '3B', 'HR'].includes(entry.result)) stats.h += 1;
  if (entry.result === 'HR') stats.hr += 1;
  if (entry.result === 'BB') stats.bb += 1;
  if (entry.result === 'HBP') stats.hbp += 1;
  if (SINGLE_OUT_RESULTS.has(entry.result)) stats.ip3 += 1;
  else if (entry.result === 'DP') stats.ip3 += 2;
  if (entry.result === 'K') stats.k += 1;
  // Runs are charged from `runsScored`, which knows the responsible pitcher and whether an
  // error made the run unearned. Entries without it predate that accounting, so they fall
  // back to the historical RBI-proportional approximation.
  if (!entry.runsScored) stats.er += Math.round((entry.rbi || 0) * 0.88);
}

/** Charge runs and earned runs to the pitcher responsible for each runner. */
function applyScoredRuns(
  entry: AtBatLogEntry,
  ensurePitcher: (id: string, name: string) => PitcherStats,
): void {
  for (const run of entry.runsScored ?? []) {
    const pitcher = ensurePitcher(run.chargedPitcherId, '');
    pitcher.r += 1;
    if (run.earned) pitcher.er += 1;
  }
}
export function accumulateStatsAll(
  gameResult: GameState,
  previous: AccumulatedStats,
): AccumulatedStats {
  const next: AccumulatedStats = { ...previous };
  const ensureBatter = (id: string, name: string): BatterStats => {
    if (!next[id]) next[id] = createBatterStats(name);
    return next[id] as BatterStats;
  };
  const ensurePitcher = (id: string, name: string): PitcherStats => {
    if (!next[id]) next[id] = createPitcherStats(name);
    return next[id] as PitcherStats;
  };
  for (const entry of gameResult.atBatLog) {
    applyBattingEvent(ensureBatter(entry.batterId, entry.batter), entry);
    applyPitchingEvent(ensurePitcher(entry.pitcherId, entry.pitcher), entry);
    applyScoredRuns(entry, ensurePitcher);
    for (const run of entry.runsScored ?? []) ensureBatter(run.runnerId, '').r += 1;
    if (entry.errorFielderId) ensureBatter(entry.errorFielderId, '').e += 1;
  }
  const pitchersSeen = new Set<string>();
  for (const entry of gameResult.atBatLog) {
    if (!pitchersSeen.has(entry.pitcherId)) {
      ensurePitcher(entry.pitcherId, entry.pitcher).g += 1;
      pitchersSeen.add(entry.pitcherId);
    }
  }
  const battersSeen = new Set<string>();
  for (const entry of gameResult.atBatLog) {
    if (!battersSeen.has(entry.batterId) && entry.result !== 'SB' && entry.result !== 'CS') {
      ensureBatter(entry.batterId, entry.batter).g += 1;
      battersSeen.add(entry.batterId);
    }
  }
  if (gameResult.starterH) ensurePitcher(gameResult.starterH.id, gameResult.starterH.name).gs += 1;
  if (gameResult.starterA) ensurePitcher(gameResult.starterA.id, gameResult.starterA.name).gs += 1;
  if (gameResult.winnerPitcherId)
    ensurePitcher(gameResult.winnerPitcherId, next[gameResult.winnerPitcherId]?.name || '').w += 1;
  if (gameResult.loserPitcherId)
    ensurePitcher(gameResult.loserPitcherId, next[gameResult.loserPitcherId]?.name || '').l += 1;
  if (gameResult.savePitcherId)
    ensurePitcher(gameResult.savePitcherId, next[gameResult.savePitcherId]?.name || '').sv += 1;
  for (const id of gameResult.holdPitcherIds ?? [])
    ensurePitcher(id, next[id]?.name || '').hld += 1;
  for (const id of gameResult.blownSavePitcherIds ?? [])
    ensurePitcher(id, next[id]?.name || '').bs += 1;
  return next;
}
export function accumulateStats(
  gameResult: GameState,
  playerTeam: TeamKey,
  previous: AccumulatedStats,
): AccumulatedStats {
  const next: AccumulatedStats = { ...previous };
  const ensureBatter = (id: string, name: string): BatterStats => {
    if (!next[id]) next[id] = createBatterStats(name);
    return next[id] as BatterStats;
  };
  const ensurePitcher = (id: string, name: string): PitcherStats => {
    if (!next[id]) next[id] = createPitcherStats(name);
    return next[id] as PitcherStats;
  };
  const teamPlayerIds = new Set<string>();
  for (const entry of gameResult.atBatLog) {
    if (entry.bSide === playerTeam) teamPlayerIds.add(entry.batterId);
    if (entry.pSide === playerTeam) teamPlayerIds.add(entry.pitcherId);
  }
  for (const entry of gameResult.atBatLog) {
    if (entry.bSide === playerTeam)
      applyBattingEvent(ensureBatter(entry.batterId, entry.batter), entry);
    if (entry.pSide === playerTeam)
      applyPitchingEvent(ensurePitcher(entry.pitcherId, entry.pitcher), entry);
    if (entry.pSide === playerTeam) applyScoredRuns(entry, ensurePitcher);
    if (entry.bSide === playerTeam)
      for (const run of entry.runsScored ?? []) ensureBatter(run.runnerId, '').r += 1;
    // The fielder charged with an error is on the defensive side of the play.
    if (entry.pSide === playerTeam && entry.errorFielderId)
      ensureBatter(entry.errorFielderId, '').e += 1;
  }
  const pitchersSeen = new Set<string>(),
    battersSeen = new Set<string>();
  for (const entry of gameResult.atBatLog) {
    if (entry.pSide === playerTeam && !pitchersSeen.has(entry.pitcherId)) {
      ensurePitcher(entry.pitcherId, entry.pitcher).g += 1;
      pitchersSeen.add(entry.pitcherId);
    }
    if (
      entry.bSide === playerTeam &&
      !battersSeen.has(entry.batterId) &&
      entry.result !== 'SB' &&
      entry.result !== 'CS'
    ) {
      ensureBatter(entry.batterId, entry.batter).g += 1;
      battersSeen.add(entry.batterId);
    }
  }
  if (gameResult.starterH?.tk === playerTeam && next[gameResult.starterH.id])
    (next[gameResult.starterH.id] as PitcherStats).gs += 1;
  if (gameResult.starterA?.tk === playerTeam && next[gameResult.starterA.id])
    (next[gameResult.starterA.id] as PitcherStats).gs += 1;
  if (
    gameResult.winnerPitcherId &&
    next[gameResult.winnerPitcherId] &&
    (gameResult.starterH?.tk === playerTeam || gameResult.starterA?.tk === playerTeam)
  )
    (next[gameResult.winnerPitcherId] as PitcherStats).w += 1;
  if (gameResult.loserPitcherId && next[gameResult.loserPitcherId])
    (next[gameResult.loserPitcherId] as PitcherStats).l += 1;
  if (gameResult.savePitcherId && next[gameResult.savePitcherId])
    (next[gameResult.savePitcherId] as PitcherStats).sv += 1;
  for (const id of gameResult.holdPitcherIds ?? [])
    if (next[id]) (next[id] as PitcherStats).hld += 1;
  for (const id of gameResult.blownSavePitcherIds ?? [])
    if (next[id]) (next[id] as PitcherStats).bs += 1;
  return next;
}
export function mergeStatMaps(
  base: AccumulatedStats,
  addition: AccumulatedStats,
): AccumulatedStats {
  const output: AccumulatedStats = { ...base };
  for (const [id, stats] of Object.entries(addition)) {
    if (!output[id]) {
      output[id] = { ...stats } as PlayerStats;
      continue;
    }
    // output[id] still aliases base[id] here (the spread above only copied the top
    // level), so copy it before mutating or callers that reuse `base` across many
    // merges (e.g. per-game season snapshots in a skip batch) see their earlier
    // players' totals silently double-counted.
    const target = { ...output[id] } as unknown as Record<string, number | string>;
    for (const [key, value] of Object.entries(stats)) {
      if (key !== 'type' && key !== 'name' && typeof value === 'number') {
        target[key] = (typeof target[key] === 'number' ? target[key] : 0) + value;
      }
    }
    output[id] = target as unknown as PlayerStats;
  }
  return output;
}

export interface TeamStatLine {
  avg: number;
  hr: number;
  sb: number;
  era: number;
  k: number;
}

/** Team-level batting/pitching totals for a standings or team-report view, built by
 * summing every rostered player's individual accumulated stats. */
export function aggregateTeamStats(team: Team, statsSource: AccumulatedStats): TeamStatLine {
  let ab = 0,
    h = 0,
    hr = 0,
    sb = 0;
  for (const player of team.fielders) {
    const stats = statsSource[player.id];
    if (stats?.type === 'bat') {
      ab += stats.ab;
      h += stats.h;
      hr += stats.hr;
      sb += stats.sb;
    }
  }
  let ip3 = 0,
    er = 0,
    k = 0;
  for (const player of team.pitchers) {
    const stats = statsSource[player.id];
    if (stats?.type === 'pit') {
      ip3 += stats.ip3;
      er += stats.er;
      k += stats.k;
    }
  }
  return {
    avg: ab > 0 ? h / ab : 0,
    hr,
    sb,
    era: ip3 > 0 ? (er * 27) / ip3 : 0,
    k,
  };
}
