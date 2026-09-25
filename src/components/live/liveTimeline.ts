import type { AtBatResult, GamePlayLog, PlayLogPlay, TeamKey } from '../../engine';

/**
 * A recorded game turned into frames for the live viewer: one frame per play, with the
 * scoreboard, bases and outs after it, where the ball went, and what kind of moment it
 * was. The game has already been played; this only replays it.
 */
export type LiveCue =
  | 'single'
  | 'extraBase'
  | 'homeRun'
  | 'strikeout'
  | 'walk'
  | 'out'
  | 'doublePlay'
  | 'sacrifice'
  | 'error'
  | 'steal'
  | 'caughtStealing';

export type LiveMoment = 'tie' | 'goAhead' | 'leadChange' | 'walkoff' | 'grandSlam' | 'final';

export type Bases = [boolean, boolean, boolean];

export interface LivePoint {
  x: number;
  y: number;
}

export interface LiveBall {
  kind: 'ground' | 'line' | 'fly' | 'popup';
  /** Where the ball ends up on the field (the 0-100 field drawing, home plate at 50,88). */
  to: LivePoint;
  /** A home run lands beyond the fence. */
  gone: boolean;
}

export interface LiveLineScore {
  /** Runs per inning so far; null for an inning not yet batted. */
  away: Array<number | null>;
  home: Array<number | null>;
}

export interface LiveFrame {
  index: number;
  inning: number;
  isBot: boolean;
  battingTeam: TeamKey;
  batter: string;
  batterId: string;
  pitcher: string;
  result: AtBatResult;
  desc: string;
  rbi: number;
  runs: number;
  pitches: number;
  outsBefore: number;
  outs: number;
  basesBefore: Bases;
  bases: Bases;
  away: number;
  home: number;
  line: LiveLineScore;
  ball: LiveBall | null;
  cue: LiveCue;
  moments: LiveMoment[];
  /** Manager moves just before this play: pitching changes, bunts and steals tried. */
  notes: string[];
}

export interface LiveGame {
  gameId: string;
  awayKey: TeamKey;
  homeKey: TeamKey;
  innings: number;
  frames: LiveFrame[];
  final: { away: number; home: number };
}

export const HOME_PLATE: LivePoint = { x: 50, y: 88 };
export const BASE_POINTS: [LivePoint, LivePoint, LivePoint] = [
  { x: 74, y: 65 },
  { x: 50, y: 49 },
  { x: 26, y: 65 },
];

/** Fielders in the same 0-100 drawing as the lineup editor's field. */
export const FIELDER_POINTS: Record<string, LivePoint> = {
  投手: { x: 50, y: 71 },
  捕手: { x: 50, y: 86 },
  一塁手: { x: 72, y: 60 },
  二塁手: { x: 61, y: 50 },
  三塁手: { x: 28, y: 60 },
  遊撃手: { x: 39, y: 50 },
  左翼手: { x: 22, y: 27 },
  中堅手: { x: 50, y: 17 },
  右翼手: { x: 78, y: 27 },
};

const OUTS_ON: Partial<Record<AtBatResult, number>> = {
  K: 1,
  GO: 1,
  FO: 1,
  SH: 1,
  SF: 1,
  CS: 1,
  DP: 2,
};

function cueFor(result: AtBatResult): LiveCue {
  switch (result) {
    case '1B':
      return 'single';
    case '2B':
    case '3B':
      return 'extraBase';
    case 'HR':
      return 'homeRun';
    case 'K':
      return 'strikeout';
    case 'BB':
    case 'HBP':
      return 'walk';
    case 'DP':
      return 'doublePlay';
    case 'SH':
    case 'SF':
      return 'sacrifice';
    case 'E':
      return 'error';
    case 'SB':
      return 'steal';
    case 'CS':
      return 'caughtStealing';
    default:
      return 'out';
  }
}

/** Old saves have no fielder: read it back from the Japanese description (遊ゴ, 左中…). */
const DESC_FIELDER: Array<[RegExp, string]> = [
  [/左中/, '左翼手'],
  [/右中/, '右翼手'],
  [/投/, '投手'],
  [/捕/, '捕手'],
  [/一/, '一塁手'],
  [/二/, '二塁手'],
  [/三/, '三塁手'],
  [/遊/, '遊撃手'],
  [/左/, '左翼手'],
  [/中/, '中堅手'],
  [/右/, '右翼手'],
];

function fielderFor(play: PlayLogPlay): string {
  if (play.fieldingSlot && FIELDER_POINTS[play.fieldingSlot]) return play.fieldingSlot;
  const fragment = play.desc.replace(play.batter, '');
  for (const [pattern, slot] of DESC_FIELDER) if (pattern.test(fragment)) return slot;
  return '中堅手';
}

const OUTFIELD = new Set(['左翼手', '中堅手', '右翼手']);

function ballFor(play: PlayLogPlay): LiveBall | null {
  const { result } = play;
  if (['K', 'BB', 'HBP', 'SB', 'CS'].includes(result)) return null;
  const slot = fielderFor(play);
  const at = FIELDER_POINTS[slot] ?? FIELDER_POINTS.中堅手!;
  const kind =
    play.battedBall ??
    (result === 'GO' || result === 'DP' || result === 'SH'
      ? 'ground'
      : result === 'FO' || result === 'SF'
        ? 'fly'
        : 'line');
  // A gap hit is pulled toward center field.
  const gap = play.spray === 'center' && slot !== '中堅手' ? 0.35 : 0;
  const x = at.x + (50 - at.x) * gap;
  if (result === 'HR') return { kind: 'fly', to: { x, y: -4 }, gone: true };
  if (result === '2B' || result === '3B')
    return { kind, to: { x, y: result === '3B' ? 6 : 11 }, gone: false };
  if (result === '1B') {
    // A single gets through the infield and is picked up in front of an outfielder.
    const outfielder = OUTFIELD.has(slot)
      ? at
      : at.x < 45
        ? FIELDER_POINTS.左翼手!
        : at.x > 55
          ? FIELDER_POINTS.右翼手!
          : FIELDER_POINTS.中堅手!;
    return { kind, to: { x: outfielder.x, y: outfielder.y + 9 }, gone: false };
  }
  return { kind, to: { x: at.x, y: at.y }, gone: false };
}

/** Bases after a play when an old save did not record them. */
function inferBases(before: Bases, result: AtBatResult): Bases {
  const [first, second, third] = before;
  switch (result) {
    case 'HR':
      return [false, false, false];
    case '3B':
      return [false, false, true];
    case '2B':
      return [false, true, first];
    case '1B':
    case 'E':
      return [true, first, second];
    case 'BB':
    case 'HBP':
      return [true, first ? true : second, first && second ? true : third];
    case 'SH':
      return [false, first, second];
    case 'DP':
      return [false, false, third];
    case 'SB':
      return first && !second ? [false, true, third] : [first, false, true];
    case 'CS':
      return first && !second ? [false, second, third] : [first, false, third];
    default:
      return before;
  }
}

const EMPTY: Bases = [false, false, false];

export function buildLiveGame(log: GamePlayLog): LiveGame {
  const lastInning = log.halves.reduce((most, half) => Math.max(most, half.inning), 0);
  const innings = Math.max(9, lastInning);
  const line: LiveLineScore = {
    away: Array.from({ length: innings }, () => null),
    home: Array.from({ length: innings }, () => null),
  };
  const frames: LiveFrame[] = [];
  let away = 0;
  let home = 0;
  for (const half of log.halves) {
    const side = half.isBot ? 'home' : 'away';
    line[side][half.inning - 1] = 0;
    let outs = 0;
    let bases: Bases = [...EMPTY];
    let notes: string[] = [];
    const plays = half.events.flatMap((event) => ('play' in event ? [event.play] : []));
    let playIndex = 0;
    for (const event of half.events) {
      if ('decision' in event) {
        const { decision } = event;
        notes.push(
          decision.type === 'pitchingChange'
            ? `投手交代：${decision.playerName}`
            : decision.type === 'bunt'
              ? `${decision.playerName}、送りバント${decision.success === false ? '失敗' : ''}`
              : `${decision.playerName}、盗塁を試みる`,
        );
        continue;
      }
      const play = event.play;
      const next = plays[playIndex + 1];
      playIndex += 1;
      const outsBefore = play.outsBefore ?? outs;
      const basesBefore: Bases = play.basesBefore ? [...play.basesBefore] : bases;
      const outsAfter = Math.min(3, outsBefore + (OUTS_ON[play.result] ?? 0));
      const basesAfter: Bases =
        outsAfter >= 3
          ? [...EMPTY]
          : play.basesAfter
            ? [...play.basesAfter]
            : next?.basesBefore
              ? [...next.basesBefore]
              : inferBases(basesBefore, play.result);
      const runs = half.isBot ? play.home - home : play.away - away;
      const leadBefore = half.isBot ? home - away : away - home;
      const leadAfter = half.isBot ? play.home - play.away : play.away - play.home;
      away = play.away;
      home = play.home;
      line[side][half.inning - 1] = (line[side][half.inning - 1] ?? 0) + runs;
      const moments: LiveMoment[] = [];
      if (runs > 0 && leadBefore < 0 && leadAfter === 0) moments.push('tie');
      if (runs > 0 && leadBefore === 0 && leadAfter > 0) moments.push('goAhead');
      if (runs > 0 && leadBefore < 0 && leadAfter > 0) moments.push('leadChange');
      if (play.result === 'HR' && basesBefore.every(Boolean)) moments.push('grandSlam');
      frames.push({
        index: frames.length,
        inning: half.inning,
        isBot: half.isBot,
        battingTeam: half.battingTeam,
        batter: play.batter,
        batterId: play.batterId,
        pitcher: play.pitcher,
        result: play.result,
        desc: play.desc,
        rbi: play.rbi,
        runs,
        pitches: play.pc ?? 0,
        outsBefore,
        outs: outsAfter,
        basesBefore,
        bases: basesAfter,
        away,
        home,
        line: { away: [...line.away], home: [...line.home] },
        ball: ballFor(play),
        cue: cueFor(play.result),
        moments,
        notes,
      });
      notes = [];
      outs = outsAfter;
      bases = basesAfter;
    }
  }
  const last = frames.at(-1);
  if (last) {
    last.moments.push('final');
    if (last.isBot && last.inning >= 9 && last.runs > 0 && last.home > last.away)
      last.moments.push('walkoff');
  }
  return {
    gameId: log.gameId,
    awayKey: log.awayKey,
    homeKey: log.homeKey,
    innings,
    frames,
    final: { away, home },
  };
}

/** The line score shown before the first pitch and at the end: 'X' for a bottom half
 * that was not needed. */
export function finalLine(game: LiveGame): LiveLineScore & { homeX: boolean } {
  const last = game.frames.at(-1);
  const line = last?.line ?? {
    away: Array.from({ length: game.innings }, () => null),
    home: Array.from({ length: game.innings }, () => null),
  };
  return {
    ...line,
    homeX: Boolean(last && !last.isBot && last.home > last.away && last.inning >= 9),
  };
}

/** Pitches shown for a play, drawn from a hash of the game and play so a replay always
 * looks the same. Only for show: the engine's pitch count is the total. */
export function pitchSequence(gameId: string, frame: LiveFrame): Array<'ball' | 'strike' | 'foul'> {
  const total = Math.max(1, frame.pitches || 1);
  let seed = 2166136261;
  for (const character of `${gameId}:${frame.index}`) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const sequence: Array<'ball' | 'strike' | 'foul'> = [];
  let balls = 0;
  let strikes = 0;
  const walk = frame.result === 'BB';
  const strikeout = frame.result === 'K';
  // Everything before the last pitch, kept legal: never the fourth ball or third strike early.
  for (let pitch = 0; pitch < total - 1; pitch += 1) {
    const wantBall = walk ? balls < 3 && (strikes >= 2 || next() < 0.6) : next() < 0.4;
    if (wantBall && balls < 3) {
      balls += 1;
      sequence.push('ball');
    } else if (strikes < 2) {
      strikes += 1;
      sequence.push('strike');
    } else if (!walk && balls < 3 && next() < 0.3) {
      balls += 1;
      sequence.push('ball');
    } else sequence.push('foul');
  }
  if (walk) sequence.push('ball');
  else if (strikeout) sequence.push('strike');
  return sequence;
}
