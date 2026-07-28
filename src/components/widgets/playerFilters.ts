import type { FieldPosition, Player } from '../../engine';

export type AgeFilter = 'all' | 'under24' | '25to29' | 'over30';
export type PositionFilter = 'all' | FieldPosition;

export function matchesAge(player: Player, filter: AgeFilter): boolean {
  if (filter === 'under24') return player.age <= 24;
  if (filter === '25to29') return player.age >= 25 && player.age <= 29;
  if (filter === 'over30') return player.age >= 30;
  return true;
}

export function supportsPosition(player: Player, position: FieldPosition): boolean {
  if (player.isP) return false;
  return (
    player._assignedPos === position ||
    player.pos === position ||
    Boolean(player.positions?.some((entry) => entry.pos === position))
  );
}

export function matchesPositionFilter(player: Player, filter: PositionFilter): boolean {
  return filter === 'all' || supportsPosition(player, filter);
}
