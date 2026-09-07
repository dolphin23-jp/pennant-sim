import type { NarrativeEventContext } from '../narrative/types';
import {
  applyDraftPicks as applyDraftPicksBase,
  generateDraftProspects as generateDraftProspectsBase,
  type DraftPick,
} from './draft';
import { createPreProHistory } from './preProHistory';
import type { Player, Teams } from './types';

function enrichUnsignedProspect(player: Player): Player {
  if (player.preProHistory) return player;
  return {
    ...player,
    preProHistory: createPreProHistory(player, {
      entryYear: 0,
      origin: player.draftOrigin,
      entryAge: player.age,
    }),
  };
}

export function generateDraftProspects(): Player[] {
  return generateDraftProspectsBase().map(enrichUnsignedProspect);
}

export function applyDraftPicks(
  teams: Teams,
  picks: DraftPick[],
  context?: NarrativeEventContext,
): Teams {
  const signedPicks = picks.map((pick) => {
    if (!context || (pick.preProHistory?.entryYear ?? 0) > 0) return pick;
    return {
      ...pick,
      preProHistory: createPreProHistory(pick, {
        entryYear: context.year + 1,
        origin: pick.draftOrigin,
        entryAge: pick.age,
      }),
    };
  });
  return applyDraftPicksBase(teams, signedPicks, context);
}
