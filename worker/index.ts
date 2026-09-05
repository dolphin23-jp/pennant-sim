import {
  canonicalJson,
  sha256,
  packetFactsHash,
  snapshotKey,
  validPacket,
  validateProse,
  outputSchema,
  MODELS,
  RENDERER_VERSION,
  PROMPT_VERSION,
  VALIDATOR_VERSION,
  STYLE_VERSION,
  type ArticleSnapshot,
  type FactPacket,
  type Prose,
  type Quality,
} from '../src/narrative/protocol';

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Env {
  DB: { prepare(query: string): Statement };
  OPENAI_API_KEY?: string;
  /** SHA-256 of the separate, revocable personal proxy token. Never an OpenAI key. */
  NARRATIVE_TOKEN_SHA256?: string;
  ALLOWED_ORIGIN: string;
  STANDARD_DAILY_TOKENS?: string;
  PREMIUM_DAILY_TOKENS?: string;
  ENABLE_PREMIUM?: string;
}

export const SYSTEM_PROMPT = `あなたは架空プロ野球世界を長年取材している日本語スポーツ紙の編集記者です。
入力JSONだけが事実です。外部知識や現実のNPB情報を混ぜず、asOfDateより後の出来事を想像しないでください。

目的は「claimを言い換える」ことではなく、保存された一次事実と過去文脈を編集して、読者がこの球界の歴史を追いたくなる記事を書くことです。
story.depth=featureなら通常3〜5段落、coverなら5〜8段落を目安にしてください。ただし材料が足りない時は水増ししないでください。
headlineはheadline claimを必ず根拠にし、dekは任意です。primary claimは全て記事内で扱い、context claimは物語の連続性を高める時だけ使ってください。
関連する複数claimを1つの自然な段落に統合して構いません。FACTUALのclaimIdsには、その段落で実際に使ったclaimだけを全て列挙してください。
locked=trueのclaimを使う段落では、そのclaim.textを一字も変えず段落内に含めてください。

記事では、現在の出来事→意味のある過去文脈→現在の位置づけ、という流れを優先してください。
試合なら勝敗を分けた事実、記録なら従来記録や過去の積み上げ、優勝ならシーズン成績や過去の節目、移籍・引退なら保存された所属履歴や実績を中心にします。
単なる箇条書きやclaim順の機械的な書き換えは避け、新聞記事として読みやすい接続と段落構成にしてください。

禁止事項:
- 人物の心理、意思、感情、コメント、会見、談話、ファンや観客の反応を創作しない。
- 未提示の契約条件、球場、天候、ケガの診断名、学校名、家族、因縁、練習内容、将来予測を追加しない。
- 勝敗、移籍元/先、順位、数値、時系列、誰が何をしたかを変えない。
- ANALYTICALはまだ使わない。
COLORは最大1段落。人物名・球団名・数値・具体的出来事を含めず、記事の余韻だけにする。
確信できない内容は書かず、事実の密度を優先してください。`;

export const VERIFIER_PROMPT = `あなたはスポーツ記事の厳格なファクトチェッカーです。
packetだけを根拠としてproseを検証してください。外部知識は禁止です。
FACTUALの各文章について、指定claimIdsのtextから直接支持できない事実が1つでもあればsupported=falseです。
特に、勝敗の反転、選手と数値の取り違え、時系列、移籍元/先、順位、因果関係、心理・意図、コメント、観客反応、将来予測、歴史的評価の創作を厳しく拒否してください。
context claimは過去文脈として使えますが、そのclaimが述べていない因果や意味を足してはいけません。
COLORは具体的事実を述べてはいけません。文章の巧拙ではなく、事実の支持可能性だけを判定してください。`;

async function boundedBody(request: Request, max: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > max) throw new Error('size');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
const cap = (value: string | undefined, fallback: number) => {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};
function equal(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

interface OpenAIResult {
  status?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
}
async function structuredCall(
  upstream: typeof fetch,
  apiKey: string,
  body: unknown,
): Promise<{ text: string; input: number; output: number }> {
  const response = await upstream('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error('upstream');
  const result = (await response.json()) as OpenAIResult;
  const input = result.usage?.input_tokens;
  const output = result.usage?.output_tokens;
  if (
    typeof input !== 'number' ||
    typeof output !== 'number' ||
    !Number.isSafeInteger(input) ||
    !Number.isSafeInteger(output) ||
    input < 0 ||
    output < 0 ||
    result.status !== 'completed'
  )
    throw new Error('usage');
  const text =
    result.output
      ?.filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((content) => content.type === 'output_text')
      .map((content) => content.text ?? '')
      .join('') ?? '';
  if (!text) throw new Error('output');
  return { text, input, output };
}

function writerBody(packet: FactPacket, quality: Quality) {
  const maxOutput =
    packet.story.depth === 'cover' ? 7000 : packet.story.depth === 'feature' ? 5000 : 2500;
  return {
    maxOutput,
    body: {
      model: MODELS[quality],
      store: false,
      reasoning: { effort: 'none' },
      max_output_tokens: maxOutput,
      input: [
        { role: 'developer', content: SYSTEM_PROMPT },
        { role: 'user', content: canonicalJson(packet) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'narrative_prose',
          strict: true,
          schema: outputSchema(packet),
        },
      },
    },
  };
}

function verifierBody(packet: FactPacket, prose: Prose, quality: Quality) {
  return {
    model: MODELS[quality],
    store: false,
    reasoning: { effort: 'none' },
    max_output_tokens: 1200,
    input: [
      { role: 'developer', content: VERIFIER_PROMPT },
      { role: 'user', content: canonicalJson({ packet, prose }) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'narrative_verification',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            supported: { type: 'boolean' },
            issues: { type: 'array', items: { type: 'string' }, maxItems: 12 },
          },
          required: ['supported', 'issues'],
        },
      },
    },
  };
}

function validVerification(raw: unknown): raw is { supported: boolean; issues: string[] } {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as { supported?: unknown }).supported === 'boolean' &&
    Array.isArray((raw as { issues?: unknown }).issues) &&
    (raw as { issues: unknown[] }).issues.length <= 12 &&
    (raw as { issues: unknown[] }).issues.every(
      (issue) => typeof issue === 'string' && issue.length <= 500,
    )
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    ...(origin === env.ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && origin !== env.ALLOWED_ORIGIN) return reply(403, { error: 'origin' });
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      },
    });
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (
    !token ||
    !env.NARRATIVE_TOKEN_SHA256 ||
    !equal(await sha256(token), env.NARRATIVE_TOKEN_SHA256)
  )
    return reply(401, { error: 'unauthorized' });

  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/status') {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const standard = await env.DB.prepare(
        'SELECT COALESCE(SUM(charged),0) AS used FROM requests WHERE day=? AND quality=?',
      )
        .bind(day, 'standard')
        .first<{ used: number }>();
      const premium = await env.DB.prepare(
        'SELECT COALESCE(SUM(charged),0) AS used FROM requests WHERE day=? AND quality=?',
      )
        .bind(day, 'premium')
        .first<{ used: number }>();
      return reply(200, {
        day,
        configured: !!env.OPENAI_API_KEY,
        standard: { used: standard?.used ?? 0, limit: cap(env.STANDARD_DAILY_TOKENS, 2000000) },
        premium: { used: premium?.used ?? 0, limit: cap(env.PREMIUM_DAILY_TOKENS, 200000) },
      });
    } catch {
      return reply(503, { error: 'storage_unavailable' });
    }
  }
  if (request.method !== 'POST' || path !== '/render') return reply(404, { error: 'not_found' });

  let raw: { packet?: unknown; world?: unknown; quality?: unknown; revision?: unknown };
  try {
    raw = JSON.parse(await boundedBody(request, 140000));
  } catch {
    return reply(400, { error: 'invalid_request' });
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    !validPacket(raw.packet) ||
    typeof raw.world !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(raw.world) ||
    !['standard', 'premium'].includes(String(raw.quality)) ||
    !Number.isSafeInteger(raw.revision) ||
    Number(raw.revision) < 0 ||
    Number(raw.revision) > 1000
  )
    return reply(400, { error: 'invalid_packet' });

  const packet = raw.packet;
  const quality = raw.quality as Quality;
  const revision = raw.revision as number;
  const hash = await packetFactsHash(packet);
  const key = await snapshotKey(raw.world, hash, quality, revision);
  const day = new Date().toISOString().slice(0, 10);
  const writer = writerBody(packet, quality);
  // Reserve for both the writer and independent verifier. UTF-8 bytes are deliberately
  // conservative relative to tokenizer counts; unknown completions remain charged.
  const encodedWriter = new TextEncoder().encode(JSON.stringify(writer.body)).length;
  const reserved = encodedWriter * 2 + writer.maxOutput + 1200 + 4096;
  const limit =
    quality === 'standard'
      ? cap(env.STANDARD_DAILY_TOKENS, 2000000)
      : cap(env.PREMIUM_DAILY_TOKENS, 200000);

  try {
    const existing = await env.DB.prepare('SELECT status,snapshot FROM requests WHERE key=?')
      .bind(key)
      .first<{ status: string; snapshot: string | null }>();
    if (existing)
      return existing.status === 'ready' && existing.snapshot
        ? reply(200, { snapshot: JSON.parse(existing.snapshot) })
        : reply(existing.status === 'pending' ? 202 : 422, { error: existing.status });
    if (!env.OPENAI_API_KEY) return reply(503, { error: 'not_configured' });
    if (quality === 'premium' && env.ENABLE_PREMIUM !== 'true')
      return reply(403, { error: 'premium_disabled' });
    const admitted = await env.DB.prepare(
      `INSERT OR IGNORE INTO requests(key,day,quality,status,charged,created_at)
      SELECT ?,?,?,'pending',?,? WHERE (SELECT COALESCE(SUM(charged),0) FROM requests WHERE day=? AND quality=?) + ? <= ? RETURNING key`,
    )
      .bind(key, day, quality, reserved, new Date().toISOString(), day, quality, reserved, limit)
      .first<{ key: string }>();
    if (!admitted) {
      const raced = await env.DB.prepare('SELECT status,snapshot FROM requests WHERE key=?')
        .bind(key)
        .first<{ status: string; snapshot: string | null }>();
      if (raced)
        return raced.status === 'ready' && raced.snapshot
          ? reply(200, { snapshot: JSON.parse(raced.snapshot) })
          : reply(raced.status === 'pending' ? 202 : 422, { error: raced.status });
      return reply(429, { error: 'budget' });
    }
  } catch {
    return reply(503, { error: 'storage_unavailable' });
  }

  let charged = reserved;
  try {
    const written = await structuredCall(upstream, env.OPENAI_API_KEY!, writer.body);
    charged = written.input + written.output;
    const prose = validateProse(JSON.parse(written.text), packet);
    if (!prose) throw new Error('validation');

    const checked = await structuredCall(
      upstream,
      env.OPENAI_API_KEY!,
      verifierBody(packet, prose, quality),
    );
    charged += checked.input + checked.output;
    const verification = JSON.parse(checked.text) as unknown;
    if (!validVerification(verification) || !verification.supported)
      throw new Error('unsupported');

    const snapshot: ArticleSnapshot = {
      key,
      articleId: packet.articleId,
      year: packet.year,
      factsHash: hash,
      rendererVersion: RENDERER_VERSION,
      promptVersion: PROMPT_VERSION,
      validatorVersion: VALIDATOR_VERSION,
      styleVersion: STYLE_VERSION,
      model: MODELS[quality],
      quality,
      revision,
      generatedAt: new Date().toISOString(),
      usage: {
        input: written.input + checked.input,
        output: written.output + checked.output,
      },
      prose,
    };
    await env.DB.prepare("UPDATE requests SET status='ready',charged=?,snapshot=? WHERE key=?")
      .bind(charged, JSON.stringify(snapshot), key)
      .run();
    return reply(200, { snapshot });
  } catch {
    await env.DB.prepare("UPDATE requests SET status='failed',charged=? WHERE key=?")
      .bind(charged, key)
      .run()
      .catch(() => {});
    return reply(502, { error: 'generation_unavailable' });
  }
}

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
