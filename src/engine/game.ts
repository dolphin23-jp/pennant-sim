import { AT_BAT_BALANCE, FOREIGN_PLAYER_BALANCE, PITCHER_USAGE_BALANCE } from '../data';
import { advBases, buildDesc, simAB } from './atBat';
import { isForeignPlayer } from './foreign';
import { applyPostGamePlayerEvents } from './playerEvents';
import {
  resolveStarterRotation,
  selectCloserByPriority,
  type PitcherPlanInput,
} from './pitcherPlan';
import {
  applyPitcherWorkloads,
  bullpenSelectionScore,
  isPitcherSelectable,
  prepareTeamPitchersForGame,
} from './pitcherUsage';
import { clamp, random, randomChoice, randomInt } from './random';
import { bestLineup, masteryFromAccum } from './ratings';
import { hasGold, hasSpecial, specialLevel } from './specials';
import type {
  AccumulatedStats,
  AtBatLogEntry,
  BaseState,
  GameState,
  HalfInningResult,
  PlateAppearanceResult,
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
  const selected = resolved.slice(0, 9);
  return resolved.length >= 9 &&
    selected.filter(isForeignPlayer).length <= FOREIGN_PLAYER_BALANCE.simultaneousHitterLimit
    ? selected
    : bestLineup(team);
}
// A sacrifice bunt is only laid down in the textbook spot: nobody out, a runner to move
// into scoring position, and third not already occupied. Weak-hitting, bunt-capable
// batters attempt it most often.
function attemptsSacrificeBunt(batter: Player, bases: BaseState, outs: number): boolean {
  if (outs !== 0 || bases[2] || (!bases[0] && !bases[1])) return false;
  const sacrifice = AT_BAT_BALANCE.sacrificeBunt,
    buntRating = batter.p.bnt ?? 50,
    power = batter.p.pw ?? 50,
    level = specialLevel(batter, 'bnt'),
    attemptRate = clamp(
      Math.max(0, buntRating - sacrifice.minimumBuntRating) / sacrifice.attemptRatingScale +
        level * sacrifice.attemptPerSpecialLevel +
        (power < sacrifice.weakHitterPowerThreshold ? sacrifice.weakHitterAttemptBonus : 0),
      0,
      sacrifice.maximumAttemptRate,
    );
  if (random() >= attemptRate) return false;
  const successRate = clamp(
    sacrifice.baseSuccessRate +
      (buntRating - 50) / sacrifice.successRatingScale +
      level * sacrifice.successPerSpecialLevel,
    sacrifice.minimumSuccessRate,
    sacrifice.maximumSuccessRate,
  );
  return random() < successRate;
}

export function simHalf(
  gameState: GameState,
  battingSide: Side,
  inning: number,
  accumulatedStats: AccumulatedStats,
  closerPriority: string[] = [],
): HalfInningResult {
  const fieldingSide: Side = battingSide === 'home' ? 'away' : 'home';
  const catcher = gameState.lineups[fieldingSide].find(
      (player) => player._assignedPos === '捕手' || player.pos === '捕手',
    ),
    catcherGameCalling = catcher?.p.ld || 50;
  const maybeChangePitcher = (): void => {
    const currentPitcher = gameState.curP[fieldingSide],
      pitchCount = gameState.pc[fieldingSide],
      pitchBalance = PITCHER_USAGE_BALANCE.pitchCount,
      gameStarter = fieldingSide === 'home' ? gameState.starterH : gameState.starterA,
      isStartingPitcher = currentPitcher.id === gameStarter.id;
    const maximumPitchCount = isStartingPitcher
      ? Math.round(
          pitchBalance.starterBase +
            currentPitcher.p.stam * pitchBalance.starterStaminaShare +
            (random() * pitchBalance.starterVariation - pitchBalance.starterVariation / 2),
        )
      : currentPitcher.role === 'クローザー'
        ? Math.round(
            pitchBalance.closerBase +
              currentPitcher.p.stam * pitchBalance.closerStaminaShare +
              (random() * pitchBalance.closerVariation - pitchBalance.closerVariation / 2),
          )
        : Math.round(
            pitchBalance.relieverBase +
              currentPitcher.p.stam * pitchBalance.relieverStaminaShare +
              (random() * pitchBalance.relieverVariation - pitchBalance.relieverVariation / 2),
          );
    if (pitchCount < maximumPitchCount) return;
    const bullpen = gameState.teams[fieldingSide].pitchers.filter(
      (p) =>
        p.role !== '先発' && !gameState.usedR[fieldingSide].has(p.id) && (p.injuryDays ?? 0) <= 0,
    );
    const rested = bullpen.filter((pitcher) => isPitcherSelectable(pitcher));
    const available =
      rested.length > 0 ? rested : bullpen.filter((pitcher) => isPitcherSelectable(pitcher, true));
    if (!available.length) return;
    const close = Math.abs(gameState.score.home - gameState.score.away) <= 3,
      closers = available.filter((p) => p.role === 'クローザー'),
      relievers = available.filter((p) => p.role === 'リリーフ');
    let nextPitcher: Player;
    if (inning >= 8 && close && closers.length)
      nextPitcher = selectCloserByPriority(closers, closerPriority) as Player;
    else if (relievers.length)
      nextPitcher = relievers.sort(
        (a, b) => bullpenSelectionScore(b) - bullpenSelectionScore(a),
      )[0] as Player;
    else
      nextPitcher = available.sort(
        (a, b) => bullpenSelectionScore(b) - bullpenSelectionScore(a),
      )[0] as Player;
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
      if (runnerPlayer) {
        let attemptRate = clamp((((runnerPlayer.p.sp ?? 50) - 30) / 260) * 0.55, 0.01, 0.13);
        if (hasSpecial(runnerPlayer, 'sb')) attemptRate *= 1.4;
        if (hasGold(runnerPlayer, 'sb_gold')) attemptRate *= 1.6;
        if (random() < attemptRate) {
          const catcherArm = catcher?.p.arm ?? 50,
            pitcherControl = pitcher.p.ctrl ?? 50,
            defensePenalty = (catcherArm - 50) / 420 + (pitcherControl - 50) / 900,
            successRate = clamp(
              (0.62 + ((runnerPlayer.p.sp ?? 50) - 50) / 280 - defensePenalty) *
                (hasGold(runnerPlayer, 'sb_gold') ? 1.12 : 1),
              0.4,
              0.92,
            ),
            snapshot = {
              home: gameState.score.home + (battingSide === 'home' ? runs : 0),
              away: gameState.score.away + (battingSide === 'away' ? runs : 0),
            };
          if (random() < successRate) {
            bases = [false, runnerPlayer, bases[2]];
            atBats.push({
              inning: inning + 1,
              isBot: battingSide === 'home',
              batter: runnerPlayer.name,
              batterId: runnerPlayer.id,
              bSide: teamKeyForSide(gameState, battingSide),
              pitcher: pitcher.name,
              pitcherId: pitcher.id,
              pSide: teamKeyForSide(gameState, fieldingSide),
              result: 'SB',
              rbi: 0,
              desc: `${runnerPlayer.name}、盗塁成功`,
              snap: snapshot,
            });
          } else {
            bases = [false, bases[1], bases[2]];
            outs += 1;
            atBats.push({
              inning: inning + 1,
              isBot: battingSide === 'home',
              batter: runnerPlayer.name,
              batterId: runnerPlayer.id,
              bSide: teamKeyForSide(gameState, battingSide),
              pitcher: pitcher.name,
              pitcherId: pitcher.id,
              pSide: teamKeyForSide(gameState, fieldingSide),
              result: 'CS',
              rbi: 0,
              desc: `${runnerPlayer.name}、盗塁失敗`,
              snap: snapshot,
            });
            if (outs >= 3) break;
          }
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
      // A pinch is a runner in scoring position — second or third — regardless of outs.
      isPinch = Boolean(bases[1] || bases[2]),
      isLead = outs === 0 && !bases[0] && !bases[1] && !bases[2],
      pitcherMastery = masteryFromAccum(pitcher, accumulatedStats),
      batterMastery = masteryFromAccum(batter, accumulatedStats),
      matchupKey = `${pitcher.id}:${batter.id}`,
      priorMatchups = gameState.matchupCounts[matchupKey] ?? 0;
    let result: PlateAppearanceResult, pitchCount: number, direction: string | null;
    if (attemptsSacrificeBunt(batter, bases, outs)) {
      result = 'SH';
      pitchCount = randomInt(1, 4);
      direction = randomChoice(['投犠', '一犠', '三犠']);
    } else {
      const outcome = simAB(
        pitcher,
        batter,
        { pStam: staminaPercentage, isPinch, isLead, outs, bases },
        catcherGameCalling,
        pitcherMastery,
        batterMastery,
        gameState.park,
        priorMatchups,
      );
      result = outcome.result;
      pitchCount = outcome.pc;
      direction = outcome.dir;
    }
    gameState.matchupCounts[matchupKey] = priorMatchups + 1;
    gameState.pc[fieldingSide] += pitchCount;
    let officialResult = result;
    let runsBattedIn = 0;
    let scoredIds: string[] = [];
    if (result === 'K') outs += 1;
    else if (result === 'GO' || result === 'SH') {
      const advancement = advBases(bases, result, batter, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      scoredIds = advancement.scorers.map((player) => player.id);
      outs += 1;
      runs += runsBattedIn;
    } else if (result === 'FO') {
      const advancement = advBases(bases, result, batter, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      scoredIds = advancement.scorers.map((player) => player.id);
      // A fly out that brings a runner home from third is officially a sacrifice fly,
      // which is a plate appearance but not an at-bat.
      if (runsBattedIn > 0) {
        officialResult = 'SF';
        direction = direction ? direction.replace('飛', '犠飛') : '犠飛';
      }
      outs += 1;
      runs += runsBattedIn;
    } else if (result === 'DP') {
      const advancement = advBases(bases, result, batter, outs);
      bases = advancement.bases;
      outs += 2;
      if (outs > 3) outs = 3;
    } else {
      const advancement = advBases(bases, result, batter, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      scoredIds = advancement.scorers.map((player) => player.id);
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
      result: officialResult,
      dir: direction,
      pc: pitchCount,
      rbi: runsBattedIn,
      snap: snapshot,
      scoredIds,
      desc: buildDesc(batter.name, officialResult, direction, runsBattedIn),
    });
    if (battingSide === 'home' && inning >= 8 && snapshot.home > snapshot.away) {
      outs = 3;
      break;
    }
  }
  return { runs, atBats };
}
// Post-game bookkeeping shared by decided and drawn games: development events, pitcher
// workload, and writing the resulting rosters back for the caller.
function finalizeGame(
  gameState: GameState,
  teams: Teams,
  homeKey: TeamKey,
  awayKey: TeamKey,
  gameDate?: string,
): GameState {
  const participantIds = (side: Side): Set<string> => {
      const teamKey = gameState.teams[side].key,
        ids = new Set<string>();
      for (const entry of gameState.atBatLog) {
        if (entry.bSide === teamKey) ids.add(entry.batterId);
        if (entry.pSide === teamKey) ids.add(entry.pitcherId);
      }
      return ids;
    },
    homePostGame = applyPostGamePlayerEvents(gameState.teams.home, participantIds('home')),
    awayPostGame = applyPostGamePlayerEvents(gameState.teams.away, participantIds('away')),
    homeAfterWorkload = applyPitcherWorkloads(
      homePostGame.team,
      gameState.atBatLog,
      gameDate,
      gameState.starterH.id,
    ),
    awayAfterWorkload = applyPitcherWorkloads(
      awayPostGame.team,
      gameState.atBatLog,
      gameDate,
      gameState.starterA.id,
    );
  gameState.teams = { home: homeAfterWorkload, away: awayAfterWorkload };
  gameState.postGameEvents = {
    awakenings: [...homePostGame.events.awakenings, ...awayPostGame.events.awakenings],
    injuries: [...homePostGame.events.injuries, ...awayPostGame.events.injuries],
  };
  // Deliberately persist post-game roster state for every caller, including CPU skips and diagnostics.
  teams[homeKey] = homeAfterWorkload;
  teams[awayKey] = awayAfterWorkload;
  return gameState;
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
  homePitcherPlan?: PitcherPlanInput | null,
  awayPitcherPlan?: PitcherPlanInput | null,
  gameDate?: string,
): GameState {
  const homeTeam = prepareTeamPitchersForGame(teams[homeKey], gameDate),
    awayTeam = prepareTeamPitchersForGame(teams[awayKey], gameDate),
    resolvedHomeLineup = resolveLineup(homeTeam, homeLineup),
    resolvedAwayLineup = resolveLineup(awayTeam, awayLineup),
    homeStarters = resolveStarterRotation(homeTeam, homePitcherPlan?.rotationOrder ?? []),
    awayStarters = resolveStarterRotation(awayTeam, awayPitcherPlan?.rotationOrder ?? []),
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
      awayHalf = simHalf(
        gameState,
        'away',
        inningIndex,
        accumulatedStats,
        homePitcherPlan?.closerPriority ?? [],
      );
    inningScore.away = awayHalf.runs;
    gameState.score.away += awayHalf.runs;
    gameState.atBatLog.push(...awayHalf.atBats);
    if (inningIndex >= 8 && gameState.score.home > gameState.score.away) {
      gameState.innings.push({ home: inningScore.home, away: inningScore.away });
      break;
    }
    const homeHalf = simHalf(
      gameState,
      'home',
      inningIndex,
      accumulatedStats,
      awayPitcherPlan?.closerPriority ?? [],
    );
    inningScore.home = homeHalf.runs;
    gameState.score.home += homeHalf.runs;
    gameState.atBatLog.push(...homeHalf.atBats);
    gameState.innings.push({ home: inningScore.home, away: inningScore.away });
    if (inningIndex >= 8 && gameState.score.home !== gameState.score.away) break;
  }
  // A drawn game has no winning or losing pitcher and no save, so skip the whole
  // decision block rather than treating the away side as the nominal winner.
  if (gameState.score.home === gameState.score.away) {
    gameState.winnerPitcherId = null;
    gameState.loserPitcherId = null;
    gameState.savePitcherId = null;
    gameState.holdPitcherIds = [];
    return finalizeGame(gameState, teams, homeKey, awayKey, gameDate);
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
  return finalizeGame(gameState, teams, homeKey, awayKey, gameDate);
}
