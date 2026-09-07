import { buildDraftProspectSnapshot } from '../engine/draftEvaluation';
import type { Player } from '../engine/types';
import { validPacket, type FactPacket } from './protocol';
import {
  NARRATIVE_GENERATOR_VERSION,
  type NarrativeArticle,
  type NarrativeFactKind,
  type NarrativeFactRef,
} from './types';

export type DraftProfileSourceClass = 'canonical' | 'derived';

export interface DraftProfileEditorialInput {
  id: string;
  sourceClass: DraftProfileSourceClass;
  text: string;
  factRefs: NarrativeFactRef[];
  value: unknown;
}

export interface DraftNarrativeProfile {
  article: NarrativeArticle;
  packet: FactPacket;
  editorialInputs: DraftProfileEditorialInput[];
}

export interface DraftNarrativeProfileSource {
  player: Player;
  prospects: readonly Player[];
  year: number;
  asOfDate: string;
}

const ref = (kind: NarrativeFactKind, key: string): NarrativeFactRef => ({ kind, key });

function uniqueRefs(inputs: DraftProfileEditorialInput[]): NarrativeFactRef[] {
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

export function buildDraftNarrativeProfile(
  source: DraftNarrativeProfileSource,
): DraftNarrativeProfile | null {
  const history = source.player.preProHistory;
  if (
    !Number.isSafeInteger(source.year) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.asOfDate) ||
    Number(source.asOfDate.slice(0, 4)) !== source.year ||
    !history
  )
    return null;

  const { player, year, asOfDate } = source;
  const pool = [...source.prospects];
  const snapshot = buildDraftProspectSnapshot(player, pool);
  if (!snapshot) return null;

  const identity: DraftProfileEditorialInput = {
    id: 'identity',
    sourceClass: 'canonical',
    text: `${player.name}は${snapshot.age}歳の${snapshot.role}、${history.origin}のドラフト候補。`,
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:identity`)],
    value: {
      sourceClass: 'canonical',
      playerId: player.id,
      playerName: player.name,
      age: snapshot.age,
      role: snapshot.role,
      origin: history.origin,
    },
  };

  const amateurText = history.highlights.length
    ? `${player.name}のアマチュア歴には、${history.highlights.map((highlight) => highlight.text).join('、')}という記録が保存されている。`
    : `${player.name}のアマチュア歴は${history.origin}として保存されている。`;
  const amateur: DraftProfileEditorialInput = {
    id: 'pre-pro-history',
    sourceClass: 'canonical',
    text: amateurText,
    factRefs: [ref('PLAYER_PRE_PRO', `${player.id}:generated-v1`)],
    value: { sourceClass: 'canonical', ...structuredClone(history) },
  };

  const standing: DraftProfileEditorialInput = {
    id: 'draft-pool-standing',
    sourceClass: 'derived',
    text: `現在能力のOVRでは${snapshot.currentOverall}で、ドラフト候補${snapshot.poolSize}人中${snapshot.poolRank}位。`,
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:pool-standing`)],
    value: {
      sourceClass: 'derived',
      metric: 'current-ovr',
      overall: snapshot.currentOverall,
      rank: snapshot.poolRank,
      poolSize: snapshot.poolSize,
    },
  };

  const strength: DraftProfileEditorialInput = {
    id: 'strongest-current-skill',
    sourceClass: 'derived',
    text: `現在能力で最も高い項目は${snapshot.strongestSkill.label}。`,
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:strongest-skill`)],
    value: {
      sourceClass: 'derived',
      label: snapshot.strongestSkill.label,
      rating: snapshot.strongestSkill.rating,
    },
  };

  const gapCount = snapshot.materialPotentialGap.count;
  const development: DraftProfileEditorialInput = {
    id: 'potential-gap',
    sourceClass: 'derived',
    text:
      gapCount > 0
        ? `潜在能力設定では、現在値より12点以上高い能力項目が${gapCount}項目ある。`
        : '潜在能力設定では、現在値より12点以上高い能力項目はない。',
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:potential-gap`)],
    value: { sourceClass: 'derived', materialGapThreshold: 12, count: gapCount },
  };

  const editorialInputs = [identity, amateur, standing, strength, development];
  const headline = `${player.name}｜${history.origin} ドラフト候補名鑑`;
  const article: NarrativeArticle = {
    id: `draft-profile:${year}:${player.id}`,
    generatorVersion: NARRATIVE_GENERATOR_VERSION,
    kind: 'draftProfile',
    year,
    publishedAt: `${year}年ドラフト候補名鑑`,
    asOfDate,
    viewMode: 'archival',
    headline,
    teamKeys: [],
    playerIds: [player.id],
    segments: [
      { class: 'FACTUAL', text: identity.text, factRefs: identity.factRefs },
      { class: 'FACTUAL', text: amateur.text, factRefs: amateur.factRefs },
      { class: 'FACTUAL', text: standing.text, factRefs: standing.factRefs },
      { class: 'FACTUAL', text: strength.text, factRefs: strength.factRefs },
    ],
    factRefs: uniqueRefs(editorialInputs),
  };

  const primaryClaims = [
    {
      id: 'headline',
      role: 'primary' as const,
      text: headline,
      factRefs: identity.factRefs,
      locked: false,
    },
    {
      id: 'p0',
      role: 'primary' as const,
      text: identity.text,
      factRefs: identity.factRefs,
      locked: false,
    },
    {
      id: 'p1',
      role: 'primary' as const,
      text: amateur.text,
      factRefs: amateur.factRefs,
      locked: false,
    },
  ];
  const contextInputs = [standing, strength, development];
  const contextClaims = contextInputs.map((input, index) => ({
    id: `ctx${index}`,
    role: 'context' as const,
    text: input.text,
    factRefs: input.factRefs,
    locked: false,
  }));
  const facts = editorialInputs.flatMap((input) =>
    input.factRefs.map((factRef) => ({ ref: factRef, value: structuredClone(input.value) })),
  );
  const packet: FactPacket = {
    schemaVersion: 2,
    articleId: article.id,
    kind: article.kind,
    year,
    asOfDate,
    publishedAt: article.publishedAt,
    facts,
    claims: [...primaryClaims, ...contextClaims],
    entities: [player.name],
    story: {
      depth: 'feature',
      score: 78,
      reasons: ['draft-profile', 'canonical-pre-pro-history', 'draft-pool-context'],
      targetParagraphs: { min: 2, max: 4 },
      primaryClaimIds: primaryClaims.map((claim) => claim.id),
      contextArticleIds: contextInputs.flatMap((input) =>
        input.factRefs.map((factRef) => `${factRef.kind.toLowerCase()}:${factRef.key}`),
      ),
    },
  };

  return validPacket(packet) ? { article, packet, editorialInputs } : null;
}
