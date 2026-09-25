import { PLAYER_DEVELOPMENT_BALANCE, SPECIAL_INDEX } from '../../data';
import type { FieldPosition, Player } from '../../engine';

/** Ratings the engine is built for: current values up to the development cap, and
 * potentials up to the elite ceiling in debug mode whatever the player's class. */
export const DEBUG_RATING_MIN = 1;
export const DEBUG_RATING_MAX = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;
export const DEBUG_POTENTIAL_MAX = PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.elite;

/**
 * A typed number, clamped to its range only once the user commits it (blur or Enter).
 * Returns null for text that is not a number, so the field can go back to the stored
 * value instead of guessing.
 */
export function parseBoundedInt(text: string, min: number, max: number): number | null {
  const parsed = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Sets a special ability's level. Level 0 removes it from both the level map and the
 * `specials` list; leaving it in the list made the save step bring it back at level 1.
 */
export function withSpecialLevel(player: Player, id: string, level: number): Player {
  const specialLevels = { ...(player.specialLevels ?? {}) };
  const others = (player.specials ?? []).filter((special) => special.id !== id);
  if (level <= 0) {
    delete specialLevels[id];
    return { ...player, specialLevels, specials: others };
  }
  specialLevels[id] = level;
  const definition = SPECIAL_INDEX[id];
  return {
    ...player,
    specialLevels,
    specials: definition ? [...others, definition] : others,
  };
}

/**
 * Sets a fielding aptitude. 0 removes the position from the player's list (an entry at 0
 * still counted as a claim to the position, e.g. catcher); the primary position keeps at
 * least 1.
 */
export function withAptitude(player: Player, pos: FieldPosition, apt: number): Player {
  const existing = player.positions ?? [];
  if (apt <= 0 && pos !== player.pos) {
    return { ...player, positions: existing.filter((entry) => entry.pos !== pos) };
  }
  const value = pos === player.pos ? Math.max(1, apt) : apt;
  const positions = existing.some((entry) => entry.pos === pos)
    ? existing.map((entry) => (entry.pos === pos ? { ...entry, apt: value } : entry))
    : [...existing, { pos, apt: value }];
  return { ...player, positions };
}
