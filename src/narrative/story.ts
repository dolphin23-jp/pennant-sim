import { buildNarrativeFeed, type NarrativeSource } from './generate';
import { narrativeEventArticleId } from './ledger';
import type { NarrativeArticle, NarrativeFactRef } from './types';

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
  sourceKind: NarrativeArticle['kind'];
  asOfDate: string;
  text: string;
  factRefs: NarrativeFactRef[];
}

/**
 * The director spends model tokens on consequential stories, not every ledger row.
 * Scores are deterministic projections over already-canonical facts and never affect simulation.
 */
export function planNarrativeStory(
  article: NarrativeArticle,
  source: NarrativeSource,
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
    if (event?.kind === 'seasonRecord' || event?.kind === 'franchiseRecord')
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

  // A story that already has several grounded facts is more worth expanding than a one-line notice.
  const factualSegments = article.segments.filter((s) => s.class === 'FACTUAL').length;
  if (factualSegments >= 3) add(12, 'rich-primary-facts');
  else if (factualSegments >= 2) add(5, 'multiple-primary-facts');

  const depth: NarrativeStoryDepth = score >= 100 ? 'cover' : score >= 50 ? 'feature' : 'brief';
  return {
    depth,
    score,
    autoGenerate: depth !== 'brief',
    reasons,
    targetParagraphs:
      depth === 'cover' ? { min: 5, max: 8 } : depth === 'feature' ? { min: 3, max: 5 } : { min: 1, max: 2 },
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
 * Build sparse, historical context from other canonical articles. Same-day items are excluded:
 * many offseason events only have year-level dates, and strict exclusion is safer than leaking a
 * later action into an earlier article.
 */
export function buildNarrativeStoryContext(
  article: NarrativeArticle,
  source: NarrativeSource,
  limit = 12,
): NarrativeContextClaim[] {
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
    })
    .slice(0, limit);

  const result: NarrativeContextClaim[] = [];
  let index = 0;
  for (const candidate of ranked) {
    for (const segment of candidate.segments) {
      if (segment.class !== 'FACTUAL' || !segment.factRefs.length) continue;
      result.push({
        id: `ctx${index++}`,
        sourceArticleId: candidate.id,
        sourceKind: candidate.kind,
        asOfDate: candidate.asOfDate,
        text: segment.text,
        factRefs: segment.factRefs,
      });
      if (result.length >= limit) return result;
    }
  }
  return result;
}
