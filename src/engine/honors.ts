import { CENTRAL, PACIFIC } from '../data';
import type { AwardLeague } from './awards';
import { isForeignPlayer } from './foreign';
import { aptitudeFor } from './ratings';
import type {
  AccumulatedStats,
  BatterStats,
  FieldPosition,
  PitcherStats,
  Player,
  StandingRecord,
  TeamKey,
  Teams,
} from './types';

/** Season honors voted on after the season, kept apart from the statistical titles. */
export type SeasonHonorId = 'mvp' | 'rookieOfYear' | 'bestNine' | 'goldenGlove';

export interface SeasonHonorRecord {
  year: number;
  league: AwardLeague;
  honorId: SeasonHonorId;
  /** Best Nine / Golden Glove position ('外野手' for the three outfield places). */
  position?: string;
  playerId: string;
  playerName: string;
  teamKey: TeamKey;
  /** Short factual line, e.g. ".315 32本 98打点" or "15勝5敗 防御率2.10". */
  summary: string;
}

export const SEASON_HONOR_LABEL: Record<SeasonHonorId, string> = {
  mvp: 'MVP',
  rookieOfYear: '新人王',
  bestNine: 'ベストナイン',
  goldenGlove: 'ゴールデングラブ賞',
};

const LEAGUES: Record<AwardLeague, readonly TeamKey[]> = { central: CENTRAL, pacific: PACIFIC };

/** Positional scarcity, in runs per full season, added to a hitter's value. */
const POSITION_BONUS: Partial<Record<FieldPosition, number>> = {
  捕手: 10,
  遊撃手: 7,
  二塁手: 4,
  中堅手: 4,
  三塁手: 2,
};

const INFIELD: FieldPosition[] = ['捕手', '一塁手', '二塁手', '三塁手', '遊撃手'];
const OUTFIELD: FieldPosition[] = ['左翼手', '中堅手', '右翼手'];

const rate = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : 0;

function batterLine(stats: BatterStats): string {
  return `${rate(stats.h, stats.ab).toFixed(3).replace(/^0/, '')} ${stats.hr}本 ${stats.rbi}打点`;
}

function pitcherLine(stats: PitcherStats): string {
  const era = rate(stats.er * 27, stats.ip3).toFixed(2);
  if (stats.sv >= 20) return `${stats.sv}セーブ 防御率${era}`;
  if (stats.gs < 10 && stats.hld >= 20) return `${stats.hld}ホールド 防御率${era}`;
  return `${stats.w}勝${stats.l}敗 防御率${era}`;
}

/** Runs above an average player, roughly: on-base and slugging over playing time, plus
 * the scarcity of the position he plays. */
export function batterValue(player: Player, stats: BatterStats): number {
  const onBase = rate(stats.h + stats.bb + stats.hbp, stats.ab + stats.bb + stats.hbp + stats.sf);
  const totalBases = stats.s + stats.d * 2 + stats.t * 3 + stats.hr * 4;
  const slugging = rate(totalBases, stats.ab);
  const batting = ((onBase - 0.315) * 1.8 + (slugging - 0.38)) * stats.pa * 0.45;
  const position = (POSITION_BONUS[player.pos as FieldPosition] ?? 0) * (stats.pa / 600);
  return batting + position + (stats.sb - stats.cs * 2) * 0.2;
}

/** Runs saved against an average pitcher, with a little credit for high-leverage work. */
export function pitcherValue(stats: PitcherStats): number {
  const innings = stats.ip3 / 3;
  const era = rate(stats.er * 9, innings);
  return (3.6 - era) * (innings / 9) + stats.sv * 0.35 + stats.hld * 0.15;
}

interface Candidate {
  player: Player;
  teamKey: TeamKey;
  stats: BatterStats | PitcherStats;
}

function leagueCandidates(
  teams: Teams,
  league: AwardLeague,
  accumulated: AccumulatedStats,
): Candidate[] {
  return LEAGUES[league].flatMap((teamKey) =>
    [...teams[teamKey].fielders, ...teams[teamKey].pitchers].flatMap((player) => {
      const stats = accumulated[player.id];
      if (!stats) return [];
      if (player.isP ? stats.type !== 'pit' : stats.type !== 'bat') return [];
      return [{ player, teamKey, stats }];
    }),
  );
}

const valueOf = (candidate: Candidate) =>
  candidate.stats.type === 'bat'
    ? batterValue(candidate.player, candidate.stats)
    : pitcherValue(candidate.stats);

const lineOf = (candidate: Candidate) =>
  candidate.stats.type === 'bat' ? batterLine(candidate.stats) : pitcherLine(candidate.stats);

const qualifiedBatter = (candidate: Candidate, games: number) =>
  candidate.stats.type === 'bat' && candidate.stats.pa >= games * 3.1;
const qualifiedPitcher = (candidate: Candidate, games: number) =>
  candidate.stats.type === 'pit' &&
  (candidate.stats.ip3 >= games * 3 || candidate.stats.sv >= 25 || candidate.stats.hld >= 30);

function record(
  year: number,
  league: AwardLeague,
  honorId: SeasonHonorId,
  candidate: Candidate,
  position?: string,
): SeasonHonorRecord {
  return {
    year,
    league,
    honorId,
    ...(position ? { position } : {}),
    playerId: candidate.player.id,
    playerName: candidate.player.name,
    teamKey: candidate.teamKey,
    summary: lineOf(candidate),
  };
}

const best = <T>(items: T[], score: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>(
    (top, item) => (top === undefined || score(item) > score(top) ? item : top),
    undefined,
  );

/**
 * The season's honors for both leagues, from the finished season's statistics.
 *
 * - MVP: the most valuable regular, with a lift for the pennant winner's players.
 * - 新人王: the most valuable player in his first season of top-team service.
 * - ベストナイン: the most valuable qualified hitter at each position (three outfielders)
 *   and the most valuable pitcher.
 * - ゴールデングラブ賞: the best fielder at each position among players who played most of
 *   the season there, and among pitchers with a full season of innings.
 */
export function selectSeasonHonors(
  year: number,
  teams: Teams,
  accumulated: AccumulatedStats,
  standings: Record<TeamKey, StandingRecord>,
): SeasonHonorRecord[] {
  const honors: SeasonHonorRecord[] = [];
  for (const league of ['central', 'pacific'] as const) {
    const candidates = leagueCandidates(teams, league, accumulated);
    const games = Math.max(1, ...LEAGUES[league].map((teamKey) => standings[teamKey]?.g ?? 0));
    const pennant = best([...LEAGUES[league]], (teamKey) => {
      const standing = standings[teamKey];
      return standing ? rate(standing.w, standing.w + standing.l) : 0;
    });
    const regulars = candidates.filter(
      (candidate) => qualifiedBatter(candidate, games) || qualifiedPitcher(candidate, games),
    );
    const mvp = best(
      regulars,
      (candidate) => valueOf(candidate) * (candidate.teamKey === pennant ? 1.15 : 1),
    );
    if (mvp) honors.push(record(year, league, 'mvp', mvp));

    const rookie = best(
      candidates.filter(
        (candidate) =>
          (candidate.player.serviceYears ?? 0) === 0 &&
          !isForeignPlayer(candidate.player) &&
          (candidate.stats.type === 'bat'
            ? candidate.stats.pa >= 150
            : candidate.stats.ip3 >= 120 || candidate.stats.g >= 30),
      ),
      valueOf,
    );
    if (rookie && valueOf(rookie) > 0) honors.push(record(year, league, 'rookieOfYear', rookie));

    const hitters = candidates.filter((candidate) => qualifiedBatter(candidate, games * 0.75));
    const taken = new Set<string>();
    const pick = (pool: Candidate[], score: (candidate: Candidate) => number, count = 1) => {
      const chosen = [...pool]
        .filter((candidate) => !taken.has(candidate.player.id))
        .sort((first, second) => score(second) - score(first))
        .slice(0, count);
      for (const candidate of chosen) taken.add(candidate.player.id);
      return chosen;
    };
    const pitchers = candidates.filter((candidate) => qualifiedPitcher(candidate, games));
    for (const candidate of pick(pitchers, valueOf))
      honors.push(record(year, league, 'bestNine', candidate, '投手'));
    for (const position of INFIELD)
      for (const candidate of pick(
        hitters.filter((candidate) => candidate.player.pos === position),
        valueOf,
      ))
        honors.push(record(year, league, 'bestNine', candidate, position));
    for (const candidate of pick(
      hitters.filter((candidate) => OUTFIELD.includes(candidate.player.pos as FieldPosition)),
      valueOf,
      3,
    ))
      honors.push(record(year, league, 'bestNine', candidate, '外野手'));

    taken.clear();
    const fielding = (candidate: Candidate, position: FieldPosition) =>
      (candidate.player.p.df ?? 50) * (aptitudeFor(candidate.player, position) / 100) +
      (candidate.player.p.arm ?? 50) * 0.2;
    for (const candidate of pick(pitchers, (candidate) => candidate.player.p.fld ?? 50))
      honors.push(record(year, league, 'goldenGlove', candidate, '投手'));
    for (const position of INFIELD)
      for (const candidate of pick(
        hitters.filter((candidate) => candidate.player.pos === position),
        (candidate) => fielding(candidate, position),
      ))
        honors.push(record(year, league, 'goldenGlove', candidate, position));
    for (const candidate of pick(
      hitters.filter((candidate) => OUTFIELD.includes(candidate.player.pos as FieldPosition)),
      (candidate) => fielding(candidate, candidate.player.pos as FieldPosition),
      3,
    ))
      honors.push(record(year, league, 'goldenGlove', candidate, '外野手'));
  }
  return honors;
}
