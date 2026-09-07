import assert from 'node:assert/strict';
import test from 'node:test';

import { TINFO } from '../src/data';
import type {
  AchievementEvent,
  BatterStats,
  Player,
  PlayerSeasonRecord,
  SeasonTitleRecord,
  YearlyPlayerRecords,
} from '../src/engine';
import { buildCareerRetrospective } from '../src/narrative/careerRetrospective';
import { canonicalJson, PROMPT_VERSION, validateProse, type Prose } from '../src/narrative/protocol';
import type { NarrativeEvent, NarrativeEventLedger } from '../src/narrative/types';
import { SYSTEM_PROMPT } from '../worker/index';

function batterStats(name: string, games: number, homeRuns: number, hits = 130): BatterStats {
  const ab = Math.max(hits, games * 4);
  return {
    type: 'bat',
    name,
    g: games,
    pa: ab + 40,
    ab,
    h: hits,
    s: Math.max(0, hits - 30 - homeRuns),
    d: 24,
    t: 3,
    hr: homeRuns,
    bb: 40,
    k: 80,
    rbi: homeRuns * 3,
    sb: 6,
    cs: 2,
    bnt: 0,
    sf: 4,
    r: 65,
    hbp: 3,
    gdp: 8,
    e: 2,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'retro-player',
    name: '回顧 太郎',
    age: 27,
    tk: 'giants',
    isP: false,
    pos: '右翼手',
    positions: [{ pos: '右翼手', apt: 100 }],
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: { stam: 45, cf: 50, cb: 49, pw: 70, dc: 52, sp: 48, df: 44, arm: 50, bnt: 30 },
    pot: { pw: 80, cf: 62 },
    trainPolicy: 'balanced',
    draftOrigin: '高卒',
    preProHistory: {
      schemaVersion: 1,
      source: 'generated-v1',
      origin: '高卒',
      entryYear: 2027,
      entryAge: 18,
      profileTier: 'national',
      highlights: [
        { kind: 'career-home-runs', text: '高校通算38本塁打', value: 38, unit: '本塁打' },
      ],
    },
    ...overrides,
  };
}

function season(year: number, age: number, hr: number, ovr: number): PlayerSeasonRecord {
  return {
    playerId: 'retro-player',
    playerName: '回顧 太郎',
    year,
    age,
    teamKey: 'giants',
    teamName: TINFO.giants.n,
    teamAbbreviation: TINFO.giants.ab,
    isPitcher: false,
    position: '右翼手',
    ovr,
    params: { stam: 45, pw: ovr },
    stats: batterStats('回顧 太郎', 130, hr),
  };
}

function draftEvent(withSnapshot = true): NarrativeEvent {
  return {
    type: 'draft',
    id: 'draft:2026:giants:2:retro-player',
    year: 2026,
    date: '2026年オフ',
    teamKey: 'giants',
    playerId: 'retro-player',
    playerName: '回顧 太郎',
    round: 2,
    origin: '高卒',
    ...(withSnapshot
      ? {
          prospectSnapshot: {
            schemaVersion: 1 as const,
            source: 'draft-pool-v1' as const,
            playerId: 'retro-player',
            age: 18,
            role: '右翼手',
            currentOverall: 48,
            poolRank: 61,
            poolSize: 96,
            strongestSkill: { label: '長打力', rating: 66 },
            materialPotentialGap: { threshold: 12 as const, count: 2 },
          },
        }
      : {}),
  };
}

function baseHistory(includeFuture = false): YearlyPlayerRecords {
  const history: YearlyPlayerRecords = {
    '2027': [season(2027, 19, 8, 50)],
    '2028': [season(2028, 20, 18, 57)],
    '2029': [season(2029, 21, 25, 64)],
    '2030': [season(2030, 22, 32, 72)],
  };
  if (includeFuture) history['2032'] = [season(2032, 24, 99, 99)];
  return history;
}

function source(input: {
  withSnapshot?: boolean;
  includeFuture?: boolean;
  retirement?: boolean;
  awards?: SeasonTitleRecord[];
  achievements?: AchievementEvent[];
} = {}) {
  const events: NarrativeEvent[] = [draftEvent(input.withSnapshot !== false)];
  if (input.retirement) {
    events.push({
      type: 'transaction',
      id: 'retirement:2030:giants:retro-player',
      year: 2030,
      date: '2030年オフ',
      transactionKind: 'retirement',
      playerId: 'retro-player',
      playerName: '回顧 太郎',
      fromTeamKey: 'giants',
    });
  }
  const narrativeEvents: NarrativeEventLedger = {
    '2026': [events[0]],
    ...(input.retirement ? { '2030': [events[1]] } : {}),
  };
  return {
    player: player(),
    seasonYear: 2031,
    asOfDate: '2031-04-01',
    yearlyStats: baseHistory(input.includeFuture),
    awardHistory:
      input.awards ??
      [
        {
          year: 2030,
          league: 'central' as const,
          titleId: 'hr',
          titleLabel: '本塁打王',
          playerId: 'retro-player',
          playerName: '回顧 太郎',
          teamKey: 'giants' as const,
          displayValue: '32本',
          value: 32,
        },
      ],
    achievementHistory: input.achievements ?? [],
    narrativeEvents,
  };
}

test('career retrospective connects frozen draft evaluation to later career without current-rating leakage', () => {
  const base = buildCareerRetrospective(source());
  const changedPlayer = player({
    age: 40,
    p: { stam: 10, cf: 10, cb: 10, pw: 10, dc: 10, sp: 10, df: 10, arm: 10, bnt: 10 },
    pot: { pw: 10 },
  });
  const changed = buildCareerRetrospective({ ...source(), player: changedPlayer });

  assert.ok(base);
  assert.ok(changed);
  assert.equal(base.article.id, 'career-retrospective:2031:retro-player');
  assert.equal(base.article.kind, 'careerRetrospective');
  assert.equal(base.outcome, 'lower-ranked-rise');
  assert.equal(base.article.viewMode, 'live');
  assert.match(base.article.segments.map((segment) => segment.text).join(' '), /96人中61位/);
  assert.match(base.article.segments.map((segment) => segment.text).join(' '), /高校通算38本塁打/);
  assert.equal(canonicalJson(base.packet), canonicalJson(changed.packet));
});

test('career retrospective ignores future history and refuses to reconstruct missing draft evaluations', () => {
  const base = buildCareerRetrospective(source());
  const future = buildCareerRetrospective(source({ includeFuture: true }));
  const legacy = buildCareerRetrospective(source({ withSnapshot: false }));

  assert.ok(base);
  assert.ok(future);
  assert.equal(canonicalJson(base.packet), canonicalJson(future.packet));
  assert.equal(canonicalJson(future.packet).includes('2032'), false);
  assert.equal(canonicalJson(future.packet).includes('99'), false);
  assert.equal(legacy, null);
});

test('retirement turns the same grounded story into a cover-style career retrospective', () => {
  const retrospective = buildCareerRetrospective(source({ retirement: true }));
  assert.ok(retrospective);
  assert.equal(retrospective.retired, true);
  assert.equal(retrospective.packet.story.depth, 'cover');
  assert.match(retrospective.article.headline, /キャリア回顧/);
  assert.ok(
    retrospective.editorialInputs.some(
      (input) => input.id === 'retirement' && input.sourceClass === 'canonical',
    ),
  );
});

test('career retrospective packets require grounded multi-claim analytical prose', () => {
  const retrospective = buildCareerRetrospective(source());
  assert.ok(retrospective);
  const primary = retrospective.packet.claims.filter((claim) => claim.role === 'primary');
  const context = retrospective.packet.claims.filter((claim) => claim.role === 'context');
  const factual = (claim: (typeof primary)[number]) => ({
    class: 'FACTUAL' as const,
    text: claim.text,
    claimIds: [claim.id],
  });
  const prose: Prose = {
    headline: factual(primary.find((claim) => claim.id === 'headline')!),
    dek: null,
    segments: primary.filter((claim) => claim.id !== 'headline').map(factual),
  };
  assert.equal(validateProse(prose, retrospective.packet), null);

  prose.segments.push({
    class: 'ANALYTICAL',
    text: 'ドラフト時評価と後年の保存記録を比較すると、キャリアの位置づけを時系列で整理できる。',
    claimIds: context.slice(0, 2).map((claim) => claim.id),
  });
  assert.ok(validateProse(prose, retrospective.packet));
});

test('worker prompt version and instructions explicitly cover career retrospectives', () => {
  assert.equal(PROMPT_VERSION, 6);
  assert.match(SYSTEM_PROMPT, /kind=careerRetrospective/);
  assert.match(SYSTEM_PROMPT, /後知恵で当時の評価を書き換えない/);
});
