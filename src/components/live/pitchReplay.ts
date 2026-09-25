import { velocityToKmh } from '../../engine/ratings';
import type { PitchDefinition } from '../../engine/types';
import type { LiveFrame } from './liveTimeline';

/**
 * The pitches of a plate appearance, rebuilt for the live viewer. The engine decides a
 * plate appearance in one step and only knows how many pitches it took, so each pitch
 * here is a reconstruction: the count follows the rules, the last pitch matches the
 * result, and the pitch types and speeds are the pitcher's own. Drawn from a hash of the
 * game and play, so a replay always looks the same, and never from the engine's random
 * numbers.
 *
 * Locations are in strike-zone units seen from behind the catcher: the zone spans -1 to 1
 * across (x, positive toward first base) and -1 to 1 up (z). A right-handed batter stands
 * on the left (x < 0).
 */
export type PitchCall =
  'ball' | 'calledStrike' | 'swingingStrike' | 'foul' | 'inPlay' | 'hitByPitch';

export interface ReplayPitch {
  n: number;
  type: string;
  kmh: number;
  x: number;
  z: number;
  call: PitchCall;
  /** Balls and strikes after this pitch. */
  balls: number;
  strikes: number;
}

export interface ReplayAtBat {
  batterSide: 'R' | 'L';
  throws: 'R' | 'L';
  pitches: ReplayPitch[];
}

export interface ReplayPitcher {
  pitches?: PitchDefinition[];
  vel?: number;
  ctrl?: number;
  throws?: '右' | '左';
}

export interface ReplayBatter {
  bats?: '右' | '左' | '両';
}

export const PITCH_CALL_LABEL: Record<PitchCall, string> = {
  ball: 'ボール',
  calledStrike: '見逃し',
  swingingStrike: '空振り',
  foul: 'ファウル',
  inPlay: 'インプレー',
  hitByPitch: '死球',
};

/** How much slower than the pitcher's fastball each pitch type comes in. */
const SPEED_GAP: Record<string, number> = {
  直球: 0,
  スライダー: 12,
  カーブ: 25,
  フォーク: 8,
  チェンジアップ: 15,
  シュート: 5,
  カットボール: 5,
  シンカー: 10,
};

function randomFor(seedText: string): () => number {
  let seed = 2166136261;
  for (const character of seedText) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (next: () => number, low: number, high: number) => low + (high - low) * next();

type Token = 'B' | 'S' | 'F';

/**
 * Everything before the last pitch, as balls (B), strikes (S) and fouls with two strikes
 * (F), never reaching four balls or three strikes early.
 */
function countTokens(result: string, before: number, next: () => number): Token[] {
  let balls: number;
  if (result === 'K') balls = Math.max(0, Math.min(3, before - 2) - Math.floor(next() * 2));
  else if (result === 'BB') balls = 3;
  else balls = Math.floor(next() * (Math.min(3, before) + 1));
  balls = Math.min(balls, before);
  const strikes = result === 'K' ? 2 : Math.min(2, before - balls);
  const fouls = Math.max(0, before - balls - strikes);
  const main: Token[] = [...Array(balls).fill('B'), ...Array(strikes).fill('S')];
  for (let index = main.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [main[index], main[swap]] = [main[swap]!, main[index]!];
  }
  // Two-strike fouls go after the second strike.
  let secondStrike = -1;
  let seen = 0;
  main.forEach((token, index) => {
    if (token === 'S' && ++seen === 2) secondStrike = index;
  });
  const tokens = [...main];
  for (let foul = 0; foul < fouls; foul += 1) {
    const earliest = (secondStrike < 0 ? tokens.length : secondStrike + 1) + foul;
    const at = earliest + Math.floor(next() * (tokens.length - earliest + 1));
    tokens.splice(at, 0, 'F');
  }
  return tokens;
}

function pickType(
  repertoire: PitchDefinition[],
  strikes: number,
  next: () => number,
): PitchDefinition | null {
  const options: Array<[PitchDefinition | null, number]> = [
    [null, strikes >= 2 ? 0.8 : 1.3],
    ...repertoire
      .filter((pitch) => pitch.type !== '直球')
      .map((pitch): [PitchDefinition, number] => [
        pitch,
        0.25 + ((pitch.shr ?? 0) + (pitch.brk ?? 0)) / 160 + (strikes >= 2 ? 0.3 : 0),
      ]),
  ];
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = next() * total;
  for (const [pitch, weight] of options) {
    roll -= weight;
    if (roll <= 0) return pitch;
  }
  return null;
}

export function replayAtBat(
  gameId: string,
  frame: LiveFrame,
  pitcher?: ReplayPitcher | null,
  batter?: ReplayBatter | null,
): ReplayAtBat {
  const throws = pitcher?.throws === '左' ? 'L' : 'R';
  const batterSide: 'R' | 'L' =
    batter?.bats === '左' ? 'L' : batter?.bats === '両' ? (throws === 'R' ? 'L' : 'R') : 'R';
  if (frame.result === 'SB' || frame.result === 'CS') return { batterSide, throws, pitches: [] };
  const next = randomFor(`${gameId}:${frame.index}:pitches`);
  const inside = batterSide === 'R' ? -1 : 1;
  const away = -inside;
  const control = Math.max(0.2, Math.min(1, (pitcher?.ctrl ?? 50) / 100));
  const fastball = pitcher?.vel === undefined ? 145 : velocityToKmh(pitcher.vel);
  const repertoire =
    pitcher?.pitches ?? (pitcher ? [] : [{ type: 'スライダー', shr: 50, brk: 50, ctl: 50 }]);

  const finalCall: PitchCall =
    frame.result === 'K'
      ? next() < 0.62
        ? 'swingingStrike'
        : 'calledStrike'
      : frame.result === 'BB'
        ? 'ball'
        : frame.result === 'HBP'
          ? 'hitByPitch'
          : 'inPlay';
  const minimum = frame.result === 'K' ? 3 : frame.result === 'BB' ? 4 : 1;
  const total = Math.max(minimum, frame.pitches || minimum);
  const tokens = countTokens(frame.result, total - 1, next);

  const location = (call: PitchCall, breaking: boolean): [number, number] => {
    switch (call) {
      case 'ball': {
        // Missing the zone: by a little for a control pitcher, by more for a wild one.
        const miss = 1.08 + (1 - control) * 0.7 * next() + 0.05 * next();
        const along = between(next, -1.15, 1.15);
        const side = Math.floor(next() * 4);
        if (breaking && next() < 0.5) return [between(next, -0.2, 1) * away, -miss];
        return side === 0
          ? [miss * away, along]
          : side === 1
            ? [miss * inside, along]
            : side === 2
              ? [along, -miss]
              : [along, miss];
      }
      case 'calledStrike': {
        const edge = 0.35 + control * 0.6;
        return [between(next, -edge, edge), between(next, -edge, edge)];
      }
      case 'swingingStrike':
        return breaking
          ? [between(next, -0.1, 1.25) * away, between(next, -1.45, 0.1)]
          : [between(next, -0.8, 0.8), between(next, 0.2, 1.3)];
      case 'foul':
        return [between(next, -1.1, 1.1), between(next, -1.1, 1.1)];
      case 'hitByPitch':
        return [inside * between(next, 1.5, 1.8), between(next, -0.3, 0.7)];
      case 'inPlay': {
        const kind = frame.ball?.kind ?? 'line';
        const [low, high] =
          frame.result === 'HR' || frame.result === '2B' || frame.result === '3B'
            ? [-0.35, 0.5]
            : kind === 'ground'
              ? [-0.95, -0.1]
              : kind === 'popup'
                ? [0.4, 1.05]
                : kind === 'fly'
                  ? [0, 0.95]
                  : [-0.45, 0.5];
        const spray = frame.spray ?? 'center';
        const across =
          frame.result === 'HR'
            ? between(next, -0.45, 0.45)
            : spray === 'pull'
              ? inside * between(next, 0.05, 0.9)
              : spray === 'oppo'
                ? away * between(next, 0.05, 0.9)
                : between(next, -0.4, 0.4);
        return [across, between(next, low, high)];
      }
    }
  };

  const pitches: ReplayPitch[] = [];
  let balls = 0;
  let strikes = 0;
  const throwPitch = (call: PitchCall) => {
    const pitch = pickType(repertoire, strikes, next);
    const type = pitch?.type ?? '直球';
    const breaking = type !== '直球';
    const [x, z] = location(call, breaking);
    if (call === 'ball') balls += 1;
    else if (call === 'calledStrike' || call === 'swingingStrike') strikes += 1;
    else if (call === 'foul' && strikes < 2) strikes += 1;
    pitches.push({
      n: pitches.length + 1,
      type,
      kmh: Math.round(fastball - (SPEED_GAP[type] ?? 10) + between(next, -2, 2)),
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
      call,
      balls: Math.min(balls, 4),
      strikes: Math.min(strikes, 3),
    });
  };
  for (const token of tokens) {
    if (token === 'B') throwPitch('ball');
    else if (token === 'F') throwPitch('foul');
    else {
      const roll = next();
      throwPitch(roll < 0.45 ? 'calledStrike' : roll < 0.75 ? 'foul' : 'swingingStrike');
    }
  }
  throwPitch(finalCall);
  return { batterSide, throws, pitches };
}

/** Inside the strike zone, on the edge included. */
export const inZone = (pitch: Pick<ReplayPitch, 'x' | 'z'>) =>
  Math.abs(pitch.x) <= 1 && Math.abs(pitch.z) <= 1;
