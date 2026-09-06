import { buildNarrativeFeed, type NarrativeSource } from './generate';
import { narrativeEventArticleId } from './ledger';
import {
  buildCareerMemoryContext,
  buildNarrativeMemoryIndex,
  buildNarrativeStoryArcs,
  type NarrativeMemoryIndex,
} from './memory';
import type {
  NarrativeArticle,
  NarrativeArticleKind,
  NarrativeFactRef,
} from './types';

export type NarrativeStoryDepth = 'brief' | 'feature' | 'cover';

export interface NarrativeStoryPlan {
  depth: NarrativeStoryDepth;
  score: number;
  autoGenerate: boolean;
  reasons: string[];
  targetParagraphs: { min: number; max: number };
}

export interface NarrativeContextClaim {
  id: string;
  sourceArticleId: string;
  sourceKind: NarrativeArticleKind | 'playerSeason';
  asOfDate: string;
  text: string;
  factRefs: NarrativeFactRef[];
  /** Exact archived value for non-article context such as a PlayerSeasonRecord. */
  factValue?: unknown;
}

/**
 * The director spends model tokens on consequential stories, not every ledger row.
 * Scores are deterministic projections over already-canonical facts and never affect simulation.
 */
export function planNarrativeStory(
  article: NarrativeArticle,
  source: NarrativeSource,
  memory: NarrativeMemoryIndex = buildNarrativeMemoryIndex(source),
): NarrativeStoryPlan {
  let score = 10;
  const reasons: string[] = [];

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  if (article.kind === 'championship') add(100, 'championship');
  else if (article.kind === 'seasonAwards') add(72, 'season-awards');
  else if (article.kind === 'achievement') {
    add(65, 'record-or-milestone');
    const event = source.achievementHistory.find((e) => `achievement:${e.id}` === article.id);
    if (event?.kind === 'seasonRecord' || event?.kind === 'careerRecord')
      add(15, 'record-history');
  } else if (article.kind === 'gameRecap') {
    const box = source.gameBoxScores[article.id.slice('game:'.length)];
    if (box?.walkoff) add(32, 'walkoff');
    if (box?.notableEvents.some((e) => e.type === 'comeback')) add(24, 'comeback');
    if (box?.shutoutTeam) add(10, 'shutout');
    if (box && Math.abs(box.homeScore - box.awayScore) <= 1) add(8, 'close-game');
    if ((box?.notableEvents.length ?? 0) >= 2) add(8, 'multiple-notable-plays');
  } else {
    const event = Object.values(source.narrativeEvents ?? {})
      .flat()
      .find((candidate) => narrativeEventArticleId(candidate) === article.id);
    if (event?.type === 'seasonReview') {
      if (event.champion || event.rank === 1) add(78, 'league-champion-review');
      else if (event.rank <= 3) add(48, 'contender-review');
      else add(18, 'season-review');
    } else if (event?.type === 'transaction') {
      if (event.transactionKind === 'retirement') add(72, 'retirement');
      else if (event.transactionKind === 'trade') {
        add(event.movements && event.movements.length > 1 ? 62 : 52, 'trade');
      } else if (event.transactionKind === 'faSigning') add(50, 'fa-signing');
      else if (event.transactionKind === 'foreignSigning') add(34, 'foreign-signing');
      else add(12, 'release');
    } else if (event?.type === 'draft') {
      if (event.round === 1) add(52, 'first-round-draft');
      else if (event.round === 2) add(30, 'early-draft');
      else add(10, 'draft');
    } else if (event?.type === 'career') {
      if (event.careerKind === 'retirement') add(72, 'retirement');
      else if (event.careerKind === 'breakthrough') add(55, 'breakthrough');
      else if (event.careerKind === 'debut') add(42, 'debut');
      else if (event.careerKind === 'returnFromInjury') add(28, 'return');
      else add(12, 'role-change');
    } else if (event?.type === 'injury') {
      if (event.severity === 'heavy') add(50, 'heavy-injury');
      else if (event.severity === 'mid') add(25, 'injury');
      else add(6, 'light-injury');
    } else if (event?.type === 'development') {
      if (event.developmentKind === 'awakening') {
        add(event.isBreakthrough ? 55 : 42, event.isBreakthrough ? 'major-awakening' : 'awakening');
      } else if (
        event.developmentKind === 'growth' &&
        Math.abs(event.ovrAfter - event.ovrBefore) >= 5
      ) {
        add(36, 'major-growth');
      } else add(5, 'routine-growth');
    }
  }

  const factualSegments = article.segments.filter((s) => s.class === 'FACTUAL').length;
  if (factualSegments >= 3) add(12, 'rich-primary-facts');
  else if (factualSegments >= 2) add(5, 'multiple-primary-facts');

  // Existing history can turn an otherwise thin event into a worthwhile feature, but never enough
  // to make a routine game expensive on its own.
  const arcs = buildNarrativeStoryArcs(article, source, memory);
  let arcBoost = 0;
  for (const storyArc of arcs) {
    if (
      storyArc.type === 'repeat-final' ||
      (storyArc.type === 'long-career' && article.kind === 'career') ||
      (storyArc.type === 'title-history' &&
        ['career', 'achievement', 'transaction'].includes(article.kind)) ||
      (storyArc.type === 'club-journey' &&
        ['gameRecap', 'achievement', 'career', 'transaction'].includes(article.kind)) ||
      (storyArc.type === 'career-origin' &&
        ['achievement', 'career', 'transaction'].includes(article.kind))
    )
      arcBoost += storyArc.weight;
  }
  if (arcBoost > 0) add(Math.min(18, arcBoost), 'story-arc-context');

  // Game recaps are deliberately deterministic. AI is reserved for feature journalism that can
  // connect a consequential event to durable career/franchise history; rewriting a box score is
  // not a worthwhile use of model tokens.
  const modelEligible = article.kind !== 'gameRecap';
  const depth: NarrativeStoryDepth = modelEligible
    ? score >= 100
      ? 'cover'
      : score >= 50
        ? 'feature'
        : 'brief'
    : 'brief';
  return {
    depth,
    score,
    autoGenerate: modelEligible && depth !== 'brief',
    reasons: [
      ...reasons,
      ...(!modelEligible ? ['deterministic-game-recap'] : []),
      ...arcs.slice(0, 6).map((storyArc) => `arc:${storyArc.type}`),
    ],
    targetParagraphs:
      depth === 'cover'
        ? { min: 5, max: 8 }
        : depth === 'feature'
          ? { min: 3, max: 5 }
          : { min: 1, max: 2 },
  };
}

function relatedness(target: NarrativeArticle, candidate: NarrativeArticle): number {
  let score = 0;
  const targetPlayers = new Set(target.playerIds);
  const targetTeams = new Set(target.teamKeys);
  score += candidate.playerIds.filter((id) => targetPlayers.has(id)).length * 40;
  score += candidate.teamKeys.filter((key) => targetTeams.has(key)).length * 14;
  if (candidate.kind === 'championship') score += 18;
  if (candidate.kind === 'achievement') score += 14;
  if (candidate.kind === 'transaction' || candidate.kind === 'career') score += 10;
  if (candidate.kind === 'seasonReview' || candidate.kind === 'seasonAwards') score += 8;
  if (candidate.kind === 'gameRecap') score += 2;
  return score;
}

/**
 * Build sparse historical context. CareerMemory gets a reserved slice of the packet so a feature
 * can say what the player actually did in prior seasons, while article context preserves
 * transactions, records, championships and other dated events.
 */
export function buildNarrativeStoryContext(
  article: NarrativeArticle,
  source: NarrativeSource,
  limit = 12,
  memory: NarrativeMemoryIndex = buildNarrativeMemoryIndex(source),
): NarrativeContextClaim[] {
  const memoryLimit = article.playerIds.length ? Math.min(6, Math.max(2, Math.floor(limit * 0.45))) : 0;
  const career = buildCareerMemoryContext(article, source, memory, memoryLimit);

  const candidates = new Map<string, NarrativeArticle>();
  for (const teamKey of article.teamKeys.slice(0, 2)) {
    for (const candidate of buildNarrativeFeed(source, {
      teamKey,
      asOfDate: article.asOfDate,
      limit: 24,
    }).articles)
      candidates.set(candidate.id, candidate);
  }
  for (const playerId of article.playerIds.slice(0, 4)) {
    for (const candidate of buildNarrativeFeed(source, {
      playerId,
      asOfDate: article.asOfDate,
      limit: 16,
    }).articles)
      candidates.set(candidate.id, candidate);
  }

  const ranked = [...candidates.values()]
    .filter(
      (candidate) =>
        candidate.id !== article.id &&
        candidate.viewMode === 'archival' &&
        candidate.asOfDate < article.asOfDate &&
        candidate.factRefs.length > 0,
    )
    .sort((a, b) => {
      const relation = relatedness(article, b) - relatedness(article, a);
      return relation || b.asOfDate.localeCompare(a.asOfDate) || b.id.localeCompare(a.id);
    });

  const raw: Omit<NarrativeContextClaim, 'id'>[] = career.map((claim) => ({
    sourceArticleId: claim.sourceArticleId,
    sourceKind: claim.sourceKind,
    asOfDate: claim.asOfDate,
    text: claim.text,
    factRefs: claim.factRefs,
    factValue: claim.factValue,
  }));

  for (const candidate of ranked) {
    if (raw.length >= limit) break;
    for (const segment of candidate.segments) {
      if (segment.class !== 'FACTUAL' || !segment.factRefs.length) continue;
      raw.push({
        sourceArticleId: candidate.id,
        sourceKind: candidate.kind,
        asOfDate: candidate.asOfDate,
        text: segment.text,
        factRefs: segment.factRefs,
      });
      if (raw.length >= limit) break;
    }
  }

  return raw.slice(0, limit).map((claim, index) => ({ ...claim, id: `ctx${index}` }));
}
