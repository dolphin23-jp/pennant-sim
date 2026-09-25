import { CENTRAL, PACIFIC } from '../data';
import type { ScheduleGame, TeamKey } from './types';

/** The number of clubs in a league that go to the Climax Series. */
export const CLIMAX_SERIES_SPOTS = 3;

interface Tally {
  w: number;
  l: number;
}

const pct = ({ w, l }: Tally) => (w + l > 0 ? w / (w + l) : 0);

/** True when `first` finishes strictly ahead of `second` on winning percentage, or level
 * on percentage with more wins (NPB's first tiebreak). */
const finishesAhead = (first: Tally, second: Tally) => {
  const difference = pct(first) - pct(second);
  if (Math.abs(difference) > 1e-12) return difference > 0;
  return first.w > second.w;
};

export interface RaceStatus {
  /** Wins that clinch the pennant however the rivals do, for the leader only: shown once
   * it is within the club's remaining games (NPB's マジック点灯). 0 means clinched. */
  magic: number | null;
  clinchedPennant: boolean;
  clinchedClimax: boolean;
  /** No longer able to finish first, even winning out. */
  eliminatedPennant: boolean;
  /** No longer able to finish in the top three, even winning out. */
  eliminatedClimax: boolean;
  remaining: number;
}

function leagueOf(team: TeamKey): readonly TeamKey[] {
  return CENTRAL.includes(team) ? CENTRAL : PACIFIC;
}

/**
 * Where each club in a league stands in the race: magic numbers, clinches and
 * eliminations, all worst case (ties are treated as games that can still be won or lost,
 * never as draws, and each rival is judged on its own).
 */
export function pennantRace(
  schedule: ScheduleGame[],
  league: readonly TeamKey[],
): Record<TeamKey, RaceStatus> {
  const tally: Record<string, Tally> = {};
  const remaining: Record<string, number> = {};
  const headToHead: Record<string, number> = {};
  for (const team of league) {
    tally[team] = { w: 0, l: 0 };
    remaining[team] = 0;
  }
  const pairKey = (first: TeamKey, second: TeamKey) => [first, second].sort().join(':');
  for (const game of schedule) {
    const home = tally[game.homeKey];
    const away = tally[game.awayKey];
    if (!game.played) {
      if (home) remaining[game.homeKey]! += 1;
      if (away) remaining[game.awayKey]! += 1;
      if (home && away) {
        const key = pairKey(game.homeKey, game.awayKey);
        headToHead[key] = (headToHead[key] ?? 0) + 1;
      }
      continue;
    }
    const homeScore = game.hs ?? 0;
    const awayScore = game.as ?? 0;
    if (homeScore === awayScore) continue;
    const homeWon = homeScore > awayScore;
    if (home) home[homeWon ? 'w' : 'l'] += 1;
    if (away) away[homeWon ? 'l' : 'w'] += 1;
  }

  // Can `team` be sure of finishing ahead of `rival` after winning `wins` more games?
  // Worst case: its wins come from games against other clubs first, the rival wins every
  // other game it has left, and every head-to-head game the team does not win goes to the
  // rival.
  const secureAfter = (team: TeamKey, rival: TeamKey, wins: number) => {
    const own = tally[team]!;
    const other = tally[rival]!;
    const left = remaining[team]!;
    const shared = headToHead[pairKey(team, rival)] ?? 0;
    const winsOverRival = Math.max(0, wins - (left - shared));
    const final = { w: own.w + wins, l: own.l + (left - wins) };
    const rivalFinal = {
      w: other.w + remaining[rival]! - winsOverRival,
      l: other.l + winsOverRival,
    };
    return finishesAhead(final, rivalFinal);
  };
  // The fewest further wins that make `team` sure of finishing ahead of `rival`, or null.
  const winsToPass = (team: TeamKey, rival: TeamKey): number | null => {
    for (let wins = 0; wins <= remaining[team]!; wins += 1)
      if (secureAfter(team, rival, wins)) return wins;
    return null;
  };
  // Can `team` still finish ahead of `rival` if it wins out and the rival loses out?
  const canPass = (team: TeamKey, rival: TeamKey) => {
    const own = tally[team]!;
    const other = tally[rival]!;
    const best = { w: own.w + remaining[team]!, l: own.l };
    const worst = { w: other.w, l: other.l + remaining[rival]! };
    return finishesAhead(best, worst) || (pct(best) === pct(worst) && best.w === worst.w);
  };

  const leader = [...league].sort((first, second) => {
    const difference = pct(tally[second]!) - pct(tally[first]!);
    return difference || tally[second]!.w - tally[first]!.w;
  })[0]!;

  const result = {} as Record<TeamKey, RaceStatus>;
  for (const team of league) {
    const rivals = league.filter((rival) => rival !== team);
    const needed = rivals.map((rival) => winsToPass(team, rival));
    const clinchedOver = needed.filter((wins) => wins === 0).length;
    const magicWins = needed.every((wins) => wins !== null)
      ? Math.max(...(needed as number[]))
      : null;
    const cannotPass = rivals.filter((rival) => !canPass(team, rival)).length;
    result[team] = {
      magic: team === leader ? magicWins : null,
      clinchedPennant: clinchedOver === rivals.length,
      clinchedClimax: clinchedOver >= league.length - CLIMAX_SERIES_SPOTS,
      eliminatedPennant: cannotPass > 0,
      eliminatedClimax: cannotPass >= CLIMAX_SERIES_SPOTS,
      remaining: remaining[team]!,
    };
  }
  return result;
}

/** Games left at which the magic number starts being shown: earlier in the year a leader
 * who has lost the fewest games can have a "magic" of 130, which says nothing. */
export const MAGIC_SHOWN_FROM_REMAINING = 60;

export const magicLit = (
  status: RaceStatus | undefined,
): status is RaceStatus & { magic: number } =>
  Boolean(status && status.magic !== null && status.remaining <= MAGIC_SHOWN_FROM_REMAINING);

/** The race for the user's league. */
export function leagueRace(schedule: ScheduleGame[], team: TeamKey) {
  return pennantRace(schedule, leagueOf(team));
}

export interface RaceTimelinePoint {
  date: string;
  /** Games behind the league leader after that day's games. */
  gamesBehind: Record<TeamKey, number>;
}

/** Games behind the leader at the end of each day with games, for the league's clubs. */
export function raceTimeline(
  schedule: ScheduleGame[],
  league: readonly TeamKey[],
): RaceTimelinePoint[] {
  const tally: Record<string, Tally> = Object.fromEntries(
    league.map((team) => [team, { w: 0, l: 0 }]),
  );
  const played = schedule
    .filter((game) => game.played)
    .sort((first, second) => first.date.localeCompare(second.date));
  const points: RaceTimelinePoint[] = [];
  const snapshot = (date: string) => {
    const leader = [...league].sort(
      (first, second) => pct(tally[second]!) - pct(tally[first]!),
    )[0]!;
    const top = tally[leader]!;
    points.push({
      date,
      gamesBehind: Object.fromEntries(
        league.map((team) => [team, (top.w - tally[team]!.w + tally[team]!.l - top.l) / 2]),
      ) as Record<TeamKey, number>,
    });
  };
  for (let index = 0; index < played.length; index += 1) {
    const game = played[index]!;
    const homeScore = game.hs ?? 0;
    const awayScore = game.as ?? 0;
    if (homeScore !== awayScore) {
      const homeWon = homeScore > awayScore;
      const home = tally[game.homeKey];
      const away = tally[game.awayKey];
      if (home) home[homeWon ? 'w' : 'l'] += 1;
      if (away) away[homeWon ? 'l' : 'w'] += 1;
    }
    if (played[index + 1]?.date !== game.date) snapshot(game.date);
  }
  return points;
}
