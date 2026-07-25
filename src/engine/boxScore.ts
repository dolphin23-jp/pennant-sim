import { accumulateStatsAll, mergeStatMaps } from './stats';
import type {
  AccumulatedStats,
  BatterStats,
  FieldPosition,
  GameState,
  PitcherStats,
  Side,
  TeamKey,
} from './types';

export interface BatterLine {
  playerId: string;
  name: string;
  teamKey: TeamKey;
  battingOrder: number;
  position: FieldPosition | null;
  ab: number;
  r: number;
  h: number;
  d: number;
  t: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  k: number;
  sb: number;
  cs: number;
  gdp: number;
  seasonAvgAfter: number;
  seasonHrAfter: number;
  seasonRbiAfter: number;
}

export interface PitcherLine {
  playerId: string;
  name: string;
  teamKey: TeamKey;
  appearanceOrder: number;
  role: 'start' | 'relief';
  decision: 'W' | 'L' | 'S' | 'H' | null;
  ip3: number;
  pitches: number;
  battersFaced: number;
  h: number;
  hr: number;
  bb: number;
  hbp: number;
  k: number;
  r: number;
  er: number;
  seasonWAfter: number;
  seasonLAfter: number;
  seasonSvAfter: number;
  seasonHldAfter: number;
  seasonEraAfter: number;
}

export type NotableEventType =
  | 'hr'
  | 'grandSlam'
  | 'multiHr'
  | 'triple'
  | 'bigGame'
  | 'gameWinningHit'
  | 'walkoff'
  | 'walkoffHr'
  | 'completeGame'
  | 'shutout'
  | 'tenK'
  | 'blowout'
  | 'winStreak'
  | 'loseStreak'
  | 'comeback'
  | 'firstWinOfSeason'
  | 'firstHrOfSeason';

export interface NotableEvent {
  type: NotableEventType;
  playerId?: string;
  playerName?: string;
  teamKey?: TeamKey;
  description: string;
}

export interface GameDecisions {
  winnerId: string | null;
  winnerText: string | null;
  loserId: string | null;
  loserText: string | null;
  saveId: string | null;
  saveText: string | null;
}

export interface GameSummary {
  gameId: string;
  date: string;
  seasonYear: number;
  homeKey: TeamKey;
  awayKey: TeamKey;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  innings: { home: number | null; away: number | null }[];
  extraInnings: boolean;
  tie: boolean;
  walkoff: boolean;
  shutoutTeam: TeamKey | null;
  decisions: GameDecisions;
  headline: string | null;
  hasBoxScore: boolean;
}

export interface GameBoxScore extends GameSummary {
  batterLines: BatterLine[];
  pitcherLines: PitcherLine[];
  notableEvents: NotableEvent[];
}

const HIT_RESULTS = new Set(['1B', '2B', '3B', 'HR']);
const BIG_GAME_HITS = 4;
const BLOWOUT_MARGIN = 8;
const TEN_K = 10;

interface GameOnlyBatterExtras {
  r: number;
  hbp: number;
  gdp: number;
}

interface GameOnlyPitcherExtras {
  battersFaced: number;
  hrAllowed: number;
  runsAllowed: number;
  firstInning: number;
}

function tallyGameOnlyFields(gameState: GameState): {
  batters: Record<string, GameOnlyBatterExtras>;
  pitchers: Record<string, GameOnlyPitcherExtras>;
} {
  const batters: Record<string, GameOnlyBatterExtras> = {};
  const pitchers: Record<string, GameOnlyPitcherExtras> = {};
  const ensureBatter = (id: string): GameOnlyBatterExtras =>
    (batters[id] ??= { r: 0, hbp: 0, gdp: 0 });
  const ensurePitcher = (id: string, inning: number): GameOnlyPitcherExtras =>
    (pitchers[id] ??= { battersFaced: 0, hrAllowed: 0, runsAllowed: 0, firstInning: inning });

  for (const entry of gameState.atBatLog) {
    for (const id of entry.scoredIds ?? []) ensureBatter(id).r += 1;
    if (entry.result === 'HBP') ensureBatter(entry.batterId).hbp += 1;
    if (entry.result === 'DP') ensureBatter(entry.batterId).gdp += 1;

    const isRunningPlay = entry.result === 'SB' || entry.result === 'CS';
    const pitcherExtras = ensurePitcher(entry.pitcherId, entry.inning);
    if (!isRunningPlay) pitcherExtras.battersFaced += 1;
    if (entry.result === 'HR') pitcherExtras.hrAllowed += 1;
    pitcherExtras.runsAllowed += entry.rbi || 0;
  }
  return { batters, pitchers };
}

function countHits(gameState: GameState, teamKey: TeamKey): number {
  return gameState.atBatLog.filter(
    (entry) => entry.bSide === teamKey && HIT_RESULTS.has(entry.result),
  ).length;
}

function buildBatterLines(
  gameState: GameState,
  side: Side,
  gameStats: AccumulatedStats,
  seasonAfter: AccumulatedStats,
  extras: Record<string, GameOnlyBatterExtras>,
): BatterLine[] {
  const teamKey = gameState.teams[side].key;
  return gameState.lineups[side]
    .map((player, index) => {
      const stats = gameStats[player.id];
      if (!stats || stats.type !== 'bat') return null;
      const batStats = stats as BatterStats;
      const after = seasonAfter[player.id];
      const afterBat = after?.type === 'bat' ? (after as BatterStats) : null;
      const gameExtras = extras[player.id] ?? { r: 0, hbp: 0, gdp: 0 };
      const line: BatterLine = {
        playerId: player.id,
        name: player.name,
        teamKey,
        battingOrder: index + 1,
        position: player._assignedPos ?? player.pos ?? null,
        ab: batStats.ab,
        r: gameExtras.r,
        h: batStats.h,
        d: batStats.d,
        t: batStats.t,
        hr: batStats.hr,
        rbi: batStats.rbi,
        bb: batStats.bb,
        hbp: gameExtras.hbp,
        k: batStats.k,
        sb: batStats.sb,
        cs: batStats.cs,
        gdp: gameExtras.gdp,
        seasonAvgAfter: afterBat && afterBat.ab > 0 ? afterBat.h / afterBat.ab : 0,
        seasonHrAfter: afterBat?.hr ?? 0,
        seasonRbiAfter: afterBat?.rbi ?? 0,
      };
      return line;
    })
    .filter((line): line is BatterLine => line !== null);
}

function buildPitcherLines(
  gameState: GameState,
  side: Side,
  gameStats: AccumulatedStats,
  seasonAfter: AccumulatedStats,
  extras: Record<string, GameOnlyPitcherExtras>,
): PitcherLine[] {
  const teamKey = gameState.teams[side].key;
  const starterId = side === 'home' ? gameState.starterH.id : gameState.starterA.id;
  const pitcherIds = Object.keys(extras)
    .filter((id) => gameState.teams[side].pitchers.some((pitcher) => pitcher.id === id))
    .sort((first, second) => extras[first]!.firstInning - extras[second]!.firstInning);

  return pitcherIds
    .map((playerId, index) => {
      const stats = gameStats[playerId];
      if (!stats || stats.type !== 'pit') return null;
      const pitStats = stats as PitcherStats;
      const after = seasonAfter[playerId];
      const afterPit = after?.type === 'pit' ? (after as PitcherStats) : null;
      const gameExtras = extras[playerId] as GameOnlyPitcherExtras;
      const name =
        gameState.teams[side].pitchers.find((pitcher) => pitcher.id === playerId)?.name ??
        pitStats.name;
      const decision: PitcherLine['decision'] =
        playerId === gameState.winnerPitcherId
          ? 'W'
          : playerId === gameState.loserPitcherId
            ? 'L'
            : playerId === gameState.savePitcherId
              ? 'S'
              : (gameState.holdPitcherIds ?? []).includes(playerId)
                ? 'H'
                : null;
      const seasonEraAfter =
        afterPit && afterPit.ip3 > 0 ? (afterPit.er * 27) / afterPit.ip3 : 0;
      const line: PitcherLine = {
        playerId,
        name,
        teamKey,
        appearanceOrder: index + 1,
        role: playerId === starterId ? 'start' : 'relief',
        decision,
        ip3: pitStats.ip3,
        pitches: pitStats.pc,
        battersFaced: gameExtras.battersFaced,
        h: pitStats.h,
        hr: gameExtras.hrAllowed,
        bb: pitStats.bb,
        hbp: 0,
        k: pitStats.k,
        r: gameExtras.runsAllowed,
        er: pitStats.er,
        seasonWAfter: afterPit?.w ?? 0,
        seasonLAfter: afterPit?.l ?? 0,
        seasonSvAfter: afterPit?.sv ?? 0,
        seasonHldAfter: afterPit?.hld ?? 0,
        seasonEraAfter,
      };
      return line;
    })
    .filter((line): line is PitcherLine => line !== null);
}

function decisionText(label: string, line: PitcherLine | undefined): string | null {
  if (!line) return null;
  if (label === 'S')
    return `S：${line.name}（${line.seasonSvAfter}セーブ、防御率${line.seasonEraAfter.toFixed(2)}）`;
  return `${label}：${line.name}（${line.seasonWAfter}勝${line.seasonLAfter}敗、防御率${line.seasonEraAfter.toFixed(2)}）`;
}

function buildDecisions(gameState: GameState, pitcherLines: PitcherLine[]): GameDecisions {
  const byId = new Map(pitcherLines.map((line) => [line.playerId, line]));
  const winner = gameState.winnerPitcherId ? byId.get(gameState.winnerPitcherId) : undefined;
  const loser = gameState.loserPitcherId ? byId.get(gameState.loserPitcherId) : undefined;
  const save = gameState.savePitcherId ? byId.get(gameState.savePitcherId) : undefined;
  return {
    winnerId: gameState.winnerPitcherId ?? null,
    winnerText: decisionText('勝', winner),
    loserId: gameState.loserPitcherId ?? null,
    loserText: decisionText('敗', loser),
    saveId: gameState.savePitcherId ?? null,
    saveText: decisionText('S', save),
  };
}

function inningsFor(gameState: GameState): { home: number | null; away: number | null }[] {
  return gameState.innings.map((inning, index) => {
    const inningNumber = index + 1;
    const homePlayed = gameState.atBatLog.some(
      (entry) => entry.inning === inningNumber && entry.isBot,
    );
    return { home: homePlayed ? inning.home : null, away: inning.away };
  });
}

function detectNotableEvents(
  gameState: GameState,
  batterLines: BatterLine[],
  pitcherLines: PitcherLine[],
  seasonBefore: AccumulatedStats,
  innings: { home: number | null; away: number | null }[],
): NotableEvent[] {
  const events: NotableEvent[] = [];
  const homeWon = gameState.score.home > gameState.score.away;
  const tie = gameState.score.home === gameState.score.away;
  const margin = Math.abs(gameState.score.home - gameState.score.away);
  const lastInningIndex = innings.length - 1;
  const walkoff =
    !tie && homeWon && lastInningIndex >= 8 && innings[lastInningIndex]?.home !== null;

  for (const line of batterLines) {
    if (line.hr > 0) {
      const grandSlam = gameState.atBatLog.some(
        (entry) => entry.batterId === line.playerId && entry.result === 'HR' && entry.rbi === 4,
      );
      events.push({
        type: grandSlam ? 'grandSlam' : line.hr >= 2 ? 'multiHr' : 'hr',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: grandSlam
          ? `${line.name}、満塁本塁打`
          : line.hr >= 2
            ? `${line.name}、${line.hr}本塁打（${line.seasonHrAfter}号）`
            : `${line.name}、${line.seasonHrAfter}号本塁打`,
      });
    }
    if (line.t > 0) {
      events.push({
        type: 'triple',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: `${line.name}、三塁打`,
      });
    }
    if (line.h >= BIG_GAME_HITS) {
      events.push({
        type: 'bigGame',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: `${line.name}、猛打賞（${line.h}安打）`,
      });
    }
    const seasonBeforeStats = seasonBefore[line.playerId];
    const hadHrBefore = seasonBeforeStats?.type === 'bat' && seasonBeforeStats.hr > 0;
    if (line.hr > 0 && !hadHrBefore) {
      events.push({
        type: 'firstHrOfSeason',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: `${line.name}、今季初本塁打`,
      });
    }
  }

  if (walkoff) {
    const lastEntry = [...gameState.atBatLog].reverse().find((entry) => entry.isBot);
    const walkoffHr = lastEntry?.result === 'HR';
    events.push({
      type: walkoffHr ? 'walkoffHr' : 'walkoff',
      playerId: lastEntry?.batterId,
      playerName: lastEntry?.batter,
      teamKey: gameState.teams.home.key,
      description: walkoffHr
        ? `${lastEntry?.batter}、サヨナラ本塁打`
        : `${lastEntry?.batter}、サヨナラ打`,
    });
  }

  for (const line of pitcherLines) {
    if (line.role === 'start' && line.ip3 >= 27) {
      const isShutout =
        (line.teamKey === gameState.teams.home.key && gameState.score.away === 0) ||
        (line.teamKey === gameState.teams.away.key && gameState.score.home === 0);
      events.push({
        type: isShutout ? 'shutout' : 'completeGame',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: isShutout ? `${line.name}、完封勝利` : `${line.name}、完投`,
      });
    }
    if (line.k >= TEN_K) {
      events.push({
        type: 'tenK',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: `${line.name}、${line.k}奪三振`,
      });
    }
    const seasonBeforeStats = seasonBefore[line.playerId];
    const hadWinBefore = seasonBeforeStats?.type === 'pit' && seasonBeforeStats.w > 0;
    if (line.decision === 'W' && !hadWinBefore) {
      events.push({
        type: 'firstWinOfSeason',
        playerId: line.playerId,
        playerName: line.name,
        teamKey: line.teamKey,
        description: `${line.name}、今季初勝利`,
      });
    }
  }

  if (!tie && margin >= BLOWOUT_MARGIN) {
    const winnerKey = homeWon ? gameState.teams.home.key : gameState.teams.away.key;
    events.push({
      type: 'blowout',
      teamKey: winnerKey,
      description: `${margin}点差の大差勝利`,
    });
  }

  return events;
}

function buildHeadline(events: NotableEvent[]): string | null {
  const priority: NotableEventType[] = [
    'walkoffHr',
    'walkoff',
    'grandSlam',
    'shutout',
    'multiHr',
    'bigGame',
    'tenK',
    'triple',
    'hr',
    'completeGame',
    'blowout',
  ];
  for (const type of priority) {
    const match = events.find((event) => event.type === type);
    if (match) return match.description;
  }
  return events[0]?.description ?? null;
}

export function buildGameBoxScore(
  gameState: GameState,
  gameId: string,
  date: string,
  seasonYear: number,
  seasonStatsBefore: AccumulatedStats,
): GameBoxScore {
  const gameStats = accumulateStatsAll(gameState, {});
  const seasonAfter = mergeStatMaps(seasonStatsBefore, gameStats);
  const { batters: batterExtras, pitchers: pitcherExtras } = tallyGameOnlyFields(gameState);

  const batterLines = [
    ...buildBatterLines(gameState, 'away', gameStats, seasonAfter, batterExtras),
    ...buildBatterLines(gameState, 'home', gameStats, seasonAfter, batterExtras),
  ];
  const pitcherLines = [
    ...buildPitcherLines(gameState, 'away', gameStats, seasonAfter, pitcherExtras),
    ...buildPitcherLines(gameState, 'home', gameStats, seasonAfter, pitcherExtras),
  ];
  const decisions = buildDecisions(gameState, pitcherLines);
  const innings = inningsFor(gameState);
  const homeScore = gameState.score.home;
  const awayScore = gameState.score.away;
  const tie = homeScore === awayScore;
  const homeWon = homeScore > awayScore;
  const lastInningIndex = innings.length - 1;
  const walkoff = !tie && homeWon && lastInningIndex >= 8 && innings[lastInningIndex]?.home !== null;
  const shutoutTeam =
    awayScore === 0 && homeScore > 0
      ? gameState.teams.home.key
      : homeScore === 0 && awayScore > 0
        ? gameState.teams.away.key
        : null;
  const notableEvents = detectNotableEvents(
    gameState,
    batterLines,
    pitcherLines,
    seasonStatsBefore,
    innings,
  );

  return {
    gameId,
    date,
    seasonYear,
    homeKey: gameState.teams.home.key,
    awayKey: gameState.teams.away.key,
    homeScore,
    awayScore,
    homeHits: countHits(gameState, gameState.teams.home.key),
    awayHits: countHits(gameState, gameState.teams.away.key),
    innings,
    extraInnings: innings.length > 9,
    tie,
    walkoff,
    shutoutTeam,
    decisions,
    headline: buildHeadline(notableEvents),
    hasBoxScore: true,
    batterLines,
    pitcherLines,
    notableEvents,
  };
}

export function toSummary(box: GameBoxScore): GameSummary {
  const {
    gameId,
    date,
    seasonYear,
    homeKey,
    awayKey,
    homeScore,
    awayScore,
    homeHits,
    awayHits,
    innings,
    extraInnings,
    tie,
    walkoff,
    shutoutTeam,
    decisions,
    headline,
  } = box;
  return {
    gameId,
    date,
    seasonYear,
    homeKey,
    awayKey,
    homeScore,
    awayScore,
    homeHits,
    awayHits,
    innings,
    extraInnings,
    tie,
    walkoff,
    shutoutTeam,
    decisions,
    headline,
    hasBoxScore: false,
  };
}

export function isNotableGame(box: GameBoxScore): boolean {
  return (
    box.walkoff ||
    box.extraInnings ||
    box.shutoutTeam !== null ||
    box.tie ||
    Math.abs(box.homeScore - box.awayScore) >= BLOWOUT_MARGIN ||
    box.notableEvents.some((event) =>
      ['grandSlam', 'multiHr', 'bigGame', 'tenK', 'completeGame'].includes(event.type),
    )
  );
}
