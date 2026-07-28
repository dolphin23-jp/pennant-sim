import assert from 'node:assert/strict';
import test from 'node:test';

import { kmhToVelocity, velocityKmhText, velocityToKmh } from '../src/engine';
import { PLAYER_DEVELOPMENT_BALANCE } from '../src/data';

test('velocityToKmh maps the rating floor and ceiling to realistic NPB fastball speeds', () => {
  const ceiling = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;
  assert.equal(velocityToKmh(25), 125);
  assert.equal(velocityToKmh(ceiling), 170);
});

test('velocityToKmh increases monotonically with the rating and stays in a plausible range', () => {
  let previous = -Infinity;
  for (let vel = 1; vel <= 160; vel += 1) {
    const kmh = velocityToKmh(vel);
    assert.ok(kmh >= previous, `球速表示が単調増加していない: vel=${vel} -> ${kmh}`);
    assert.ok(kmh >= 100 && kmh <= 180, `非現実的な球速: vel=${vel} -> ${kmh}`);
    previous = kmh;
  }
});

test('velocityToKmh treats an unset rating the same as the floor', () => {
  assert.equal(velocityToKmh(undefined), velocityToKmh(25));
});

test('velocityKmhText appends the unit', () => {
  assert.equal(velocityKmhText(25), '125km/h');
});

test('kmhToVelocity is the inverse of velocityToKmh at the anchor points', () => {
  const ceiling = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;
  assert.equal(kmhToVelocity(125), 25);
  assert.equal(kmhToVelocity(170), ceiling);
});
