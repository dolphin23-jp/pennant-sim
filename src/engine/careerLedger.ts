import { calcOvr } from './ratings';
import type {
  AccumulatedStats,
  BatterStats,
  PitcherStats,
  Player,
  PlayerSeasonRecord,
  PlayerStats,
  Team,
  TeamKey,
  Teams,
} from './types';

const emptyBatterStats = (player: Player): BatterStats => ({
  type: 'bat', name: player.name, g: 0, pa: 0, ab: 0, h: 0, s: 0, d: 0, t: 0,
  hr: 0, bb: 0, k: 0, rbi: 0, sb: 0, cs: 0, bnt: 0, sf: 0,
});

const emptyPitcherStats = (player: Player): PitcherStats => ({
  type: 'pit', name: player.name, g: 0, gs: 0, w: 0, l: 0, sv: 0, hld: 0,
  bs: 0, ip3: 0, h: 0, bb: 0, k: 0, er: 0, pc: 0,
});

function snapshotStats(player: Player, stats: AccumulatedStats): PlayerStats {
  const recorded = stats[player.id];
  if (recorded) return { ...recorded } as PlayerStats;
  return player.isP ? emptyPitcherStats(player) : emptyBatterStats(player);
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
    ovr: calcOvr(player),
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
