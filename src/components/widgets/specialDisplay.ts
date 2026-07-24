import { SPECIAL_INDEX } from '../../data';
import type { Player, SpecialAbility } from '../../engine';

function specialDefinition(player: Player, id: string): SpecialAbility | undefined {
  return SPECIAL_INDEX[id] ?? player.specials?.find((special) => special.id === id);
}

export function hasGoldSpecial(player: Player): boolean {
  const ids = new Set<string>([
    ...(player.specials ?? []).map((special) => special.id),
    ...Object.keys(player.specialLevels ?? {}),
  ]);
  return [...ids].some((id) => {
    const level = player.specialLevels?.[id];
    if (typeof level === 'number' && level <= 0) return false;
    return specialDefinition(player, id)?.rarity === 'gold';
  });
}
