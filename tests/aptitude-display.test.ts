import assert from 'node:assert/strict';
import test from 'node:test';

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
