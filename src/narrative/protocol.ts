import type { NarrativeArticle, NarrativeFactRef, NarrativeStatementClass } from './types';

export const RENDERER_VERSION = 1;
export const PROMPT_VERSION = 1;
export const VALIDATOR_VERSION = 1;
export const STYLE_VERSION = 1;
export const MODELS = { standard: 'gpt-5.4-mini', premium: 'gpt-5.4' } as const;
export type Quality = keyof typeof MODELS;
export const COLORS = [
  '球界の新たな一頁となった。',
  'ペナントの物語は続いていく。',
  'ひとつの節目を刻んだ。',
] as const;

export interface FactClaim {
  id: string;
  text: string;
  factRefs: NarrativeFactRef[];
  /** Exact phrases for high-risk relations that a lexical check cannot prove. */
  locked: boolean;
}
export interface FactPacket {
  schemaVersion: 1;
  articleId: string;
  kind: NarrativeArticle['kind'];
  year: number;
  asOfDate: string;
  publishedAt: string;
  facts: Array<{ ref: NarrativeFactRef; value: unknown }>;
  claims: FactClaim[];
  entities: string[];
}
export interface ProseUnit {
  class: NarrativeStatementClass;
  text: string;
  claimId: string | null;
}
export interface Prose {
  headline: ProseUnit;
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
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
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
    v.schemaVersion !== 1 ||
    !short(v.articleId, 512) ||
    !short(v.kind, 40) ||
    !Number.isSafeInteger(v.year) ||
    !short(v.asOfDate, 10) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.asOfDate) ||
    Number(v.asOfDate.slice(0, 4)) !== v.year ||
    !short(v.publishedAt, 80) ||
    !Array.isArray(v.facts) ||
    !v.facts.length ||
    v.facts.length > 64 ||
    !Array.isArray(v.claims) ||
    !v.claims.length ||
    v.claims.length > 64 ||
    !Array.isArray(v.entities) ||
    v.entities.length > 200 ||
    !v.entities.every((e) => short(e, 100))
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
      !short(c.text) ||
      typeof c.locked !== 'boolean' ||
      !refsValid(c.factRefs) ||
      !c.factRefs.length ||
      !c.factRefs.every((r) => supplied.has(canonicalJson(r)))
    )
      return false;
    ids.add(c.id);
  }
  return ids.has('headline') && canonicalJson(v).length <= 60000;
}

// These are defense in depth, not a proof of unrestricted natural-language entailment.
const prohibited =
  /[「」『』<>]|語った|コメント|明かした|監督|契約金|年俸|出身校|診断|骨折|靭帯|悔し|信頼|因縁|移籍理由|ファン|観客|球場|歓声|初めて|史上初|連勝|連敗/;
const numbers = (s: string) => (s.normalize('NFKC').match(/\d+(?:\.\d+)?/g) ?? []).join('|');
/** A deliberately small, audited surface grammar. Unknown factual paraphrases fall back.
 * This prevents lexical whitelist checks from accepting "won" -> "lost", invented names,
 * or a correct citation attached to an unsupported causal claim. Expand only with evals.
 */
export function normalizeFactualWording(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/白星を挙げた|勝った/g, '勝利した')
    .replace(/勝利を収めた/g, '勝利した')
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
    Object.keys(raw).some((k) => !['headline', 'segments'].includes(k)) ||
    !Array.isArray(raw.segments) ||
    raw.segments.length > 66
  )
    return null;
  const seen = new Set<string>();
  function unit(v: unknown, headline: boolean): v is ProseUnit {
    if (
      !record(v) ||
      Object.keys(v).some((k) => !['class', 'text', 'claimId'].includes(k)) ||
      !short(v.text, headline ? 180 : 4096)
    )
      return false;
    if (v.class === 'COLOR')
      return !headline && v.claimId === null && (COLORS as readonly string[]).includes(v.text);
    // No analytical claims are currently derived by the packet builder.
    if (v.class !== 'FACTUAL' || !short(v.claimId, 30) || headline !== (v.claimId === 'headline'))
      return false;
    const claim = packet.claims.find((c) => c.id === v.claimId);
    if (!claim || seen.has(claim.id)) return false;
    if (claim.locked && v.text !== claim.text) return false;
    if (normalizeFactualWording(v.text) !== normalizeFactualWording(claim.text)) return false;
    if (
      v.text !== claim.text &&
      (prohibited.test(v.text) || numbers(v.text) !== numbers(claim.text))
    )
      return false;
    for (const name of packet.entities) {
      if (claim.text.includes(name) !== v.text.includes(name)) return false;
    }
    const entityOrder = (text: string) =>
      packet.entities
        .filter((n) => text.includes(n))
        .sort((a, b) => text.indexOf(a) - text.indexOf(b))
        .join('|');
    if (entityOrder(v.text) !== entityOrder(claim.text)) return false;
    seen.add(claim.id);
    return true;
  }
  if (
    !unit(raw.headline, true) ||
    !raw.segments.every((s) => unit(s, false)) ||
    packet.claims.some((c) => !seen.has(c.id)) ||
    raw.segments.filter((s) => s.class === 'COLOR').length > 1
  )
    return null;
  return structuredClone(raw) as unknown as Prose;
}

export function outputSchema(packet: FactPacket) {
  const unit = {
    type: 'object',
    additionalProperties: false,
    properties: {
      class: { type: 'string', enum: ['FACTUAL', 'COLOR'] },
      text: { type: 'string' },
      claimId: {
        anyOf: [{ type: 'string', enum: packet.claims.map((c) => c.id) }, { type: 'null' }],
      },
    },
    required: ['class', 'text', 'claimId'],
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: { headline: unit, segments: { type: 'array', items: unit } },
    required: ['headline', 'segments'],
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
    canonicalJson(v.prose).length <= 40000
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

export function applyProse(
  template: NarrativeArticle,
  prose: Prose,
  packet: FactPacket,
): NarrativeArticle {
  const segments = prose.segments.map((s) => ({
    class: s.class,
    text: s.text,
    factRefs: s.claimId ? packet.claims.find((c) => c.id === s.claimId)!.factRefs : [],
  }));
  return { ...template, headline: prose.headline.text, dek: undefined, segments };
}
