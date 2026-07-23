import { SPECIAL_INDEX } from '../data';
import type { Player } from './types';
export function ensureSpecialLevels(player: Player): Record<string, number> {
  const levels = { ...(player.specialLevels ?? {}) };
  for (const special of player.specials ?? []) {
    if (special.id && !levels[special.id]) levels[special.id] = 1;
  }
  return levels;
}
export function specialLevel(player: Player, id: string): number {
  const stored = player.specialLevels?.[id];
  const legacy = (player.specials ?? []).some((s) => s.id === id) ? 1 : 0;
  return Math.max(0, Number(stored ?? legacy) || 0);
}
export const hasSpecial = (player: Player, id: string): boolean => specialLevel(player, id) > 0;
export const hasGold = hasSpecial;
export const specialMultiplier = (player: Player, id: string, perLevel = 0.05): number =>
  1 + specialLevel(player, id) * perLevel;
export function syncSpecialsFromLevels(player: Player): Player {
  const specialLevels = ensureSpecialLevels(player);
  return {
    ...player,
    specialLevels,
    specials: Object.entries(specialLevels)
      .filter(([, level]) => level > 0)
      .map(
        ([id]) =>
          SPECIAL_INDEX[id] ?? { id, n: id, c: '#90A4AE', p: 0, tierMax: 5, rarity: 'normal' },
      ),
  };
}
