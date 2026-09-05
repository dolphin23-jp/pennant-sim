import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerSeasonRecord } from '../src/engine';
import { articleFromChampionship, articleFromFutureEvent, type NarrativeSource } from '../src/narrative/generate';
import { buildNarrativeHistoryFacts } from '../src/narrative/historyFacts';
import { buildNarrativeMemoryIndex } from '../src/narrative/memory';
import { buildFactPacket } from '../src/narrative/packet';
import type { NarrativeArticle, NarrativeEvent } from '../src/narrative/types';

function season(year: number, teamKey: 'giants' | 'tigers', hits: number, homeRuns: number): PlayerSeasonRecord {
  return {
    playerId: 'story-player',
    playerName: '物語太郎',
    year,
    age: 20 + (year - 2027),
    teamKey,
    teamName: teamKey === 'giants' ? '読売ジャイアンツ' : '阪神タイガース',
    teamAbbreviation: teamKey === 'giants' ? '巨' : '神',
    isPitcher: false,
    position: '中堅手',
    ovr: 70,
    params: {} as PlayerSeasonRecord['params'],
    stats: {
      type: 'bat',
      name: '物語太郎',
      g: 130,
      pa: 540,
      ab: 490,
      h: hits,
      s: Math.max(0, hits - 45),
      d: 25,
      t: 2,
      hr: homeRuns,
      bb: 42,
      k: 90,
      rbi: 80,
      sb: 12,
      cs: 4,
      bnt: 1,
      sf: 5,
      r: 68,
      hbp: 4,
      gdp: 8,
      e: 3,
    },
  };
}

const retirement: NarrativeEvent = {
  type: 'transaction',
  id: 'retirement:2034:story-player',
  year: 2034,
  date: '2034年オフ',
  transactionKind: 'retirement',
  playerId: 'story-player',
  playerName: '物語太郎',
  fromTeamKey: 'tigers',
};

function source(): NarrativeSource {
  return {
    gameBoxScores: {},
    achievementHistory: [],
    championHistory: [
      { year: 2030, champion: 'giants', runnerUp: 'tigers' },
      { year: 2032, champion: 'giants', runnerUp: 'hawks' },
      { year: 2033, champion: 'giants', runnerUp: 'buffaloes' },
      { year: 2034, champion: 'giants', runnerUp: 'tigers' },
    ],
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
      {
        year: 2033,
        league: 'central',
        titleId: 'hits',
        titleLabel: '最多安打',
        playerId: 'story-player',
        playerName: '物語太郎',
        teamKey: 'tigers',
        value: 170,
        displayValue: '170',
      },
    ],
    narrativeEvents: {
      '2031': [
        {
          type: 'transaction',
          id: 'trade:2031:story-player',
          year: 2031,
          date: '2031年オフ',
          transactionKind: 'trade',
          playerId: 'story-player',
          playerName: '物語太郎',
          fromTeamKey: 'giants',
          toTeamKey: 'tigers',
        },
      ],
      '2034': [retirement],
    },
    yearlyStats: {
      '2027': [season(2027, 'giants', 120, 12)],
      '2028': [season(2028, 'giants', 140, 18)],
      '2029': [season(2029, 'giants', 150, 25)],
      '2030': [season(2030, 'giants', 165, 32)],
      '2031': [season(2031, 'giants', 155, 28)],
      '2032': [season(2032, 'tigers', 160, 30)],
      '2033': [season(2033, 'tigers', 170, 26)],
      '2034': [season(2034, 'tigers', 145, 20)],
    },
  };
}

test('retirement history exposes deterministic career span, totals, best season and titles', () => {
  const data = source();
  const article = articleFromFutureEvent(retirement);
  const index = buildNarrativeMemoryIndex(data);
  const facts = buildNarrativeHistoryFacts(article, data, index, 8);
  const text = facts.map((fact) => fact.text).join('\n');

  assert.match(text, /2027年の一軍初出場から8シーズン/);
  assert.match(text, /通算成績は1040試合、1205安打、191本塁打/);
  assert.match(text, /シーズン最多本塁打は2030年の32本/);
  assert.match(text, /個人タイトルを延べ2回/);
  assert.ok(facts.every((fact) => fact.factRefs.length > 0));

  const packet = buildFactPacket(article, data, undefined, index);
  assert.ok(packet);
  assert.ok(packet.claims.some((claim) => claim.id.startsWith('h') && claim.text.includes('8シーズン')));
  assert.ok(packet.facts.some((fact) => fact.ref.kind === 'CAREER_SUMMARY'));
});

test('history facts never leak the current final season into an in-season article', () => {
  const data = source();
  const article: NarrativeArticle = {
    id: 'game:2034-06-01-G-T',
    generatorVersion: 2,
    kind: 'gameRecap',
    year: 2034,
    publishedAt: '2034-06-01',
    asOfDate: '2034-06-01',
    viewMode: 'archival',
    headline: '巨人対阪神',
    teamKeys: ['giants', 'tigers'],
    playerIds: ['story-player'],
    segments: [],
    factRefs: [{ kind: 'GAME_RESULT', key: '2034-06-01-G-T' }],
  };
  const facts = buildNarrativeHistoryFacts(article, data, buildNarrativeMemoryIndex(data), 8);
  const text = facts.map((fact) => fact.text).join('\n');

  assert.match(text, /2033年終了時点/);
  assert.doesNotMatch(text, /2034年終了時点/);
  assert.match(text, /古巣/);
});

test('championship history makes drought, dynasty and rematch arithmetic explicit', () => {
  const data = source();
  const article = articleFromChampionship(data.championHistory.at(-1)!);
  const facts = buildNarrativeHistoryFacts(article, data, buildNarrativeMemoryIndex(data), 8);
  const text = facts.map((fact) => fact.text).join('\n');

  assert.match(text, /2033年以来1年ぶり|2年連続/);
  assert.match(text, /3年連続で日本一/);
  assert.match(text, /2030年の日本シリーズでも対戦/);
  assert.ok(facts.some((fact) => fact.factRefs.some((ref) => ref.kind === 'TEAM_HISTORY')));
});
