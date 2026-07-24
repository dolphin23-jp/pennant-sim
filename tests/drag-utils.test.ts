import assert from 'node:assert/strict';
import test from 'node:test';

import { reorderIds, swapRecordValues } from '../src/components/widgets/dragUtils';

test('reorderIds moves an item to the hovered item position without mutating input', () => {
  const original = ['one', 'two', 'three', 'four'];
  const reordered = reorderIds(original, 'one', 'three');
  assert.deepEqual(reordered, ['two', 'three', 'one', 'four']);
  assert.deepEqual(original, ['one', 'two', 'three', 'four']);
});

test('reorderIds supports moving upward and ignores invalid or identical targets', () => {
  assert.deepEqual(reorderIds(['one', 'two', 'three'], 'three', 'one'), [
    'three',
    'one',
    'two',
  ]);
  const original = ['one', 'two', 'three'];
  assert.equal(reorderIds(original, 'missing', 'one'), original);
  assert.equal(reorderIds(original, 'two', 'two'), original);
});

test('swapRecordValues exchanges field assignments without mutating the source record', () => {
  const assignments = {
    catcher: { id: 'catcher-player' },
    first: { id: 'first-player' },
    extra: null,
  };
  const swapped = swapRecordValues(assignments, 'catcher', 'extra');
  assert.deepEqual(swapped, {
    catcher: null,
    first: { id: 'first-player' },
    extra: { id: 'catcher-player' },
  });
  assert.deepEqual(assignments, {
    catcher: { id: 'catcher-player' },
    first: { id: 'first-player' },
    extra: null,
  });
});
