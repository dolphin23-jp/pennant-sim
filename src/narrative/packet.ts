import { TINFO } from '../data';
import { narrativeEventArticleId } from './ledger';
import {
  articleFromAchievement,
  articleFromChampionship,
  articleFromFutureEvent,
  articleFromGameBoxScore,
  articleFromSeasonAwards,
  type NarrativeSource,
} from './generate';
import type { NarrativeArticle } from './types';
import { canonicalJson, validPacket, type FactPacket } from './protocol';

/** Projection over the exact archived source. Never consult current players or later articles. */
export function buildFactPacket(
  article: NarrativeArticle,
  source: NarrativeSource,
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
  // Preserve exact high-risk relations. Other wording is checked per claim; semantic review remains necessary.
  const locked = ['transaction', 'draft', 'injury', 'development', 'career'].includes(article.kind);
  const packet: FactPacket = {
    schemaVersion: 1,
    articleId: article.id,
    kind: article.kind,
    year: article.year,
    asOfDate: article.asOfDate,
    publishedAt: article.publishedAt,
    facts: article.factRefs.map((ref, index) => ({
      ref,
      value: index === 0 ? structuredClone(value) : { sameArchivedSourceAs: article.factRefs[0] },
    })),
    claims: [
      { id: 'headline', text: article.headline, factRefs: article.factRefs, locked },
      ...article.segments
        .filter((s) => s.class === 'FACTUAL')
        .map((s, i) => ({ id: `c${i}`, text: s.text, factRefs: s.factRefs, locked })),
    ],
    entities: [...names].sort(),
  };
  return validPacket(packet) ? packet : null;
}
