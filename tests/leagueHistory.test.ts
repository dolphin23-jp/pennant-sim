import assert from 'node:assert/strict';
import test from 'node:test';

import { createFictionalLeagueHistory } from '../src/engine/leagueHistory';
import { initTeams } from '../src/engine/players';


test('fictional history is deterministic for the same teams and seed', () => {
  const teams = initTeams();
  const first = createFictionalLeagueHistory(teams, {
    endYear: 2025,
    seasons: 20,
    seed: 2026,
    legendsPerTeam: 2,
  });
  const second = createFictionalLeagueHistory(teams, {
    endYear: 2025,
    seasons: 20,
    seed: 2026,
    legendsPerTeam: 2,
  });

  assert.deepEqual(first.yearlyStats, second.yearlyStats);
  assert.deepEqual(first.championHistory, second.championHistory);
  assert.deepEqual(first.retiredPlayers, second.retiredPlayers);
});

test('new league history contains active careers, legends, and twenty champions', () => {
  const teams = initTeams();
  const history = createFictionalLeagueHistory(teams, {
    endYear: 2025,
    seasons: 20,
    seed: 77,
    legendsPerTeam: 2,
  });
  const activePlayers = Object.values(history.teams)
    .flatMap((team) => [...team.fielders, ...team.pitchers]);
  const records = Object.values(history.yearlyStats).flat();

  assert.equal(history.championHistory.length, 20);
  assert.equal(history.championHistory[0]?.year, 2006);
  assert.equal(history.championHistory.at(-1)?.year, 2025);
  assert.equal(history.retiredPlayers.length, 24);
  assert.ok(records.some((record) => activePlayers.some((player) => player.id === record.playerId)));
  assert.ok(records.some((record) => history.retiredPlayers.some((player) => player.id === record.playerId)));
  assert.ok(activePlayers.some((player) => Number(player.proYears ?? 0) > 0));
});

test('generated records stay bounded to the requested historical window', () => {
  const history = createFictionalLeagueHistory(initTeams(), {
    endYear: 2025,
    seasons: 8,
    seed: 9,
    legendsPerTeam: 1,
  });
  const years = Object.values(history.yearlyStats).flat().map((record) => record.year);

  assert.ok(years.length > 0);
  assert.ok(Math.min(...years) >= 2018);
  assert.ok(Math.max(...years) <= 2025);
  assert.equal(history.championHistory.length, 8);
});
