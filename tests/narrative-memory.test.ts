import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerSeasonRecord, TeamKey } from '../src/engine';
import {
  articleFromChampionship,
  articleFromFutureEvent,
  type NarrativeSource,
} from '../src/narrative/generate';
import {
  buildCareerMemoryContext,
  buildNarrativeMemoryIndex,
  buildNarrativeStoryArcs,
} from '../src/narrative/memory';
import { buildFactPacket } from '../src/narrative/packet';
import { planNarrativeStory } from '../src/narrative/story';
import type { NarrativeEvent } from '../src/narrative/types';

function batterRecord(year: number, teamKey: TeamKey = 'giants'): PlayerSeasonRecord {
  return {
    playerId: 'p',
    playerName: '物語太郎',
    year,
    age: 20 + (year - 2027),
    teamKey,
    teamName: teamKey === 'giants' ? '読売ジャイアンツ' : '阪神タイガース',
    teamAbbreviation: teamKey === 'giants' ? '巨' : '神',
    isPitcher: false,
    position: 'cf',
    ovr: 70 + (year - 2027),
    params: {} as PlayerSeasonRecord['params'],
    stats: {
      type: 'bat',
      name: '物語太郎',
      g: 130,
      pa: 540,
      ab: 490,
      h: year === 2030 ? 160 : 140,
      s: 100,
      d: 25,
      t: 2,
      hr: year === 2030 ? 32 : 18,
      bb: 42,
      k: 90,
      rbi: year === 2030 ? 101 : 70,
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

const draft: NarrativeEvent = {
  type: 'draft',
  id: 'draft:2026:giants:1:p',
  year: 2026,
  date: '2026年オフ',
  teamKey: 'giants',
  playerId: 'p',
  playerName: '物語太郎',
  round: 1,
  origin: '高卒',
};
const trade: NarrativeEvent = {
  type: 'transaction',
  id: 'trade:2031:p',
  year: 2031,
  date: '2031年オフ',
  transactionKind: 'trade',
  playerId: 'p',
  playerName: '物語太郎',
  fromTeamKey: 'giants',
  toTeamKey: 'tigers',
};
const injury: NarrativeEvent = {
  type: 'injury',
  id: 'injury:2032:p',
  year: 2032,
  date: '2032-05-01',
  teamKey: 'tigers',
  playerId: 'p',
  playerName: '物語太郎',
  days: 20,
  severity: 'mid',
};
const recovery: NarrativeEvent = {
  type: 'career',
  id: 'return:2032:p',
  year: 2032,
  date: '2032-05-20',
  careerKind: 'returnFromInjury',
  teamKey: 'tigers',
  playerId: 'p',
  playerName: '物語太郎',
  injuryDaysBefore: 1,
};
const retirement: NarrativeEvent = {
  type: 'transaction',
  id: 'retirement:2035:p',
  year: 2035,
  date: '2035年オフ',
  transactionKind: 'retirement',
  playerId: 'p',
  playerName: '物語太郎',
  fromTeamKey: 'tigers',
};

function careerSource(): NarrativeSource {
  return {
    gameBoxScores: {},
    achievementHistory: [],
    championHistory: [],
    awardHistory: [
      {
        year: 2030,
        league: 'central',
        titleId: 'homeRuns',
        titleLabel: '本塁打王',
        playerId: 'p',
        playerName: '物語太郎',
        teamKey: 'giants',
        value: 32,
        displayValue: '32',
      },
    ],
    narrativeEvents: {
      '2026': [draft],
      '2031': [trade],
      '2032': [injury, recovery],
      '2035': [retirement],
    },
    yearlyStats: Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const year = 2027 + index;
        return [String(year), [batterRecord(year, year >= 2032 ? 'tigers' : 'giants')]];
      }),
    ),
  };
}

test('CareerMemory selects recent, title, standout and early seasons without exposing OVR', () => {
  const source = careerSource();
  const article = articleFromFutureEvent(retirement);
  const memory = buildNarrativeMemoryIndex(source);
  const context = buildCareerMemoryContext(article, source, memory, 6);

  assert.ok(context.some((claim) => claim.sourceArticleId === 'player-season:2034:p'));
  assert.ok(context.some((claim) => claim.sourceArticleId === 'player-season:2030:p'));
  assert.ok(context.some((claim) => claim.sourceArticleId === 'player-season:2027:p'));
  assert.ok(context.some((claim) => claim.text.includes('32本塁打')));
  assert.ok(context.every((claim) => !claim.text.includes('OVR')));
  assert.ok(context.every((claim) => claim.factRefs[0].kind === 'PLAYER_SEASON'));
});

test('StoryArc derives career continuity only from prior canonical history', () => {
  const source = careerSource();
  const article = articleFromFutureEvent(retirement);
  const memory = buildNarrativeMemoryIndex(source);
  const arcs = buildNarrativeStoryArcs(article, source, memory);
  const kinds = new Set(arcs.map((storyArc) => storyArc.type));

  assert.ok(kinds.has('career-origin'));
  assert.ok(kinds.has('club-journey'));
  assert.ok(kinds.has('injury-recovery'));
  assert.ok(kinds.has('long-career'));
  assert.ok(kinds.has('title-history'));

  const plan = planNarrativeStory(article, source, memory);
  assert.ok(plan.reasons.some((reason) => reason.startsWith('arc:')));

  const packet = buildFactPacket(article, source, undefined, memory);
  assert.ok(packet);
  assert.ok(packet.facts.some((fact) => fact.ref.kind === 'PLAYER_SEASON'));
  assert.ok(packet.claims.some((claim) => claim.role === 'context' && claim.text.includes('2034年')));
});

test('current-year final stats never leak into an in-season article', () => {
  const currentInjury: NarrativeEvent = {
    type: 'injury',
    id: 'injury:2034:p:current',
    year: 2034,
    date: '2034-06-01',
    teamKey: 'tigers',
    playerId: 'p',
    playerName: '物語太郎',
    days: 10,
    severity: 'mid',
  };
  const source = careerSource();
  source.narrativeEvents = { ...source.narrativeEvents, '2034': [currentInjury] };
  const article = articleFromFutureEvent(currentInjury);
  const context = buildCareerMemoryContext(article, source);

  assert.ok(context.some((claim) => claim.sourceArticleId === 'player-season:2033:p'));
  assert.ok(context.every((claim) => claim.sourceArticleId !== 'player-season:2034:p'));
});

test('same-year final stats are available to year-end offseason stories', () => {
  const yearEndRetirement: NarrativeEvent = {
    ...retirement,
    id: 'retirement:2034:p',
    year: 2034,
    date: '2034年オフ',
  };
  const source = careerSource();
  source.narrativeEvents = { ...source.narrativeEvents, '2034': [yearEndRetirement] };
  const article = articleFromFutureEvent(yearEndRetirement);
  const context = buildCareerMemoryContext(article, source);

  assert.ok(context.some((claim) => claim.sourceArticleId === 'player-season:2034:p'));
});

test('repeat championship matchup becomes an editorial arc without inventing a new fact', () => {
  const source: NarrativeSource = {
    gameBoxScores: {},
    achievementHistory: [],
    awardHistory: [],
    championHistory: [
      { year: 2030, champion: 'giants', runnerUp: 'tigers' },
      { year: 2034, champion: 'giants', runnerUp: 'tigers' },
    ],
  };
  const article = articleFromChampionship(source.championHistory[1]);
  const arcs = buildNarrativeStoryArcs(article, source);
  const repeat = arcs.find((storyArc) => storyArc.type === 'repeat-final');

  assert.ok(repeat);
  assert.deepEqual(repeat.teamKeys, ['giants', 'tigers']);
  assert.deepEqual(repeat.sourceIds, ['championship:2030']);
});
