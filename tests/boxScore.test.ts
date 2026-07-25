import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameBoxScore, isNotableGame, toSummary } from '../src/engine/boxScore';
import type { AtBatLogEntry, GameState, Player, Team, TeamKey } from '../src/engine/types';

function makeBatter(id: string, teamKey: TeamKey): Player {
  return {
    id,
    name: id,
    age: 27,
    tk: teamKey,
    isP: false,
    pos: '中堅手',
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: { cf: 50, cb: 50, pw: 50, dc: 50, sp: 50, stam: 80 },
    pot: {},
    trainPolicy: 'balanced',
  };
}

function makePitcher(id: string, teamKey: TeamKey): Player {
  return {
    id,
    name: id,
    age: 27,
    tk: teamKey,
    isP: true,
    role: '先発',
    mat: '通常',
    hand: { th: '右' },
    p: { vel: 50, ctrl: 50, stam: 80, nobi: 50, pitches: [] },
    pot: {},
    trainPolicy: 'balanced',
  };
}

function makeTeam(key: TeamKey, fielders: Player[], pitchers: Player[]): Team {
  return {
    key,
    n: key,
    ab: key,
    lg: 'central',
    c: '#000000',
    bd: 70,
    park: { homeRun: 1, hit: 1 },
    pol: { fa: 0, for: 0, pitF: 0, pwrF: 0, dev: 0 },
    fielders,
    pitchers,
    rotSize: 6,
  };
}

function entry(partial: Partial<AtBatLogEntry> & Pick<AtBatLogEntry, 'inning' | 'isBot'>): AtBatLogEntry {
  return {
    batter: '',
    batterId: '',
    bSide: 'giants',
    pitcher: '',
    pitcherId: '',
    pSide: 'tigers',
    result: 'K',
    rbi: 0,
    desc: '',
    snap: { home: 0, away: 0 },
    scoredIds: [],
    ...partial,
  };
}

test('打者・投手成績がatBatLogの集計と一致し、得点合計がチーム得点と一致する', () => {
  const aB1 = makeBatter('aB1', 'tigers');
  const aB2 = makeBatter('aB2', 'tigers');
  const aP = makePitcher('aP', 'tigers');
  const hB1 = makeBatter('hB1', 'giants');
  const hB2 = makeBatter('hB2', 'giants');
  const hP = makePitcher('hP', 'giants');

  const atBatLog: AtBatLogEntry[] = [
    entry({
      inning: 1,
      isBot: false,
      batter: 'aB1',
      batterId: 'aB1',
      bSide: 'tigers',
      pitcher: 'hP',
      pitcherId: 'hP',
      pSide: 'giants',
      result: 'HR',
      rbi: 1,
      scoredIds: ['aB1'],
      snap: { home: 0, away: 1 },
    }),
    entry({
      inning: 1,
      isBot: false,
      batter: 'aB2',
      batterId: 'aB2',
      bSide: 'tigers',
      pitcher: 'hP',
      pitcherId: 'hP',
      pSide: 'giants',
      result: 'K',
      snap: { home: 0, away: 1 },
    }),
    entry({
      inning: 1,
      isBot: true,
      batter: 'hB1',
      batterId: 'hB1',
      bSide: 'giants',
      pitcher: 'aP',
      pitcherId: 'aP',
      pSide: 'tigers',
      result: '1B',
      snap: { home: 0, away: 1 },
    }),
    entry({
      inning: 1,
      isBot: true,
      batter: 'hB2',
      batterId: 'hB2',
      bSide: 'giants',
      pitcher: 'aP',
      pitcherId: 'aP',
      pSide: 'tigers',
      result: 'HR',
      rbi: 2,
      scoredIds: ['hB1', 'hB2'],
      snap: { home: 2, away: 1 },
    }),
    entry({
      inning: 1,
      isBot: true,
      batter: 'hB1',
      batterId: 'hB1',
      bSide: 'giants',
      pitcher: 'aP',
      pitcherId: 'aP',
      pSide: 'tigers',
      result: 'K',
      snap: { home: 2, away: 1 },
    }),
  ];

  const gameState = {
    teams: { home: makeTeam('giants', [hB1, hB2], [hP]), away: makeTeam('tigers', [aB1, aB2], [aP]) },
    lineups: { home: [hB1, hB2], away: [aB1, aB2] },
    park: { homeRun: 1, hit: 1 },
    matchupCounts: {},
    score: { home: 2, away: 1 },
    innings: [{ home: 2, away: 1 }],
    atBatLog,
    changes: [],
    curP: { home: hP, away: aP },
    pc: { home: 0, away: 0 },
    batIdx: { home: 0, away: 0 },
    usedR: { home: new Set([hP.id]), away: new Set([aP.id]) },
    starterH: hP,
    starterA: aP,
    winnerPitcherId: 'hP',
    loserPitcherId: 'aP',
    savePitcherId: null,
    holdPitcherIds: [],
    postGameEvents: { awakenings: [], injuries: [] },
  } as unknown as GameState;

  const box = buildGameBoxScore(gameState, 'g1', '2026-04-01', 2026, {});

  assert.equal(box.homeScore, 2);
  assert.equal(box.awayScore, 1);

  const findBatter = (id: string) => box.batterLines.find((line) => line.playerId === id);
  const aB1Line = findBatter('aB1');
  assert.equal(aB1Line?.ab, 1);
  assert.equal(aB1Line?.h, 1);
  assert.equal(aB1Line?.hr, 1);
  assert.equal(aB1Line?.rbi, 1);
  assert.equal(aB1Line?.r, 1);

  const hB1Line = findBatter('hB1');
  assert.equal(hB1Line?.ab, 2);
  assert.equal(hB1Line?.h, 1);
  assert.equal(hB1Line?.r, 1, 'hB1 scored via hB2の本塁打のscoredIds経由');
  assert.equal(hB1Line?.k, 1);

  const hB2Line = findBatter('hB2');
  assert.equal(hB2Line?.hr, 1);
  assert.equal(hB2Line?.rbi, 2);
  assert.equal(hB2Line?.r, 1);

  const homeRunsSum = box.batterLines
    .filter((line) => line.teamKey === 'giants')
    .reduce((sum, line) => sum + line.r, 0);
  const awayRunsSum = box.batterLines
    .filter((line) => line.teamKey === 'tigers')
    .reduce((sum, line) => sum + line.r, 0);
  assert.equal(homeRunsSum, box.homeScore);
  assert.equal(awayRunsSum, box.awayScore);

  const hPLine = box.pitcherLines.find((line) => line.playerId === 'hP');
  const aPLine = box.pitcherLines.find((line) => line.playerId === 'aP');
  assert.equal(hPLine?.decision, 'W');
  assert.equal(hPLine?.r, 1);
  assert.equal(aPLine?.decision, 'L');
  assert.equal(aPLine?.r, 2);

  assert.equal(box.decisions.winnerText, '勝：hP（1勝0敗、防御率27.00）');
  assert.equal(box.decisions.loserText, '敗：aP（0勝1敗、防御率54.00）');
});

test('猛打賞・大差勝利の注目記録を検出する', () => {
  const aB1 = makeBatter('aB1', 'tigers');
  const aP = makePitcher('aP', 'tigers');
  const hB1 = makeBatter('hB1', 'giants');
  const hP = makePitcher('hP', 'giants');

  const atBatLog: AtBatLogEntry[] = [
    entry({ inning: 1, isBot: true, batter: 'hB1', batterId: 'hB1', bSide: 'giants', pitcher: 'aP', pitcherId: 'aP', pSide: 'tigers', result: '1B', snap: { home: 0, away: 0 } }),
    entry({ inning: 2, isBot: true, batter: 'hB1', batterId: 'hB1', bSide: 'giants', pitcher: 'aP', pitcherId: 'aP', pSide: 'tigers', result: '2B', snap: { home: 0, away: 0 } }),
    entry({ inning: 3, isBot: true, batter: 'hB1', batterId: 'hB1', bSide: 'giants', pitcher: 'aP', pitcherId: 'aP', pSide: 'tigers', result: '1B', snap: { home: 0, away: 0 } }),
    entry({ inning: 4, isBot: true, batter: 'hB1', batterId: 'hB1', bSide: 'giants', pitcher: 'aP', pitcherId: 'aP', pSide: 'tigers', result: '1B', snap: { home: 0, away: 0 } }),
    entry({ inning: 5, isBot: false, batter: 'aB1', batterId: 'aB1', bSide: 'tigers', pitcher: 'hP', pitcherId: 'hP', pSide: 'giants', result: 'K', snap: { home: 0, away: 0 } }),
  ];

  const gameState = {
    teams: { home: makeTeam('giants', [hB1], [hP]), away: makeTeam('tigers', [aB1], [aP]) },
    lineups: { home: [hB1], away: [aB1] },
    park: { homeRun: 1, hit: 1 },
    matchupCounts: {},
    score: { home: 9, away: 0 },
    innings: [{ home: 9, away: 0 }],
    atBatLog,
    changes: [],
    curP: { home: hP, away: aP },
    pc: { home: 0, away: 0 },
    batIdx: { home: 0, away: 0 },
    usedR: { home: new Set([hP.id]), away: new Set([aP.id]) },
    starterH: hP,
    starterA: aP,
    winnerPitcherId: 'hP',
    loserPitcherId: 'aP',
    savePitcherId: null,
    holdPitcherIds: [],
    postGameEvents: { awakenings: [], injuries: [] },
  } as unknown as GameState;

  const box = buildGameBoxScore(gameState, 'g2', '2026-04-02', 2026, {});

  assert.ok(box.notableEvents.some((eventItem) => eventItem.type === 'bigGame' && eventItem.playerId === 'hB1'));
  assert.ok(box.notableEvents.some((eventItem) => eventItem.type === 'blowout'));
  assert.equal(isNotableGame(box), true);
});

test('9回裏で決着した場合のみサヨナラと判定し、9回裏を行わなかった場合はイニングをnullにする', () => {
  const aB1 = makeBatter('aB1', 'tigers');
  const aP = makePitcher('aP', 'tigers');
  const hB1 = makeBatter('hB1', 'giants');
  const hP = makePitcher('hP', 'giants');

  const walkoffLog: AtBatLogEntry[] = [
    entry({ inning: 9, isBot: false, batter: 'aB1', batterId: 'aB1', bSide: 'tigers', pitcher: 'hP', pitcherId: 'hP', pSide: 'giants', result: 'K', snap: { home: 0, away: 0 } }),
    entry({ inning: 9, isBot: true, batter: 'hB1', batterId: 'hB1', bSide: 'giants', pitcher: 'aP', pitcherId: 'aP', pSide: 'tigers', result: 'HR', rbi: 1, scoredIds: ['hB1'], snap: { home: 1, away: 0 } }),
  ];
  const innings = Array.from({ length: 9 }, () => ({ home: 0, away: 0 }));
  innings[8] = { home: 1, away: 0 };

  const walkoffGame = {
    teams: { home: makeTeam('giants', [hB1], [hP]), away: makeTeam('tigers', [aB1], [aP]) },
    lineups: { home: [hB1], away: [aB1] },
    park: { homeRun: 1, hit: 1 },
    matchupCounts: {},
    score: { home: 1, away: 0 },
    innings,
    atBatLog: walkoffLog,
    changes: [],
    curP: { home: hP, away: aP },
    pc: { home: 0, away: 0 },
    batIdx: { home: 0, away: 0 },
    usedR: { home: new Set([hP.id]), away: new Set([aP.id]) },
    starterH: hP,
    starterA: aP,
    winnerPitcherId: 'hP',
    loserPitcherId: 'aP',
    savePitcherId: null,
    holdPitcherIds: [],
    postGameEvents: { awakenings: [], injuries: [] },
  } as unknown as GameState;

  const walkoffBox = buildGameBoxScore(walkoffGame, 'g3', '2026-04-03', 2026, {});
  assert.equal(walkoffBox.walkoff, true);
  assert.ok(walkoffBox.notableEvents.some((eventItem) => eventItem.type === 'walkoffHr'));
  assert.equal(walkoffBox.innings[8]?.home, 1);

  const noBottomLog: AtBatLogEntry[] = [
    entry({ inning: 9, isBot: false, batter: 'aB1', batterId: 'aB1', bSide: 'tigers', pitcher: 'hP', pitcherId: 'hP', pSide: 'giants', result: 'K', snap: { home: 3, away: 0 } }),
  ];
  const noBottomInnings = Array.from({ length: 9 }, () => ({ home: 0, away: 0 }));
  noBottomInnings[8] = { home: 0, away: 0 };

  const noBottomGame = {
    ...walkoffGame,
    score: { home: 3, away: 0 },
    innings: noBottomInnings,
    atBatLog: noBottomLog,
  } as unknown as GameState;

  const noBottomBox = buildGameBoxScore(noBottomGame, 'g4', '2026-04-04', 2026, {});
  assert.equal(noBottomBox.innings[8]?.home, null, '9回裏の出場記録が無いのでnullとして表現する');
  assert.equal(noBottomBox.walkoff, false);
});

test('toSummaryは打者・投手成績と注目記録を除きhasBoxScoreをfalseにする', () => {
  const hB1 = makeBatter('hB1', 'giants');
  const hP = makePitcher('hP', 'giants');
  const aB1 = makeBatter('aB1', 'tigers');
  const aP = makePitcher('aP', 'tigers');
  const atBatLog: AtBatLogEntry[] = [
    entry({ inning: 1, isBot: false, batter: 'aB1', batterId: 'aB1', bSide: 'tigers', pitcher: 'hP', pitcherId: 'hP', pSide: 'giants', result: '1B', snap: { home: 0, away: 0 } }),
    entry({ inning: 1, isBot: true, batter: 'hB1', batterId: 'hB1', bSide: 'giants', pitcher: 'aP', pitcherId: 'aP', pSide: 'tigers', result: '2B', rbi: 1, scoredIds: [], snap: { home: 1, away: 0 } }),
  ];
  const gameState = {
    teams: { home: makeTeam('giants', [hB1], [hP]), away: makeTeam('tigers', [aB1], [aP]) },
    lineups: { home: [hB1], away: [aB1] },
    park: { homeRun: 1, hit: 1 },
    matchupCounts: {},
    score: { home: 1, away: 0 },
    innings: [{ home: 1, away: 0 }],
    atBatLog,
    changes: [],
    curP: { home: hP, away: aP },
    pc: { home: 0, away: 0 },
    batIdx: { home: 0, away: 0 },
    usedR: { home: new Set([hP.id]), away: new Set([aP.id]) },
    starterH: hP,
    starterA: aP,
    winnerPitcherId: 'hP',
    loserPitcherId: 'aP',
    savePitcherId: null,
    holdPitcherIds: [],
    postGameEvents: { awakenings: [], injuries: [] },
  } as unknown as GameState;

  const box = buildGameBoxScore(gameState, 'g5', '2026-04-05', 2026, {});
  const summary = toSummary(box);
  assert.equal(summary.hasBoxScore, false);
  assert.equal('batterLines' in summary, false);
  assert.equal(summary.gameId, 'g5');
  assert.equal(
    isNotableGame(box),
    true,
    '完封(1-0)なのでshutoutTeamが立ちnotableと判定される',
  );
});
