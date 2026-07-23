import { advBases, buildDesc, simAB } from './atBat';
import { applyPostGamePlayerEvents } from './playerEvents';
import { clamp, random } from './random';
import { bestLineup, calcOVR, masteryFromAccum, topStarters } from './ratings';
import { hasGold, hasSpecial } from './specials';
import type {
  AccumulatedStats,
  AtBatLogEntry,
  BaseState,
  GameState,
  HalfInningResult,
  Player,
  Side,
  Team,
  TeamKey,
  Teams,
} from './types';
const teamKeyForSide = (gameState: GameState, side: Side): TeamKey => gameState.teams[side].key;
function resolveLineup(team: Team, supplied?: Player[] | null): Player[] {
  if (!supplied?.length) return bestLineup(team);
  const roster = new Map(team.fielders.map((player) => [player.id, player])),
    resolved: Player[] = [];
  for (const player of supplied) {
    const current = roster.get(player.id);
    if (!current || (current.injuryDays ?? 0) > 0) continue;
    resolved.push({ ...current, _assignedPos: player._assignedPos ?? current.pos });
  }
  return resolved.length >= 9 ? resolved.slice(0, 9) : bestLineup(team);
}
export function simHalf(
  gameState: GameState,
  battingSide: Side,
  inning: number,
  accumulatedStats: AccumulatedStats,
): HalfInningResult {
  const fieldingSide: Side = battingSide === 'home' ? 'away' : 'home';
  const catcher = gameState.lineups[battingSide].find(
      (player) => player._assignedPos === '捕手' || player.pos === '捕手',
    ),
    catcherGameCalling = catcher?.p.ld || 50;
  const maybeChangePitcher = (): void => {
    const currentPitcher = gameState.curP[fieldingSide],
      pitchCount = gameState.pc[fieldingSide];
    const maximumPitchCount =
      currentPitcher.role === '先発'
        ? Math.round(66 + currentPitcher.p.stam * 0.3 + (random() * 10 - 5))
        : currentPitcher.role === 'クローザー'
          ? Math.round(20 + currentPitcher.p.stam * 0.2 + (random() * 6 - 3))
          : Math.round(24 + currentPitcher.p.stam * 0.28 + (random() * 8 - 4));
    if (pitchCount < maximumPitchCount) return;
    const available = gameState.teams[fieldingSide].pitchers.filter(
      (p) =>
        p.role !== '先発' &&
        !gameState.usedR[fieldingSide].has(p.id) &&
        (p.injuryDays ?? 0) <= 0 &&
        (p.fatigue || 0) < 95,
    );
    if (!available.length) return;
    const close = Math.abs(gameState.score.home - gameState.score.away) <= 3,
      closers = available.filter((p) => p.role === 'クローザー'),
      relievers = available.filter((p) => p.role === 'リリーフ');
    let nextPitcher: Player;
    if (inning >= 8 && close && closers.length) nextPitcher = closers[0] as Player;
    else if (relievers.length)
      nextPitcher = relievers.sort((a, b) => calcOVR(b) - calcOVR(a))[0] as Player;
    else nextPitcher = available[0] as Player;
    gameState.changes.push({
      inning: inning + 1,
      isBot: battingSide === 'home',
      pitcher: nextPitcher.name,
      side: fieldingSide,
    });
    gameState.curP[fieldingSide] = nextPitcher;
    gameState.usedR[fieldingSide].add(nextPitcher.id);
    gameState.pc[fieldingSide] = 0;
  };
  const atBats: AtBatLogEntry[] = [];
  let outs = 0,
    bases: BaseState = [false, false, false],
    runs = 0;
  while (outs < 3) {
    maybeChangePitcher();
    const pitcher = gameState.curP[fieldingSide];
    if (bases[0] && !bases[1] && outs < 2) {
      const runner = bases[0],
        runnerPlayer = typeof runner === 'object' ? runner : undefined;
      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 50) / 400, 0.01, 0.08);
      if (runnerPlayer && hasSpecial(runnerPlayer, 'sb')) attemptRate *= 1.4;
      if (runnerPlayer && hasGold(runnerPlayer, 'sb_gold')) attemptRate *= 1.6;
      if (random() < attemptRate) {
        const successRate = clamp(
            (0.62 + ((runnerPlayer?.p.sp || 50) - 50) / 280) *
              (runnerPlayer && hasGold(runnerPlayer, 'sb_gold') ? 1.12 : 1),
            0.45,
            0.91,
          ),
          snapshot = {
            home: gameState.score.home + (battingSide === 'home' ? runs : 0),
            away: gameState.score.away + (battingSide === 'away' ? runs : 0),
          },
          runnerName = runnerPlayer?.name as string,
          runnerId = runnerPlayer?.id as string;
        if (random() < successRate) {
          bases = [false, runner, bases[2]];
          atBats.push({
            inning: inning + 1,
            isBot: battingSide === 'home',
            batter: runnerName,
            batterId: runnerId,
            bSide: teamKeyForSide(gameState, battingSide),
            pitcher: pitcher.name,
            pitcherId: pitcher.id,
            pSide: teamKeyForSide(gameState, fieldingSide),
            result: 'SB',
            rbi: 0,
            desc: `${runnerName}、盗塁成功`,
            snap: snapshot,
          });
        } else {
          bases = [false, bases[1], bases[2]];
          outs += 1;
          atBats.push({
            inning: inning + 1,
            isBot: battingSide === 'home',
            batter: runnerName,
            batterId: runnerId,
            bSide: teamKeyForSide(gameState, battingSide),
            pitcher: pitcher.name,
            pitcherId: pitcher.id,
            pSide: teamKeyForSide(gameState, fieldingSide),
            result: 'CS',
            rbi: 0,
            desc: `${runnerName}、盗塁失敗`,
            snap: snapshot,
          });
          if (outs >= 3) break;
        }
      }
    }
    const lineup = gameState.lineups[battingSide],
      batter = lineup[gameState.batIdx[battingSide] % lineup.length] as Player;
    gameState.batIdx[battingSide] += 1;
    const staminaPercentage = clamp(
        100 - (gameState.pc[fieldingSide] / Math.max(1, pitcher.p.stam * 1.5)) * 100,
        20,
        100,
      ),
      isPinch = Boolean(bases[0] || bases[1] || bases[2]) && outs >= 1,
      isLead = outs === 0 && !bases[0] && !bases[1] && !bases[2],
      pitcherMastery = masteryFromAccum(pitcher, accumulatedStats),
      batterMastery = masteryFromAccum(batter, accumulatedStats),
      matchupKey = `${pitcher.id}:${batter.id}`,
      priorMatchups = gameState.matchupCounts[matchupKey] ?? 0;
    const {
      result,
      pc: pitchCount,
      dir: direction,
    } = simAB(
      pitcher,
      batter,
      { pStam: staminaPercentage, isPinch, isLead, outs, bases },
      catcherGameCalling,
      pitcherMastery,
      batterMastery,
      gameState.park,
      priorMatchups,
    );
    gameState.matchupCounts[matchupKey] = priorMatchups + 1;
    gameState.pc[fieldingSide] += pitchCount;
    let runsBattedIn = 0;
    if (result === 'K') outs += 1;
    else if (result === 'GO') {
      const advancement = advBases(bases, result, batter.p.sp || 50, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      outs += 1;
      runs += runsBattedIn;
    } else if (result === 'FO') {
      const advancement = advBases(bases, result, batter.p.sp || 50, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      outs += 1;
      runs += runsBattedIn;
    } else if (result === 'DP') {
      const advancement = advBases(bases, result, batter.p.sp || 50, outs);
      bases = advancement.bases;
      outs += 2;
      if (outs > 3) outs = 3;
    } else {
      const advancement = advBases(bases, result, batter.p.sp || 50, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      runs += runsBattedIn;
    }
    const snapshot = {
      home: gameState.score.home + (battingSide === 'home' ? runs : 0),
      away: gameState.score.away + (battingSide === 'away' ? runs : 0),
    };
    atBats.push({
      inning: inning + 1,
      isBot: battingSide === 'home',
      batter: batter.name,
      batterId: batter.id,
      bSide: teamKeyForSide(gameState, battingSide),
      pitcher: pitcher.name,
      pitcherId: pitcher.id,
      pSide: teamKeyForSide(gameState, fieldingSide),
      result,
      dir: direction,
      pc: pitchCount,
      rbi: runsBattedIn,
      snap: snapshot,
      desc: buildDesc(batter.name, result, direction, runsBattedIn),
    });
    if (battingSide === 'home' && inning >= 8 && snapshot.home > snapshot.away) {
      outs = 3;
      break;
    }
  }
  return { runs, atBats };
}
export function simulateGame(
  homeKey: TeamKey,
  awayKey: TeamKey,
  teams: Teams,
  homeLineup?: Player[] | null,
  awayLineup?: Player[] | null,
  homeStarterIndex = 0,
  awayStarterIndex = 0,
  accumulatedStats: AccumulatedStats = {},
): GameState {
  const homeTeam = teams[homeKey],
    awayTeam = teams[awayKey],
    resolvedHomeLineup = resolveLineup(homeTeam, homeLineup),
    resolvedAwayLineup = resolveLineup(awayTeam, awayLineup),
    homeStarters = topStarters(homeTeam),
    awayStarters = topStarters(awayTeam),
    homeStarter =
      homeStarters[homeStarterIndex % Math.max(1, homeStarters.length)] ||
      homeTeam.pitchers.find((player) => (player.injuryDays ?? 0) <= 0) ||
      homeTeam.pitchers[0],
    awayStarter =
      awayStarters[awayStarterIndex % Math.max(1, awayStarters.length)] ||
      awayTeam.pitchers.find((player) => (player.injuryDays ?? 0) <= 0) ||
      awayTeam.pitchers[0];
  const gameState: GameState = {
    teams: { home: homeTeam, away: awayTeam },
    lineups: { home: resolvedHomeLineup, away: resolvedAwayLineup },
    park: homeTeam.park,
    matchupCounts: {},
    score: { home: 0, away: 0 },
    innings: [],
    atBatLog: [],
    changes: [],
    curP: { home: homeStarter as Player, away: awayStarter as Player },
    pc: { home: 0, away: 0 },
    batIdx: { home: 0, away: 0 },
    usedR: {
      home: new Set([(homeStarter as Player).id]),
      away: new Set([(awayStarter as Player).id]),
    },
    starterH: homeStarter as Player,
    starterA: awayStarter as Player,
    postGameEvents: { awakenings: [], injuries: [] },
  };
  for (let inningIndex = 0; inningIndex < 15; inningIndex += 1) {
    const inningScore = { away: 0, home: 0 },
      awayHalf = simHalf(gameState, 'away', inningIndex, accumulatedStats);
    inningScore.away = awayHalf.runs;
    gameState.score.away += awayHalf.runs;
    gameState.atBatLog.push(...awayHalf.atBats);
    if (inningIndex >= 8 && gameState.score.home > gameState.score.away) {
      gameState.innings.push({ home: inningScore.home, away: inningScore.away });
      break;
    }
    const homeHalf = simHalf(gameState, 'home', inningIndex, accumulatedStats);
    inningScore.home = homeHalf.runs;
    gameState.score.home += homeHalf.runs;
    gameState.atBatLog.push(...homeHalf.atBats);
    gameState.innings.push({ home: inningScore.home, away: inningScore.away });
    if (inningIndex >= 8 && gameState.score.home !== gameState.score.away) break;
  }
  const homeWin = gameState.score.home > gameState.score.away,
    winningSide: Side = homeWin ? 'home' : 'away',
    losingSide: Side = homeWin ? 'away' : 'home';
  const winningStarter =
      gameState.starterH && winningSide === 'home'
        ? gameState.starterH
        : gameState.starterA && winningSide === 'away'
          ? gameState.starterA
          : null,
    battersFaced = winningStarter
      ? gameState.atBatLog.filter(
          (entry) =>
            entry.pitcherId === winningStarter.id &&
            entry.pSide === gameState.teams[winningSide].key,
        ).length
      : 0;
  gameState.winnerPitcherId = battersFaced >= 15 ? winningStarter?.id : null;
  const lead = Math.abs(gameState.score.home - gameState.score.away),
    lastWinningPitcher = [...gameState.atBatLog]
      .reverse()
      .find((entry) => entry.pSide === gameState.teams[winningSide].key),
    lastPitcherId = lastWinningPitcher?.pitcherId;
  gameState.savePitcherId =
    lead >= 1 && lead <= 3 && lastPitcherId && lastPitcherId !== gameState.winnerPitcherId
      ? lastPitcherId
      : null;
  const winningPitchers = new Set(
    gameState.atBatLog
      .filter((entry) => entry.pSide === gameState.teams[winningSide].key)
      .map((entry) => entry.pitcherId),
  );
  gameState.holdPitcherIds = [...winningPitchers].filter(
    (id) =>
      id !== gameState.starterH?.id &&
      id !== gameState.starterA?.id &&
      id !== gameState.savePitcherId &&
      id !== gameState.winnerPitcherId,
  );
  const losingRuns: Record<string, number> = {};
  for (const entry of gameState.atBatLog)
    if (entry.pSide === gameState.teams[losingSide].key && entry.rbi > 0)
      losingRuns[entry.pitcherId] = (losingRuns[entry.pitcherId] || 0) + entry.rbi;
  gameState.loserPitcherId = Object.entries(losingRuns).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const participantIds = (side: Side): Set<string> => {
      const teamKey = gameState.teams[side].key,
        ids = new Set<string>();
      for (const entry of gameState.atBatLog) {
        if (entry.bSide === teamKey) ids.add(entry.batterId);
        if (entry.pSide === teamKey) ids.add(entry.pitcherId);
      }
      return ids;
    },
    homePostGame = applyPostGamePlayerEvents(homeTeam, participantIds('home')),
    awayPostGame = applyPostGamePlayerEvents(awayTeam, participantIds('away'));
  gameState.teams = { home: homePostGame.team, away: awayPostGame.team };
  gameState.postGameEvents = {
    awakenings: [...homePostGame.events.awakenings, ...awayPostGame.events.awakenings],
    injuries: [...homePostGame.events.injuries, ...awayPostGame.events.injuries],
  };
  // Deliberately persist post-game roster state for every caller, including CPU skips and diagnostics.
  teams[homeKey] = homePostGame.team;
  teams[awayKey] = awayPostGame.team;
  return gameState;
}
