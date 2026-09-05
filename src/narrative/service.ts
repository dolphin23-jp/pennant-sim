import {
  applyProse,
  packetFactsHash,
  snapshotKey,
  validateProse,
  validSnapshot,
  VALIDATOR_VERSION,
  type ArticleSnapshot,
  type FactPacket,
  type Quality,
} from './protocol';
import type { NarrativeArticle } from './types';

export interface NarrativeConnection {
  enabled: boolean;
  url: string;
  token: string;
}
export interface RenderResult {
  article: NarrativeArticle;
  snapshot?: ArticleSnapshot;
  status: 'template' | 'cached' | 'generated' | 'unavailable';
}
export function validProxyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/'
    );
  } catch {
    return false;
  }
}

/** One queue for all screens. No engine imports, simulation RNG or state mutations. */
export class NarrativeArticleService {
  private pending = new Map<string, Promise<RenderResult>>();
  private snapshots = new Map<string, ArticleSnapshot>();
  private blocked = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  private retryAfter = 0;
  private epoch = 0;
  cancelQueued(): void {
    this.epoch++;
  }
  constructor(
    private transport: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  async render(
    template: NarrativeArticle,
    packet: FactPacket,
    world: string,
    stored: readonly ArticleSnapshot[],
    connection: NarrativeConnection,
    quality: Quality = 'standard',
    revision = 0,
    force = false,
  ): Promise<RenderResult> {
    const fallback: RenderResult = { article: template, status: 'template' };
    const epoch = this.epoch;
    if (!connection.enabled) return fallback;
    try {
      const hash = await packetFactsHash(packet);
      const key = await snapshotKey(world, hash, quality, revision);
      const all = [...stored, ...this.snapshots.values()]
        .filter(
          (s) =>
            s.articleId === template.id &&
            s.factsHash === hash &&
            s.validatorVersion === VALIDATOR_VERSION,
        )
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt) || b.revision - a.revision);
      if (!force)
        for (const s of all) {
          // Recompute with this world to reject snapshots from a different save.
          if (s.key !== (await snapshotKey(world, hash, s.quality, s.revision, s))) continue;
          const prose = validateProse(s.prose, packet);
          if (prose)
            return { article: applyProse(template, prose, packet), snapshot: s, status: 'cached' };
        }
      if (this.epoch !== epoch) return fallback;
      const inflight = this.pending.get(key);
      if (inflight) return inflight;
      if (
        !connection.token ||
        !validProxyUrl(connection.url) ||
        this.now() < this.retryAfter ||
        this.now() < (this.blocked.get(key) ?? 0)
      )
        return fallback;
      const job = this.tail.then(async (): Promise<RenderResult> => {
        if (this.now() < this.retryAfter || this.epoch !== epoch) return fallback;
        try {
          const response = await this.transport(`${connection.url.replace(/\/$/, '')}/render`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${connection.token}`,
            },
            body: JSON.stringify({ packet, world, quality, revision }),
            signal: AbortSignal.timeout(55000),
          });
          if (response.status !== 200) {
            if (response.status === 429)
              this.retryAfter = (Math.floor(this.now() / 86400000) + 1) * 86400000;
            else if (response.status === 401 || response.status >= 500)
              this.retryAfter = this.now() + 60000;
            this.blocked.set(key, response.status === 422 ? Infinity : this.now() + 60000);
            return { ...fallback, status: 'unavailable' };
          }
          const body = (await response.json()) as { snapshot?: unknown };
          const s = body.snapshot;
          if (
            !validSnapshot(s) ||
            s.quality !== quality ||
            s.revision !== revision ||
            s.key !== (await snapshotKey(world, hash, quality, revision, s)) ||
            s.key !== key ||
            s.factsHash !== hash ||
            s.articleId !== template.id ||
            s.year !== template.year ||
            s.validatorVersion !== VALIDATOR_VERSION
          )
            throw new Error('snapshot');
          const prose = validateProse(s.prose, packet);
          if (!prose) throw new Error('prose');
          this.snapshots.set(key, s);
          if (this.snapshots.size > 128) this.snapshots.delete(this.snapshots.keys().next().value!);
          return { article: applyProse(template, prose, packet), snapshot: s, status: 'generated' };
        } catch {
          this.retryAfter = this.now() + 60000;
          return { ...fallback, status: 'unavailable' };
        }
      });
      this.pending.set(key, job);
      this.tail = job.catch(() => {});
      try {
        return await job;
      } finally {
        this.pending.delete(key);
      }
    } catch {
      return fallback;
    }
  }
}
export const narrativeArticleService = new NarrativeArticleService();
