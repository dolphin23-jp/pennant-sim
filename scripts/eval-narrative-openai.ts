/** Explicit opt-in smoke evaluation against YOUR authenticated proxy. Not part of CI. */
import { articleFromChampionship } from '../src/narrative/generate';
import { buildFactPacket } from '../src/narrative/packet';
import { NarrativeArticleService, validProxyUrl } from '../src/narrative/service';

const url = process.env.NARRATIVE_EVAL_URL ?? '';
const token = process.env.NARRATIVE_EVAL_TOKEN ?? '';
if (
  process.env.NARRATIVE_EVAL_CONFIRM !== '1' ||
  !validProxyUrl(url) ||
  !/^[A-Za-z0-9_-]{32,256}$/.test(token) ||
  token.startsWith('sk-')
) {
  throw new Error(
    'Set NARRATIVE_EVAL_CONFIRM=1, NARRATIVE_EVAL_URL (HTTPS origin with trailing slash), and the proxy-only NARRATIVE_EVAL_TOKEN. Never use an OpenAI key.',
  );
}
const record = { year: 2034, champion: 'giants' as const, runnerUp: 'tigers' as const };
const template = articleFromChampionship(record);
const packet = buildFactPacket(template, {
  gameBoxScores: {},
  achievementHistory: [],
  awardHistory: [],
  championHistory: [record],
})!;
const started = Date.now();
const service = new NarrativeArticleService();
const result = await service.render(template, packet, 'narrative-smoke-v1', [], {
  enabled: true,
  url,
  token,
});
if (!result.snapshot)
  throw new Error(
    `Proxy did not return validated prose (${result.status}); inspect worker configuration/status. No automatic retry was performed.`,
  );
const second = await service.render(template, packet, 'narrative-smoke-v1', [result.snapshot], {
  enabled: true,
  url,
  token: '',
});
if (second.status !== 'cached') throw new Error('Offline reuse failed');
console.log(
  JSON.stringify(
    {
      status: result.status,
      elapsedMs: Date.now() - started,
      model: result.snapshot.model,
      usage: result.snapshot.usage,
      article: result.article,
    },
    null,
    2,
  ),
);
