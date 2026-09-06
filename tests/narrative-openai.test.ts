import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { initTeams } from '../src/engine';
import {
  articleFromFutureEvent,
  articleFromChampionship,
  articleFromGameBoxScore,
} from '../src/narrative/generate';
import { buildFactPacket } from '../src/narrative/packet';
import {
  canonicalJson,
  MODELS,
  packetFactsHash,
  sha256,
  snapshotKey,
  validateProse,
  validPacket,
  RENDERER_VERSION,
  PROMPT_VERSION,
  VALIDATOR_VERSION,
  STYLE_VERSION,
  type FactPacket,
  type ArticleSnapshot,
  type Prose,
} from '../src/narrative/protocol';
import { NarrativeArticleService } from '../src/narrative/service';
import { handleRequest, type Env, type Statement } from '../worker/index';
import {
  migrateSaveData,
  saveGameToSlot,
  loadGameFromSlot,
  exportSaveData,
  importSaveData,
  SAVE_KEY,
  clearSaveSlot,
  type StorageBackend,
} from '../src/state/storage';

const token = 't'.repeat(48);
const world = 'test-world';
const connection = { enabled: true, url: 'https://news.example/', token };
const event = {
  type: 'draft' as const,
  id: 'draft:2034:giants:1:p',
  year: 2034,
  date: '2034年オフ',
  teamKey: 'giants' as const,
  playerId: 'p',
  playerName: '新人太郎',
  round: 1,
  origin: '高卒',
};
const template = articleFromFutureEvent(event);
const source = {
  gameBoxScores: {},
  achievementHistory: [],
  championHistory: [],
  awardHistory: [],
  narrativeEvents: { '2034': [event] },
};
const packet = buildFactPacket(template, source)!;
function prose(p: FactPacket = packet): Prose {
  const headline = p.claims.find((claim) => claim.id === 'headline')!;
  const primary = p.claims.filter((claim) => claim.role === 'primary' && claim.id !== 'headline');
  const make = (claims: FactPacket['claims']) => ({
    class: 'FACTUAL' as const,
    text: claims.map((claim) => claim.text).join(' '),
    claimIds: claims.map((claim) => claim.id),
  });
  return { headline: make([headline]), dek: null, segments: primary.map((claim) => make([claim])) };
}
async function snapshot(p = packet, worldId = world, revision = 0): Promise<ArticleSnapshot> {
  const hash = await packetFactsHash(p);
  return {
    key: await snapshotKey(worldId, hash, 'standard', revision),
    articleId: p.articleId,
    year: p.year,
    factsHash: hash,
    rendererVersion: RENDERER_VERSION,
    promptVersion: PROMPT_VERSION,
    validatorVersion: VALIDATOR_VERSION,
    styleVersion: STYLE_VERSION,
    model: MODELS.standard,
    quality: 'standard',
    revision,
    generatedAt: '2026-09-05T00:00:00Z',
    usage: { input: 100, output: 50 },
    prose: prose(p),
  };
}
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/migrations/0001_articles.sql', import.meta.url), 'utf8'));
  return {
    db,
    binding: {
      prepare(query: string): Statement {
        let values: (string | number | null)[] = [];
        const statement: Statement = {
          bind(...v) {
            values = v as typeof values;
            return statement;
          },
          async first<T>() {
            return (db.prepare(query).get(...values) ?? null) as T | null;
          },
          async run() {
            return db.prepare(query).run(...values);
          },
        };
        return statement;
      },
    },
  };
}
async function environment(extra: Partial<Env> = {}) {
  const { db, binding } = database();
  return {
    db,
    env: {
      DB: binding,
      OPENAI_API_KEY: 'server-test-key',
      NARRATIVE_TOKEN_SHA256: await sha256(token),
      ALLOWED_ORIGIN: 'https://game.example',
      ...extra,
    } as Env,
  };
}
function request(p = packet, revision = 0, bearer = token) {
  return new Request('https://news.example/render', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, Origin: 'https://game.example' },
    body: JSON.stringify({ packet: p, world, quality: 'standard', revision }),
  });
}
function success(p = packet): typeof fetch {
  return async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'gpt-5.4-mini');
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined);
    const verification = body.text.format.name === 'narrative_verification';
    return Response.json({
      status: 'completed',
      usage: verification
        ? { input_tokens: 40, output_tokens: 10 }
        : { input_tokens: 100, output_tokens: 50 },
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify(
                verification ? { supported: true, issues: [] } : prose(p),
              ),
            },
          ],
        },
      ],
    });
  };
}

test('packet uses only the archived event, dates and exact refs, without mutating source', async () => {
  assert.equal(
    canonicalJson({ z: 1, A: 2, a: 3 }),
    '{"A":2,"a":3,"z":1}',
    'hash key ordering is locale-independent',
  );
  const before = canonicalJson(source);
  assert.ok(validPacket(packet));
  assert.equal(packet.asOfDate, '2034-12-31');
  assert.ok(validateProse(prose(), packet));
  const hash = await packetFactsHash(packet);
  assert.equal(canonicalJson(source), before);
  assert.equal(buildFactPacket({ ...template, id: 'draft:missing' }, source), null);
  const later = structuredClone(source);
  later.narrativeEvents['2034'][0].playerName = '別人';
  assert.notEqual(
    await packetFactsHash(
      buildFactPacket(articleFromFutureEvent(later.narrativeEvents['2034'][0]), later)!,
    ),
    hash,
  );
  assert.equal(validPacket({ ...packet, asOfDate: '2035-01-01' }), false);
  const wordingUpgrade = structuredClone(packet);
  wordingUpgrade.claims[0].text += '。';
  assert.equal(
    await packetFactsHash(wordingUpgrade),
    hash,
    'wording version does not change factual identity',
  );
});

test('validation rejects false references, swapped numbers, quotes, future claims, and COLOR facts', () => {
  for (const edit of [
    (p: Prose) => {
      p.headline.claimIds = ['unknown'];
    },
    (p: Prose) => {
      p.segments[0].text += '監督は「期待している」と語った。';
    },
    (p: Prose) => {
      p.segments[0].text = p.segments[0].text.replace('1巡目', '2巡目');
    },
    (p: Prose) => {
      p.segments.push({ class: 'COLOR', claimIds: [], text: '翌年は首位打者を獲得した。' });
    },
    (p: Prose) => {
      p.segments[0].class = 'ANALYTICAL';
    },
    (p: Prose) => {
      p.segments = [];
    },
  ]) {
    const p = prose();
    edit(p);
    assert.equal(validateProse(p, packet), null);
  }
  const c = { year: 2034, champion: 'giants' as const, runnerUp: 'tigers' as const };
  const a = articleFromChampionship(c);
  const cp = buildFactPacket(a, { ...source, championHistory: [c] })!;
  const pp = prose(cp);
  pp.headline.text += '監督が明かした。';
  assert.equal(validateProse(pp, cp), null);
});

test('validation requires grounded synthesis when a feature has rich context', () => {
  const rich = structuredClone(packet);
  rich.story.depth = 'feature';
  rich.story.targetParagraphs = { min: 3, max: 5 };
  const evidenceRefs = rich.claims.find((claim) => claim.id === 'headline')!.factRefs;
  rich.claims.push(
    {
      id: 'ctxA',
      role: 'context',
      text: '過去にも保存された出来事がある。',
      factRefs: evidenceRefs,
      locked: false,
    },
    {
      id: 'ctxB',
      role: 'context',
      text: '別の過去事実も保存されている。',
      factRefs: evidenceRefs,
      locked: false,
    },
  );

  assert.equal(validateProse(prose(rich), rich), null, 'rich features may not collapse to template prose');

  const output = prose(rich);
  output.segments.push({
    class: 'ANALYTICAL',
    text: '保存された複数の事実を一つの流れとして位置づけられる。',
    claimIds: ['ctxA', 'ctxB'],
  });
  assert.ok(validateProse(output, rich));

  const invented = structuredClone(output);
  invented.segments.at(-1)!.text += ' 10年後にも続く。';
  assert.equal(validateProse(invented, rich), null);
});

test('game packets stay deterministic while local wording validation remains available', async () => {
  const box = {
    gameId: 'g',
    date: '2034-04-01',
    seasonYear: 2034,
    homeKey: 'giants' as const,
    awayKey: 'tigers' as const,
    homeScore: 4,
    awayScore: 3,
    homeHits: 9,
    awayHits: 7,
    homeErrors: 0,
    awayErrors: 1,
    innings: [{ home: 4, away: 3 }],
    extraInnings: false,
    tie: false,
    walkoff: false,
    shutoutTeam: null,
    decisions: {
      winnerId: null,
      winnerText: null,
      loserId: null,
      loserText: null,
      saveId: null,
      saveText: null,
    },
    headline: null,
    hasBoxScore: true,
    batterLines: [],
    pitcherLines: [],
    notableEvents: [],
  };
  const a = articleFromGameBoxScore(box);
  const p = buildFactPacket(a, { ...source, gameBoxScores: { g: box } })!;
  const output = prose(p);
  output.segments[0].text = output.segments[0].text.replace('勝利した', '勝った');
  assert.ok(validateProse(output, p));
  output.segments[0].text = output.segments[0].text.replace('4-3', '3-4');
  assert.equal(validateProse(output, p), null);

  const { env } = await environment();
  let calls = 0;
  const upstream: typeof fetch = async () => {
    calls++;
    throw new Error('game recap must not call OpenAI');
  };
  assert.equal((await handleRequest(request(p, 9), env, upstream)).status, 422);
  assert.equal(calls, 0);
});

test('worker authenticates, constrains origin and model, and rejects oversized input before OpenAI', async () => {
  const { env } = await environment();
  const never: typeof fetch = async () => {
    throw new Error('must not call');
  };
  assert.equal((await handleRequest(request(packet, 0, 'bad'), env, never)).status, 401);
  const foreign = request();
  foreign.headers.set('Origin', 'https://evil.example');
  assert.equal((await handleRequest(foreign, env, never)).status, 403);
  const oversized = new Request('https://news.example/render', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: 'x'.repeat(100001),
  });
  assert.equal((await handleRequest(oversized, env, never)).status, 400);
  assert.equal(
    (await handleRequest(request(), { ...env, OPENAI_API_KEY: undefined }, never)).status,
    503,
  );
  assert.equal(
    (await handleRequest(request(), { ...env, STANDARD_DAILY_TOKENS: '0' }, never)).status,
    429,
  );
});

test('D1 atomically dedupes simultaneous requests and preserves token accounting and cached prose', async () => {
  const { env, db } = await environment();
  let calls = 0;
  const upstream: typeof fetch = async (...args) => {
    calls++;
    return success()(...args);
  };
  const responses = await Promise.all([
    handleRequest(request(), env, upstream),
    handleRequest(request(), env, upstream),
  ]);
  assert.equal(calls, 2, 'one writer and one verifier call');
  assert.ok(responses.some((r) => r.status === 200));
  assert.equal((await handleRequest(request(), env, upstream)).status, 200);
  assert.equal(calls, 2);
  assert.equal(db.prepare('SELECT SUM(charged) AS n FROM requests').get()!.n, 200);
  assert.equal((await handleRequest(request(packet, 1), env, upstream)).status, 200);
  assert.equal(calls, 4, 'explicit new revision runs writer and verifier again');
});

test('independent verifier rejects fluent but unsupported prose', async () => {
  const { env } = await environment();
  let calls = 0;
  const upstream: typeof fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    if (body.text.format.name === 'narrative_prose') {
      return Response.json({
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(prose()) }] },
        ],
      });
    }
    return Response.json({
      status: 'completed',
      usage: { input_tokens: 40, output_tokens: 10 },
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({ supported: false, issues: ['unsupported causal framing'] }),
            },
          ],
        },
      ],
    });
  };
  assert.equal((await handleRequest(request(packet, 77), env, upstream)).status, 502);
  assert.equal(calls, 2);
});

test('uncertain upstream failures and invalid prose do not retry the same key or release unknown charges', async () => {
  const { env, db } = await environment();
  let calls = 0;
  const fail: typeof fetch = async () => {
    calls++;
    throw new Error('network');
  };
  assert.equal((await handleRequest(request(), env, fail)).status, 502);
  assert.equal((await handleRequest(request(), env, fail)).status, 422);
  assert.equal(calls, 1);
  assert.ok(Number(db.prepare('SELECT charged FROM requests').get()!.charged) > 6000);
  const bad: typeof fetch = async () =>
    Response.json({
      status: 'completed',
      usage: { input_tokens: 100, output_tokens: 40 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"wrong":true}' }] }],
    });
  assert.equal((await handleRequest(request(packet, 1), env, bad)).status, 502);
  assert.equal(
    db.prepare('SELECT charged FROM requests ORDER BY created_at DESC LIMIT 1').get()!.charged,
    140,
  );
});

test('article service shares requests, caches offline, isolates worlds and preserves old versions', async () => {
  let calls = 0;
  const s = await snapshot();
  const service = new NarrativeArticleService(async () => {
    calls++;
    return Response.json({ snapshot: s });
  });
  const results = await Promise.all([
    service.render(template, packet, world, [], connection),
    service.render(template, packet, world, [], connection),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0].article.id, template.id);
  assert.equal(
    (await service.render(template, packet, world, [], { ...connection, token: '' })).status,
    'cached',
  );
  assert.equal(
    (await service.render(template, packet, 'other-world', [s], { ...connection, token: '' }))
      .status,
    'template',
  );
  const old = { ...s, promptVersion: 0 };
  old.key = await snapshotKey(world, old.factsHash, old.quality, old.revision, old);
  const offline = new NarrativeArticleService(async () => {
    throw new Error('offline');
  });
  assert.equal(
    (await offline.render(template, packet, world, [old], { ...connection, token: '' })).status,
    'cached',
  );
});

test('service errors and quota are progressive enhancement, with a shared cooldown', async () => {
  let calls = 0;
  const service = new NarrativeArticleService(async () => {
    calls++;
    return new Response(null, { status: 429 });
  });
  const r = await service.render(template, packet, world, [], connection);
  assert.deepEqual(r.article, template);
  await service.render(template, packet, world, [], connection, 'premium', 1);
  assert.equal(calls, 1);
  assert.equal(
    (await service.render(template, packet, world, [], { ...connection, enabled: false })).status,
    'template',
  );
});

test('v4 prose sidecars export and rehydrate, preserve world identity, and do not rewrite fact chunks', async () => {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const backend: StorageBackend = {
    async get(k) {
      return values.get(k) ?? null;
    },
    async set(k, v) {
      values.set(k, v);
      writes.push(k);
    },
  };
  const save = migrateSaveData({
    teams: initTeams(),
    worldId: world,
    season: { year: 2035, schedule: [] },
    narrativeEvents: source.narrativeEvents,
  })!;
  assert.equal(await saveGameToSlot(save, 1, backend), true);
  const old = JSON.parse(values.get(SAVE_KEY(1))!);
  save.narrativeArticles = { '2034': [await snapshot()] };
  writes.length = 0;
  assert.equal(await saveGameToSlot(save, 1, backend), true);
  const root = JSON.parse(values.get(SAVE_KEY(1))!);
  assert.deepEqual(root.current.narrativeArticles, {});
  assert.deepEqual(root.archive.seasons, old.archive.seasons);
  assert.ok(!writes.includes(root.archive.seasons['2034'].key));
  const loaded = (await loadGameFromSlot(1, backend))!;
  assert.equal(loaded.worldId, world);
  assert.deepEqual(loaded.narrativeArticles, save.narrativeArticles);
  assert.deepEqual(
    importSaveData(exportSaveData(loaded))!.narrativeArticles,
    save.narrativeArticles,
  );
  values.set(root.archive.articleYears['2034'].key, 'corrupted');
  const recovered = (await loadGameFromSlot(1, backend))!;
  assert.deepEqual(recovered.narrativeArticles, {});
  assert.deepEqual(recovered.narrativeEvents, save.narrativeEvents);
  assert.equal(await saveGameToSlot(save, 1, backend), true);
  assert.deepEqual(
    (await loadGameFromSlot(1, backend))!.narrativeArticles,
    save.narrativeArticles,
    'a corrupt optional chunk can be repaired even at the same content revision',
  );
});

test('optional prose write failures do not block canonical saves, and queued clear runs last', async () => {
  const values = new Map<string, string>();
  const backend: StorageBackend = {
    async get(k) {
      return values.get(k) ?? null;
    },
    async set(k, v) {
      if (k.includes('_articles_') && v) throw new Error('quota');
      values.set(k, v);
    },
  };
  const save = migrateSaveData({
    teams: initTeams(),
    worldId: world,
    season: { year: 2035, schedule: [] },
    narrativeEvents: source.narrativeEvents,
    narrativeArticles: { '2034': [await snapshot()] },
  })!;
  assert.equal(await saveGameToSlot(save, 1, backend), true);
  const loaded = (await loadGameFromSlot(1, backend))!;
  assert.deepEqual(loaded.narrativeEvents, source.narrativeEvents);
  assert.deepEqual(loaded.narrativeArticles, {});
  const writing = saveGameToSlot(save, 1, backend);
  const clearing = clearSaveSlot(1, backend);
  assert.deepEqual(await Promise.all([writing, clearing]), [true, true]);
  assert.equal(await loadGameFromSlot(1, backend), null);
});

test('settings changes cancel queued requests before they use obsolete credentials', async () => {
  let calls = 0;
  const service = new NarrativeArticleService(async () => {
    calls++;
    return Response.json({ snapshot: await snapshot() });
  });
  const pending = service.render(template, packet, world, [], connection);
  service.cancelQueued();
  assert.equal((await pending).status, 'template');
  assert.equal(calls, 0);
});

test('budget reservations are shared by distinct concurrent keys and unknown prose is rejected', async () => {
  const { env } = await environment({ STANDARD_DAILY_TOKENS: '1' });
  const responses = await Promise.all([
    handleRequest(request(packet, 1), env, success()),
    handleRequest(request(packet, 2), env, success()),
  ]);
  assert.ok(responses.every((r) => r.status === 429));
  const c = { year: 2034, champion: 'giants' as const };
  const cp = buildFactPacket(articleFromChampionship(c), { ...source, championHistory: [c] })!;
  const p = prose(cp);
  p.segments[0].text += '秘密の特訓が実を結んだ。';
  assert.equal(validateProse(p, cp), null, 'valid refs never legitimize invented causation');
});
