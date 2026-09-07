import {
  createFictionalLeagueHistory as createFictionalLeagueHistoryBase,
  type FictionalLeagueHistory,
  type FictionalLeagueHistoryOptions,
} from './leagueHistory';
import { createPreProHistory } from './preProHistory';
import type { Player, PlayerSeasonRecord, Teams } from './types';

function firstRecordByPlayer(history: FictionalLeagueHistory): Map<string, PlayerSeasonRecord> {
  const records = Object.values(history.yearlyStats)
    .flat()
    .slice()
    .sort((first, second) => first.year - second.year || first.age - second.age);
  const first = new Map<string, PlayerSeasonRecord>();
  for (const record of records) if (!first.has(record.playerId)) first.set(record.playerId, record);
  return first;
}

function enrichPlayer(
  player: Player,
  record: PlayerSeasonRecord | undefined,
  fallbackEntryYear?: number,
): void {
  if (player.preProHistory) return;
  if (!record && fallbackEntryYear == null) return;
  const entryYear = record?.year ?? fallbackEntryYear!;
  const entryAge = record?.age ?? player.age;
  const preProHistory = createPreProHistory(player, {
    entryYear,
    entryAge,
    origin: player.draftOrigin,
    // For existing players, use the earliest archived professional level as the closest
    // available proxy for how highly regarded they were at entry. This avoids turning a
    // late-blooming veteran into an elite amateur merely because of later career ability.
    prospectQuality: record?.ovr,
  });
  player.preProHistory = preProHistory;
  player.draftOrigin ??= preProHistory.origin;
}

function enrichTeams(
  teams: Teams,
  firstRecords: Map<string, PlayerSeasonRecord>,
  fallbackEntryYear: number,
): void {
  for (const team of Object.values(teams)) {
    for (const player of [...team.fielders, ...team.pitchers]) {
      enrichPlayer(player, firstRecords.get(player.id), fallbackEntryYear);
    }
  }
}

export function createFictionalLeagueHistory(
  sourceTeams: Teams,
  options: FictionalLeagueHistoryOptions = {},
): FictionalLeagueHistory {
  const history = createFictionalLeagueHistoryBase(sourceTeams, options);
  const firstRecords = firstRecordByPlayer(history);
  const nextSeason = (options.endYear ?? 2025) + 1;
  // Active players with no archived season are current rookies. They still need a
  // canonical amateur history, with the coming season as their professional entry year.
  enrichTeams(history.teams, firstRecords, nextSeason);
  for (const player of history.retiredPlayers) enrichPlayer(player, firstRecords.get(player.id));
  return history;
}
