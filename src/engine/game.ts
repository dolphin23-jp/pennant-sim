import { AT_BAT_BALANCE, FOREIGN_PLAYER_BALANCE, PITCHER_USAGE_BALANCE } from '../data';
import {
  sacrificeBuntAttemptRate,
  sacrificeBuntSuccessRate,
  stealAttemptRate,
  stealSuccessRate,
  stealThirdAttemptRate,
  stealThirdSuccessRate,
  strategicBestLineup,
  strategicPitcherOrder,
  strategicPitcherPlan,
  teamStrategyFor,
  type TeamStrategy,
} from './aiStrategy';
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
import { specialLevel } from './specials';
import type {
  AccumulatedStats,
  AtBatLogEntry,
  BaseState,
  BattedBallType,
  GameState,
  HalfInningResult,
  ManagementDecision,
  PlateAppearanceResult,
  Player,
  ScoredRun,
  Score,
  Side,
  Team,
  TeamKey,
  Teams,
} from './types';
const teamKeyForSide = (gameState: GameState, side: Side): TeamKey => gameState.teams[side].key;
function resolveLineup(team: Team, supplied?: Player[] | null): Player[] {
  if (supplied === null || supplied === undefined) return strategicBestLineup(team).lineup;
  if (!supplied.length) return bestLineup(team);
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
interface HalfInningManagement {
  battingStrategy: TeamStrategy;
  fieldingStrategy: TeamStrategy;
  closerPriority: string[];
  bullpenPriority: string[];
}

function orderByPriority(
  players: Player[],
  priority: string[],
  fallback: Map<string, number>,
): Player[] {
  const priorityIndex = new Map(priority.map((playerId, index) => [playerId, index]));
  return [...players].sort((first, second) => {
    const firstIndex = priorityIndex.get(first.id);
    const secondIndex = priorityIndex.get(second.id);
    if (firstIndex !== undefined || secondIndex !== undefined)
      return (firstIndex ?? Number.MAX_SAFE_INTEGER) - (secondIndex ?? Number.MAX_SAFE_INTEGER);
    return (
      (fallback.get(second.id) ?? bullpenSelectionScore(second)) -
      (fallback.get(first.id) ?? bullpenSelectionScore(first))
    );
  });
}

/** Start a new outing record for a pitcher taking the mound. */
function openAppearance(
  gameState: GameState,
  side: Side,
  pitcher: Player,
  inning: number,
  enteredOuts: number,
  enteredRunners: number,
): void {
  (gameState.appearances ??= []).push({
    pitcherId: pitcher.id,
    side,
    isStarter: pitcher.id === (side === 'home' ? gameState.starterH.id : gameState.starterA.id),
    enteredInning: inning,
    enteredOuts,
    enteredRunners,
    scoreOnEntry: { ...gameState.score },
    scoreOnExit: { ...gameState.score },
    outsRecorded: 0,
    runsCharged: 0,
  });
}

/** The outing a pitcher is currently in, if he has not yet been replaced. */
function openAppearanceFor(gameState: GameState, pitcherId: string) {
  const records = gameState.appearances ?? [];
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index]!.pitcherId === pitcherId) return records[index];
  }
  return undefined;
}

/** Stamp the score a pitcher left with, for the lead-preserved rules. */
function closeAppearance(gameState: GameState, side: Side): void {
  const records = gameState.appearances ?? [];
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    if (record.side === side) {
      record.scoreOnExit = { ...gameState.score };
      return;
    }
  }
}

export function simHalf(
  gameState: GameState,
  battingSide: Side,
  inning: number,
  accumulatedStats: AccumulatedStats,
  management?: HalfInningManagement,
): HalfInningResult {
  const fieldingSide: Side = battingSide === 'home' ? 'away' : 'home';
  const battingStrategy =
      management?.battingStrategy ?? teamStrategyFor(teamKeyForSide(gameState, battingSide)),
    fieldingStrategy =
      management?.fieldingStrategy ?? teamStrategyFor(teamKeyForSide(gameState, fieldingSide)),
    closerPriority = management?.closerPriority ?? [],
    bullpenPriority = management?.bullpenPriority ?? [],
    decisionStart = (gameState.managementLog ??= []).length;
  const catcher = gameState.lineups[fieldingSide].find(
      (player) => player._assignedPos === '捕手' || player.pos === '捕手',
    ),
    catcherGameCalling = catcher
      ? (catcher.p.ld || 50) +
        specialLevel(catcher, 'ld_art') * AT_BAT_BALANCE.specials.gameCallingPerLevel
      : 50;
  const maybeChangePitcher = (): void => {
    const currentPitcher = gameState.curP[fieldingSide],
      pitchCount = gameState.pc[fieldingSide],
      pitchBalance = PITCHER_USAGE_BALANCE.pitchCount,
      gameStarter = fieldingSide === 'home' ? gameState.starterH : gameState.starterA,
      isStartingPitcher = currentPitcher.id === gameStarter.id;
    const baseMaximumPitchCount = isStartingPitcher
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
    const reliefPitchBuffer = isStartingPitcher ? 0 : currentPitcher.role === 'クローザー' ? 3 : 4;
    const maximumPitchCount = Math.max(
      5,
      Math.round(
        baseMaximumPitchCount + reliefPitchBuffer - (fieldingStrategy.bullpenAggression - 1) * 16,
      ),
    );
    const bullpen = gameState.teams[fieldingSide].pitchers.filter(
      (p) =>
        p.role !== '先発' && !gameState.usedR[fieldingSide].has(p.id) && (p.injuryDays ?? 0) <= 0,
    );
    const rested = bullpen.filter((pitcher) => isPitcherSelectable(pitcher));
    const available =
      rested.length > 0 ? rested : bullpen.filter((pitcher) => isPitcherSelectable(pitcher, true));
    if (!available.length) return;
    const liveScore = {
        home: gameState.score.home + (battingSide === 'home' ? runs : 0),
        away: gameState.score.away + (battingSide === 'away' ? runs : 0),
      },
      fieldingLead =
        fieldingSide === 'home' ? liveScore.home - liveScore.away : liveScore.away - liveScore.home,
      close = Math.abs(fieldingLead) <= 3,
      closers = available.filter((p) => p.role === 'クローザー'),
      relievers = available.filter((p) => p.role === 'リリーフ');
    const forceLateCloser =
      inning >= 8 && close && currentPitcher.role !== 'クローザー' && closers.length > 0;
    if (pitchCount < maximumPitchCount && !forceLateCloser) return;
    const strategicScores = new Map(
      strategicPitcherOrder(
        gameState.teams[fieldingSide],
        'bullpen',
        fieldingStrategy,
        accumulatedStats,
      ).map((entry) => [entry.playerId, entry.score]),
    );
    let nextPitcher: Player;
    let reason: string;
    if (forceLateCloser) {
      nextPitcher = selectCloserByPriority(closers, closerPriority) as Player;
      reason = '終盤3点差以内のためクローザーを投入';
    } else if (relievers.length) {
      const ordered = orderByPriority(relievers, bullpenPriority, strategicScores);
      const lowLeverage = inning < 6 || Math.abs(fieldingLead) >= 4;
      nextPitcher = ordered[lowLeverage ? Math.min(2, ordered.length - 1) : 0] as Player;
      reason = lowLeverage
        ? '低レバレッジのため主力以外の救援を選択'
        : '接戦のため戦略評価最上位の救援を選択';
    } else {
      nextPitcher = orderByPriority(available, bullpenPriority, strategicScores)[0] as Player;
      reason = '登板可能な救援から戦略評価順に選択';
    }
    gameState.changes.push({
      inning: inning + 1,
      isBot: battingSide === 'home',
      pitcher: nextPitcher.name,
      side: fieldingSide,
    });
    closeAppearance(gameState, fieldingSide);
    openAppearance(
      gameState,
      fieldingSide,
      nextPitcher,
      inning + 1,
      currentOuts(),
      basesOccupied(),
    );
    gameState.curP[fieldingSide] = nextPitcher;
    gameState.usedR[fieldingSide].add(nextPitcher.id);
    gameState.pc[fieldingSide] = 0;
    gameState.managementLog?.push({
      teamKey: teamKeyForSide(gameState, fieldingSide),
      inning: inning + 1,
      type: 'pitchingChange',
      playerId: nextPitcher.id,
      playerName: nextPitcher.name,
      attempted: true,
      scoreDifference: fieldingLead,
      outs: currentOuts(),
      bases: [Boolean(bases[0]), Boolean(bases[1]), Boolean(bases[2])],
      reason,
      runsAtDecision: runs,
    });
  };
  const atBats: AtBatLogEntry[] = [];
  const currentOuts = (): number => outs;
  const basesOccupied = (): number => bases.filter(Boolean).length;
  // Who put each runner on base, and whether an error was responsible. A run is charged
  // to the pitcher who allowed the runner, not whoever happens to be pitching when it
  // scores, and is unearned when it would not have scored had the defence been clean.
  const runnerResponsibility = new Map<string, { pitcherId: string; reachedOnError: boolean }>();
  // Outs the defence should have recorded but did not, because of an error. Once the
  // inning would have been over without them, every later run is unearned.
  let phantomOuts = 0;
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
        const liveScore = {
            home: gameState.score.home + (battingSide === 'home' ? runs : 0),
            away: gameState.score.away + (battingSide === 'away' ? runs : 0),
          },
          scoreDifference =
            battingSide === 'home'
              ? liveScore.home - liveScore.away
              : liveScore.away - liveScore.home,
          attemptRate = stealAttemptRate(runnerPlayer, catcher, pitcher, battingStrategy, {
            inning: inning + 1,
            outs,
            scoreDifference,
          }),
          attempted = random() < attemptRate,
          decision: ManagementDecision = {
            teamKey: teamKeyForSide(gameState, battingSide),
            inning: inning + 1,
            type: 'steal' as const,
            playerId: runnerPlayer.id,
            playerName: runnerPlayer.name,
            attempted,
            probability: attemptRate,
            scoreDifference,
            outs,
            bases: [Boolean(bases[0]), Boolean(bases[1]), Boolean(bases[2])] as [
              boolean,
              boolean,
              boolean,
            ],
            reason:
              scoreDifference <= -2
                ? '複数点を追うため企図を抑制'
                : inning >= 7 && Math.abs(scoreDifference) <= 1
                  ? '終盤接戦で次の塁を狙う'
                  : '走力・相手バッテリー・球団方針から判断',
            runsAtDecision: runs,
          };
        gameState.managementLog?.push(decision);
        if (attempted) {
          const successRate = stealSuccessRate(runnerPlayer, catcher, pitcher),
            snapshot = {
              home: gameState.score.home + (battingSide === 'home' ? runs : 0),
              away: gameState.score.away + (battingSide === 'away' ? runs : 0),
            };
          if (random() < successRate) {
            decision.success = true;
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
            decision.success = false;
            bases = [false, bases[1], bases[2]];
            outs += 1;
            const stealAppearance = openAppearanceFor(gameState, pitcher.id);
            if (stealAppearance) stealAppearance.outsRecorded += 1;
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
    } else if (!bases[0] && bases[1] && !bases[2] && outs < 2) {
      const runner = bases[1],
        runnerPlayer = typeof runner === 'object' ? runner : undefined;
      if (runnerPlayer) {
        const liveScore = {
            home: gameState.score.home + (battingSide === 'home' ? runs : 0),
            away: gameState.score.away + (battingSide === 'away' ? runs : 0),
          },
          scoreDifference =
            battingSide === 'home'
              ? liveScore.home - liveScore.away
              : liveScore.away - liveScore.home,
          attemptRate = stealThirdAttemptRate(runnerPlayer, catcher, pitcher, battingStrategy, {
            inning: inning + 1,
            outs,
            scoreDifference,
          }),
          attempted = random() < attemptRate,
          decision: ManagementDecision = {
            teamKey: teamKeyForSide(gameState, battingSide),
            inning: inning + 1,
            type: 'steal' as const,
            playerId: runnerPlayer.id,
            playerName: runnerPlayer.name,
            attempted,
            probability: attemptRate,
            scoreDifference,
            outs,
            bases: [Boolean(bases[0]), Boolean(bases[1]), Boolean(bases[2])] as [
              boolean,
              boolean,
              boolean,
            ],
            reason:
              scoreDifference <= -2
                ? '複数点を追うため企図を抑制'
                : inning >= 7 && Math.abs(scoreDifference) <= 1
                  ? '終盤接戦で三塁を狙う'
                  : '走力・相手バッテリー・球団方針から三塁を判断',
            runsAtDecision: runs,
          };
        gameState.managementLog?.push(decision);
        if (attempted) {
          const successRate = stealThirdSuccessRate(runnerPlayer, catcher, pitcher),
            snapshot = {
              home: gameState.score.home + (battingSide === 'home' ? runs : 0),
              away: gameState.score.away + (battingSide === 'away' ? runs : 0),
            };
          if (random() < successRate) {
            decision.success = true;
            bases = [bases[0], false, runnerPlayer];
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
              desc: `${runnerPlayer.name}、盗塁成功（三塁）`,
              snap: snapshot,
            });
          } else {
            decision.success = false;
            bases = [bases[0], false, bases[2]];
            outs += 1;
            const stealAppearance = openAppearanceFor(gameState, pitcher.id);
            if (stealAppearance) stealAppearance.outsRecorded += 1;
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
              desc: `${runnerPlayer.name}、盗塁失敗（三塁）`,
              snap: snapshot,
            });
            if (outs >= 3) break;
          }
        }
      }
    }
    const lineup = gameState.lineups[battingSide];
    if (lineup.length === 0) {
      throw new Error(
        `Cannot simulate an at-bat: ${teamKeyForSide(gameState, battingSide)} has no eligible fielders in its lineup.`,
      );
    }
    const batter = lineup[gameState.batIdx[battingSide] % lineup.length] as Player;
    gameState.batIdx[battingSide] += 1;
    const staminaPercentage = clamp(
        100 -
          (gameState.pc[fieldingSide] /
            Math.max(
              1,
              // 疲れにくい stretches how many pitches a given stamina rating is worth.
              pitcher.p.stam *
                1.5 *
                (1 + specialLevel(pitcher, 'tough') * AT_BAT_BALANCE.specials.toughPerLevel),
            )) *
            100,
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
    const basesBefore: [boolean, boolean, boolean] = [
      Boolean(bases[0]),
      Boolean(bases[1]),
      Boolean(bases[2]),
    ];
    const outsBefore = outs;
    let result: PlateAppearanceResult, pitchCount: number, direction: string | null;
    let battedBall: BattedBallType | undefined;
    let errorFielderId: string | undefined;
    const liveScore = {
        home: gameState.score.home + (battingSide === 'home' ? runs : 0),
        away: gameState.score.away + (battingSide === 'away' ? runs : 0),
      },
      scoreDifference =
        battingSide === 'home' ? liveScore.home - liveScore.away : liveScore.away - liveScore.home,
      buntSituation = outs === 0 && !bases[2] && Boolean(bases[0] || bases[1]),
      buntRate = buntSituation
        ? sacrificeBuntAttemptRate(batter, battingStrategy, {
            inning: inning + 1,
            outs,
            bases: basesBefore,
            scoreDifference,
          })
        : 0,
      buntAttempted = buntSituation && random() < buntRate,
      buntSucceeded = buntAttempted && random() < sacrificeBuntSuccessRate(batter);
    if (buntSituation) {
      gameState.managementLog?.push({
        teamKey: teamKeyForSide(gameState, battingSide),
        inning: inning + 1,
        type: 'bunt',
        playerId: batter.id,
        playerName: batter.name,
        attempted: buntAttempted,
        success: buntAttempted ? buntSucceeded : undefined,
        probability: buntRate,
        scoreDifference,
        outs,
        bases: basesBefore,
        reason:
          scoreDifference <= -2
            ? '複数点を追うため強攻を優先'
            : inning >= 7 && Math.abs(scoreDifference) <= 1
              ? '終盤接戦で走者進塁を優先'
              : '打者の犠打能力・長打力・球団方針から判断',
        runsAtDecision: runs,
      });
    }
    if (buntSucceeded) {
      result = 'SH';
      pitchCount = randomInt(1, 4);
      direction = randomChoice(['投犠', '一犠', '三犠']);
    } else {
      const outcome = simAB(
        pitcher,
        batter,
        {
          pStam: staminaPercentage,
          isPinch,
          isLead,
          outs,
          bases,
          // The defence actually on the field decides whether a batted ball is fielded.
          fieldingLineup: gameState.lineups[fieldingSide],
        },
        catcherGameCalling,
        pitcherMastery,
        batterMastery,
        gameState.park,
        priorMatchups,
      );
      result = outcome.result;
      pitchCount = outcome.pc;
      direction = outcome.dir;
      battedBall = outcome.battedBall;
      errorFielderId = outcome.errorFielderId ?? undefined;
    }
    gameState.matchupCounts[matchupKey] = priorMatchups + 1;
    gameState.pc[fieldingSide] += pitchCount;
    let officialResult = result;
    let runsBattedIn = 0;
    let scorers: Player[] = [];
    if (result === 'K') outs += 1;
    else if (result === 'GO' || result === 'SH') {
      const advancement = advBases(bases, result, batter, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      scorers = advancement.scorers;
      outs += 1;
      runs += runsBattedIn;
    } else if (result === 'FO') {
      const advancement = advBases(bases, result, batter, outs);
      bases = advancement.bases;
      runsBattedIn = advancement.runs;
      scorers = advancement.scorers;
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
      scorers = advancement.scorers;
      runs += advancement.runs;
      // No run batted in when the run only scored because of an error.
      runsBattedIn = result === 'E' ? 0 : advancement.runs;
    }

    // An error is a play the defence should have converted, so it also costs an out that
    // the official reconstruction of the inning would have had.
    if (result === 'E') phantomOuts += 1;

    const playAppearance = openAppearanceFor(gameState, pitcher.id);
    if (playAppearance) playAppearance.outsRecorded += outs - outsBefore;

    const runsScored: ScoredRun[] = scorers.map((runner) => {
      const responsibility = runnerResponsibility.get(runner.id);
      // The batter scoring on his own hit is the current pitcher's responsibility.
      const chargedPitcherId = responsibility?.pitcherId ?? pitcher.id;
      const reachedOnError = responsibility?.reachedOnError ?? result === 'E';
      return {
        runnerId: runner.id,
        chargedPitcherId,
        earned: !reachedOnError && outs + phantomOuts < 3,
      };
    });
    const scoredIds = runsScored.map((run) => run.runnerId);
    for (const run of runsScored) {
      const homeScore = gameState.score.home + (battingSide === 'home' ? runs : 0);
      const awayScore = gameState.score.away + (battingSide === 'away' ? runs : 0);
      (gameState.scoringSequence ??= []).push({
        scoringSide: battingSide,
        chargedPitcherId: run.chargedPitcherId,
        homeScore,
        awayScore,
      });
      const appearance = openAppearanceFor(gameState, run.chargedPitcherId);
      if (appearance) appearance.runsCharged += 1;
    }

    // Register the batter if he is now standing on a base, so a later run is charged to
    // the pitcher who let him on.
    if (bases.some((runner) => typeof runner === 'object' && runner.id === batter.id)) {
      runnerResponsibility.set(batter.id, {
        pitcherId: pitcher.id,
        reachedOnError: result === 'E',
      });
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
      runsScored,
      battedBall,
      errorFielderId,
      basesBefore,
      outsBefore,
      desc: buildDesc(batter.name, officialResult, direction, runsBattedIn),
    });
    if (battingSide === 'home' && inning >= 8 && snapshot.home > snapshot.away) {
      outs = 3;
      break;
    }
  }
  for (const decision of (gameState.managementLog ?? []).slice(decisionStart))
    decision.runsAfterDecision = Math.max(0, runs - decision.runsAtDecision);
  return { runs, atBats };
}
const leadFor = (side: Side, score: Score): number =>
  side === 'home' ? score.home - score.away : score.away - score.home;

/**
 * Assign the winning, losing and saving pitchers by the official rules rather than by
 * counting batters faced and runs allowed.
 */
function assignDecisions(gameState: GameState): void {
  const appearances = gameState.appearances ?? [];
  const homeWon = gameState.score.home > gameState.score.away;
  const winningSide: Side = homeWon ? 'home' : 'away';
  const losingSide: Side = homeWon ? 'away' : 'home';
  const winners = appearances.filter((entry) => entry.side === winningSide);
  const losers = appearances.filter((entry) => entry.side === losingSide);

  // --- Losing pitcher: whoever allowed the go-ahead run the leaders never gave back. ---
  const scoring = gameState.scoringSequence ?? [];
  let goAheadPitcherId: string | null = null;
  for (let index = scoring.length - 1; index >= 0; index -= 1) {
    const event = scoring[index]!;
    const leadAfter = homeWon
      ? event.homeScore - event.awayScore
      : event.awayScore - event.homeScore;
    const previous = scoring[index - 1];
    const leadBefore = previous
      ? homeWon
        ? previous.homeScore - previous.awayScore
        : previous.awayScore - previous.homeScore
      : 0;
    // The run that put the winners ahead for good: scanning from the most recent event
    // backward, the first crossing from <=0 to >0 for the winning side is that run.
    if (event.scoringSide === winningSide && leadBefore <= 0 && leadAfter > 0) {
      goAheadPitcherId = event.chargedPitcherId;
      break;
    }
  }
  gameState.loserPitcherId = goAheadPitcherId ?? losers[0]?.pitcherId ?? null;

  // --- Winning pitcher ---
  const starter = winners.find((entry) => entry.isStarter);
  const starterQualifies =
    starter !== undefined &&
    starter.outsRecorded >= 15 &&
    leadFor(winningSide, starter.scoreOnExit) > 0;
  if (starterQualifies) {
    gameState.winnerPitcherId = starter.pitcherId;
  } else {
    // The reliever on the mound when the winners took the lead for good; if that outing
    // was brief and ineffective, the most effective one after it.
    const goAheadIndex = scoring.findIndex(
      (event) =>
        event.scoringSide === winningSide &&
        (homeWon ? event.homeScore > event.awayScore : event.awayScore > event.homeScore),
    );
    const goAheadScore = goAheadIndex >= 0 ? scoring[goAheadIndex] : undefined;
    const reliefCandidates = winners.filter((entry) => !entry.isStarter);
    const holder = goAheadScore
      ? reliefCandidates.find(
          (entry) =>
            leadFor(winningSide, entry.scoreOnEntry) <= 0 &&
            leadFor(winningSide, entry.scoreOnExit) > 0,
        )
      : undefined;
    const effective = [...reliefCandidates].sort(
      (first, second) =>
        second.outsRecorded - second.runsCharged * 3 - (first.outsRecorded - first.runsCharged * 3),
    )[0];
    gameState.winnerPitcherId = (holder ?? effective ?? starter)?.pitcherId ?? null;
  }

  // --- Save, hold and blown save ---
  const finisher = winners[winners.length - 1];
  const isSaveSituation = (entry: (typeof winners)[number]): boolean => {
    const leadOnEntry = leadFor(winningSide, entry.scoreOnEntry);
    if (leadOnEntry <= 0) return false;
    // Ahead by no more than three, or the tying run already at bat or on deck.
    if (leadOnEntry <= 3) return true;
    return leadOnEntry - entry.enteredRunners <= 2;
  };
  gameState.savePitcherId = null;
  if (
    finisher &&
    finisher.pitcherId !== gameState.winnerPitcherId &&
    (isSaveSituation(finisher) || finisher.outsRecorded >= 9) &&
    leadFor(winningSide, gameState.score) > 0
  ) {
    // A one-batter save needs a save situation; three innings qualifies regardless.
    if (finisher.outsRecorded >= 3 || isSaveSituation(finisher)) {
      gameState.savePitcherId = finisher.pitcherId;
    }
  }
  gameState.holdPitcherIds = winners
    .filter(
      (entry) =>
        !entry.isStarter &&
        entry !== finisher &&
        entry.pitcherId !== gameState.winnerPitcherId &&
        isSaveSituation(entry) &&
        entry.outsRecorded >= 1 &&
        leadFor(winningSide, entry.scoreOnExit) > 0,
    )
    .map((entry) => entry.pitcherId);
  // A blown save is entering with a lead to protect and letting it go, on either side.
  gameState.blownSavePitcherIds = appearances
    .filter(
      (entry) =>
        !entry.isStarter &&
        leadFor(entry.side, entry.scoreOnEntry) > 0 &&
        leadFor(entry.side, entry.scoreOnEntry) <= 3 &&
        leadFor(entry.side, entry.scoreOnExit) <= 0,
    )
    .map((entry) => entry.pitcherId);
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
    homeStrategy = teamStrategyFor(homeKey),
    awayStrategy = teamStrategyFor(awayKey),
    resolvedHomePitcherPlan =
      homePitcherPlan ?? strategicPitcherPlan(homeTeam, homeStrategy, accumulatedStats),
    resolvedAwayPitcherPlan =
      awayPitcherPlan ?? strategicPitcherPlan(awayTeam, awayStrategy, accumulatedStats),
    resolvedHomeLineup = resolveLineup(homeTeam, homeLineup),
    resolvedAwayLineup = resolveLineup(awayTeam, awayLineup),
    homeStarters = resolveStarterRotation(homeTeam, resolvedHomePitcherPlan.rotationOrder),
    awayStarters = resolveStarterRotation(awayTeam, resolvedAwayPitcherPlan.rotationOrder),
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
    appearances: [],
    scoringSequence: [],
    managementLog: [],
    postGameEvents: { awakenings: [], injuries: [] },
  };
  openAppearance(gameState, 'home', homeStarter as Player, 1, 0, 0);
  openAppearance(gameState, 'away', awayStarter as Player, 1, 0, 0);
  for (let inningIndex = 0; inningIndex < 15; inningIndex += 1) {
    const inningScore = { away: 0, home: 0 },
      awayHalf = simHalf(gameState, 'away', inningIndex, accumulatedStats, {
        battingStrategy: awayStrategy,
        fieldingStrategy: homeStrategy,
        closerPriority: resolvedHomePitcherPlan.closerPriority,
        bullpenPriority: resolvedHomePitcherPlan.bullpenPriority ?? [],
      });
    inningScore.away = awayHalf.runs;
    gameState.score.away += awayHalf.runs;
    gameState.atBatLog.push(...awayHalf.atBats);
    if (inningIndex >= 8 && gameState.score.home > gameState.score.away) {
      gameState.innings.push({ home: inningScore.home, away: inningScore.away });
      break;
    }
    const homeHalf = simHalf(gameState, 'home', inningIndex, accumulatedStats, {
      battingStrategy: homeStrategy,
      fieldingStrategy: awayStrategy,
      closerPriority: resolvedAwayPitcherPlan.closerPriority,
      bullpenPriority: resolvedAwayPitcherPlan.bullpenPriority ?? [],
    });
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
    gameState.blownSavePitcherIds = [];
    return finalizeGame(gameState, teams, homeKey, awayKey, gameDate);
  }
  // Every pitcher still on the mound gets his exit score stamped.
  closeAppearance(gameState, 'home');
  closeAppearance(gameState, 'away');
  assignDecisions(gameState);
  return finalizeGame(gameState, teams, homeKey, awayKey, gameDate);
}
