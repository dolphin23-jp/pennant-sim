import type { NarrativeArticle, NarrativeFactRef, NarrativeStatementClass } from './types';

export const RENDERER_VERSION = 2;
export const PROMPT_VERSION = 2;
export const VALIDATOR_VERSION = 2;
export const STYLE_VERSION = 2;
export const MODELS = { standard: 'gpt-5.4-mini', premium: 'gpt-5.4' } as const;
export type Quality = keyof typeof MODELS;

export interface FactClaim {
  id: string;
  role: 'primary' | 'context';
  text: string;
  factRefs: NarrativeFactRef[];
  /** High-risk relations are preserved verbatim inside any generated paragraph that cites them. */
  locked: boolean;
}
export interface FactPacket {
  schemaVersion: 2;
  articleId: string;
  kind: NarrativeArticle['kind'];
  year: number;
  asOfDate: string;
  publishedAt: string;
  facts: Array<{ ref: NarrativeFactRef; value: unknown }>;
  claims: FactClaim[];
  entities: string[];
  story: {
    depth: 'brief' | 'feature' | 'cover';
    score: number;
    reasons: string[];
    targetParagraphs: { min: number; max: number };
    primaryClaimIds: string[];
    contextArticleIds: string[];
  };
}
export interface ProseUnit {
  class: NarrativeStatementClass;
  text: string;
  claimIds: string[];
}
export interface Prose {
  headline: ProseUnit;
  dek: ProseUnit | null;
  segments: ProseUnit[];
}
export interface ArticleSnapshot {
  key: string;
  articleId: string;
  year: number;
  factsHash: string;
  rendererVersion: number;
  promptVersion: number;
  validatorVersion: number;
  styleVersion: number;
  model: string;
  quality: Quality;
  revision: number;
  generatedAt: string;
  usage: { input: number; output: number };
  prose: Prose;
}
export type ArticleArchive = Record<string, ArticleSnapshot[]>;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function packetFactsHash(packet: FactPacket): Promise<string> {
  const facts = Object.fromEntries(Object.entries(packet).filter(([key]) => key !== 'claims'));
  return sha256(canonicalJson(facts));
}
export async function snapshotKey(
  world: string,
  hash: string,
  quality: Quality,
  revision: number,
  metadata?: Pick<ArticleSnapshot, 'rendererVersion' | 'promptVersion' | 'styleVersion' | 'model'>,
): Promise<string> {
  return sha256(
    canonicalJson([
      world,
      hash,
      metadata?.rendererVersion ?? RENDERER_VERSION,
      metadata?.promptVersion ?? PROMPT_VERSION,
      metadata?.styleVersion ?? STYLE_VERSION,
      metadata?.model ?? MODELS[quality],
      revision,
    ]),
  );
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const short = (v: unknown, max = 4096): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const refsValid = (v: unknown): v is NarrativeFactRef[] =>
  Array.isArray(v) &&
  v.length <= 64 &&
  v.every((r) => record(r) && short(r.kind, 40) && short(r.key, 512));

export function validPacket(v: unknown): v is FactPacket {
  if (
    !record(v) ||
    v.schemaVersion !== 2 ||
    !short(v.articleId, 512) ||
    !short(v.kind, 40) ||
    !Number.isSafeInteger(v.year) ||
    !short(v.asOfDate, 10) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.asOfDate) ||
    Number(v.asOfDate.slice(0, 4)) !== v.year ||
    !short(v.publishedAt, 80) ||
    !Array.isArray(v.facts) ||
    !v.facts.length ||
    v.facts.length > 128 ||
    !Array.isArray(v.claims) ||
    !v.claims.length ||
    v.claims.length > 96 ||
    !Array.isArray(v.entities) ||
    v.entities.length > 300 ||
    !v.entities.every((e) => short(e, 100)) ||
    !record(v.story)
  )
    return false;
  const date = new Date(`${v.asOfDate}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== v.asOfDate ||
    ![
      'gameRecap',
      'achievement',
      'championship',
      'seasonAwards',
      'seasonReview',
      'transaction',
      'draft',
      'career',
      'injury',
      'development',
    ].includes(v.kind)
  )
    return false;

  const story = v.story;
  if (
    !['brief', 'feature', 'cover'].includes(String(story.depth)) ||
    typeof story.score !== 'number' ||
    !Number.isFinite(story.score) ||
    story.score < 0 ||
    story.score > 500 ||
    !Array.isArray(story.reasons) ||
    story.reasons.length > 32 ||
    !story.reasons.every((reason) => short(reason, 80)) ||
    !record(story.targetParagraphs) ||
    !Number.isSafeInteger(story.targetParagraphs.min) ||
    !Number.isSafeInteger(story.targetParagraphs.max) ||
    Number(story.targetParagraphs.min) < 1 ||
    Number(story.targetParagraphs.max) < Number(story.targetParagraphs.min) ||
    Number(story.targetParagraphs.max) > 12 ||
    !Array.isArray(story.primaryClaimIds) ||
    !story.primaryClaimIds.length ||
    !story.primaryClaimIds.every((id) => short(id, 30)) ||
    !Array.isArray(story.contextArticleIds) ||
    story.contextArticleIds.length > 32 ||
    !story.contextArticleIds.every((id) => short(id, 512))
  )
    return false;

  const ids = new Set<string>();
  const supplied = new Set<string>();
  for (const f of v.facts) {
    if (!record(f) || !refsValid([f.ref]) || f.value === undefined) return false;
    supplied.add(canonicalJson(f.ref));
  }
  for (const c of v.claims) {
    if (
      !record(c) ||
      !short(c.id, 30) ||
      ids.has(c.id) ||
      !['primary', 'context'].includes(String(c.role)) ||
      !short(c.text) ||
      typeof c.locked !== 'boolean' ||
      !refsValid(c.factRefs) ||
      !c.factRefs.length ||
      !c.factRefs.every((r) => supplied.has(canonicalJson(r)))
    )
      return false;
    ids.add(c.id);
  }
  if (!ids.has('headline')) return false;
  const primaryClaimIds = story.primaryClaimIds as string[];
  if (
    primaryClaimIds.some((id) => !ids.has(id)) ||
    v.claims
      .filter((claim) => claim.role === 'primary')
      .some((claim) => !primaryClaimIds.includes(claim.id))
  )
    return false;
  return canonicalJson(v).length <= 100000;
}

// These lexical checks are defense in depth. The Worker also runs an independent grounded
// verification pass before accepting freer prose.
const prohibited =
  /[「」『』<>]|語った|コメント|明かした|監督は|契約金|年俸|出身校|診断|骨折|靭帯|悔し|信頼|移籍理由|ファン|観客|歓声|秘密の|特訓|悲願|執念|覚悟|意地|因縁/;
const colorFactual =
  /\d|勝|敗|優勝|日本一|移籍|加入|退団|引退|故障|復帰|記録|達成|本塁打|安打|奪三振|盗塁|首位|順位|ドラフト|指名|選手|球団|シリーズ|試合/;
const numberList = (s: string) => s.normalize('NFKC').match(/\d+(?:\.\d+)?/g) ?? [];

function isNumberSubset(output: string[], evidence: string[]): boolean {
  let index = 0;
  for (const value of evidence) {
    if (value === output[index]) index++;
    if (index === output.length) return true;
  }
  return output.length === 0;
}

export function normalizeFactualWording(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/白星を挙げた|勝った|勝利を収めた/g, '勝利した')
    .replace(/制した/g, '下した')
    .replace(/幕を閉じた/g, '終えた')
    .replace(/記録に到達した/g, '記録を達成した')
    .replace(/入団することが決まった/g, '加入した')
    .replace(/新たな所属先となった/g, '移籍先となった')
    .replace(/[\s。、]/g, '');
}

export function validateProse(raw: unknown, packet: FactPacket): Prose | null {
  if (
    !record(raw) ||
    Object.keys(raw).some((k) => !['headline', 'dek', 'segments'].includes(k)) ||
    !Array.isArray(raw.segments) ||
    raw.segments.length > 14 ||
    !(raw.dek === null || record(raw.dek))
  )
    return null;

  const claims = new Map(packet.claims.map((claim) => [claim.id, claim]));
  const coveredPrimary = new Set<string>();
  let colorCount = 0;

  function unit(
    value: unknown,
    placement: 'headline' | 'dek' | 'segment',
  ): value is ProseUnit {
    if (
      !record(value) ||
      Object.keys(value).some((k) => !['class', 'text', 'claimIds'].includes(k)) ||
      !short(value.text, placement === 'headline' ? 180 : placement === 'dek' ? 500 : 4096) ||
      !Array.isArray(value.claimIds) ||
      value.claimIds.length > 12 ||
      !value.claimIds.every((id) => short(id, 30))
    )
      return false;

    const text = text as string;
    const claimIds = claimIds as string[];
    if (value.class === 'COLOR') {
      colorCount++;
      return (
        placement === 'segment' &&
        claimIds.length === 0 &&
        colorCount <= 1 &&
        !colorFactual.test(text) &&
        !packet.entities.some((name) => text.includes(name)) &&
        !prohibited.test(text)
      );
    }
    if (value.class !== 'FACTUAL' || !claimIds.length) return false;

    const cited = claimIds.map((id) => claims.get(id));
    if (cited.some((claim) => !claim)) return false;
    const validClaims = cited as FactClaim[];
    if (placement === 'headline' && !claimIds.includes('headline')) return false;

    const evidence = validClaims.map((claim) => claim.text).join(' ');
    // Canonical template wording is already an audited game projection. The lexical banlist
    // applies to freer prose, not to an exact one-claim fallback (which may legitimately contain
    // terms such as an archived origin/exit label).
    const exactCanonical =
      validClaims.length === 1 && text === validClaims[0].text;
    if (!exactCanonical && prohibited.test(text)) return false;
    if (!isNumberSubset(numberList(text), numberList(evidence))) return false;

    for (const name of packet.entities) {
      if (text.includes(name) && !evidence.includes(name)) return false;
    }
    for (const claim of validClaims) {
      if (claim.locked && !text.includes(claim.text)) return false;
      if (claim.role === 'primary') coveredPrimary.add(claim.id);
    }
    return true;
  }

  if (
    !unit(raw.headline, 'headline') ||
    (raw.dek !== null && !unit(raw.dek, 'dek')) ||
    !raw.segments.every((segment) => unit(segment, 'segment')) ||
    packet.story.primaryClaimIds.some((id) => !coveredPrimary.has(id))
  )
    return null;

  return structuredClone(raw) as unknown as Prose;
}

export function outputSchema(packet: FactPacket) {
  const claimIds = packet.claims.map((claim) => claim.id);
  const unit = {
    type: 'object',
    additionalProperties: false,
    properties: {
      class: { type: 'string', enum: ['FACTUAL', 'COLOR'] },
      text: { type: 'string' },
      claimIds: {
        type: 'array',
        items: { type: 'string', enum: claimIds },
        maxItems: 12,
      },
    },
    required: ['class', 'text', 'claimIds'],
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: unit,
      dek: { anyOf: [unit, { type: 'null' }] },
      segments: { type: 'array', items: unit, maxItems: 14 },
    },
    required: ['headline', 'dek', 'segments'],
  };
}

export function validSnapshot(v: unknown): v is ArticleSnapshot {
  return (
    record(v) &&
    short(v.key, 64) &&
    /^[a-f0-9]{64}$/.test(v.key) &&
    short(v.articleId, 512) &&
    Number.isSafeInteger(v.year) &&
    short(v.factsHash, 64) &&
    /^[a-f0-9]{64}$/.test(v.factsHash) &&
    [v.rendererVersion, v.promptVersion, v.validatorVersion, v.styleVersion, v.revision].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
    ) &&
    (v.quality === 'standard' || v.quality === 'premium') &&
    short(v.model, 100) &&
    short(v.generatedAt, 40) &&
    Number.isFinite(Date.parse(v.generatedAt)) &&
    record(v.usage) &&
    [v.usage.input, v.usage.output].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
    ) &&
    record(v.prose) &&
    canonicalJson(v.prose).length <= 50000
  );
}

/** Optional presentation data cannot make the factual save unreadable. Validate again before display. */
export function migrateArticleArchive(raw: unknown): ArticleArchive {
  const result: ArticleArchive = {};
  if (!record(raw)) return result;
  for (const [year, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue;
    const seen = new Set<string>();
    for (const e of entries)
      if (validSnapshot(e) && String(e.year) === year && !seen.has(e.key)) {
        seen.add(e.key);
        (result[year] ??= []).push(structuredClone(e));
      }
  }
  return result;
}

function uniqueRefs(refs: NarrativeFactRef[]): NarrativeFactRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = canonicalJson(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyProse(
  template: NarrativeArticle,
  prose: Prose,
  packet: FactPacket,
): NarrativeArticle {
  const claims = new Map(packet.claims.map((claim) => [claim.id, claim]));
  const refsFor = (ids: string[]) =>
    uniqueRefs(ids.flatMap((id) => claims.get(id)?.factRefs ?? []));
  const segments = prose.segments.map((segment) => ({
    class: segment.class,
    text: segment.text,
    factRefs: segment.class === 'FACTUAL' ? refsFor(segment.claimIds) : [],
  }));
  return {
    ...template,
    headline: prose.headline.text,
    dek: prose.dek?.text,
    segments,
    factRefs: uniqueRefs([
      ...refsFor(prose.headline.claimIds),
      ...(prose.dek ? refsFor(prose.dek.claimIds) : []),
      ...segments.flatMap((segment) => segment.factRefs),
    ]),
  };
}
