import { calcOVR, effectiveOVR } from '../engine/ratings';
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

function roleLabel(player: Player): string {
  return player.isP ? player.role ?? '投手' : player.pos ?? '野手';
}

function overall(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function strongestSkill(player: Player): { label: string; value: number } {
  const skills = player.isP
    ? [
        ['球速', Number(player.p.vel ?? 0)],
        ['制球', Number(player.p.ctrl ?? 0)],
        ['スタミナ', Number(player.p.stam ?? 0)],
        ['球威', Number(player.p.nobi ?? 0)],
        ['守備', Number(player.p.fld ?? 0)],
      ] as const
    : [
        ['ミート', Math.max(Number(player.p.cf ?? 0), Number(player.p.cb ?? 0))],
        ['長打力', Number(player.p.pw ?? 0)],
        ['選球眼', Number(player.p.dc ?? 0)],
        ['走力', Number(player.p.sp ?? 0)],
        ['守備', Number(player.p.df ?? 0)],
        ['肩力', Number(player.p.arm ?? 0)],
      ] as const;
  return skills.reduce((best, candidate) => (candidate[1] > best[1] ? candidate : best), skills[0]);
}

function materialPotentialGapCount(player: Player): number {
  return Object.entries(player.pot).filter(([key, target]) => {
    if (typeof target !== 'number') return false;
    const current = player.p[key as keyof typeof player.p];
    return typeof current === 'number' && target >= current + 12;
  }).length;
}

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
  if (
    !Number.isSafeInteger(source.year) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.asOfDate) ||
    Number(source.asOfDate.slice(0, 4)) !== source.year ||
    !source.player.preProHistory
  )
    return null;

  const { player, year, asOfDate } = source;
  const history = player.preProHistory;
  const pool = [...source.prospects];
  const ranked = pool
    .map((candidate) => ({ id: candidate.id, overall: overall(candidate) }))
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const rank = ranked.findIndex((candidate) => candidate.id === player.id) + 1;
  if (rank <= 0) return null;

  const identity: DraftProfileEditorialInput = {
    id: 'identity',
    sourceClass: 'canonical',
    text: `${player.name}は${player.age}歳の${roleLabel(player)}、${history.origin}のドラフト候補。`,
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:identity`)],
    value: {
      sourceClass: 'canonical',
      playerId: player.id,
      playerName: player.name,
      age: player.age,
      role: roleLabel(player),
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

  const currentOverall = overall(player);
  const standing: DraftProfileEditorialInput = {
    id: 'draft-pool-standing',
    sourceClass: 'derived',
    text: `現在能力のOVRでは${currentOverall}で、ドラフト候補${pool.length}人中${rank}位。`,
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:pool-standing`)],
    value: {
      sourceClass: 'derived',
      metric: 'current-ovr',
      overall: currentOverall,
      rank,
      poolSize: pool.length,
    },
  };

  const strongest = strongestSkill(player);
  const strength: DraftProfileEditorialInput = {
    id: 'strongest-current-skill',
    sourceClass: 'derived',
    text: `現在能力で最も高い項目は${strongest.label}。`,
    factRefs: [ref('DRAFT_PROSPECT', `${year}:${player.id}:strongest-skill`)],
    value: {
      sourceClass: 'derived',
      label: strongest.label,
      rating: strongest.value,
    },
  };

  const gapCount = materialPotentialGapCount(player);
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
