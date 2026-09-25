import { popularityOf } from './popularity';
import type { Player, Temperament } from './types';

/**
 * How a player takes the spotlight. Most are unmoved by it; some rise to a big stage and a
 * crowd that came to see them, and some tighten up under the same eyes. The effect grows
 * with popularity (a nobody has no spotlight to feel) and doubles when the game is on the
 * line, but stays small: a few percent at most, never a rating.
 */
export const TEMPERAMENT_LABEL: Record<Temperament, string> = {
  bigStage: '大舞台に強い',
  steady: '平常心',
  pressure: '注目で力む',
};

export const TEMPERAMENT_DESCRIPTION: Record<Temperament, string> = {
  bigStage: '注目されるほど力を出す。人気が高いほど、終盤の接戦やポストシーズンで少し強くなる。',
  steady: '注目にも重圧にも左右されない。',
  pressure: '注目を浴びるほど硬くなる。人気が高いほど、終盤の接戦やポストシーズンで少し弱くなる。',
};

/** Largest effect, at popularity 100, in an ordinary moment; doubled in a big one. */
export const SPOTLIGHT_EFFECT = 0.02;

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A player's temperament: set by hand in debug mode, otherwise fixed by his id (about one
 * in five rises to the occasion, one in seven tightens), with no random draw. */
export function temperamentOf(player: Player): Temperament {
  if (player.temperament) return player.temperament;
  const roll = hashId(`temperament:${player.id}`) % 100;
  return roll < 20 ? 'bigStage' : roll < 85 ? 'steady' : 'pressure';
}

/** How much the spotlight lifts (above 1) or weighs on (below 1) a player right now. */
export function spotlightMultiplier(player: Player, highLeverage = false): number {
  const temperament = temperamentOf(player);
  if (temperament === 'steady') return 1;
  const exposure = Math.max(0, Math.min(1, (popularityOf(player) - 50) / 50));
  const effect = exposure * SPOTLIGHT_EFFECT * (highLeverage ? 2 : 1);
  return temperament === 'bigStage' ? 1 + effect : 1 - effect;
}
