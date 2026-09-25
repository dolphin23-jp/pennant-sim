import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEBUG_POTENTIAL_MAX,
  parseBoundedInt,
  withAptitude,
  withSpecialLevel,
} from '../src/components/widgets/playerEdit';
import {
  assignAllActiveRosters,
  configureRandom,
  initTeams,
  resetRandom,
  specialLevel,
  syncSpecialsFromLevels,
} from '../src/engine';

function aPlayer(pitcher = false) {
  configureRandom(
    () => 0.41,
    () => 1_700_000_000_000,
  );
  try {
    const team = assignAllActiveRosters(initTeams()).giants;
    return pitcher ? team.pitchers[0]! : team.fielders[0]!;
  } finally {
    resetRandom();
  }
}

test('a typed number is clamped only when committed, and junk keeps the stored value', () => {
  assert.equal(parseBoundedInt('25', 15, 50), 25);
  assert.equal(parseBoundedInt(' 2 ', 15, 50), 15, 'a finished "2" is raised to the minimum');
  assert.equal(parseBoundedInt('999', 1, 130), 130);
  assert.equal(parseBoundedInt('', 1, 130), null);
  assert.equal(parseBoundedInt('abc', 1, 130), null);
  assert.equal(DEBUG_POTENTIAL_MAX, 150);
});

test('removing a special ability sticks through the save step', () => {
  const player = withSpecialLevel(aPlayer(), 'avg', 3);
  assert.equal(specialLevel(syncSpecialsFromLevels(player), 'avg'), 3);
  const removed = syncSpecialsFromLevels(withSpecialLevel(player, 'avg', 0));
  assert.equal(specialLevel(removed, 'avg'), 0);
  assert.ok(!(removed.specials ?? []).some((special) => special.id === 'avg'));
});

test('an aptitude set to 0 drops the position, but the primary position stays', () => {
  const player = aPlayer();
  const withCatcher = withAptitude(player, '捕手', 60);
  assert.ok(withCatcher.positions?.some((entry) => entry.pos === '捕手'));
  const without = withAptitude(withCatcher, '捕手', 0);
  assert.ok(!without.positions?.some((entry) => entry.pos === '捕手'));
  const primary = withAptitude(player, player.pos as '捕手', 0);
  assert.equal(primary.positions?.find((entry) => entry.pos === player.pos)?.apt, 1);
});
