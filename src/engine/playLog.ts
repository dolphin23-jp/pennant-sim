import type { AtBatResult, GameState, ManagementDecisionType, TeamKey } from './types';

/** One play, compact enough to keep the user's recent games in the save. */
export interface PlayLogPlay {
  batter: string;
  batterId: string;
  pitcher: string;
  result: AtBatResult;
  desc: string;
  rbi: number;
  outsBefore?: number;
  basesBefore?: [boolean, boolean, boolean];
  /** For replaying the play: what was hit, where, who fielded it, and the bases after. */
  battedBall?: 'ground' | 'line' | 'fly' | 'popup';
  fieldingSlot?: string;
  spray?: 'pull' | 'center' | 'oppo';
  basesAfter?: [boolean, boolean, boolean];
  pc?: number;
  /** Score after the play. */
  away: number;
  home: number;
}

/** A manager's move shown in its place: a pitching change, or a bunt or steal tried. */
export interface PlayLogDecision {
  teamKey: TeamKey;
  type: ManagementDecisionType;
  playerName: string;
  reason: string;
  success?: boolean;
}

export interface PlayLogHalfInning {
  inning: number;
  isBot: boolean;
  battingTeam: TeamKey;
  /** Plays and decisions in the order they happened. */
  events: Array<{ play: PlayLogPlay } | { decision: PlayLogDecision }>;
  runs: number;
}

export interface GamePlayLog {
  gameId: string;
  date: string;
  awayKey: TeamKey;
  homeKey: TeamKey;
  halves: PlayLogHalfInning[];
}

/**
 * The finished game as a sequence of half-innings, each with its plays and the AI's
 * decisions (pitching changes, and bunts and steals it tried) in the order they happened.
 */
export function buildPlayLog(gameId: string, date: string, game: GameState): GamePlayLog {
  const homeKey = game.teams.home.key;
  const awayKey = game.teams.away.key;
  const halves = new Map<string, PlayLogHalfInning>();
  const half = (inning: number, isBot: boolean): PlayLogHalfInning => {
    const key = `${inning}:${isBot}`;
    let entry = halves.get(key);
    if (!entry) {
      entry = { inning, isBot, battingTeam: isBot ? homeKey : awayKey, events: [], runs: 0 };
      halves.set(key, entry);
    }
    return entry;
  };
  const decisions = (game.managementLog ?? []).filter(
    (decision) => decision.type === 'pitchingChange' || decision.attempted,
  );
  const plays = new Map<string, typeof game.atBatLog>();
  for (const entry of game.atBatLog) {
    const key = `${entry.inning}:${entry.isBot}`;
    plays.set(key, [...(plays.get(key) ?? []), entry]);
  }
  // Every half-inning that saw a play or a decision, in game order.
  for (const entry of game.atBatLog) half(entry.inning, entry.isBot);
  for (const decision of decisions) {
    const batting =
      decision.type === 'pitchingChange'
        ? decision.teamKey !== homeKey
        : decision.teamKey === homeKey;
    half(decision.inning, batting);
  }
  let previousAway = 0;
  let previousHome = 0;
  const ordered = [...halves.values()].sort(
    (a, b) => a.inning - b.inning || Number(a.isBot) - Number(b.isBot),
  );
  for (const entry of ordered) {
    const halfPlays = plays.get(`${entry.inning}:${entry.isBot}`) ?? [];
    const halfDecisions = decisions.filter((decision) => {
      const isBot =
        decision.type === 'pitchingChange'
          ? decision.teamKey !== homeKey
          : decision.teamKey === homeKey;
      return decision.inning === entry.inning && isBot === entry.isBot;
    });
    for (let index = 0; index <= halfPlays.length; index += 1) {
      for (const decision of halfDecisions.filter(
        (candidate) => (candidate.playIndex ?? 0) === index,
      ))
        entry.events.push({
          decision: {
            teamKey: decision.teamKey,
            type: decision.type,
            playerName: decision.playerName,
            reason: decision.reason,
            ...(decision.success === undefined ? {} : { success: decision.success }),
          },
        });
      const play = halfPlays[index];
      if (!play) continue;
      entry.events.push({
        play: {
          batter: play.batter,
          batterId: play.batterId,
          pitcher: play.pitcher,
          result: play.result,
          desc: play.desc,
          rbi: play.rbi,
          ...(play.outsBefore === undefined ? {} : { outsBefore: play.outsBefore }),
          ...(play.basesBefore ? { basesBefore: play.basesBefore } : {}),
          ...(play.battedBall ? { battedBall: play.battedBall } : {}),
          ...(play.fieldingSlot ? { fieldingSlot: play.fieldingSlot } : {}),
          ...(play.spray ? { spray: play.spray } : {}),
          ...(play.basesAfter ? { basesAfter: play.basesAfter } : {}),
          ...(play.pc === undefined ? {} : { pc: play.pc }),
          away: play.snap.away,
          home: play.snap.home,
        },
      });
    }
    const last = halfPlays.at(-1);
    const away = last?.snap.away ?? previousAway;
    const home = last?.snap.home ?? previousHome;
    entry.runs = entry.isBot ? home - previousHome : away - previousAway;
    previousAway = away;
    previousHome = home;
  }
  return { gameId, date, awayKey, homeKey, halves: ordered };
}
