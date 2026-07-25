import { CENTRAL, PACIFIC } from '../data';
import { qualifiesForRate } from './statsQualification';
import type { AccumulatedStats, Player, PlayerStats, TeamKey, Teams } from './types';

export type AwardLeague = 'central' | 'pacific';
export type SeasonTitleId =
  | 'battingAverage'
  | 'hits'
  | 'homeRuns'
  | 'runsBattedIn'
  | 'stolenBases'
  | 'earnedRunAverage'
  | 'wins'
  | 'strikeouts'
  | 'saves'
  | 'holds';

export interface SeasonTitleRecord {
  year: number;
  league: AwardLeague;
  titleId: SeasonTitleId;
  titleLabel: string;
  playerId: string;
  playerName: string;
  teamKey: TeamKey;
  value: number;
  displayValue: string;
}

interface TitleDefinition {
  id: SeasonTitleId;
  label: string;
  kind: 'bat' | 'pit';
  direction: 'asc' | 'desc';
  requiresQualification: boolean;
  value(stats: PlayerStats): number | null;
  format(value: number): string;
}

const integerText = (value: number): string => String(Math.round(value));
const rateText = (value: number): string => value.toFixed(3).replace(/^0/, '');
const eraText = (value: number): string => value.toFixed(2);

export const SEASON_TITLE_DEFINITIONS: readonly TitleDefinition[] = [
  {
    id: 'battingAverage',
    label: '首位打者',
    kind: 'bat',
    direction: 'desc',
    requiresQualification: true,
    value: (stats) => (stats.type === 'bat' && stats.ab > 0 ? stats.h / stats.ab : null),
    format: rateText,
  },
  {
    id: 'hits',
    label: '最多安打',
    kind: 'bat',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'bat' ? stats.h : null),
    format: integerText,
  },
  {
    id: 'homeRuns',
    label: '本塁打王',
    kind: 'bat',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'bat' ? stats.hr : null),
    format: integerText,
  },
  {
    id: 'runsBattedIn',
    label: '打点王',
    kind: 'bat',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'bat' ? stats.rbi : null),
    format: integerText,
  },
  {
    id: 'stolenBases',
    label: '盗塁王',
    kind: 'bat',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'bat' ? stats.sb : null),
    format: integerText,
  },
  {
    id: 'earnedRunAverage',
    label: '最優秀防御率',
    kind: 'pit',
    direction: 'asc',
    requiresQualification: true,
    value: (stats) => (stats.type === 'pit' && stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null),
    format: eraText,
  },
  {
    id: 'wins',
    label: '最多勝利',
    kind: 'pit',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'pit' ? stats.w : null),
    format: integerText,
  },
  {
    id: 'strikeouts',
    label: '最多奪三振',
    kind: 'pit',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'pit' ? stats.k : null),
    format: integerText,
  },
  {
    id: 'saves',
    label: '最多セーブ',
    kind: 'pit',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'pit' ? stats.sv : null),
    format: integerText,
  },
  {
    id: 'holds',
    label: '最優秀中継ぎ',
    kind: 'pit',
    direction: 'desc',
    requiresQualification: false,
    value: (stats) => (stats.type === 'pit' ? stats.hld : null),
    format: integerText,
  },
];

const LEAGUE_TEAMS: Record<AwardLeague, readonly TeamKey[]> = {
  central: CENTRAL,
  pacific: PACIFIC,
};

function leaguePlayers(
  teams: Teams,
  league: AwardLeague,
): Array<{ player: Player; teamKey: TeamKey }> {
  return LEAGUE_TEAMS[league].flatMap((teamKey) => {
    const team = teams[teamKey];
    return [...team.fielders, ...team.pitchers].map((player) => ({ player, teamKey }));
  });
}

export function selectSeasonTitles(
  year: number,
  teams: Teams,
  accumulated: AccumulatedStats,
  gamesByTeam: Partial<Record<TeamKey, number>>,
): SeasonTitleRecord[] {
  const records: SeasonTitleRecord[] = [];
  for (const league of ['central', 'pacific'] as const) {
    const players = leaguePlayers(teams, league);
    for (const definition of SEASON_TITLE_DEFINITIONS) {
      const candidates = players
        .map(({ player, teamKey }) => {
          const stats = accumulated[player.id];
          if (!stats || stats.type !== definition.kind) return null;
          if (
            definition.requiresQualification &&
            !qualifiesForRate(stats, gamesByTeam[teamKey] ?? 0)
          )
            return null;
          const value = definition.value(stats);
          return value === null ? null : { player, teamKey, value };
        })
        .filter(
          (candidate): candidate is { player: Player; teamKey: TeamKey; value: number } =>
            candidate !== null,
        )
        .sort((first, second) =>
          definition.direction === 'asc' ? first.value - second.value : second.value - first.value,
        );
      const leadingValue = candidates[0]?.value;
      if (leadingValue === undefined) continue;
      for (const candidate of candidates.filter(
        ({ value }) => Math.abs(value - leadingValue) < 1e-10,
      )) {
        records.push({
          year,
          league,
          titleId: definition.id,
          titleLabel: definition.label,
          playerId: candidate.player.id,
          playerName: candidate.player.name,
          teamKey: candidate.teamKey,
          value: candidate.value,
          displayValue: definition.format(candidate.value),
        });
      }
    }
  }
  return records;
}
