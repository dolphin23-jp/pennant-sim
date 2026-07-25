import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcOVR,
  configureRandom,
  generateDraftProspects,
  resetRandom,
  type DraftOrigin,
  type Player,
} from '../src/engine';

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
const overall = (player: Player) => (player.isP ? calcOVR(player) : calcOVR(player, player.pos));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('draft origins control age bands, labels, and population shares', () => {
  configureRandom(mulberry32(20260726), () => 1_700_000_000_000);
  const prospects = Array.from({ length: 100 }, () => generateDraftProspects()).flat();
  assert.equal(prospects.length, 9600);

  const groups = Object.fromEntries(
    (['高卒', '大卒', '社会人'] as DraftOrigin[]).map((origin) => [
      origin,
      prospects.filter((player) => player.draftOrigin === origin),
    ]),
  ) as Record<DraftOrigin, Player[]>;

  const shares = Object.fromEntries(
    Object.entries(groups).map(([origin, players]) => [origin, players.length / prospects.length]),
  ) as Record<DraftOrigin, number>;
  assert.ok(shares.高卒 >= 0.42 && shares.高卒 <= 0.5);
  assert.ok(shares.大卒 >= 0.32 && shares.大卒 <= 0.4);
  assert.ok(shares.社会人 >= 0.15 && shares.社会人 <= 0.21);

  for (const player of prospects) {
    assert.ok(player.draftOrigin);
    assert.match(player.note ?? '', /^(高卒|大卒|社会人)・(怪物候補|即戦力候補|素材型|有望株)$/);
    if (player.draftOrigin === '高卒') assert.ok(player.age >= 18 && player.age <= 19);
    if (player.draftOrigin === '大卒') assert.ok(player.age >= 21 && player.age <= 22);
    if (player.draftOrigin === '社会人') assert.ok(player.age >= 23 && player.age <= 25);
  }

  const meanOvr = Object.fromEntries(
    Object.entries(groups).map(([origin, players]) => [origin, average(players.map(overall))]),
  ) as Record<DraftOrigin, number>;
  assert.ok(meanOvr.大卒 > meanOvr.高卒 + 2);
  assert.ok(meanOvr.社会人 > meanOvr.高卒 + 2);
  assert.ok(groups.高卒.some((player) => player.note?.endsWith('怪物候補')));
  assert.ok(groups.大卒.some((player) => player.note?.endsWith('怪物候補')));
  assert.ok(groups.社会人.some((player) => player.note?.endsWith('怪物候補')));
  assert.ok(
    prospects.some(
      (player) => !player.isP && player.note?.endsWith('怪物候補') && Number(player.p.pw) >= 100,
    ),
  );
  assert.ok(
    prospects.some(
      (player) =>
        player.isP &&
        player.note?.endsWith('怪物候補') &&
        Math.max(Number(player.p.vel), Number(player.p.ctrl), Number(player.p.nobi)) >= 92,
    ),
  );
  resetRandom();
});
