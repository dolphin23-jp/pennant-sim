import { MATURITY_PEAK_AGE, TINFO } from '../data';
import { averageText, earnedRunAverage, inningsText } from '../engine/statsFormat';
import type { Player, PlayerSeasonRecord, TeamKey, YearlyPlayerRecords } from '../engine/types';
import type { ChampionRecord } from '../state/storage';
import { validPacket, type FactPacket } from './protocol';
import {
  NARRATIVE_GENERATOR_VERSION,
  type NarrativeArticle,
  type NarrativeFactKind,
  type NarrativeFactRef,
} from './types';

export type PlayerProfileSourceClass = 'canonical' | 'derived';
export type PlayerProfileArchetype =
  | 'elite-prospect'
  | 'breakout-candidate'
  | 'young-regular'
  | 'established-star'
  | 'established-regular'
  | 'late-bloomer'
  | 'steady-veteran'
  | 'former-star'
  | 'declining-veteran'
  | 'journeyman'
  | 'developing-player';

export interface PlayerProfileEditorialInput {
  id: string;
  sourceClass: PlayerProfileSourceClass;
  text: string;
  factRefs: NarrativeFactRef[];
  value: unknown;
}

export interface PlayerNarrativeProfile {
  article: NarrativeArticle;
  packet: FactPacket;
  editorialInputs: PlayerProfileEditorialInput[];
  archetype: PlayerProfileArchetype;
}

export interface PlayerNarrativeProfileSource {
  player: Player;
  teamKey: TeamKey;
  seasonYear: number;
  asOfDate: string;
  yearlyStats: YearlyPlayerRecords;
  championHistory?: ChampionRecord[];
}

type Trajectory = 'rising' | 'stable' | 'declining' | 'none';

const ref = (kind: NarrativeFactKind, key: string): NarrativeFactRef => ({ kind, key });

function availableRecords(source: PlayerNarrativeProfileSource): PlayerSeasonRecord[] {
  return Object.values(source.yearlyStats)
    .flat()
    .filter(
      (record) =>
        record.playerId === source.player.id &&
        record.stats.g > 0 &&
        (record.year < source.seasonYear ||
          (record.year === source.seasonYear &&
            source.asOfDate === `${source.seasonYear}-12-31`)),
    )
    .sort((first, second) => first.year - second.year);
}

function roleLabel(player: Player): string {
  if (player.isP) return player.role ?? '投手';
  return player.pos ?? '野手';
}

function latestSeasonText(record: PlayerSeasonRecord): string {
  const stats = record.stats;
  if (stats.type === 'bat') {
    return `${record.year}年は${record.teamName}で${stats.g}試合に出場し、打率${averageText(stats.h, stats.ab)}、${stats.hr}本塁打、${stats.rbi}打点、${stats.sb}盗塁を記録した。`;
  }
  const era = earnedRunAverage(stats);
  const parts = [
    `${record.year}年は${record.teamName}で${stats.g}試合に登板`,
    stats.gs > 0 ? `${stats.gs}先発` : null,
    `${stats.w}勝${stats.l}敗`,
    era === null ? null : `防御率${era.toFixed(2)}`,
    `${inningsText(stats.ip3)}回`,
    `${stats.k}奪三振`,
    stats.sv > 0 ? `${stats.sv}セーブ` : null,
    stats.hld > 0 ? `${stats.hld}ホールド` : null,
  ].filter((part): part is string => Boolean(part));
  return `${parts.join('、')}だった。`;
}

function careerSummary(
  player: Player,
  records: PlayerSeasonRecord[],
  asOfDate: string,
): PlayerProfileEditorialInput | null {
  if (!records.length) return null;
  const first = records[0];
  const last = records.at(-1)!;
  const teamKeys = [...new Set(records.map((record) => record.teamKey))];
  const factRef = ref('CAREER_SUMMARY', `${asOfDate}:${player.id}:profile-summary`);
  if (last.stats.type === 'bat') {
    const totals = records.reduce(
      (sum, record) => {
        if (record.stats.type !== 'bat') return sum;
        sum.games += record.stats.g;
        sum.hits += record.stats.h;
        sum.homeRuns += record.stats.hr;
        sum.rbi += record.stats.rbi;
        sum.stolenBases += record.stats.sb;
        return sum;
      },
      { games: 0, hits: 0, homeRuns: 0, rbi: 0, stolenBases: 0 },
    );
    return {
      id: 'career-summary',
      sourceClass: 'derived',
      text: `${last.year}年終了時点で、${player.name}は${first.year}年の一軍初出場から${records.length}シーズンに出場。通算${totals.games}試合、${totals.hits}安打、${totals.homeRuns}本塁打、${totals.rbi}打点、${totals.stolenBases}盗塁を記録している${teamKeys.length > 1 ? `。一軍キャリアでは${teamKeys.length}球団に所属した` : ''}。`,
      factRefs: [factRef],
      value: {
        sourceClass: 'derived',
        playerId: player.id,
        firstActiveYear: first.year,
        throughYear: last.year,
        activeSeasons: records.length,
        teamKeys,
        totals,
      },
    };
  }
  const totals = records.reduce(
    (sum, record) => {
      if (record.stats.type !== 'pit') return sum;
      sum.games += record.stats.g;
      sum.wins += record.stats.w;
      sum.strikeouts += record.stats.k;
      sum.saves += record.stats.sv;
      sum.holds += record.stats.hld;
      return sum;
    },
    { games: 0, wins: 0, strikeouts: 0, saves: 0, holds: 0 },
  );
  return {
    id: 'career-summary',
    sourceClass: 'derived',
    text: `${last.year}年終了時点で、${player.name}は${first.year}年の一軍初登板から${records.length}シーズンに登板。通算${totals.games}登板、${totals.wins}勝、${totals.strikeouts}奪三振、${totals.saves}セーブ、${totals.holds}ホールドを記録している${teamKeys.length > 1 ? `。一軍キャリアでは${teamKeys.length}球団に所属した` : ''}。`,
    factRefs: [factRef],
    value: {
      sourceClass: 'derived',
      playerId: player.id,
      firstActiveYear: first.year,
      throughYear: last.year,
      activeSeasons: records.length,
      teamKeys,
      totals,
    },
  };
}

function careerBest(
  player: Player,
  records: PlayerSeasonRecord[],
  asOfDate: string,
): PlayerProfileEditorialInput | null {
  if (records.length < 2) return null;
  const batting = records.filter((record) => record.stats.type === 'bat');
  if (batting.length) {
    const best = batting
      .slice()
      .sort((a, b) =>
        a.stats.type === 'bat' && b.stats.type === 'bat'
          ? b.stats.hr - a.stats.hr || b.year - a.year
          : 0,
      )[0];
    if (!best || best.stats.type !== 'bat' || best.stats.hr <= 0) return null;
    return {
      id: 'career-best',
      sourceClass: 'derived',
      text: `${player.name}のシーズン最多本塁打は${best.year}年の${best.stats.hr}本。`,
      factRefs: [ref('CAREER_SUMMARY', `${asOfDate}:${player.id}:profile-best-home-runs`)],
      value: {
        sourceClass: 'derived',
        metric: 'homeRuns',
        bestYear: best.year,
        value: best.stats.hr,
      },
    };
  }
  const pitching = records.filter((record) => record.stats.type === 'pit');
  const best = pitching
    .slice()
    .sort((a, b) =>
      a.stats.type === 'pit' && b.stats.type === 'pit'
        ? b.stats.w - a.stats.w || b.year - a.year
        : 0,
    )[0];
  if (!best || best.stats.type !== 'pit' || best.stats.w <= 0) return null;
  return {
    id: 'career-best',
    sourceClass: 'derived',
    text: `${player.name}のシーズン最多勝利は${best.year}年の${best.stats.w}勝。`,
    factRefs: [ref('CAREER_SUMMARY', `${asOfDate}:${player.id}:profile-best-wins`)],
    value: {
      sourceClass: 'derived',
      metric: 'wins',
      bestYear: best.year,
      value: best.stats.w,
    },
  };
}

function strongestSkill(
  player: Player,
  asOfDate: string,
): PlayerProfileEditorialInput | null {
  const entries = player.isP
    ? [
        ['球速', player.p.vel],
        ['制球', player.p.ctrl],
        ['スタミナ', player.p.stam],
        ['球威', player.p.nobi],
        ['守備', player.p.fld],
      ]
    : [
        ['直球対応', player.p.cf],
        ['変化球対応', player.p.cb],
        ['長打力', player.p.pw],
        ['選球眼', player.p.dc],
        ['走力', player.p.sp],
        ['守備力', player.p.df],
        ['肩力', player.p.arm],
      ];
  const valid = entries.filter((entry): entry is [string, number] => typeof entry[1] === 'number');
  valid.sort((first, second) => second[1] - first[1]);
  const best = valid[0];
  if (!best) return null;
  return {
    id: 'strongest-skill',
    sourceClass: 'derived',
    text: `${player.name}の現在の能力構成では「${best[0]}」が最も高い評価項目。`,
    factRefs: [ref('PLAYER_PROFILE', `${asOfDate}:${player.id}:strongest-skill`)],
    value: {
      sourceClass: 'derived',
      playerId: player.id,
      strongestSkill: best[0],
      basis: 'current-ability-ordering',
    },
  };
}

function trajectoryInput(
  player: Player,
  records: PlayerSeasonRecord[],
): { input: PlayerProfileEditorialInput | null; trajectory: Trajectory } {
  const recent = records.slice(-3);
  if (recent.length < 3) return { input: null, trajectory: 'none' };
  const factRefs = recent.map((record) => ref('PLAYER_SEASON', `${record.year}:${player.id}`));
  if (recent.every((record) => record.stats.type === 'bat')) {
    const lines = recent.map((record) => record.stats).filter((stats) => stats.type === 'bat');
    if (lines.every((stats) => stats.hr >= 20)) {
      return {
        trajectory: 'stable',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${player.name}は直近3シーズンすべてで20本塁打以上を記録している。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'stable-power', years: recent.map((r) => r.year) },
        },
      };
    }
    const first = lines[0];
    const last = lines.at(-1)!;
    if (last.g >= first.g + 30 && last.g >= 80) {
      return {
        trajectory: 'rising',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${recent[0].year}年から${recent[2].year}年にかけて、${player.name}の年間出場試合数は${first.g}試合から${last.g}試合へ増えた。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'playing-time-up', from: first.g, to: last.g },
        },
      };
    }
    if (last.hr >= first.hr + 8) {
      return {
        trajectory: 'rising',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${recent[0].year}年から${recent[2].year}年にかけて、${player.name}の本塁打は${first.hr}本から${last.hr}本へ増えた。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'home-runs-up', from: first.hr, to: last.hr },
        },
      };
    }
    if (player.age >= 32 && last.g <= first.g - 25 && last.hr <= first.hr - 5) {
      return {
        trajectory: 'declining',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${recent[0].year}年から${recent[2].year}年にかけて、${player.name}は出場試合数と本塁打の双方が減少している。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'batting-output-down' },
        },
      };
    }
    if (lines.every((stats) => stats.g >= 100) && Math.max(...lines.map((s) => s.hr)) - Math.min(...lines.map((s) => s.hr)) <= 5) {
      return {
        trajectory: 'stable',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${player.name}は直近3シーズンすべてで100試合以上に出場し、本塁打数の振れ幅は5本以内だった。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'stable-regular' },
        },
      };
    }
    return { input: null, trajectory: 'none' };
  }

  if (recent.every((record) => record.stats.type === 'pit')) {
    const lines = recent.map((record) => record.stats).filter((stats) => stats.type === 'pit');
    const metric =
      player.role === 'クローザー'
        ? { label: 'セーブ', key: 'sv' as const, rise: 8, stable: 20 }
        : player.role === 'リリーフ'
          ? { label: 'ホールド', key: 'hld' as const, rise: 8, stable: 20 }
          : { label: '勝利', key: 'w' as const, rise: 4, stable: 8 };
    const first = lines[0][metric.key];
    const last = lines.at(-1)![metric.key];
    if (lines.every((stats) => stats[metric.key] >= metric.stable)) {
      return {
        trajectory: 'stable',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${player.name}は直近3シーズンすべてで${metric.label}${metric.stable}以上を記録している。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'stable-pitching-role', metric: metric.key },
        },
      };
    }
    if (last >= first + metric.rise) {
      return {
        trajectory: 'rising',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${recent[0].year}年から${recent[2].year}年にかけて、${player.name}の${metric.label}は${first}から${last}へ増えた。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'pitching-output-up', metric: metric.key, from: first, to: last },
        },
      };
    }
    if (player.age >= 32 && last + metric.rise <= first) {
      return {
        trajectory: 'declining',
        input: {
          id: 'recent-trajectory',
          sourceClass: 'derived',
          text: `${recent[0].year}年から${recent[2].year}年にかけて、${player.name}の${metric.label}は${first}から${last}へ減った。`,
          factRefs,
          value: { sourceClass: 'derived', trajectory: 'pitching-output-down', metric: metric.key, from: first, to: last },
        },
      };
    }
  }
  return { input: null, trajectory: 'none' };
}

function relativeStanding(
  source: PlayerNarrativeProfileSource,
  records: PlayerSeasonRecord[],
): { input: PlayerProfileEditorialInput | null; rank: number | null } {
  const latest = records.at(-1);
  if (!latest) return { input: null, rank: null };
  const league = TINFO[latest.teamKey].lg;
  const pool = (source.yearlyStats[String(latest.year)] ?? []).filter(
    (record) =>
      record.stats.g > 0 &&
      TINFO[record.teamKey]?.lg === league &&
      record.stats.type === latest.stats.type,
  );

  let label = '';
  let unit = '';
  let value = 0;
  let values: number[] = [];
  if (latest.stats.type === 'bat') {
    label = '本塁打';
    unit = '本';
    value = latest.stats.hr;
    if (value < 5) return { input: null, rank: null };
    values = pool.flatMap((record) => (record.stats.type === 'bat' ? [record.stats.hr] : []));
  } else {
    const metric =
      source.player.role === 'クローザー'
        ? { label: 'セーブ', unit: '', key: 'sv' as const, minimum: 5 }
        : source.player.role === 'リリーフ'
          ? { label: 'ホールド', unit: '', key: 'hld' as const, minimum: 5 }
          : { label: '勝利', unit: '勝', key: 'w' as const, minimum: 3 };
    label = metric.label;
    unit = metric.unit;
    value = latest.stats[metric.key];
    if (value < metric.minimum) return { input: null, rank: null };
    values = pool.flatMap((record) =>
      record.stats.type === 'pit' ? [record.stats[metric.key]] : [],
    );
  }
  const rank = 1 + values.filter((candidate) => candidate > value).length;
  if (rank > 10) return { input: null, rank };
  const ties = values.filter((candidate) => candidate === value).length;
  const leagueName = league === 'central' ? 'セ・リーグ' : 'パ・リーグ';
  return {
    rank,
    input: {
      id: 'relative-standing',
      sourceClass: 'derived',
      text: `${latest.year}年の${label}${value}${unit}は${leagueName}で${ties > 1 ? '同率' : ''}${rank}位。`,
      factRefs: [ref('PLAYER_PROFILE', `${source.asOfDate}:${source.player.id}:relative-standing`)],
      value: {
        sourceClass: 'derived',
        year: latest.year,
        league,
        metric: label,
        value,
        rank,
        tied: ties > 1,
      },
    },
  };
}

function teamShare(
  source: PlayerNarrativeProfileSource,
  records: PlayerSeasonRecord[],
): PlayerProfileEditorialInput | null {
  const latest = records.at(-1);
  if (!latest || latest.stats.type !== 'bat' || latest.stats.hr < 5) return null;
  const teamRecords = (source.yearlyStats[String(latest.year)] ?? []).filter(
    (record) => record.teamKey === latest.teamKey && record.stats.type === 'bat',
  );
  const teamHomeRuns = teamRecords.reduce(
    (total, record) => total + (record.stats.type === 'bat' ? record.stats.hr : 0),
    0,
  );
  if (teamHomeRuns <= 0) return null;
  const share = Math.round((latest.stats.hr / teamHomeRuns) * 100);
  if (share < 15) return null;
  return {
    id: 'team-share',
    sourceClass: 'derived',
    text: `${latest.year}年、${source.player.name}の${latest.stats.hr}本塁打は${latest.teamName}のチーム本塁打${teamHomeRuns}本の${share}%を占めた。`,
    factRefs: [ref('PLAYER_PROFILE', `${source.asOfDate}:${source.player.id}:team-home-run-share`)],
    value: {
      sourceClass: 'derived',
      year: latest.year,
      playerHomeRuns: latest.stats.hr,
      teamHomeRuns,
      sharePercent: share,
    },
  };
}

function championshipInput(
  source: PlayerNarrativeProfileSource,
  records: PlayerSeasonRecord[],
): PlayerProfileEditorialInput | null {
  const byYear = new Map(records.map((record) => [record.year, record]));
  const supported = (source.championHistory ?? []).filter((record) => {
    if (record.year >= source.seasonYear) return false;
    const season = byYear.get(record.year);
    if (!season || season.teamKey !== record.champion) return false;
    return (
      record.lineup?.some((entry) => entry.playerId === source.player.id) ||
      record.keyBatters?.includes(source.player.name) ||
      record.keyPitchers?.includes(source.player.name)
    );
  });
  if (!supported.length) return null;
  const years = supported.map((record) => record.year).sort((a, b) => a - b);
  return {
    id: 'championship-history',
    sourceClass: 'derived',
    text: `${source.player.name}は${years.join('年、')}年の日本一記録で、優勝チームの主要選手として名前が保存されている。`,
    factRefs: [ref('PLAYER_PROFILE', `${source.asOfDate}:${source.player.id}:championship-history`)],
    value: { sourceClass: 'derived', championshipYears: years },
  };
}

function isRegular(record: PlayerSeasonRecord): boolean {
  if (record.stats.type === 'bat') return record.stats.g >= 100;
  if (record.role === '先発') return record.stats.gs >= 15;
  if (record.role === 'クローザー') return record.stats.sv >= 20;
  return record.stats.g >= 40;
}

function peakAndLatest(
  records: PlayerSeasonRecord[],
  player: Player,
): { peak: number; latest: number } {
  const latestRecord = records.at(-1);
  if (!latestRecord) return { peak: 0, latest: 0 };
  if (latestRecord.stats.type === 'bat') {
    const values = records.flatMap((record) =>
      record.stats.type === 'bat' ? [record.stats.hr] : [],
    );
    return { peak: Math.max(0, ...values), latest: latestRecord.stats.hr };
  }
  const key = player.role === 'クローザー' ? 'sv' : player.role === 'リリーフ' ? 'hld' : 'w';
  const values = records.flatMap((record) =>
    record.stats.type === 'pit' ? [record.stats[key]] : [],
  );
  return { peak: Math.max(0, ...values), latest: latestRecord.stats[key] };
}

function hasMaterialPotentialGap(player: Player): boolean {
  return Object.entries(player.pot).some(([key, target]) => {
    if (typeof target !== 'number') return false;
    const current = player.p[key as keyof typeof player.p];
    return typeof current === 'number' && target >= current + 12;
  });
}

function archetypeInput(
  source: PlayerNarrativeProfileSource,
  records: PlayerSeasonRecord[],
  trajectory: Trajectory,
  relativeRank: number | null,
): { input: PlayerProfileEditorialInput; archetype: PlayerProfileArchetype } {
  const { player } = source;
  const firstRegular = records.find(isRegular);
  const teamCount = new Set(records.map((record) => record.teamKey)).size;
  const latest = records.at(-1);
  const latestRegular = latest ? isRegular(latest) : false;
  const maturityPeakAge = MATURITY_PEAK_AGE[player.mat];
  const growthRoom = player.potentialClass === 'elite' || hasMaterialPotentialGap(player);
  const { peak, latest: latestValue } = peakAndLatest(records, player);
  const starPeak = player.isP
    ? player.role === 'クローザー'
      ? peak >= 30
      : player.role === 'リリーフ'
        ? peak >= 25
        : peak >= 12
    : peak >= 25;
  let archetype: PlayerProfileArchetype;
  let label: string;

  if (
    firstRegular &&
    records.length >= 2 &&
    (firstRegular.age >= 28 ||
      ((player.mat === '晩成' || player.mat === '超晩成') &&
        firstRegular.age >= maturityPeakAge - 2))
  ) {
    archetype = 'late-bloomer';
    label = '遅咲き';
  } else if (player.age >= 33 && starPeak && latestValue <= peak * 0.55) {
    archetype = 'former-star';
    label = '全盛期の実績を持つベテラン';
  } else if (player.age >= 32 && trajectory === 'declining') {
    archetype = 'declining-veteran';
    label = '近年成績が下降しているベテラン';
  } else if (relativeRank !== null && relativeRank <= 5 && records.length >= 3) {
    archetype = 'established-star';
    label = 'リーグ上位の実績を持つ主力';
  } else if (player.age <= 24 && growthRoom && records.length <= 2) {
    archetype = 'elite-prospect';
    label = '若手有望株';
  } else if (
    player.age <= Math.min(28, maturityPeakAge) &&
    (growthRoom || trajectory === 'rising') &&
    records.length <= 4
  ) {
    archetype = 'breakout-candidate';
    label = 'ブレイク候補';
  } else if (player.age <= 26 && latestRegular) {
    archetype = 'young-regular';
    label = '若手レギュラー';
  } else if (player.age >= 31 && records.length >= 7 && trajectory !== 'declining') {
    archetype = 'steady-veteran';
    label = '経験を重ねたベテラン';
  } else if (teamCount >= 3) {
    archetype = 'journeyman';
    label = '複数球団を歩んだ選手';
  } else if (records.length >= 3) {
    archetype = 'established-regular';
    label = '一軍実績を積んだ選手';
  } else {
    archetype = 'developing-player';
    label = 'キャリア初期の選手';
  }

  return {
    archetype,
    input: {
      id: 'career-archetype',
      sourceClass: 'derived',
      text: `${player.name}は、保存された年齢・年度別実績・現在の能力評価に基づく編集分類では「${label}」。`,
      factRefs: [ref('PLAYER_PROFILE', `${source.asOfDate}:${player.id}:career-archetype`)],
      value: {
        sourceClass: 'derived',
        archetype,
        basis: {
          age: player.age,
          activeSeasons: records.length,
          firstRegularAge: firstRegular?.age ?? null,
          relativeRank,
          trajectory,
          maturity: player.mat,
          maturityPeakAge,
          potentialClass: player.potentialClass ?? 'standard',
          materialPotentialGap: hasMaterialPotentialGap(player),
        },
      },
    },
  };
}

function uniqueRefs(inputs: PlayerProfileEditorialInput[]): NarrativeFactRef[] {
  const seen = new Set<string>();
  const output: NarrativeFactRef[] = [];
  for (const input of inputs) {
    for (const candidate of input.factRefs) {
      const key = `${candidate.kind}:${candidate.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(candidate);
    }
  }
  return output;
}

export function buildPlayerNarrativeProfile(
  source: PlayerNarrativeProfileSource,
): PlayerNarrativeProfile | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(source.asOfDate) ||
    Number(source.asOfDate.slice(0, 4)) !== source.seasonYear
  )
    return null;

  const { player, teamKey, seasonYear, asOfDate } = source;
  const team = TINFO[teamKey];
  if (!team) return null;
  const records = availableRecords(source);
  const identityRef = ref('PLAYER_CURRENT', `${asOfDate}:${player.id}:identity`);
  const identity: PlayerProfileEditorialInput = {
    id: 'identity',
    sourceClass: 'canonical',
    text: `${player.name}は${player.age}歳の${roleLabel(player)}で、${team.n}に所属する。`,
    factRefs: [identityRef],
    value: {
      sourceClass: 'canonical',
      asOfDate,
      playerId: player.id,
      playerName: player.name,
      age: player.age,
      teamKey,
      role: roleLabel(player),
    },
  };

  const summary = careerSummary(player, records, asOfDate);
  const latest = records.at(-1);
  const latestInput: PlayerProfileEditorialInput | null = latest
    ? {
        id: 'latest-season',
        sourceClass: 'canonical',
        text: latestSeasonText(latest),
        factRefs: [ref('PLAYER_SEASON', `${latest.year}:${player.id}`)],
        value: {
          sourceClass: 'canonical',
          playerId: latest.playerId,
          playerName: latest.playerName,
          year: latest.year,
          age: latest.age,
          teamKey: latest.teamKey,
          teamName: latest.teamName,
          isPitcher: latest.isPitcher,
          role: latest.role,
          position: latest.position,
          stats: structuredClone(latest.stats),
        },
      }
    : null;
  const best = careerBest(player, records, asOfDate);
  const strongest = strongestSkill(player, asOfDate);
  const trajectory = trajectoryInput(player, records);
  const standing = relativeStanding(source, records);
  const share = teamShare(source, records);
  const championship = championshipInput(source, records);
  const archetype = archetypeInput(source, records, trajectory.trajectory, standing.rank);

  const primary = [identity, ...(summary ? [summary] : [])];
  const context = [
    ...(latestInput ? [latestInput] : []),
    ...(best ? [best] : []),
    ...(trajectory.input ? [trajectory.input] : []),
    ...(standing.input ? [standing.input] : []),
    ...(share ? [share] : []),
    ...(strongest ? [strongest] : []),
    ...(championship ? [championship] : []),
    archetype.input,
  ].slice(0, 10);
  const editorialInputs = [...primary, ...context];
  const headline = `${player.name}｜${team.ab} 選手名鑑`;
  const articleSegments = [
    { class: 'FACTUAL' as const, text: identity.text, factRefs: identity.factRefs },
    ...(summary
      ? [{ class: 'FACTUAL' as const, text: summary.text, factRefs: summary.factRefs }]
      : []),
    ...(latestInput
      ? [{ class: 'FACTUAL' as const, text: latestInput.text, factRefs: latestInput.factRefs }]
      : []),
    {
      class: 'FACTUAL' as const,
      text: archetype.input.text,
      factRefs: archetype.input.factRefs,
    },
  ];
  const article: NarrativeArticle = {
    id: `player-profile:${seasonYear}:${player.id}`,
    generatorVersion: NARRATIVE_GENERATOR_VERSION,
    kind: 'playerProfile',
    year: seasonYear,
    publishedAt: `${seasonYear}年選手名鑑`,
    asOfDate,
    viewMode: 'live',
    headline,
    teamKeys: [teamKey],
    playerIds: [player.id],
    segments: articleSegments,
    factRefs: uniqueRefs(editorialInputs),
  };

  const headlineClaim = {
    id: 'headline',
    role: 'primary' as const,
    text: headline,
    factRefs: identity.factRefs,
    locked: false,
  };
  const primaryClaims = primary.map((input, index) => ({
    id: `p${index}`,
    role: 'primary' as const,
    text: input.text,
    factRefs: input.factRefs,
    locked: false,
  }));
  const contextClaims = context.map((input, index) => ({
    id: `ctx${index}`,
    role: 'context' as const,
    text: input.text,
    factRefs: input.factRefs,
    locked: false,
  }));
  const allInputs = [identity, ...editorialInputs];
  const facts = new Map<string, FactPacket['facts'][number]>();
  for (const input of allInputs) {
    for (const factRef of input.factRefs) {
      const key = `${factRef.kind}:${factRef.key}`;
      if (!facts.has(key)) facts.set(key, { ref: factRef, value: structuredClone(input.value) });
    }
  }
  const rich = contextClaims.length >= 2;
  const packet: FactPacket = {
    schemaVersion: 2,
    articleId: article.id,
    kind: article.kind,
    year: seasonYear,
    asOfDate,
    publishedAt: article.publishedAt,
    facts: [...facts.values()],
    claims: [headlineClaim, ...primaryClaims, ...contextClaims],
    entities: [
      player.name,
      team.n,
      team.ab,
      ...records.flatMap((record) => [record.teamName, record.teamAbbreviation]),
    ]
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
      .sort(),
    story: {
      depth: rich ? 'feature' : 'brief',
      score: rich ? 70 + Math.min(20, contextClaims.length * 2) : 25,
      reasons: [
        'player-profile',
        ...(records.length ? ['career-history'] : []),
        ...(trajectory.input ? ['career-trajectory'] : []),
        ...(standing.input ? ['relative-standing'] : []),
        ...(rich ? ['profile-rich-context'] : []),
      ],
      targetParagraphs: rich ? { min: 2, max: 4 } : { min: 1, max: 2 },
      primaryClaimIds: [headlineClaim.id, ...primaryClaims.map((claim) => claim.id)],
      contextArticleIds: context
        .flatMap((input) =>
          input.factRefs.map((factRef) => `${factRef.kind.toLowerCase()}:${factRef.key}`),
        )
        .slice(0, 32),
    },
  };
  if (!validPacket(packet)) return null;
  return { article, packet, editorialInputs, archetype: archetype.archetype };
}
