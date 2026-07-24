import assert from 'node:assert/strict';
import test from 'node:test';

import { aptitudeRank } from '../src/engine';
import { aptitudeToneColor } from '../src/components/widgets/aptitudeDisplay';

test('aptitudeToneColor maps aptitude thresholds to shared theme colors', () => {
  assert.equal(aptitudeToneColor(null), null);
  assert.equal(aptitudeToneColor(100), 'var(--color-success)');
  assert.equal(aptitudeToneColor(85), 'var(--color-success)');
  assert.equal(aptitudeToneColor(84), 'var(--color-accent)');
  assert.equal(aptitudeToneColor(60), 'var(--color-accent)');
  assert.equal(aptitudeToneColor(59), 'var(--color-warning)');
  assert.equal(aptitudeToneColor(40), 'var(--color-warning)');
  assert.equal(aptitudeToneColor(39), 'var(--color-danger)');
  assert.equal(aptitudeToneColor(0), 'var(--color-danger)');
});

test('aptitudeRank maps aptitude values using configurable display thresholds', () => {
  assert.equal(aptitudeRank(120), 'S');
  assert.equal(aptitudeRank(95), 'S');
  assert.equal(aptitudeRank(94), 'A');
  assert.equal(aptitudeRank(85), 'A');
  assert.equal(aptitudeRank(84), 'B');
  assert.equal(aptitudeRank(75), 'B');
  assert.equal(aptitudeRank(74), 'C');
  assert.equal(aptitudeRank(65), 'C');
  assert.equal(aptitudeRank(64), 'D');
  assert.equal(aptitudeRank(55), 'D');
  assert.equal(aptitudeRank(54), 'E');
  assert.equal(aptitudeRank(45), 'E');
  assert.equal(aptitudeRank(44), 'F');
  assert.equal(aptitudeRank(35), 'F');
  assert.equal(aptitudeRank(34), 'G');
  assert.equal(aptitudeRank(-10), 'G');
});
