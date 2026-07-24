import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcOVR,
  configureRandom,
  generateBatter,
  initTeams,
  resetRandom,
  type Player,
} from '../src/engine';
import { generateDraftProspects } from '../src/state/offseason';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const hasAny = (player: Player, ids: string[]) =>
  ids.some((id) => (player.specialLevels?.[id] ?? 0) > 0);

test('special abilities follow the generated player profile', () => {
  configureRandom(mulberry32(20260724), () => 1_700_000_000_000);
  const players = Array.from({ length: 2400 }, (_, index) =>
    generateBatter('draft', 27, index % 2 ? '一塁手' : '中堅手', 72),
  );
  const compare = (ids: string[], rating: (player: Player) => number) => {
    const holders = players.filter((player) => hasAny(player, ids));
    const others = players.filter((player) => !hasAny(player, ids));
    assert.ok(holders.length > 20);
    assert.ok(average(holders.map(rating)) > average(others.map(rating)) + 2);
  };
  compare(['pull', 'slugger_gold'], (player) => player.p.pw ?? 0);
  compare(
    ['avg', 'avg_gold', 'spray', 'spray_gold'],
    (player) => ((player.p.cf ?? 0) + (player.p.cb ?? 0)) / 2,
  );
  compare(['sb', 'sb_gold', 'run'], (player) => player.p.sp ?? 0);
  for (const player of players) {
    assert.ok(!hasAny(player, ['co']) || !hasAny(player, ['cx']));
    assert.ok(!hasAny(player, ['fbo']) || !hasAny(player, ['fbx']));
  }
  resetRandom();
});

test('layered roster generation produces visible upper-tail talent', () => {
  configureRandom(mulberry32(20260725), () => 1_700_000_000_000);
  const teams = initTeams();
  const batters = Object.values(teams).flatMap((team) => team.fielders);
  const pitchers = Object.values(teams).flatMap((team) => team.pitchers);
  assert.ok(batters.filter((player) => calcOVR(player, player.pos) >= 85).length >= 12);
  assert.ok(pitchers.filter((player) => calcOVR(player) >= 85).length >= 6);
  resetRandom();
});

test('draft origin controls age bands and labels', () => {
  configureRandom(mulberry32(20260726), () => 1_700_000_000_000);
  const prospects = generateDraftProspects();
  assert.equal(prospects.length, 80);
  for (const player of prospects) {
    assert.ok(player.draftOrigin);
    assert.match(player.note ?? '', /^(高卒|大卒|社会人)・/);
    if (player.draftOrigin === '高卒') assert.ok(player.age >= 18 && player.age <= 19);
    if (player.draftOrigin === '大卒') assert.ok(player.age >= 21 && player.age <= 22);
    if (player.draftOrigin === '社会人') assert.ok(player.age >= 23 && player.age <= 25);
  }
  resetRandom();
});
