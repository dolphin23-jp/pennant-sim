import assert from 'node:assert/strict';
import test from 'node:test';

import { TINFO } from '../src/data';
import type {
  BatterStats,
  PitcherStats,
  Player,
  PlayerSeasonRecord,
  YearlyPlayerRecords,
} from '../src/engine';
import { buildPlayerNarrativeProfile } from '../src/narrative/playerProfile';
import { canonicalJson, validateProse, type Prose } from '../src/narrative/protocol';

function batterStats(name: string, g: number, hr: number, hits = 150): BatterStats {
  const ab = Math.max(hits, g * 4);
  return {
    type: 'bat',
    name,
    g,
    pa: ab + 40,
    ab,
    h: hits,
    s: Math.max(0, hits - 30 - hr),
    d: 25,
    t: 5,
    hr,
    bb: 40,
    k: 90,
    rbi: hr * 3,
    sb: 8,
    cs: 3,
    bnt: 0,
    sf: 4,
    r: 70,
    hbp: 3,
    gdp: 8,
    e: 2,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'profile-player',
    name: '架空 太郎',
    age: 24,
    tk: 'giants',
    isP: false,
    pos: '右翼手',
    positions: [{ pos: '右翼手', apt: 100 }],
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: {
      stam: 40,
      cf: 48,
      cb: 46,
      pw: 62,
      dc: 50,
      sp: 45,
      df: 43,
      arm: 51,
      bnt: 30,
    },
    pot: { pw: 72, cf: 58 },
    potentialClass: 'elite',
    trainPolicy: 'balanced',
    ...overrides,
  };
}

function season(
  year: number,
  age: number,
  hr: number,
  g = 130,
  id = 'profile-player',
  name = '架空 太郎',
  teamKey: PlayerSeasonRecord['teamKey'] = 'giants',
): PlayerSeasonRecord {
  return {
    playerId: id,
    playerName: name,
    year,
    age,
    teamKey,
    teamName: TINFO[teamKey].n,
    teamAbbreviation: TINFO[teamKey].ab,
    isPitcher: false,
    position: '右翼手',
    ovr: 50,
    params: { stam: 40, pw: 55 },
    stats: batterStats(name, g, hr),
  };
}

function history(includeFuture = false): YearlyPlayerRecords {
  const records: YearlyPlayerRecords = {
    '2023': [season(2023, 21, 20, 115)],
    '2024': [season(2024, 22, 26, 128)],
    '2025': [
      season(2025, 23, 32, 140),
      season(2025, 27, 40, 140, 'carp-a', '鯉 一郎', 'carp'),
      season(2025, 28, 35, 138, 'tigers-a', '虎 二郎', 'tigers'),
      season(2025, 29, 18, 130, 'giants-b', '巨人 次郎', 'giants'),
    ],
  };
  if (includeFuture) {
    records['2027'] = [season(2027, 25, 99, 143)];
  }
  return records;
}

test('player profile is a stable live projection and ignores future yearly records', () => {
  const base = buildPlayerNarrativeProfile({
    player: player(),
    teamKey: 'giants',
    seasonYear: 2026,
    asOfDate: '2026-03-27',
    yearlyStats: history(false),
  });
  const withFuture = buildPlayerNarrativeProfile({
    player: player(),
    teamKey: 'giants',
    seasonYear: 2026,
    asOfDate: '2026-03-27',
    yearlyStats: history(true),
  });

  assert.ok(base);
  assert.ok(withFuture);
  assert.equal(base.article.id, 'player-profile:2026:profile-player');
  assert.equal(base.article.kind, 'playerProfile');
  assert.equal(base.article.viewMode, 'live');
  assert.equal(base.packet.story.depth, 'feature');
  assert.equal(base.archetype, 'established-star');
  assert.ok(base.editorialInputs.some((input) => input.sourceClass === 'canonical'));
  assert.ok(base.editorialInputs.some((input) => input.sourceClass === 'derived'));
  assert.equal(canonicalJson(base.packet), canonicalJson(withFuture.packet));
  assert.equal(canonicalJson(base.packet).includes('2027'), false);
  assert.equal(canonicalJson(base.packet).includes('99'), false);
});

test('player profile keeps editorial classification derived instead of writing it into player state', () => {
  const veteran = player({
    age: 34,
    potentialClass: 'standard',
    p: {
      stam: 40,
      cf: 43,
      cb: 42,
      pw: 45,
      dc: 47,
      sp: 35,
      df: 41,
      arm: 44,
      bnt: 30,
    },
  });
  const yearlyStats: YearlyPlayerRecords = {
    '2014': [season(2014, 22, 35, 140)],
    '2023': [season(2023, 31, 24, 132)],
    '2024': [season(2024, 32, 15, 112)],
    '2025': [season(2025, 33, 8, 92)],
  };
  const before = structuredClone(veteran);
  const profile = buildPlayerNarrativeProfile({
    player: veteran,
    teamKey: 'giants',
    seasonYear: 2026,
    asOfDate: '2026-03-27',
    yearlyStats,
  });

  assert.ok(profile);
  assert.equal(profile.archetype, 'former-star');
  assert.deepEqual(veteran, before);
  assert.ok(
    profile.editorialInputs.some(
      (input) => input.id === 'career-archetype' && input.sourceClass === 'derived',
    ),
  );
});

test('rich player profiles require multi-claim analytical prose while primary facts remain factual', () => {
  const profile = buildPlayerNarrativeProfile({
    player: player(),
    teamKey: 'giants',
    seasonYear: 2026,
    asOfDate: '2026-03-27',
    yearlyStats: history(),
  });
  assert.ok(profile);

  const primary = profile.packet.claims.filter((claim) => claim.role === 'primary');
  const context = profile.packet.claims.filter((claim) => claim.role === 'context');
  assert.ok(context.length >= 2);
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
  assert.equal(validateProse(prose, profile.packet), null);

  prose.segments.push({
    class: 'ANALYTICAL',
    text: '保存された複数の事実を合わせると、キャリアの流れの中で現在の位置づけを読める。',
    claimIds: context.slice(0, 2).map((claim) => claim.id),
  });
  assert.ok(validateProse(prose, profile.packet));
});


function pitcherStats(name: string, saves: number): PitcherStats {
  return {
    type: 'pit',
    name,
    g: 55,
    gs: 0,
    w: 3,
    l: 2,
    sv: saves,
    hld: 4,
    bs: 2,
    ip3: 165,
    h: 42,
    bb: 14,
    k: 68,
    er: 12,
    pc: 900,
    r: 13,
    hbp: 1,
    hr: 4,
    bf: 210,
  };
}

function pitcherSeason(
  year: number,
  age: number,
  saves: number,
  id = 'profile-pitcher',
  name = '架空 投手',
  teamKey: PlayerSeasonRecord['teamKey'] = 'hawks',
): PlayerSeasonRecord {
  return {
    playerId: id,
    playerName: name,
    year,
    age,
    teamKey,
    teamName: TINFO[teamKey].n,
    teamAbbreviation: TINFO[teamKey].ab,
    isPitcher: true,
    role: 'クローザー',
    ovr: 55,
    params: { stam: 42, vel: 60, ctrl: 53, nobi: 58 },
    stats: pitcherStats(name, saves),
  };
}

test('player profile supports pitcher role standings and career context', () => {
  const closer = player({
    id: 'profile-pitcher',
    name: '架空 投手',
    age: 28,
    tk: 'hawks',
    isP: true,
    pos: undefined,
    positions: undefined,
    role: 'クローザー',
    p: { stam: 42, vel: 64, ctrl: 55, nobi: 61, fld: 40 },
    pot: { vel: 68, ctrl: 60 },
    potentialClass: 'standard',
  });
  const yearlyStats: YearlyPlayerRecords = {
    '2023': [pitcherSeason(2023, 25, 22)],
    '2024': [pitcherSeason(2024, 26, 29)],
    '2025': [
      pitcherSeason(2025, 27, 36),
      pitcherSeason(2025, 29, 41, 'marines-closer', '幕張 守', 'marines'),
      pitcherSeason(2025, 30, 31, 'lions-closer', '所沢 守', 'lions'),
    ],
  };
  const profile = buildPlayerNarrativeProfile({
    player: closer,
    teamKey: 'hawks',
    seasonYear: 2026,
    asOfDate: '2026-03-27',
    yearlyStats,
  });

  assert.ok(profile);
  assert.equal(profile.packet.kind, 'playerProfile');
  assert.ok(
    profile.editorialInputs.some(
      (input) => input.id === 'relative-standing' && input.text.includes('セーブ'),
    ),
  );
  assert.ok(
    profile.editorialInputs.some(
      (input) => input.id === 'strongest-skill' && input.text.includes('球速'),
    ),
  );
});
