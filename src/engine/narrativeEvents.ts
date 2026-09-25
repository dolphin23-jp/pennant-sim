/** Fact adapters used only by the subsystem committing the corresponding operation. */
import type {
  NarrativeEvent,
  NarrativeEventContext,
  TransactionNarrativeEvent,
} from '../narrative/types';
import type { RosterExit } from './offseason';
import { CENTRAL, PACIFIC } from '../data';
import type { SeasonTitleRecord } from './awards';
import { clinchDate, pennantRace } from './pennantRace';
import { gameAttendance } from './popularity';
import { averageText, earnedRunAverage } from './statsFormat';
import type {
  AccumulatedStats,
  Player,
  PostGameEvents,
  ScheduleGame,
  StandingRecord,
  TeamKey,
  Teams,
} from './types';

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
      exit.reason === 'mandatoryRetirement' ||
      exit.reason === 'voluntaryRetirement' ||
      exit.reason === 'ageAndPerformance'
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
      ...(kind === 'retirement' ? { ageAtExit: exit.age } : {}),
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
/** A player's season so far as a newspaper line, from the stats before the game. */
export function seasonLineText(
  stats: AccumulatedStats | undefined,
  playerId: string,
): string | null {
  const line = stats?.[playerId];
  if (!line) return null;
  if (line.type === 'bat') {
    if (line.pa < 20) return null;
    return `打率${averageText(line.h, line.ab)} ${line.hr}本塁打 ${line.rbi}打点`;
  }
  if (line.ip3 < 15) return null;
  const era = earnedRunAverage(line);
  return `${line.g}試合 ${line.w}勝${line.l}敗${line.sv ? `${line.sv}セーブ` : ''} 防御率${era === null ? '-' : era.toFixed(2)}`;
}

export function narrativeEventsFromPostGame(
  gameId: string,
  date: string,
  events: PostGameEvents,
  /** Season stats before this game, so an injury article can say what the club loses. */
  seasonStats?: AccumulatedStats,
): NarrativeEvent[] {
  const year = Number(date.slice(0, 4));
  return [
    ...events.injuries.map((event) => {
      const seasonLine = seasonLineText(seasonStats, event.playerId);
      return {
        type: 'injury' as const,
        id: `injury:${year}:${gameId}:${event.playerId}`,
        year,
        date,
        teamKey: event.teamKey,
        playerId: event.playerId,
        playerName: event.name,
        days: event.days,
        severity: event.severity,
        ...(seasonLine ? { seasonLine } : {}),
      };
    }),
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

export interface SeasonReviewContext {
  /** The season's individual titles, to name each club's title holders. */
  titles?: SeasonTitleRecord[];
  /** The finished schedule, for the pennant-clinching day and the season's crowds. */
  schedule?: ScheduleGame[];
  teams?: Teams;
  /** The owner's goal and grade for the user's club. */
  ownerReview?: { teamKey: TeamKey; targetLabel: string; grade: string; gradeLabel: string };
}

/**
 * Pennants clinched by a stretch of games: every club, in either league, that had not
 * clinched before and has now. Frozen with the record and the game on the clinching day.
 */
export function pennantClinchEvents(
  year: number,
  before: ScheduleGame[],
  after: ScheduleGame[],
): NarrativeEvent[] {
  return [CENTRAL, PACIFIC].flatMap((league) => {
    const was = pennantRace(before, league);
    const now = pennantRace(after, league);
    return league.flatMap((teamKey) => {
      if (was[teamKey]?.clinchedPennant || !now[teamKey]?.clinchedPennant) return [];
      const day = clinchDate(after, league, teamKey);
      if (!day) return [];
      const tally = Object.fromEntries(league.map((key) => [key, { w: 0, l: 0, d: 0 }]));
      let remaining = 0;
      for (const game of after) {
        const involved = game.homeKey === teamKey || game.awayKey === teamKey;
        if (!game.played || game.date > day) {
          if (involved) remaining += 1;
          continue;
        }
        const home = game.hs ?? 0;
        const away = game.as ?? 0;
        for (const [key, own, other] of [
          [game.homeKey, home, away],
          [game.awayKey, away, home],
        ] as const) {
          const record = tally[key];
          if (!record) continue;
          if (own > other) record.w += 1;
          else if (own < other) record.l += 1;
          else record.d += 1;
        }
      }
      const own = tally[teamKey]!;
      const second = league
        .filter((key) => key !== teamKey)
        .map((key) => tally[key]!)
        .sort(
          (first, other) =>
            other.w / Math.max(1, other.w + other.l) - first.w / Math.max(1, first.w + first.l),
        )[0]!;
      const gamesAhead = Math.max(0, (own.w - second.w + second.l - own.l) / 2);
      const game = after.find(
        (candidate) =>
          candidate.played &&
          candidate.date === day &&
          (candidate.homeKey === teamKey || candidate.awayKey === teamKey),
      );
      const home = game?.homeKey === teamKey;
      return [
        {
          type: 'pennantClinch' as const,
          id: `pennant-clinch:${year}:${teamKey}`,
          year,
          date: day,
          teamKey,
          wins: own.w,
          losses: own.l,
          draws: own.d,
          remaining,
          gamesAhead,
          ...(game
            ? {
                clinchingGame: {
                  opponentKey: home ? game.awayKey : game.homeKey,
                  runsFor: (home ? game.hs : game.as) ?? 0,
                  runsAgainst: (home ? game.as : game.hs) ?? 0,
                },
              }
            : {}),
        },
      ];
    });
  });
}

const monthDay = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

export function seasonReviewEvents(
  year: number,
  standings: Record<TeamKey, StandingRecord>,
  champion?: TeamKey,
  context: SeasonReviewContext = {},
): NarrativeEvent[] {
  return (Object.entries(standings) as [TeamKey, StandingRecord][]).flatMap(([teamKey, s]) => {
    if (s.rank == null) return [];
    const league = CENTRAL.includes(teamKey) ? CENTRAL : PACIFIC;
    const titleHolders = (context.titles ?? [])
      .filter((title) => title.teamKey === teamKey)
      .map((title) => ({
        playerId: title.playerId,
        playerName: title.playerName,
        titleLabel: title.titleLabel,
      }));
    const clinched =
      s.rank === 1 && context.schedule ? clinchDate(context.schedule, league, teamKey) : null;
    const homeGames = (context.schedule ?? []).filter(
      (game) => game.played && game.homeKey === teamKey,
    );
    const team = context.teams?.[teamKey];
    const averageAttendance =
      team && homeGames.length
        ? Math.round(
            homeGames.reduce(
              (sum, game) => sum + gameAttendance(team, game.id, game.date, s.rank),
              0,
            ) / homeGames.length,
          )
        : undefined;
    const owner = context.ownerReview?.teamKey === teamKey ? context.ownerReview : undefined;
    return [
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
        ...(titleHolders.length ? { titleHolders } : {}),
        gamesBehind: s.gb && s.gb !== '-' ? Number(s.gb) : 0,
        ...(clinched ? { clinchedOn: monthDay(clinched) } : {}),
        ...(averageAttendance !== undefined ? { averageAttendance } : {}),
        ...(owner
          ? {
              ownerReview: {
                targetLabel: owner.targetLabel,
                grade: owner.grade,
                gradeLabel: owner.gradeLabel,
              },
            }
          : {}),
      },
    ];
  });
}

/**
 * A top pick's first game as a pro: a rookie drafted in the first two rounds appearing
 * for the first time this season. Decided from the game's own stats, no random draw.
 */
export function debutEvents(
  gameId: string,
  date: string,
  gameStats: AccumulatedStats,
  before: AccumulatedStats,
  teams: Teams,
): NarrativeEvent[] {
  const year = Number(date.slice(0, 4));
  const events: NarrativeEvent[] = [];
  for (const [teamKey, team] of Object.entries(teams) as Array<[TeamKey, Teams[TeamKey]]>) {
    for (const player of [...team.fielders, ...team.pitchers]) {
      if (!player.rookieSeason || (player.draftRound ?? 99) > 2) continue;
      if (!gameStats[player.id] || before[player.id]) continue;
      const pick = player.draftRound === 1 ? 'ドラフト1位' : 'ドラフト2位';
      const origin = player.draftOrigin ? `${player.draftOrigin}の` : '';
      events.push({
        type: 'career',
        id: `career:${year}:${gameId}:${player.id}:debut`,
        year,
        date,
        teamKey,
        playerId: player.id,
        playerName: player.name,
        careerKind: 'debut',
        detail: `${pick}で入団した${origin}${player.name}が、プロ初出場を果たした。`,
      });
    }
  }
  return events;
}

/** A player's first individual title: the season he broke through. */
export function breakthroughEvents(
  year: number,
  titles: SeasonTitleRecord[],
  earlierTitles: SeasonTitleRecord[],
): NarrativeEvent[] {
  const before = new Set(earlierTitles.filter((t) => t.year < year).map((t) => t.playerId));
  const seen = new Set<string>();
  return titles.flatMap((title) => {
    if (before.has(title.playerId) || seen.has(title.playerId)) return [];
    seen.add(title.playerId);
    const labels = titles
      .filter((entry) => entry.playerId === title.playerId)
      .map((entry) => entry.titleLabel);
    return [
      {
        type: 'career' as const,
        id: `career:${year}:${title.playerId}:breakthrough`,
        year,
        date: `${year}年シーズン終了`,
        teamKey: title.teamKey,
        playerId: title.playerId,
        playerName: title.playerName,
        careerKind: 'breakthrough' as const,
        detail: `${title.playerName}が自身初の個人タイトル（${labels.join('・')}）を獲得した。`,
      },
    ];
  });
}
