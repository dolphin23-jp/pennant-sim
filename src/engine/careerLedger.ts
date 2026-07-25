import { calcOVR } from './ratings';
import { createBatterStats, createPitcherStats } from './stats';
import type {
  AccumulatedStats,
  Player,
  PlayerSeasonRecord,
  PlayerStats,
  Team,
  TeamKey,
  Teams,
} from './types';

function snapshotStats(player: Player, stats: AccumulatedStats): PlayerStats {
  const recorded = stats[player.id];
  if (recorded) return { ...recorded } as PlayerStats;
  // Reuse the canonical factories so a new stat field never needs a second zero literal.
  return player.isP ? createPitcherStats(player.name) : createBatterStats(player.name);
}

function snapshotPlayer(
  year: number,
  teamKey: TeamKey,
  team: Team,
  player: Player,
  stats: AccumulatedStats,
): PlayerSeasonRecord {
  return {
    playerId: player.id,
    playerName: player.name,
    year,
    age: player.age,
    teamKey,
    teamName: team.n,
    teamAbbreviation: team.ab,
    isPitcher: player.isP,
    role: player.role,
    position: player._assignedPos ?? player.pos,
    ovr: calcOVR(player),
    params: structuredClone(player.p),
    stats: snapshotStats(player, stats),
  };
}

export function createPlayerSeasonRecords(
  year: number,
  teams: Teams,
  stats: AccumulatedStats,
): PlayerSeasonRecord[] {
  return (Object.entries(teams) as Array<[TeamKey, Team]>).flatMap(([teamKey, team]) => [
    ...team.pitchers.map((player) => snapshotPlayer(year, teamKey, team, player, stats)),
    ...team.fielders.map((player) => snapshotPlayer(year, teamKey, team, player, stats)),
  ]);
}
