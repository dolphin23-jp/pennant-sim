import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBatterStats,
  createPitcherStats,
  initTeams,
  selectSeasonTitles,
  type AccumulatedStats,
} from '../src/engine';

test('season titles enforce rate qualification, preserve ties, and record display values', () => {
  const teams = initTeams();
  const firstBatter = teams.giants.fielders[0];
  const tiedSlugger = teams.tigers.fielders[0];
  const pitcher = teams.giants.pitchers[0];
  const firstStats = {
    ...createBatterStats(firstBatter.name),
    g: 143,
    pa: 520,
    ab: 470,
    h: 160,
    hr: 35,
    rbi: 92,
    sb: 18,
  };
  const tiedStats = {
    ...createBatterStats(tiedSlugger.name),
    g: 143,
    pa: 500,
    ab: 460,
    h: 140,
    hr: 35,
    rbi: 88,
    sb: 12,
  };
  const pitcherStats = {
    ...createPitcherStats(pitcher.name),
    g: 26,
    gs: 26,
    w: 15,
    ip3: 510,
    er: 45,
    k: 175,
    sv: 0,
    hld: 0,
  };
  const accumulated: AccumulatedStats = {
    [firstBatter.id]: firstStats,
    [tiedSlugger.id]: tiedStats,
    [pitcher.id]: pitcherStats,
  };
  const gamesByTeam = Object.fromEntries(Object.keys(teams).map((teamKey) => [teamKey, 143]));

  const titles = selectSeasonTitles(2026, teams, accumulated, gamesByTeam);
  const homeRunTitles = titles.filter(
    (record) => record.league === 'central' && record.titleId === 'homeRuns',
  );

  assert.equal(homeRunTitles.length, 2, '同数首位は両選手をタイトルとして保存する');
  assert.deepEqual(
    homeRunTitles.map((record) => record.playerId).sort(),
    [firstBatter.id, tiedSlugger.id].sort(),
  );
  assert.equal(homeRunTitles[0]?.displayValue, '35');
  assert.equal(
    titles.find((record) => record.league === 'central' && record.titleId === 'battingAverage')
      ?.playerId,
    firstBatter.id,
  );
  assert.equal(
    titles.find((record) => record.league === 'central' && record.titleId === 'earnedRunAverage')
      ?.displayValue,
    '2.38',
  );
});
