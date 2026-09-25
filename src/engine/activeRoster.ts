import { ACTIVE_ROSTER_BALANCE, FIELD_POSITIONS, PITCHER_USAGE_BALANCE } from '../data';
import { bestLineup, calcOVR, effectiveOVR, hasPositionAptitude } from './ratings';
import type { Player, Team, TeamKey, Teams } from './types';

const healthy = (player: Player) => (player.injuryDays ?? 0) <= 0;

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/**
 * The club's 一軍 (active) registration: the rotation, the closers and the best of the
 * bullpen up to ACTIVE_ROSTER_BALANCE.pitchers, then the lineup, two catchers and the
 * best remaining fielders up to the limit. Injured players are sent down. Players whose
 * status does not change keep their object, so unchanged saves stay unchanged.
 */
export function assignActiveRoster(team: Team): Team {
  const balance = ACTIVE_ROSTER_BALANCE;
  const pitchers = team.pitchers.filter(healthy).sort((a, b) => calcOVR(b) - calcOVR(a));
  const chosen = new Set<string>();
  const take = (players: Player[], count: number) => {
    for (const player of players) {
      if (count <= 0) break;
      if (chosen.has(player.id)) continue;
      chosen.add(player.id);
      count -= 1;
    }
  };
  take(
    pitchers.filter((player) => player.role === '先発'),
    balance.starters,
  );
  take(
    pitchers.filter((player) => player.role === 'クローザー'),
    balance.closers,
  );
  const pitcherSlots = () =>
    balance.pitchers - team.pitchers.filter((player) => chosen.has(player.id)).length;
  // A worn-out arm is sent down for a fresh one, as clubs do with a tired bullpen.
  const bullpenValue = (player: Player) =>
    calcOVR(player) + (player.role === 'リリーフ' ? 5 : 0) - (player.fatigue ?? 0) * 0.4;
  take(
    [...pitchers].sort((a, b) => bullpenValue(b) - bullpenValue(a)),
    pitcherSlots(),
  );

  const fielders = team.fielders.filter(healthy);
  const allActive = {
    ...team,
    fielders: fielders.map((player) => ({ ...player, activeRoster: true })),
  };
  take(bestLineup(allActive), 9);
  take(
    fielders
      .filter((player) => hasPositionAptitude(player, '捕手'))
      .sort((a, b) => effectiveOVR(b, '捕手') - effectiveOVR(a, '捕手')),
    balance.catchers -
      fielders.filter((player) => chosen.has(player.id) && player.pos === '捕手').length,
  );
  // One glove for every infield position before the best bats fill the bench.
  for (const position of FIELD_POSITIONS)
    if (!fielders.some((player) => chosen.has(player.id) && hasPositionAptitude(player, position)))
      take(
        fielders
          .filter((player) => hasPositionAptitude(player, position))
          .sort((a, b) => effectiveOVR(b, position) - effectiveOVR(a, position)),
        1,
      );
  const fielderSlots = balance.limit - balance.pitchers;
  take(
    [...fielders].sort((a, b) => effectiveOVR(b, b.pos) - effectiveOVR(a, a.pos)),
    fielderSlots - fielders.filter((player) => chosen.has(player.id)).length,
  );

  const flag = (player: Player): Player => {
    const active = chosen.has(player.id);
    return player.activeRoster === active ? player : { ...player, activeRoster: active };
  };
  return { ...team, pitchers: team.pitchers.map(flag), fielders: team.fielders.map(flag) };
}

export function activeRosterCount(team: Team): { pitchers: number; fielders: number } {
  const active = (player: Player) => player.activeRoster !== false;
  return {
    pitchers: team.pitchers.filter(active).length,
    fielders: team.fielders.filter(active).length,
  };
}

/** Assign every club's registration (the start of a season). */
export function assignAllActiveRosters(teams: Teams): Teams {
  return Object.fromEntries(
    Object.entries(teams).map(([teamKey, team]) => [teamKey, assignActiveRoster(team)]),
  ) as Teams;
}

/**
 * Weekly roster moves during the season. Each club not excluded is reviewed when it has
 * never been, a week after its last review, or as soon as an active player is hurt.
 * `reviewed` remembers review dates across calls within one simulation run. Replaces
 * entries of `teams` in place, as the season loops do with game results.
 */
export function manageActiveRosters(
  teams: Teams,
  teamKeys: readonly TeamKey[],
  date: string,
  reviewed: Map<TeamKey, string>,
  excluded: TeamKey | null = null,
): void {
  for (const teamKey of teamKeys) {
    if (teamKey === excluded) continue;
    const team = teams[teamKey];
    const last = reviewed.get(teamKey);
    const due =
      !last ||
      daysBetween(last, date) >= ACTIVE_ROSTER_BALANCE.reviewDays ||
      [...team.pitchers, ...team.fielders].some(
        (player) => player.activeRoster !== false && !healthy(player),
      ) ||
      [...team.pitchers, ...team.fielders].every((player) => player.activeRoster === undefined) ||
      team.pitchers.filter(
        (player) =>
          player.activeRoster !== false &&
          player.role !== '先発' &&
          (player.fatigue ?? 0) >= PITCHER_USAGE_BALANCE.fatigue.maximumSelectable,
      ).length >= ACTIVE_ROSTER_BALANCE.tiredRelieversForMove;
    if (!due) continue;
    teams[teamKey] = assignActiveRoster(team);
    reviewed.set(teamKey, date);
  }
}
