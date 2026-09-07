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

function enrichPlayer(player: Player, record: PlayerSeasonRecord | undefined): void {
  if (player.preProHistory || !record) return;
  const preProHistory = createPreProHistory(player, {
    entryYear: record.year,
    entryAge: record.age,
    origin: player.draftOrigin,
  });
  player.preProHistory = preProHistory;
  player.draftOrigin ??= preProHistory.origin;
}

function enrichTeams(teams: Teams, firstRecords: Map<string, PlayerSeasonRecord>): void {
  for (const team of Object.values(teams)) {
    for (const player of [...team.fielders, ...team.pitchers]) {
      enrichPlayer(player, firstRecords.get(player.id));
    }
  }
}

export function createFictionalLeagueHistory(
  sourceTeams: Teams,
  options: FictionalLeagueHistoryOptions = {},
): FictionalLeagueHistory {
  const history = createFictionalLeagueHistoryBase(sourceTeams, options);
  const firstRecords = firstRecordByPlayer(history);
  enrichTeams(history.teams, firstRecords);
  for (const player of history.retiredPlayers) enrichPlayer(player, firstRecords.get(player.id));
  return history;
}
