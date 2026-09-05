/** Explicit opt-in smoke evaluation against YOUR authenticated proxy. Not part of CI. */
import { articleFromChampionship } from '../src/narrative/generate';
import type { PlayerSeasonRecord } from '../src/engine';
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
const previous = {
  year: 2030,
  champion: 'giants' as const,
  runnerUp: 'tigers' as const,
  record: { w: 78, l: 59, d: 6 },
};
const record = {
  year: 2034,
  champion: 'giants' as const,
  runnerUp: 'tigers' as const,
  record: { w: 82, l: 55, d: 6 },
  keyBatters: ['物語太郎'],
  keyPitchers: ['歴史一郎'],
  lineup: [{ playerId: 'story-player', playerName: '物語太郎', pos: '中堅手', isPitcher: false }],
};
const season = (year: number, hits: number, homeRuns: number): PlayerSeasonRecord => ({
  playerId: 'story-player',
  playerName: '物語太郎',
  year,
  age: 24 + (year - 2030),
  teamKey: 'giants',
  teamName: '読売ジャイアンツ',
  teamAbbreviation: '巨',
  isPitcher: false,
  position: '中堅手',
  ovr: 80,
  params: {} as PlayerSeasonRecord['params'],
  stats: {
    type: 'bat',
    name: '物語太郎',
    g: 143,
    pa: 620,
    ab: 560,
    h: hits,
    s: 120,
    d: 30,
    t: 2,
    hr: homeRuns,
    bb: 50,
    k: 90,
    rbi: 96,
    sb: 18,
    cs: 5,
    bnt: 0,
    sf: 6,
    r: 84,
    hbp: 4,
    gdp: 9,
    e: 3,
  },
});
const template = articleFromChampionship(record);
const packet = buildFactPacket(template, {
  gameBoxScores: {},
  achievementHistory: [],
  awardHistory: [
    {
      year: 2030,
      league: 'central',
      titleId: 'homeRuns',
      titleLabel: '本塁打王',
      playerId: 'story-player',
      playerName: '物語太郎',
      teamKey: 'giants',
      value: 32,
      displayValue: '32',
    },
  ],
  championHistory: [previous, record],
  yearlyStats: {
    '2030': [season(2030, 168, 32)],
    '2033': [season(2033, 174, 28)],
    '2034': [season(2034, 181, 35)],
  },
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
