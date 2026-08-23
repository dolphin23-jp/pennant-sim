import type { ScoredRun, ScoringEvent, Score, Side } from './types';

/** Expand a multi-run play into one scoring event per runner. */
export function progressiveScoringEvents(
  baseScore: Score,
  scoringSide: Side,
  runsBeforePlay: number,
  runsScored: readonly ScoredRun[],
): ScoringEvent[] {
  return runsScored.map((run, index) => {
    const halfInningRunsAfterEvent = runsBeforePlay + index + 1;
    return {
      scoringSide,
      chargedPitcherId: run.chargedPitcherId,
      homeScore: baseScore.home + (scoringSide === 'home' ? halfInningRunsAfterEvent : 0),
      awayScore: baseScore.away + (scoringSide === 'away' ? halfInningRunsAfterEvent : 0),
    };
  });
}
