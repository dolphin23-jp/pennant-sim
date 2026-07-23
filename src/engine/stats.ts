import type {
  AccumulatedStats,
  AtBatLogEntry,
  BatterStats,
  GameState,
  PitcherStats,
  PlayerStats,
  TeamKey,
} from './types';
const createBatterStats = (name: string): BatterStats => ({
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
});
const createPitcherStats = (name: string): PitcherStats => ({
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
});
function applyBattingEvent(stats: BatterStats, entry: AtBatLogEntry): void {
  const running = entry.result === 'SB' || entry.result === 'CS';
  if (!running) stats.pa += 1;
  if (!running && entry.result !== 'BB' && entry.result !== 'HBP') stats.ab += 1;
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
  stats.rbi += entry.rbi || 0;
}
function applyPitchingEvent(stats: PitcherStats, entry: AtBatLogEntry): void {
  stats.pc += entry.pc || 3;
  if (['1B', '2B', '3B', 'HR'].includes(entry.result)) stats.h += 1;
  if (entry.result === 'BB') stats.bb += 1;
  if (['K', 'GO', 'FO'].includes(entry.result)) stats.ip3 += 1;
  else if (entry.result === 'DP') stats.ip3 += 2;
  if (entry.result === 'K') stats.k += 1;
  stats.er += Math.round((entry.rbi || 0) * 0.88);
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
  for (const entry of gameResult.atBatLog) {
    if (entry.bSide === playerTeam)
      applyBattingEvent(ensureBatter(entry.batterId, entry.batter), entry);
    if (entry.pSide === playerTeam)
      applyPitchingEvent(ensurePitcher(entry.pitcherId, entry.pitcher), entry);
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
    for (const [key, value] of Object.entries(stats)) {
      if (key !== 'type' && key !== 'name' && typeof value === 'number') {
        const target = output[id] as unknown as Record<string, number | string>;
        target[key] = (typeof target[key] === 'number' ? target[key] : 0) + value;
      }
    }
  }
  return output;
}
