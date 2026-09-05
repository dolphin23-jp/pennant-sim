/** Fact adapters used only by the subsystem committing the corresponding operation. */
import type {
  NarrativeEvent,
  NarrativeEventContext,
  TransactionNarrativeEvent,
} from '../narrative/types';
import type { RosterExit } from './offseason';
import type { Player, PostGameEvents, StandingRecord, TeamKey } from './types';

export function emitTrade(
  context: NarrativeEventContext | undefined,
  stableId: string,
  movements: NonNullable<TransactionNarrativeEvent['movements']>,
  cashAmountManYen = 0,
): void {
  if (!context || !movements.length) return;
  context.emit({
    type: 'transaction',
    id: `transaction:trade:${context.year}:${stableId}`,
    year: context.year,
    date: context.date,
    transactionKind: 'trade',
    ...movements[0],
    movements,
    cashAmountManYen,
  });
}

export function emitRosterExits(
  context: NarrativeEventContext | undefined,
  exits: RosterExit[],
): void {
  if (!context) return;
  for (const exit of exits) {
    const kind =
      exit.reason === 'mandatoryRetirement' || exit.reason === 'ageAndPerformance'
        ? 'retirement'
        : 'release';
    context.emit({
      type: 'transaction',
      id: `transaction:${kind}:${context.year}:${exit.teamKey}:${exit.playerId}`,
      year: context.year,
      date: context.date,
      transactionKind: kind,
      playerId: exit.playerId,
      playerName: exit.name,
      fromTeamKey: exit.teamKey,
      exitReason: exit.reason,
    });
  }
}

export function emitGrowth(
  context: NarrativeEventContext | undefined,
  teamKey: TeamKey,
  grown: Player,
): void {
  if (!context) return;
  const entry = grown.growthLog?.at(-1);
  // Record notable annual changes, not a second full roster snapshot every year.
  if (!entry || entry.ovrBefore == null || entry.ovrAfter == null || Math.abs(entry.delta ?? 0) < 3)
    return;
  context.emit({
    type: 'development',
    id: `development:${context.year}:offseason:${grown.id}:growth`,
    year: context.year,
    date: context.date,
    teamKey,
    playerId: grown.id,
    playerName: grown.name,
    developmentKind: 'growth',
    ovrBefore: entry.ovrBefore,
    ovrAfter: entry.ovrAfter,
    changes: structuredClone(entry.changes ?? []),
  });
}

/** The post-game subsystem already emitted these exact facts, including CPU-only games. */
export function narrativeEventsFromPostGame(
  gameId: string,
  date: string,
  events: PostGameEvents,
): NarrativeEvent[] {
  const year = Number(date.slice(0, 4));
  return [
    ...events.injuries.map((event) => ({
      type: 'injury' as const,
      id: `injury:${year}:${gameId}:${event.playerId}`,
      year,
      date,
      teamKey: event.teamKey,
      playerId: event.playerId,
      playerName: event.name,
      days: event.days,
      severity: event.severity,
    })),
    ...events.awakenings.map((event) => ({
      type: 'development' as const,
      id: `development:${year}:${gameId}:${event.playerId}:awakening`,
      year,
      date,
      teamKey: event.teamKey,
      playerId: event.playerId,
      playerName: event.name,
      developmentKind: 'awakening' as const,
      boosts: structuredClone(event.changes),
      isBreakthrough: event.isBreakthrough,
      newSpecial: event.newSpecial,
    })),
    ...(events.recoveries ?? []).map((event) => ({
      type: 'career' as const,
      id: `career:${year}:${gameId}:${event.playerId}:returnFromInjury`,
      year,
      date,
      teamKey: event.teamKey,
      playerId: event.playerId,
      playerName: event.name,
      careerKind: 'returnFromInjury' as const,
      injuryDaysBefore: 1 as const,
    })),
  ];
}

export function seasonReviewEvents(
  year: number,
  standings: Record<TeamKey, StandingRecord>,
  champion?: TeamKey,
): NarrativeEvent[] {
  return (Object.entries(standings) as [TeamKey, StandingRecord][]).flatMap(([teamKey, s]) =>
    s.rank == null
      ? []
      : [
          {
            type: 'seasonReview' as const,
            id: `season-review:${year}:${teamKey}`,
            year,
            date: `${year}年シーズン終了`,
            teamKey,
            rank: s.rank,
            wins: s.w,
            losses: s.l,
            draws: s.d,
            champion: champion === teamKey,
          },
        ],
  );
}
