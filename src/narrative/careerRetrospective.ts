import { TINFO } from '../data';
import type {
  AchievementEvent,
  Player,
  PlayerSeasonRecord,
  SeasonTitleRecord,
  TeamKey,
  YearlyPlayerRecords,
} from '../engine';
import { earnedRunAverage, inningsText } from '../engine/statsFormat';
import type { NarrativeEvent, NarrativeEventLedger, NarrativeFactKind, NarrativeFactRef, NarrativeArticle } from './types';
import { NARRATIVE_GENERATOR_VERSION } from './types';
import { validPacket, type FactPacket } from './protocol';

export type CareerRetrospectiveSourceClass = 'canonical' | 'derived';
export type CareerRetrospectiveOutcome =
  | 'top-evaluation-realized'
  | 'lower-ranked-rise'
  | 'top-evaluation-gap'
  | 'steady-development';

export interface CareerRetrospectiveEditorialInput {
  id: string;
  sourceClass: CareerRetrospectiveSourceClass;
  text: string;
  factRefs: NarrativeFactRef[];
  value: unknown;
}

export interface CareerRetrospective {
  article: NarrativeArticle;
  packet: FactPacket;
  editorialInputs: CareerRetrospectiveEditorialInput[];
  outcome: CareerRetrospectiveOutcome;
  retired: boolean;
}

export interface CareerRetrospectiveSource {
  player: Player;
  seasonYear: number;
  asOfDate: string;
  yearlyStats: YearlyPlayerRecords;
  awardHistory: SeasonTitleRecord[];
  achievementHistory: AchievementEvent[];
  narrativeEvents: NarrativeEventLedger;
}

const ref = (kind: NarrativeFactKind, key: string): NarrativeFactRef => ({ kind, key });

function visibleYear(year: number, seasonYear: number, asOfDate: string): boolean {
  return year < seasonYear || (year === seasonYear && asOfDate === `${seasonYear}-12-31`);
}

function visibleDated(year: number, date: string, seasonYear: number, asOfDate: string): boolean {
  if (year < seasonYear) return true;
  if (year > seasonYear) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date <= asOfDate;
  return asOfDate === `${seasonYear}-12-31`;
}

function recordsFor(source: CareerRetrospectiveSource): PlayerSeasonRecord[] {
  return Object.values(source.yearlyStats)
    .flat()
    .filter(
      (record) =>
        record.playerId === source.player.id &&
        record.stats.g > 0 &&
        visibleYear(record.year, source.seasonYear, source.asOfDate),
    )
    .sort((a, b) => a.year - b.year);
}

function playerEvents(source: CareerRetrospectiveSource): NarrativeEvent[] {
  return Object.values(source.narrativeEvents)
    .flat()
    .filter((event) => {
      const involved =
        'playerId' in event &&
        (event.playerId === source.player.id ||
          (event.type === 'transaction' &&
            event.movements?.some((movement) => movement.playerId === source.player.id)));
      return involved && visibleDated(event.year, event.date, source.seasonYear, source.asOfDate);
    })
    .sort((a, b) => a.year - b.year || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function seasonLine(record: PlayerSeasonRecord): string {
  const stats = record.stats;
  if (stats.type === 'bat') {
    const average = stats.ab > 0 ? (stats.h / stats.ab).toFixed(3).replace(/^0/, '') : '.000';
    return `${record.year}年は${record.teamName}で${stats.g}試合、打率${average}、${stats.hr}本塁打、${stats.rbi}打点、${stats.sb}盗塁、シーズン終了時OVR ${record.ovr}。`;
  }
  const era = earnedRunAverage(stats);
  return `${record.year}年は${record.teamName}で${stats.g}登板${stats.gs ? `、${stats.gs}先発` : ''}、${stats.w}勝${stats.l}敗${stats.sv ? `、${stats.sv}セーブ` : ''}${stats.hld ? `、${stats.hld}ホールド` : ''}${era !== null ? `、防御率${era.toFixed(2)}` : ''}、${inningsText(stats.ip3)}回、${stats.k}奪三振、シーズン終了時OVR ${record.ovr}。`;
}

function isRegular(record: PlayerSeasonRecord): boolean {
  if (record.stats.type === 'bat') return record.stats.g >= 100;
  if (record.role === '先発') return record.stats.gs >= 15;
  if (record.role === 'クローザー') return record.stats.sv >= 20;
  return record.stats.g >= 40;
}

function careerSummary(
  player: Player,
  records: PlayerSeasonRecord[],
  asOfDate: string,
): CareerRetrospectiveEditorialInput {
  const first = records[0];
  const last = records.at(-1)!;
  const regularSeasons = records.filter(isRegular).length;
  const teamKeys = [...new Set(records.map((record) => record.teamKey))];
  if (last.stats.type === 'bat') {
    const totals = records.reduce(
      (sum, record) => {
        if (record.stats.type === 'bat') {
          sum.games += record.stats.g;
          sum.hits += record.stats.h;
          sum.homeRuns += record.stats.hr;
          sum.rbi += record.stats.rbi;
          sum.stolenBases += record.stats.sb;
        }
        return sum;
      },
      { games: 0, hits: 0, homeRuns: 0, rbi: 0, stolenBases: 0 },
    );
    return {
      id: 'career-summary',
      sourceClass: 'derived',
      text: `${last.year}年終了時点で、${player.name}は${first.year}年から${records.length}シーズンに一軍出場し、うち${regularSeasons}シーズンで100試合以上に出場。通算${totals.games}試合、${totals.hits}安打、${totals.homeRuns}本塁打、${totals.rbi}打点、${totals.stolenBases}盗塁を記録している。`,
      factRefs: [ref('CAREER_SUMMARY', `${asOfDate}:${player.id}:retrospective-summary`)],
      value: {
        sourceClass: 'derived',
        firstActiveYear: first.year,
        throughYear: last.year,
        activeSeasons: records.length,
        regularSeasons,
        teamKeys,
        totals,
      },
    };
  }
  const totals = records.reduce(
    (sum, record) => {
      if (record.stats.type === 'pit') {
        sum.games += record.stats.g;
        sum.starts += record.stats.gs;
        sum.wins += record.stats.w;
        sum.strikeouts += record.stats.k;
        sum.saves += record.stats.sv;
        sum.holds += record.stats.hld;
      }
      return sum;
    },
    { games: 0, starts: 0, wins: 0, strikeouts: 0, saves: 0, holds: 0 },
  );
  return {
    id: 'career-summary',
    sourceClass: 'derived',
    text: `${last.year}年終了時点で、${player.name}は${first.year}年から${records.length}シーズンに一軍登板し、役割基準で${regularSeasons}シーズンに定着。通算${totals.games}登板、${totals.starts}先発、${totals.wins}勝、${totals.strikeouts}奪三振、${totals.saves}セーブ、${totals.holds}ホールドを記録している。`,
    factRefs: [ref('CAREER_SUMMARY', `${asOfDate}:${player.id}:retrospective-summary`)],
    value: {
      sourceClass: 'derived',
      firstActiveYear: first.year,
      throughYear: last.year,
      activeSeasons: records.length,
      regularSeasons,
      teamKeys,
      totals,
    },
  };
}

function transactionText(event: Extract<NarrativeEvent, { type: 'transaction' }>, playerId: string): string | null {
  const movement = event.movements?.find((entry) => entry.playerId === playerId);
  const playerName = movement?.playerName ?? event.playerName;
  const from = movement?.fromTeamKey ?? event.fromTeamKey;
  const to = movement?.toTeamKey ?? event.toTeamKey;
  if (event.transactionKind === 'trade' && from && to)
    return `${event.year}年、${playerName}は${TINFO[from].n}から${TINFO[to].n}へトレードで移籍した。`;
  if (event.transactionKind === 'faSigning' && to)
    return `${event.year}年、${playerName}はFAで${TINFO[to].n}へ加入した。`;
  if (event.transactionKind === 'release' && from)
    return `${event.year}年、${playerName}は${TINFO[from].n}を退団した。`;
  if (event.transactionKind === 'retirement')
    return from
      ? `${event.year}年、${playerName}は${TINFO[from].n}在籍時に現役を引退した。`
      : `${event.year}年、${playerName}は現役を引退した。`;
  return null;
}

function uniqueRefs(inputs: CareerRetrospectiveEditorialInput[]): NarrativeFactRef[] {
  const seen = new Set<string>();
  return inputs.flatMap((input) =>
    input.factRefs.filter((candidate) => {
      const key = `${candidate.kind}:${candidate.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

export function buildCareerRetrospective(
  source: CareerRetrospectiveSource,
): CareerRetrospective | null {
  if (
    !Number.isSafeInteger(source.seasonYear) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.asOfDate) ||
    Number(source.asOfDate.slice(0, 4)) !== source.seasonYear
  )
    return null;

  const { player, seasonYear, asOfDate } = source;
  const history = player.preProHistory;
  if (!history) return null;
  const records = recordsFor(source);
  if (records.length < 2) return null;

  const events = playerEvents(source);
  const draft = events.find(
    (event): event is Extract<NarrativeEvent, { type: 'draft' }> =>
      event.type === 'draft' && event.playerId === player.id && Boolean(event.prospectSnapshot),
  );
  if (!draft?.prospectSnapshot) return null;

  const draftRef = ref('DRAFT_SELECTION', draft.id);
  const prePro: CareerRetrospectiveEditorialInput = {
    id: 'pre-pro-history',
    sourceClass: 'canonical',
    text: history.highlights.length
      ? `${player.name}のプロ入り前には、${history.highlights.map((highlight) => highlight.text).join('、')}という記録が保存されている。`
      : `${player.name}は${history.origin}からプロ入りした。`,
    factRefs: [ref('PLAYER_PRE_PRO', `${player.id}:${history.source}`)],
    value: { sourceClass: 'canonical', ...structuredClone(history) },
  };
  const selection: CareerRetrospectiveEditorialInput = {
    id: 'draft-selection',
    sourceClass: 'canonical',
    text: `${player.name}は${draft.year}年ドラフト${draft.round}巡目で${TINFO[draft.teamKey].n}に指名された${draft.origin ? `（${draft.origin}）` : ''}。`,
    factRefs: [draftRef],
    value: { sourceClass: 'canonical', ...structuredClone(draft) },
  };
  const snapshot = draft.prospectSnapshot;
  const evaluation: CareerRetrospectiveEditorialInput = {
    id: 'draft-evaluation',
    sourceClass: 'derived',
    text: `ドラフト当時の保存評価では、現在能力OVR ${snapshot.currentOverall}で候補${snapshot.poolSize}人中${snapshot.poolRank}位。現在能力で最も高い項目は${snapshot.strongestSkill.label}で、潜在能力設定では現在値より12点以上高い項目が${snapshot.materialPotentialGap.count}項目あった。`,
    factRefs: [ref('DRAFT_EVALUATION', `${draft.year}:${player.id}:draft-pool-v1`)],
    value: { sourceClass: 'derived', ...structuredClone(snapshot) },
  };

  const summary = careerSummary(player, records, asOfDate);
  const peakRecord = records
    .slice()
    .sort((a, b) => b.ovr - a.ovr || b.year - a.year)[0];
  const peak: CareerRetrospectiveEditorialInput = {
    id: 'career-peak',
    sourceClass: 'derived',
    text: `保存された年度別OVRが最も高いシーズンは${peakRecord.year}年。${seasonLine(peakRecord)}`,
    factRefs: [ref('CAREER_RETROSPECTIVE', `${asOfDate}:${player.id}:peak-season-v1`)],
    value: {
      sourceClass: 'derived',
      peakRecord: structuredClone(peakRecord),
      comparedSeasonOvrs: records.map((record) => ({ year: record.year, ovr: record.ovr })),
    },
  };

  const titles = source.awardHistory
    .filter(
      (record) =>
        record.playerId === player.id && visibleYear(record.year, seasonYear, asOfDate),
    )
    .sort((a, b) => a.year - b.year || a.titleLabel.localeCompare(b.titleLabel));
  const titleCounts = [...titles.reduce((counts, title) => {
    counts.set(title.titleLabel, (counts.get(title.titleLabel) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].sort(([a], [b]) => a.localeCompare(b));
  const titleInput: CareerRetrospectiveEditorialInput | null = titles.length
    ? {
        id: 'titles',
        sourceClass: 'derived',
        text: `個人タイトルは延べ${titles.length}回（${titleCounts
          .map(([label, count]) => `${label}${count}回`)
          .join('、')}）。`,
        factRefs: [
          ref('CAREER_RETROSPECTIVE', `${asOfDate}:${player.id}:title-summary-v1`),
        ],
        value: {
          sourceClass: 'derived',
          totalTitles: titles.length,
          titleCounts: titleCounts.map(([label, count]) => ({ label, count })),
          firstTitleYear: titles[0]?.year ?? null,
          lastTitleYear: titles.at(-1)?.year ?? null,
        },
      }
    : null;

  const achievements = source.achievementHistory
    .filter(
      (event) =>
        event.playerId === player.id &&
        visibleDated(event.year, event.date, seasonYear, asOfDate),
    )
    .sort((a, b) => a.year - b.year || a.date.localeCompare(b.date));
  const achievementCounts = [...achievements.reduce((counts, event) => {
    counts.set(event.metricLabel, (counts.get(event.metricLabel) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].sort(([a], [b]) => a.localeCompare(b));
  const achievementInput: CareerRetrospectiveEditorialInput | null = achievements.length
    ? {
        id: 'achievements',
        sourceClass: 'derived',
        text: `主要記録イベントは${achievements.length}件（${achievementCounts
          .map(([label, count]) => `${label}${count}件`)
          .join('、')}）。`,
        factRefs: [
          ref('CAREER_RETROSPECTIVE', `${asOfDate}:${player.id}:achievement-summary-v1`),
        ],
        value: {
          sourceClass: 'derived',
          totalAchievements: achievements.length,
          achievementCounts: achievementCounts.map(([label, count]) => ({ label, count })),
          firstAchievementYear: achievements[0]?.year ?? null,
          lastAchievementYear: achievements.at(-1)?.year ?? null,
          eventIds: achievements.map((event) => event.id),
        },
      }
    : null;

  const transactions = events.filter(
    (event): event is Extract<NarrativeEvent, { type: 'transaction' }> =>
      event.type === 'transaction' &&
      (event.playerId === player.id ||
        Boolean(event.movements?.some((movement) => movement.playerId === player.id))),
  );
  const transactionLines = transactions
    .map((event) => ({ event, text: transactionText(event, player.id) }))
    .filter((entry): entry is { event: (typeof transactions)[number]; text: string } =>
      Boolean(entry.text),
    );
  const transactionInput: CareerRetrospectiveEditorialInput | null = transactionLines.length
    ? {
        id: 'transactions',
        sourceClass: 'canonical',
        text: transactionLines.map((entry) => entry.text).join(' '),
        factRefs: transactionLines.map((entry) => ref('TRANSACTION', entry.event.id)),
        value: {
          sourceClass: 'canonical',
          transactions: structuredClone(transactionLines.map((entry) => entry.event)),
        },
      }
    : null;

  const careerEvents = events
    .filter(
      (event): event is Extract<NarrativeEvent, { type: 'career' }> =>
        event.type === 'career' && event.playerId === player.id && Boolean(event.detail),
    )
    .slice(-4);
  const careerEventInput: CareerRetrospectiveEditorialInput | null = careerEvents.length
    ? {
        id: 'career-events',
        sourceClass: 'canonical',
        text: careerEvents.map((event) => event.detail).filter(Boolean).join(' '),
        factRefs: careerEvents.map((event) => ref('CAREER_EVENT', event.id)),
        value: { sourceClass: 'canonical', events: structuredClone(careerEvents) },
      }
    : null;

  const retirement = transactions.find(
    (event) => event.transactionKind === 'retirement' && event.playerId === player.id,
  );
  const retired = Boolean(retirement);
  const retirementInput: CareerRetrospectiveEditorialInput | null = retirement
    ? {
        id: 'retirement',
        sourceClass: 'canonical',
        text: transactionText(retirement, player.id) ?? `${player.name}は現役を引退した。`,
        factRefs: [ref('TRANSACTION', retirement.id)],
        value: { sourceClass: 'canonical', ...structuredClone(retirement) },
      }
    : null;

  const regularSeasons = records.filter(isRegular).length;
  const draftFraction = snapshot.poolRank / snapshot.poolSize;
  const starCareer = titles.length > 0 || achievements.length > 0 || regularSeasons >= 5;
  const regularCareer = regularSeasons >= 2;
  let outcome: CareerRetrospectiveOutcome = 'steady-development';
  if (draftFraction <= 0.2 && (starCareer || regularCareer)) outcome = 'top-evaluation-realized';
  else if (draftFraction > 0.5 && (starCareer || regularSeasons >= 4))
    outcome = 'lower-ranked-rise';
  else if (draftFraction <= 0.2 && !regularCareer && (retired || records.length >= 6))
    outcome = 'top-evaluation-gap';

  const outcomeText: Record<CareerRetrospectiveOutcome, string> = {
    'top-evaluation-realized': `ドラフト時の候補内OVR順位は上位20%以内で、その後は一軍定着${regularSeasons}シーズン、個人タイトル${titles.length}回、主要記録イベント${achievements.length}件が保存されている。保存事実を並べると、当時の上位評価に対応する一軍実績が後年にも残っている。`,
    'lower-ranked-rise': `ドラフト時の候補内OVR順位は上位50%外だった一方、その後は一軍定着${regularSeasons}シーズン、個人タイトル${titles.length}回、主要記録イベント${achievements.length}件が保存されている。当時の候補内現在能力順位だけでは表し切れない実績が、後年の記録として加わった。`,
    'top-evaluation-gap': `ドラフト時の候補内OVR順位は上位20%以内だった。完了${records.length}シーズンのうち役割基準で一軍定着と数えられるのは${regularSeasons}シーズンで、個人タイトルは${titles.length}回、主要記録イベントは${achievements.length}件。保存事実の範囲では、当時評価と後年の一軍実績に差が残るキャリアとして整理できる。`,
    'steady-development': `ドラフト時の候補内評価と、その後${records.length}シーズンの年度別記録を同じ時系列で比較できる。保存事実の範囲では、一軍定着${regularSeasons}シーズン、個人タイトル${titles.length}回、主要記録イベント${achievements.length}件という歩みになっている。`,
  };
  const outcomeInput: CareerRetrospectiveEditorialInput = {
    id: 'career-outcome',
    sourceClass: 'derived',
    text: outcomeText[outcome],
    factRefs: [ref('CAREER_RETROSPECTIVE', `${asOfDate}:${player.id}:outcome-v1`)],
    value: {
      sourceClass: 'derived',
      outcome,
      draftPoolRank: snapshot.poolRank,
      draftPoolSize: snapshot.poolSize,
      regularSeasons,
      completedSeasons: records.length,
      titles: titles.length,
      achievements: achievements.length,
      retired,
    },
  };

  const primary = [prePro, selection, summary, ...(retirementInput ? [retirementInput] : [])];
  const context = [
    evaluation,
    peak,
    titleInput,
    achievementInput,
    transactionInput,
    careerEventInput,
    outcomeInput,
  ].filter((input): input is CareerRetrospectiveEditorialInput => Boolean(input));
  const editorialInputs = [...primary, ...context];

  const headline = retired
    ? `${player.name}｜ドラフト時評価からたどるキャリア回顧`
    : `${player.name}｜ドラフト時評価からたどる現在までの歩み`;
  const headlineRefs = [draftRef, ...summary.factRefs];
  const article: NarrativeArticle = {
    id: `career-retrospective:${seasonYear}:${player.id}`,
    generatorVersion: NARRATIVE_GENERATOR_VERSION,
    kind: 'careerRetrospective',
    year: seasonYear,
    publishedAt: retired ? `${seasonYear}年 キャリア回顧` : `${seasonYear}年 キャリア特集`,
    asOfDate,
    viewMode: 'live',
    headline,
    teamKeys: [
      ...new Set([
        draft.teamKey,
        ...records.map((record) => record.teamKey),
        ...transactions.flatMap((event) =>
          [event.fromTeamKey, event.toTeamKey, ...(event.movements ?? []).flatMap((m) => [m.fromTeamKey, m.toTeamKey])]
            .filter((key): key is TeamKey => Boolean(key)),
        ),
      ]),
    ],
    playerIds: [player.id],
    segments: [
      { class: 'FACTUAL', text: prePro.text, factRefs: prePro.factRefs },
      { class: 'FACTUAL', text: selection.text, factRefs: selection.factRefs },
      { class: 'FACTUAL', text: evaluation.text, factRefs: evaluation.factRefs },
      { class: 'FACTUAL', text: summary.text, factRefs: summary.factRefs },
      { class: 'FACTUAL', text: peak.text, factRefs: peak.factRefs },
      ...(titleInput ? [{ class: 'FACTUAL' as const, text: titleInput.text, factRefs: titleInput.factRefs }] : []),
      ...(achievementInput
        ? [{ class: 'FACTUAL' as const, text: achievementInput.text, factRefs: achievementInput.factRefs }]
        : []),
      { class: 'ANALYTICAL', text: outcomeInput.text, factRefs: outcomeInput.factRefs },
      ...(retirementInput
        ? [{ class: 'FACTUAL' as const, text: retirementInput.text, factRefs: retirementInput.factRefs }]
        : []),
    ],
    factRefs: uniqueRefs(editorialInputs),
  };

  const primaryClaims = [
    {
      id: 'headline',
      role: 'primary' as const,
      text: headline,
      factRefs: headlineRefs,
      locked: false,
    },
    ...primary.map((input, index) => ({
      id: `p${index}`,
      role: 'primary' as const,
      text: input.text,
      factRefs: input.factRefs,
      locked: false,
    })),
  ];
  const contextClaims = context.map((input, index) => ({
    id: `ctx${index}`,
    role: 'context' as const,
    text: input.text,
    factRefs: input.factRefs,
    locked: false,
  }));

  const facts = new Map<string, FactPacket['facts'][number]>();
  const addFact = (factRef: NarrativeFactRef, value: unknown) => {
    const key = `${factRef.kind}:${factRef.key}`;
    if (!facts.has(key)) facts.set(key, { ref: factRef, value: structuredClone(value) });
  };
  for (const input of editorialInputs) for (const factRef of input.factRefs) addFact(factRef, input.value);
  for (const factRef of headlineRefs)
    if (!facts.has(`${factRef.kind}:${factRef.key}`))
      addFact(factRef, factRef.kind === 'DRAFT_SELECTION' ? selection.value : summary.value);

  const cover = retired || records.length >= 8 || titles.length >= 2 || achievements.length >= 2;
  const packet: FactPacket = {
    schemaVersion: 2,
    articleId: article.id,
    kind: article.kind,
    year: seasonYear,
    asOfDate,
    publishedAt: article.publishedAt,
    facts: [...facts.values()],
    claims: [...primaryClaims, ...contextClaims],
    entities: [
      player.name,
      ...article.teamKeys.flatMap((teamKey) => [TINFO[teamKey].n, TINFO[teamKey].ab]),
      ...achievements.flatMap((achievement) =>
        achievement.previousHolderName ? [achievement.previousHolderName] : [],
      ),
    ]
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
      .sort(),
    story: {
      depth: cover ? 'cover' : 'feature',
      score: Math.min(
        100,
        76 +
          Math.min(10, records.length) +
          Math.min(6, titles.length * 2) +
          Math.min(6, achievements.length * 2),
      ),
      reasons: [
        'career-retrospective',
        'frozen-draft-evaluation',
        'multi-season-career',
        ...(titles.length ? ['title-history'] : []),
        ...(achievements.length ? ['achievement-history'] : []),
        ...(retired ? ['retired-career'] : []),
      ],
      targetParagraphs: cover ? { min: 4, max: 7 } : { min: 3, max: 5 },
      primaryClaimIds: primaryClaims.map((claim) => claim.id),
      contextArticleIds: context
        .flatMap((input) =>
          input.factRefs.map((factRef) => `${factRef.kind.toLowerCase()}:${factRef.key}`),
        )
        .slice(0, 32),
    },
  };

  return validPacket(packet)
    ? { article, packet, editorialInputs, outcome, retired }
    : null;
}
