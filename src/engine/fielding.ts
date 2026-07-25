import { FIELDING_BALANCE } from '../data';
import { random, randomChoice, clamp } from './random';
import { aptitudeFor } from './ratings';
import { specialLevel } from './specials';
import type { BattedBallType, FieldPosition, Player } from './types';

/** Which side of the field the ball was hit to, relative to the batter's pull side. */
export type BattedBallDirection = 'pull' | 'center' | 'oppo';

/** The pitcher fields some ground balls, but is not a `FieldPosition`. */
export type FieldingSlot = FieldPosition | '投手';

const RIGHT_SIDE_INFIELD: FieldPosition[] = ['一塁手', '二塁手'];
const LEFT_SIDE_INFIELD: FieldPosition[] = ['三塁手', '遊撃手'];

/**
 * A right-handed batter pulls to left field; a left-handed batter pulls to right. Switch
 * hitters are treated as batting opposite the pitcher, which the caller has already
 * resolved into an effective handedness.
 */
function pullsToLeft(batterHand: string): boolean {
  return batterHand !== '左';
}

/** Resolve which defensive slot is responsible for a batted ball. */
export function fieldingSlotFor(
  battedBall: BattedBallType,
  direction: BattedBallDirection,
  batterHand: string,
): FieldingSlot {
  const pullLeft = pullsToLeft(batterHand);
  if (battedBall === 'ground') {
    if (direction === 'center') {
      // Up the middle: the pitcher takes a share, the rest splits between the middle infielders.
      return random() < FIELDING_BALANCE.pitcherGroundBallShare
        ? '投手'
        : randomChoice(['二塁手', '遊撃手']);
    }
    const side = (direction === 'pull') === pullLeft ? LEFT_SIDE_INFIELD : RIGHT_SIDE_INFIELD;
    return randomChoice(side);
  }
  if (battedBall === 'popup') {
    // Pop-ups stay in the infield; the corner nearest the direction takes most of them.
    if (direction === 'center') return randomChoice(['捕手', '投手']);
    const side = (direction === 'pull') === pullLeft ? '三塁手' : '一塁手';
    return randomChoice([side, direction === 'pull' ? '遊撃手' : '二塁手']);
  }
  // Line drives and fly balls go to the outfield.
  if (direction === 'center') return '中堅手';
  const pullField: FieldPosition = pullLeft ? '左翼手' : '右翼手';
  const oppoField: FieldPosition = pullLeft ? '右翼手' : '左翼手';
  return direction === 'pull' ? pullField : oppoField;
}

export const isOutfieldSlot = (slot: FieldingSlot): boolean =>
  slot === '左翼手' || slot === '中堅手' || slot === '右翼手';

/**
 * Find who is actually standing at a defensive slot.
 *
 * `bestLineup` fills positions greedily and lets the ninth slot keep the player's own
 * position, so a lineup can duplicate one position and leave another empty. Fall back
 * through progressively looser matches rather than assuming the slot is filled.
 */
export function resolveFielder(lineup: Player[], slot: FieldingSlot): Player | null {
  if (slot === '投手') return null;
  const assigned = lineup.find((player) => player._assignedPos === slot);
  if (assigned) return assigned;
  const natural = lineup.find((player) => player.pos === slot);
  if (natural) return natural;
  // Nobody is listed there: use whoever in the lineup is least bad at it.
  let best: Player | null = null;
  let bestAptitude = -1;
  for (const player of lineup) {
    const aptitude = aptitudeFor(player, slot);
    if (aptitude > bestAptitude) {
      bestAptitude = aptitude;
      best = player;
    }
  }
  return best;
}

/**
 * How well this player handles this slot, on the same 0-100 scale as the raw ratings.
 * Playing out of position costs range, which is what aptitude represents.
 */
export function fielderDefenseScore(fielder: Player | null, slot: FieldingSlot): number {
  if (!fielder) {
    // The pitcher fielding his position, or an unfilled slot: use the pitcher's own
    // fielding rating when we have it, otherwise league-average.
    return FIELDING_BALANCE.defaultDefenseScore;
  }
  const defense = fielder.p.df ?? FIELDING_BALANCE.defaultDefenseScore;
  if (slot === '投手') return defense;
  const aptitude = aptitudeFor(fielder, slot);
  const outOfPositionPenalty =
    ((100 - aptitude) / 100) * FIELDING_BALANCE.outOfPositionPenaltyScale;
  return clamp(defense - outOfPositionPenalty, 1, 120);
}

/** Throwing strength for plays on the bases, including 強肩. */
export function fielderArmScore(fielder: Player | null): number {
  if (!fielder) return FIELDING_BALANCE.defaultDefenseScore;
  const arm = fielder.p.arm ?? FIELDING_BALANCE.defaultDefenseScore;
  return arm + specialLevel(fielder, 'strong_arm') * FIELDING_BALANCE.strongArmPerLevel;
}

/**
 * Probability that the fielder misplays the ball into an error. Ground balls and hard
 * line drives are misplayed far more often than routine fly balls and pop-ups.
 */
export function errorChance(
  battedBall: BattedBallType,
  defenseScore: number,
  slot: FieldingSlot,
): number {
  const base = FIELDING_BALANCE.errorBaseRate[battedBall];
  const slotFactor = slot === '投手' ? FIELDING_BALANCE.pitcherErrorFactor : 1;
  const skill = 1 - (defenseScore - 50) / FIELDING_BALANCE.errorDefenseScale;
  return clamp(
    base * slotFactor * skill,
    FIELDING_BALANCE.minErrorRate,
    FIELDING_BALANCE.maxErrorRate,
  );
}
