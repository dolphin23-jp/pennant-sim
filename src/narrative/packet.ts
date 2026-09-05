import { TINFO } from '../data';
import { narrativeEventArticleId } from './ledger';
import { buildNarrativeHistoryFacts } from './historyFacts';
import { buildNarrativeMemoryIndex, type NarrativeMemoryIndex } from './memory';
import {
  articleFromAchievement,
  articleFromChampionship,
  articleFromFutureEvent,
  articleFromGameBoxScore,
  articleFromSeasonAwards,
  type NarrativeSource,
} from './generate';
import {
  buildNarrativeStoryContext,
  planNarrativeStory,
  type NarrativeStoryDepth,
} from './story';
import type { NarrativeArticle, NarrativeFactRef } from './types';
import { canonicalJson, validPacket, type FactPacket } from './protocol';

function refKey(ref: NarrativeFactRef): string {
  return canonicalJson(ref);
}

/** Projection over the exact archived source. Never consult current players or later articles. */
export function buildFactPacket(
  article: NarrativeArticle,
  source: NarrativeSource,
  depthOverride?: Exclude<NarrativeStoryDepth, 'brief'>,
  memory?: NarrativeMemoryIndex,
): FactPacket | null {
  let value: unknown;
  let canonical: NarrativeArticle | undefined;
  switch (article.kind) {
    case 'gameRecap': {
      const v = source.gameBoxScores[article.id.slice('game:'.length)];
      value = v;
      if (v) canonical = articleFromGameBoxScore(v);
      break;
    }
    case 'achievement': {
      const v = source.achievementHistory.find((e) => `achievement:${e.id}` === article.id);
      value = v;
      if (v) canonical = articleFromAchievement(v);
      break;
    }
    case 'championship': {
      const v = source.championHistory.find((e) => e.year === article.year);
      value = v;
      if (v) canonical = articleFromChampionship(v);
      break;
    }
    case 'seasonAwards': {
      const v = source.awardHistory.filter((e) => e.year === article.year);
      value = v;
      if (v.length) canonical = articleFromSeasonAwards(article.year, v);
      break;
    }
    default: {
      const v = source.narrativeEvents?.[String(article.year)]?.find(
        (e) => narrativeEventArticleId(e) === article.id,
      );
      value = v;
      if (v) canonical = articleFromFutureEvent(v);
    }
  }
  if (
    !value ||
    !canonical ||
    canonicalJson(canonical) !== canonicalJson(article) ||
    article.viewMode !== 'archival' ||
    !article.factRefs.length
  )
    return null;

  const names = new Set<string>();
  function visit(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    for (const [k, child] of Object.entries(v)) {
      if (
        ['name', 'playerName', 'pitcherName', 'batterName'].includes(k) &&
        typeof child === 'string'
      )
        names.add(child);
      else visit(child);
    }
  }
  visit(value);
  for (const team of Object.values(TINFO)) for (const name of [team.n, team.ab]) names.add(name);

  const memoryIndex = memory ?? buildNarrativeMemoryIndex(source);
  const basePlan = planNarrativeStory(article, source, memoryIndex);
  const story =
    depthOverride && basePlan.depth === 'brief'
      ? {
          ...basePlan,
          depth: depthOverride,
          autoGenerate: true,
          reasons: [...basePlan.reasons, 'manual-expansion'],
          targetParagraphs: depthOverride === 'cover' ? { min: 5, max: 8 } : { min: 3, max: 5 },
        }
      : basePlan;
  const articleContext = buildNarrativeStoryContext(
    article,
    source,
    story.depth === 'cover' ? 12 : 8,
    memoryIndex,
  );
  const historyFacts = buildNarrativeHistoryFacts(
    article,
    source,
    memoryIndex,
    story.depth === 'cover' ? 8 : story.depth === 'feature' ? 6 : 4,
  );
  for (const claim of articleContext)
    if (claim.factValue !== undefined) visit(claim.factValue);
  for (const fact of historyFacts) visit(fact.value);

  // Preserve exact high-risk relations in the primary event. Context is supplementary and may be
  // paraphrased, but every sentence still has to cite it and pass both validators.
  const locked = ['transaction', 'draft', 'injury', 'development', 'career'].includes(article.kind);
  const primaryClaims: FactPacket['claims'] = [
    {
      id: 'headline',
      role: 'primary',
      text: article.headline,
      factRefs: article.factRefs,
      locked,
    },
    ...article.segments
      .filter((s) => s.class === 'FACTUAL')
      .map((s, i) => ({
        id: `c${i}`,
        role: 'primary' as const,
        text: s.text,
        factRefs: s.factRefs,
        locked,
      })),
  ];
  const historyClaims: FactPacket['claims'] = historyFacts.map((fact, index) => ({
    id: `h${index}`,
    role: 'context' as const,
    text: fact.text,
    factRefs: fact.factRefs,
    locked: false,
  }));
  const articleClaims: FactPacket['claims'] = articleContext.map((claim, index) => ({
    id: `ctx${index}`,
    role: 'context' as const,
    text: claim.text,
    factRefs: claim.factRefs,
    locked: false,
  }));

  const facts: FactPacket['facts'] = [];
  const seenFacts = new Set<string>();
  for (const [index, ref] of article.factRefs.entries()) {
    const key = refKey(ref);
    if (seenFacts.has(key)) continue;
    seenFacts.add(key);
    facts.push({
      ref,
      value: index === 0 ? structuredClone(value) : { sameArchivedSourceAs: article.factRefs[0] },
    });
  }
  for (const fact of historyFacts) {
    for (const factRef of fact.factRefs) {
      const key = refKey(factRef);
      if (seenFacts.has(key)) continue;
      seenFacts.add(key);
      facts.push({ ref: factRef, value: structuredClone(fact.value) });
    }
  }
  for (const claim of articleContext) {
    for (const factRef of claim.factRefs) {
      const key = refKey(factRef);
      if (seenFacts.has(key)) continue;
      seenFacts.add(key);
      facts.push({
        ref: factRef,
        value:
          claim.factValue !== undefined
            ? structuredClone(claim.factValue)
            : {
                sourceArticleId: claim.sourceArticleId,
                sourceKind: claim.sourceKind,
                asOfDate: claim.asOfDate,
                canonicalText: claim.text,
              },
      });
    }
  }

  const packet: FactPacket = {
    schemaVersion: 2,
    articleId: article.id,
    kind: article.kind,
    year: article.year,
    asOfDate: article.asOfDate,
    publishedAt: article.publishedAt,
    facts,
    claims: [...primaryClaims, ...historyClaims, ...articleClaims],
    entities: [...names].sort(),
    story: {
      depth: story.depth,
      score: story.score,
      reasons: story.reasons,
      targetParagraphs: story.targetParagraphs,
      primaryClaimIds: primaryClaims.map((claim) => claim.id),
      contextArticleIds: [
        ...historyFacts.map((fact) => fact.id),
        ...articleContext.map((claim) => claim.sourceArticleId),
      ].slice(0, 32),
    },
  };
  return validPacket(packet) ? packet : null;
}
