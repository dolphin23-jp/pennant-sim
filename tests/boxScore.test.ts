import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameBoxScore, isNotableGame, toSummary } from '../src/engine/boxScore';
import { accumulateStatsAll, mergeStatMaps } from '../src/engine/stats';
import type { AccumulatedStats, AtBatLogEntry, BatterStats, GameState, Player, Team, TeamKey } from '../src/engine/types';

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

test('mergeStatMapsはbaseのネストしたPlayerStatsを変異させない(同一baseを複数回再利用しても二重加算しない)', () => {
  const seasonStatsSoFar: AccumulatedStats = {
    p1: {
      type: 'bat', name: 'p1', g: 10, pa: 40, ab: 36, h: 10, s: 8, d: 1, t: 0,
      hr: 1, bb: 3, k: 6, rbi: 5, sb: 1, cs: 0, bnt: 0, sf: 0,
    } as BatterStats,
  };
  const frozenBefore = JSON.parse(JSON.stringify(seasonStatsSoFar)) as AccumulatedStats;

  // season.ts の simCpuUntilNext/skipGames と同じ反復パターン:
  // バッチ内の各試合ごとに `mergeStatMaps(seasonStatsSoFar, leagueStats)` を
  // 同じ seasonStatsSoFar 参照へ何度も適用し、leagueStats は試合ごとに成長する。
  let leagueStats: AccumulatedStats = {};
  mergeStatMaps(seasonStatsSoFar, leagueStats); // game1: p1は出場せず

  leagueStats = {
    p1: {
      type: 'bat', name: 'p1', g: 1, pa: 4, ab: 4, h: 1, s: 1, d: 0, t: 0,
      hr: 0, bb: 0, k: 0, rbi: 0, sb: 0, cs: 0, bnt: 0, sf: 0,
    } as BatterStats,
  };
  const snapshotBeforeGame3 = mergeStatMaps(seasonStatsSoFar, leagueStats); // game3直前のスナップショット

  assert.deepEqual(
    seasonStatsSoFar,
    frozenBefore,
    'seasonStatsSoFar(呼び出し元が使い回す通算成績オブジェクト)はmergeStatMaps呼び出し後も変化してはいけない',
  );
  assert.equal((seasonStatsSoFar.p1 as BatterStats).h, 10, 'base自体は元の10安打のまま');
  assert.equal(
    (snapshotBeforeGame3.p1 as BatterStats).h,
    11,
    '戻り値では10安打(既存)+1安打(game2)=11安打に正しく合算される',
  );
});

test('CPU消化バッチで同一選手が複数試合に出場しても、他球団選手の試合後通算成績が二重加算されない', () => {
  const scorer = makeBatter('cpuBatter', 'giants');
  const opposingPitcher = makePitcher('cpuPitcher', 'tigers');
  const unusedHomeStarter = makePitcher('unusedHomeStarter', 'giants');

  function singleHitGame(): GameState {
    const atBatLog: AtBatLogEntry[] = [
      entry({
        inning: 1, isBot: true, batter: 'cpuBatter', batterId: 'cpuBatter', bSide: 'giants',
        pitcher: 'cpuPitcher', pitcherId: 'cpuPitcher', pSide: 'tigers', result: '1B',
        snap: { home: 0, away: 0 },
      }),
    ];
    return {
      // 本塁打者側(home)の投手陣は空にし、この検証に無関係なaway投手線だけを見る。
      teams: { home: makeTeam('giants', [scorer], []), away: makeTeam('tigers', [], [opposingPitcher]) },
      lineups: { home: [scorer], away: [] },
      park: { homeRun: 1, hit: 1 },
      matchupCounts: {},
      score: { home: 0, away: 0 },
      innings: [{ home: 0, away: 0 }],
      atBatLog,
      changes: [],
      curP: { home: unusedHomeStarter, away: opposingPitcher },
      pc: { home: 0, away: 0 },
      batIdx: { home: 0, away: 0 },
      usedR: { home: new Set(), away: new Set([opposingPitcher.id]) },
      starterH: unusedHomeStarter,
      starterA: opposingPitcher,
      winnerPitcherId: null,
      loserPitcherId: null,
      savePitcherId: null,
      holdPitcherIds: [],
      postGameEvents: { awakenings: [], injuries: [] },
    } as unknown as GameState;
  }

  // 呼び出し元(state/gameState.tsx)が current.leagueAccumulated をそのまま
  // seasonStatsSoFar として毎バッチ渡す。この選手は既に9安打を持っているとする。
  const seasonStatsSoFar: AccumulatedStats = {
    cpuBatter: {
      type: 'bat', name: 'cpuBatter', g: 20, pa: 80, ab: 72, h: 9, s: 8, d: 1, t: 0,
      hr: 0, bb: 5, k: 10, rbi: 4, sb: 0, cs: 0, bnt: 0, sf: 0,
    } as BatterStats,
  };

  // season.ts の simCpuUntilNext/skipGames のループを模倣: 同じ選手が
  // バッチ内の3試合(CPU同士、自チームは絡まない)に連続出場する。
  // バグがあると2回目以降のmergeStatMaps呼び出しでseasonStatsSoFarが書き換わり、
  // 3試合目以降の通算成績が加速度的に膨張する。
  let leagueStats: AccumulatedStats = {};
  const beforeGame1 = mergeStatMaps(seasonStatsSoFar, leagueStats);
  const game1 = singleHitGame();
  leagueStats = accumulateStatsAll(game1, leagueStats);
  buildGameBoxScore(game1, 'cpu1', '2026-04-10', 2026, beforeGame1);

  const beforeGame2 = mergeStatMaps(seasonStatsSoFar, leagueStats);
  const game2 = singleHitGame();
  leagueStats = accumulateStatsAll(game2, leagueStats);
  buildGameBoxScore(game2, 'cpu2', '2026-04-11', 2026, beforeGame2);

  const beforeGame3 = mergeStatMaps(seasonStatsSoFar, leagueStats);
  const game3 = singleHitGame();
  leagueStats = accumulateStatsAll(game3, leagueStats);
  const box3 = buildGameBoxScore(game3, 'cpu3', '2026-04-12', 2026, beforeGame3);

  assert.equal(
    (seasonStatsSoFar.cpuBatter as BatterStats).h,
    9,
    'current.leagueAccumulated相当のbaseは3回merge後も変異せず9安打のまま',
  );
  assert.equal(
    (beforeGame3.cpuBatter as BatterStats).h,
    11,
    'game3直前の通算は9(既存)+1(game1)+1(game2)=11安打。バグがあれば12以上に膨張する',
  );

  const line3 = box3.batterLines.find((line) => line.playerId === 'cpuBatter');
  assert.equal(
    line3?.seasonAvgAfter,
    12 / 75,
    '試合結果画面に表示される試合後打率も9+1+1+1=12安打/72+1+1+1=75打数で正しく計算される',
  );
});
