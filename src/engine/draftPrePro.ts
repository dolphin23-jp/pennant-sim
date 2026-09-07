import type { NarrativeEventContext } from '../narrative/types';
import {
  applyDraftPicks as applyDraftPicksBase,
  generateDraftProspects as generateDraftProspectsBase,
  runCpuDraft as runCpuDraftBase,
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

function enrichSignedPick(pick: DraftPick, context?: NarrativeEventContext): DraftPick {
  if ((pick.preProHistory?.entryYear ?? 0) > 0) return pick;
  return {
    ...pick,
    preProHistory: createPreProHistory(pick, {
      entryYear: context ? context.year + 1 : 0,
      origin: pick.draftOrigin,
      entryAge: pick.age,
    }),
  };
}

function attachSignedHistories(teams: Teams, picks: DraftPick[]): Teams {
  const historyByPlayer = new Map(
    picks.flatMap((pick) => (pick.preProHistory ? [[pick.id, pick.preProHistory] as const] : [])),
  );
  const next = { ...teams };
  for (const teamKey of Object.keys(next) as Array<keyof Teams>) {
    const team = next[teamKey];
    const attach = (player: Player): Player => {
      const preProHistory = historyByPlayer.get(player.id);
      return preProHistory ? { ...player, preProHistory } : player;
    };
    next[teamKey] = {
      ...team,
      pitchers: team.pitchers.map(attach),
      fielders: team.fielders.map(attach),
    };
  }
  return next;
}

export function applyDraftPicks(
  teams: Teams,
  picks: DraftPick[],
  context?: NarrativeEventContext,
): Teams {
  const signedPicks = picks.map((pick) => (context ? enrichSignedPick(pick, context) : pick));
  return applyDraftPicksBase(teams, signedPicks, context);
}

export function runCpuDraft(
  teams: Teams,
  rounds = 6,
  context?: NarrativeEventContext,
): { teams: Teams; picks: DraftPick[] } {
  // Run the original draft first so nominations, lotteries, picks, generated players and
  // every global RNG draw stay byte-for-byte identical. Canonical amateur history is
  // attached only after the draft outcome is already fixed.
  const result = runCpuDraftBase(teams, rounds, context);
  const picks = result.picks.map((pick) => enrichSignedPick(pick, context));
  return {
    picks,
    teams: attachSignedHistories(result.teams, picks),
  };
}
