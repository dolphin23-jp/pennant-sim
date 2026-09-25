import type { AchievementEvent } from './achievements';
import type { GameBoxScore, NotableEventType } from './boxScore';
import type { SeasonTitleRecord } from './awards';
import type { SeasonHonorRecord } from './honors';
import { calcOVR } from './ratings';
import { earnedRunAverage, ops } from './statsFormat';
import type { AccumulatedStats, Player, Team, TeamKey, Teams } from './types';

/**
 * Popularity, 0 to 100: how much the fans know and love a player. It starts from the
 * player's ability (a scout's darling is not unknown) and then follows what he does on
 * the field each season, the titles and honors he wins, the milestones he reaches, and
 * whether his club won it all. It feeds club revenue, attendance and the news.
 */
const clamp = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Amateur fame: a national-tournament star or a first-round pick arrives already known,
 * however raw. It fades over his first four years as a pro, as the pro record takes over.
 */
export function amateurFame(player: Player): number {
  const history = player.preProHistory;
  let fame = 0;
  if (history) {
    fame += { 'national-elite': 22, national: 12, regional: 5, developmental: 0 }[
      history.profileTier
    ];
    for (const highlight of history.highlights) {
      if (highlight.kind === 'national-tournament')
        fame += /優勝|準優勝/.test(highlight.text) ? 8 : 3;
      if (
        highlight.kind === 'national-team' ||
        highlight.kind === 'corporate-tournament' ||
        highlight.kind === 'university-award'
      )
        fame += 4;
    }
  }
  if (player.generationalTalent) fame += 12;
  if (player.draftRound === 1) fame += 6;
  const yearsPro = history ? Math.max(0, player.age - history.entryAge) : 4;
  return Math.min(35, fame) * Math.max(0, 1 - yearsPro / 4);
}

/** What a player's popularity is before anything has happened on the field: his ability,
 * a little, and the name he made as an amateur. */
export function basePopularity(player: Player): number {
  const ovr = calcOVR(player);
  return Math.round(clamp(12 + (ovr - 50) * 1.3 + amateurFame(player)));
}

export const popularityOf = (player: Player): number =>
  typeof player.popularity === 'number' ? player.popularity : basePopularity(player);

export function popularityLabel(popularity: number): string {
  if (popularity >= 85) return 'スター';
  if (popularity >= 70) return '全国区';
  if (popularity >= 50) return '人気選手';
  if (popularity >= 30) return '地元の人気者';
  return '知る人ぞ知る';
}

/** The season on the field as a 0-100 score, or null without enough playing time. */
function performanceScore(player: Player, stats: AccumulatedStats): number | null {
  const line = stats[player.id];
  if (!line) return null;
  if (line.type === 'bat') {
    if (line.pa < 150) return null;
    const onBasePlusSlugging = ops(line) ?? 0;
    return clamp((onBasePlusSlugging - 0.55) * 200 + line.hr * 0.7 + line.sb * 0.2);
  }
  if (line.ip3 < 120) return null;
  const era = earnedRunAverage(line) ?? 9;
  return clamp((4.6 - era) * 22 + line.w * 1.8 + line.sv * 0.9 + line.hld * 0.4 + line.k * 0.04);
}

const HONOR_BONUS: Record<SeasonHonorRecord['honorId'], number> = {
  mvp: 14,
  rookieOfYear: 10,
  bestNine: 4,
  goldenGlove: 2,
};

export interface PopularitySeason {
  year: number;
  stats: AccumulatedStats;
  titles: SeasonTitleRecord[];
  honors: SeasonHonorRecord[];
  achievements: AchievementEvent[];
  champion?: TeamKey | null;
}

export interface PopularityChange {
  playerId: string;
  playerName: string;
  teamKey: TeamKey;
  before: number;
  after: number;
}

/** One season's effect on a player's popularity. */
export function nextPopularity(player: Player, team: TeamKey, season: PopularitySeason): number {
  const before = popularityOf(player);
  const performance = performanceScore(player, season.stats);
  // A season on the bench lets a name fade toward what his ability alone would earn; a
  // long-serving player (生え抜き or veteran) keeps his name longer.
  const fade = (player.serviceYears ?? 0) >= 8 ? 0.92 : 0.85;
  let after =
    performance === null
      ? before * fade + basePopularity(player) * (1 - fade)
      : before * 0.6 + performance * 0.4;
  after += 6 * season.titles.filter((title) => title.playerId === player.id).length;
  for (const honor of season.honors)
    if (honor.playerId === player.id) after += HONOR_BONUS[honor.honorId];
  after += Math.min(
    9,
    3 * season.achievements.filter((event) => event.playerId === player.id).length,
  );
  if (season.champion === team && performance !== null) after += 4;
  return Math.round(clamp(after));
}

/** Every rostered player's popularity after the season, and who moved the most. */
export function updateSeasonPopularity(
  teams: Teams,
  season: PopularitySeason,
): { teams: Teams; changes: PopularityChange[] } {
  const changes: PopularityChange[] = [];
  const next = { ...teams };
  for (const [teamKey, team] of Object.entries(teams) as Array<[TeamKey, Team]>) {
    const update = (player: Player): Player => {
      const before = popularityOf(player);
      const after = nextPopularity(player, teamKey, season);
      if (after !== before)
        changes.push({ playerId: player.id, playerName: player.name, teamKey, before, after });
      return { ...player, popularity: after };
    };
    next[teamKey] = {
      ...team,
      fielders: team.fielders.map(update),
      pitchers: team.pitchers.map(update),
    };
  }
  return { teams: next, changes };
}

/** A club's fan following: the average popularity of its ten best-loved players. */
export function teamPopularity(team: Team): number {
  const top = [...team.fielders, ...team.pitchers]
    .map(popularityOf)
    .sort((first, second) => second - first)
    .slice(0, 10);
  return top.length ? Math.round(top.reduce((sum, value) => sum + value, 0) / top.length) : 0;
}

/** Revenue share from fan following against the league average: +-5% at most. */
export const POPULARITY_REVENUE_EFFECT = 0.05;

export function popularityRevenueFactor(team: Team, teams: Teams): number {
  const all = Object.values(teams).map(teamPopularity);
  const average = all.reduce((sum, value) => sum + value, 0) / Math.max(1, all.length);
  const deviation = Math.max(-1, Math.min(1, (teamPopularity(team) - average) / 25));
  return 1 + POPULARITY_REVENUE_EFFECT * deviation;
}

/**
 * A home game's crowd: the club's following, how the season is going, and the weekend.
 * Deterministic for a given game, so the same game always drew the same crowd.
 */
export function gameAttendance(
  home: Team,
  gameId: string,
  date: string,
  homeRank?: number,
): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 1.15 : weekday === 5 ? 1.06 : 1;
  const race = homeRank ? 1 + (3.5 - homeRank) * 0.03 : 1;
  let hash = 0;
  for (const character of gameId) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const noise = 0.94 + (((hash >>> 0) % 1000) / 1000) * 0.12;
  const crowd = (17_000 + teamPopularity(home) * 330) * weekend * race * noise;
  return Math.round(Math.min(46_000, crowd) / 10) * 10;
}

/** Popularity gained from single games in a season is capped, so a hot month cannot make
 * a star by itself; the season's whole record decides that at the end of the year. */
export const IN_SEASON_POPULARITY_CAP = 15;

const GAME_MOMENT_BONUS: Partial<Record<NotableEventType, number>> = {
  walkoffHr: 3,
  walkoff: 2,
  grandSlam: 2,
  shutout: 2,
  tenK: 1,
  multiHr: 1,
  completeGame: 1,
};

/**
 * Moments during the season raise a player's popularity at once: walk-offs, grand slams,
 * shutouts, ten-strikeout games, milestones and records.
 */
export function applyInSeasonPopularity(
  teams: Teams,
  year: number,
  boxes: GameBoxScore[],
  achievements: AchievementEvent[],
): Teams {
  const gains = new Map<string, number>();
  const add = (playerId: string | undefined, value: number) => {
    if (playerId && value > 0) gains.set(playerId, (gains.get(playerId) ?? 0) + value);
  };
  for (const box of boxes)
    for (const event of box.notableEvents) add(event.playerId, GAME_MOMENT_BONUS[event.type] ?? 0);
  for (const event of achievements) add(event.playerId, 3);
  if (!gains.size) return teams;
  const update = (player: Player): Player => {
    const gain = gains.get(player.id);
    if (!gain) return player;
    const gained = player.popularityGain?.year === year ? player.popularityGain.value : 0;
    const allowed = Math.max(0, Math.min(gain, IN_SEASON_POPULARITY_CAP - gained));
    if (!allowed) return player;
    return {
      ...player,
      popularity: Math.round(clamp(popularityOf(player) + allowed)),
      popularityGain: { year, value: gained + allowed },
    };
  };
  const next = { ...teams };
  for (const [teamKey, team] of Object.entries(teams) as Array<[TeamKey, Team]>)
    next[teamKey] = {
      ...team,
      fielders: team.fielders.map(update),
      pitchers: team.pitchers.map(update),
    };
  return next;
}
