import { ACTIVE_ROSTER_BALANCE } from '../data';
import type { ArticleArchive } from '../narrative/protocol';
import { appendNarrativeEventsSafe } from '../narrative/ledger';

import type { NarrativeEvent, NarrativeEventLedger } from '../narrative/types';
import { seasonReviewEvents } from '../engine/narrativeEvents';
import {
  aggregateTeamStats,
  assignAllActiveRosters,
  bestLineup,
  calcInterleagueStandings,
  calcOVR,
  calcStandings,
  CLUB_PLAN_LABEL,
  clubPlanFor,
  createPlayerSeasonRecords,
  detectAchievements,
  draftOrderFromStandings,
  generateSchedule,
  postseasonNarrativeEvents,
  postseasonRunnerUp,
  recommendedLineup,
  repairLineup,
  runFullOffseason,
  runPostseason,
  selectSeasonHonors,
  selectSeasonTitles,
  simCpuUntilNext,
  skipGamesWithPitcherPlan,
} from '../engine';
import type {
  AccumulatedStats,
  AchievementEvent,
  GameBoxScore,
  GameState,
  GameSummary,
  Player,
  PlayerStats,
  SeasonHonorRecord,
  SeasonOutcome,
  SeasonTitleRecord,
  StandingRecord,
  Team,
  TeamKey,
  Teams,
  YearlyPlayerRecords,
} from '../engine';
import {
  createAchievementNotices,
  createForeignLifecycleNotices,
  createFreeAgencyNotices,
  createGameResultNotice,
  createLineupRepairNotice,
  createOffseasonDevelopmentNotices,
  createSkippedInSeasonDevelopmentNotices,
  mergeNotices,
} from './notices';
import {
  createEmptyPitcherPlan,
  createEmptyRotations,
  type ChampionRecord,
  type Notice,
  type PitcherPlan,
  type SeasonState,
} from './storage';

export type GameScreen = 'welcome' | 'teamSelect' | 'season' | 'postseason' | 'offseason';

export interface RuntimeState {
  worldId: string;
  narrativeArticles: ArticleArchive;
  loading: boolean;
  loadError: string | null;
  screen: GameScreen;
  teams: Teams | null;
  playerTeam: TeamKey | null;
  viewTeam: TeamKey | null;
  season: SeasonState;
  rotN: Record<TeamKey, number>;
  lineup: Player[];
  pitcherPlan: PitcherPlan;
  standings: Record<TeamKey, StandingRecord>;
  accumulated: AccumulatedStats;
  leagueAccumulated: AccumulatedStats;
  careerAccumulated: AccumulatedStats;
  leagueCareerAccumulated: AccumulatedStats;
  yearlyStats: YearlyPlayerRecords;
  retiredPlayers: Player[];
  /** Players currently in MLB (see advanceOverseasPlayers). */
  overseasPlayers: Player[];
  notices: Notice[];
  championHistory: ChampionRecord[];
  awardHistory: SeasonTitleRecord[];
  achievementHistory: AchievementEvent[];
  honorHistory: SeasonHonorRecord[];
  narrativeEvents: NarrativeEventLedger;
  narrativeQuarantine?: unknown[];
  lastGame: GameState | null;
  selectedPlayer: Player | null;
  gameSummaries: Record<string, GameSummary>;
  gameBoxScores: Record<string, GameBoxScore>;
  selectedGameId: string | null;
  /** Set to a fresh sequence number by any update that should be persisted; the autosave
   * effect saves whenever it changes. */
  autosaveSeq: number;
}

export const initialState: RuntimeState = {
  worldId: '',
  narrativeArticles: {},
  loading: true,
  loadError: null,
  screen: 'welcome',
  teams: null,
  playerTeam: null,
  viewTeam: null,
  season: { year: 2026, schedule: [] },
  rotN: createEmptyRotations(),
  lineup: [],
  pitcherPlan: createEmptyPitcherPlan(),
  standings: calcStandings([]),
  accumulated: {},
  leagueAccumulated: {},
  careerAccumulated: {},
  leagueCareerAccumulated: {},
  yearlyStats: {},
  retiredPlayers: [],
  overseasPlayers: [],
  notices: [],
  championHistory: [],
  awardHistory: [],
  achievementHistory: [],
  honorHistory: [],
  narrativeEvents: {},
  lastGame: null,
  selectedPlayer: null,
  gameSummaries: {},
  gameBoxScores: {},
  selectedGameId: null,
  autosaveSeq: 0,
};

/** Append new ledger facts inside a state update. A rejected event is quarantined (and kept
 * in the save) instead of throwing, which would abort the update and every later autosave. */
export function withNarrativeEvents(
  current: Pick<RuntimeState, 'narrativeEvents' | 'narrativeQuarantine'>,
  events: readonly NarrativeEvent[],
): Pick<RuntimeState, 'narrativeEvents' | 'narrativeQuarantine'> {
  const { ledger, rejected } = appendNarrativeEventsSafe(current.narrativeEvents, events);
  if (!rejected.length) return { narrativeEvents: ledger };
  console.warn(`${rejected.length} narrative event(s) failed validation and were quarantined.`);
  return {
    narrativeEvents: ledger,
    narrativeQuarantine: [...(current.narrativeQuarantine ?? []), ...rejected],
  };
}

export function mergeStats(base: AccumulatedStats, addition: AccumulatedStats): AccumulatedStats {
  const merged: AccumulatedStats = { ...base };
  for (const [playerId, nextLine] of Object.entries(addition)) {
    const current = merged[playerId];
    if (!current) {
      merged[playerId] = { ...nextLine } as PlayerStats;
      continue;
    }
    const output = { ...current } as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(nextLine)) {
      if (typeof value === 'number') output[key] = Number(output[key] ?? 0) + value;
      else if (key === 'name' || key === 'type') output[key] = value;
    }
    merged[playerId] = output as unknown as PlayerStats;
  }
  return merged;
}

let autosaveCounter = 0;
/** Monotonic across new games and loads, so a reset state can never reuse a saved sequence. */
export const nextAutosaveSeq = (): number => (autosaveCounter += 1);

function lastNewPlayerGameDate(
  before: SeasonState['schedule'],
  after: SeasonState['schedule'],
  playerTeam: TeamKey,
): string | null {
  const beforeById = new Map(before.map((game) => [game.id, game]));
  return (
    after
      .filter(
        (game) =>
          game.played &&
          !beforeById.get(game.id)?.played &&
          (game.homeKey === playerTeam || game.awayKey === playerTeam),
      )
      .map((game) => game.date)
      .sort((first, second) => second.localeCompare(first))[0] ?? null
  );
}

/** Play out the schedule in bulk (the "skip" buttons). */
export function applySkip(
  current: RuntimeState,
  mode: 'next' | 'week' | 'month' | 'season',
  manageUserRoster = false,
): RuntimeState {
  if (!current.teams || !current.playerTeam) return current;
  const beforeTeam = current.teams[current.playerTeam];
  const teams = { ...current.teams };
  const result = skipGamesWithPitcherPlan(
    current.season.schedule,
    teams,
    current.rotN,
    current.playerTeam,
    mode,
    current.leagueAccumulated,
    // おまかせ進行 hands the lineup and staff to the AI; manual skips play the saved ones.
    manageUserRoster ? createEmptyPitcherPlan() : current.pitcherPlan,
    current.leagueAccumulated,
    manageUserRoster,
    manageUserRoster ? null : current.lineup,
  );
  const repaired = repairLineup(teams[current.playerTeam], current.lineup);
  const accumulated = mergeStats(current.accumulated, result.distStats);
  const leagueAccumulated = mergeStats(current.leagueAccumulated, result.leagueDistStats);
  const leagueCareerAccumulated = mergeStats(
    current.leagueCareerAccumulated,
    result.leagueDistStats,
  );
  const seasonOver = result.sched.every((game) => game.played);
  const noticeDate =
    lastNewPlayerGameDate(current.season.schedule, result.sched, current.playerTeam) ??
    `${current.season.year}年`;
  const developmentNotices = createSkippedInSeasonDevelopmentNotices(
    beforeTeam,
    teams[current.playerTeam],
    current.playerTeam,
    noticeDate,
  );
  const gameNotices = Object.values(result.gameBoxScores)
    .map((box) => createGameResultNotice(box, current.playerTeam as TeamKey))
    .filter((notice): notice is Notice => notice !== null);
  const achievements = detectAchievements({
    year: current.season.year,
    date: noticeDate,
    teams,
    beforeSeasonStats: current.leagueAccumulated,
    afterSeasonStats: leagueAccumulated,
    beforeCareerStats: current.leagueCareerAccumulated,
    afterCareerStats: leagueCareerAccumulated,
    yearlyStats: current.yearlyStats,
  });
  const achievementNotices = createAchievementNotices(achievements);
  const next: RuntimeState = {
    ...current,
    screen: seasonOver ? 'postseason' : 'season',
    teams,
    season: { ...current.season, schedule: result.sched },
    rotN: result.rotN,
    standings: calcStandings(result.sched),
    accumulated,
    leagueAccumulated,
    careerAccumulated: mergeStats(current.careerAccumulated, result.distStats),
    leagueCareerAccumulated,
    achievementHistory: [...current.achievementHistory, ...achievements],
    ...withNarrativeEvents(current, result.narrativeEvents),
    gameSummaries: { ...current.gameSummaries, ...result.gameSummaries },
    gameBoxScores: { ...current.gameBoxScores, ...result.gameBoxScores },
    lineup: repaired.lineup,
    notices: mergeNotices(current.notices, [
      ...gameNotices,
      ...[createLineupRepairNotice(repaired.substitutions, current.playerTeam, noticeDate)].filter(
        (notice): notice is Notice => notice !== null,
      ),
      ...developmentNotices,
      ...achievementNotices,
    ]),
    autosaveSeq: nextAutosaveSeq(),
  };
  return next;
}

/** Record the Japan Series champion and the postseason's facts. */
export function applyChampionship(
  current: RuntimeState,
  champion: TeamKey,
  runnerUp: TeamKey,
  events: NarrativeEvent[] = [],
): RuntimeState {
  if (!current.teams) return current;
  const team = current.teams[champion];
  const lineup = bestLineup(team).map((player) => ({
    playerId: player.id,
    playerName: player.name,
    pos: player._assignedPos ?? player.pos ?? '',
    isPitcher: player.isP,
  }));
  const teamStats = aggregateTeamStats(team, current.leagueAccumulated);
  const standing = current.standings[champion];
  const record: ChampionRecord = {
    year: current.season.year,
    champion,
    runnerUp,
    keyBatters: team.fielders
      .slice()
      .sort((first, second) => calcOVR(second, second.pos) - calcOVR(first, first.pos))
      .slice(0, 2)
      .map((player) => player.name),
    keyPitchers: team.pitchers
      .slice()
      .sort((first, second) => calcOVR(second, second.pos) - calcOVR(first, first.pos))
      .slice(0, 2)
      .map((player) => player.name),
    lineup,
    teamStats,
    record: standing ? { w: standing.w, l: standing.l, d: standing.d } : undefined,
  };
  const next: RuntimeState = {
    ...current,
    ...withNarrativeEvents(current, events),
    championHistory: [
      ...current.championHistory.filter((entry) => entry.year !== current.season.year),
      record,
    ],
    autosaveSeq: nextAutosaveSeq(),
  };
  return next;
}

/** Archive the completed year and open the next season with the offseason's rosters. */
export function applyOffseasonCompletion(
  current: RuntimeState,
  teams: Teams,
  developmentNotices: Notice[] = [],
  events: NarrativeEvent[] = [],
  retired: Player[] = [],
  overseas: Player[] = current.overseasPlayers,
): RuntimeState {
  // Every club, the user's included, opens the season with a fresh 一軍 registration.
  const nextTeams = assignAllActiveRosters(teams);
  if (!current.playerTeam) return current;
  // A duplicate completion callback belongs to the already committed old year.
  if (events.some((event) => event.year !== current.season.year)) return current;
  const completedYear = current.season.year;
  const activeIds = new Set(
    Object.values(nextTeams).flatMap((team) =>
      [...team.pitchers, ...team.fielders].map((player) => player.id),
    ),
  );
  const seasonRecords = current.teams
    ? createPlayerSeasonRecords(completedYear, current.teams, current.leagueAccumulated)
    : [];
  const seasonTitles = current.teams
    ? selectSeasonTitles(
        completedYear,
        current.teams,
        current.leagueAccumulated,
        Object.fromEntries(
          Object.entries(current.standings).map(([teamKey, standing]) => [teamKey, standing.g]),
        ),
      )
    : [];
  const seasonHonors = current.teams
    ? selectSeasonHonors(completedYear, current.teams, current.leagueAccumulated, current.standings)
    : [];
  const year = completedYear + 1;
  const schedule = generateSchedule(year);
  const prepared = simCpuUntilNext(
    schedule,
    nextTeams,
    createEmptyRotations(),
    current.playerTeam,
    {},
    {},
  );
  const next: RuntimeState = {
    ...current,
    teams: nextTeams,
    ...withNarrativeEvents(current, [
      ...events,
      ...seasonReviewEvents(
        completedYear,
        current.standings,
        current.championHistory.find((c) => c.year === completedYear)?.champion,
      ),
      ...prepared.narrativeEvents,
    ]),
    // A player back on a roster (returning from MLB) is no longer a departed one.
    retiredPlayers: [
      ...new Map([...current.retiredPlayers, ...retired].map((p) => [p.id, p])).values(),
    ].filter((player) => !activeIds.has(player.id)),
    overseasPlayers: overseas,
    screen: 'season',
    season: { year, schedule: prepared.sched },
    rotN: prepared.rotN,
    lineup: recommendedLineup(nextTeams[current.playerTeam]),
    // A new season starts from the AI's staff; last year's plan names departed pitchers.
    pitcherPlan: createEmptyPitcherPlan(),
    standings: calcStandings(prepared.sched),
    accumulated: {},
    leagueAccumulated: prepared.leagueDistStats,
    yearlyStats: {
      ...current.yearlyStats,
      [String(completedYear)]: seasonRecords,
    },
    awardHistory: [
      ...current.awardHistory.filter((record) => record.year !== completedYear),
      ...seasonTitles,
    ],
    honorHistory: [
      ...current.honorHistory.filter((record) => record.year !== completedYear),
      ...seasonHonors,
    ],
    gameSummaries: { ...current.gameSummaries, ...prepared.gameSummaries },
    gameBoxScores: { ...current.gameBoxScores, ...prepared.gameBoxScores },
    notices: mergeNotices(current.notices, [
      ...developmentNotices,
      {
        id: `active-roster:${year}:${current.playerTeam}`,
        kind: 'system',
        title: `${year}年の開幕一軍を登録`,
        body: `投手${ACTIVE_ROSTER_BALANCE.pitchers}人・野手${ACTIVE_ROSTER_BALANCE.limit - ACTIVE_ROSTER_BALANCE.pitchers}人を一軍に登録しました。「一軍・二軍」タブで入れ替えられます。`,
        tone: 'info',
        date: `${year}年開幕`,
        teamKey: current.playerTeam,
      },
    ]),
    lastGame: null,
    autosaveSeq: nextAutosaveSeq(),
  };
  return next;
}

/** The winter plan the CPU chose for the user's club when it manages the offseason. */
function clubPlanNotice(
  team: Team | undefined,
  outcome: SeasonOutcome,
  year: number,
): Notice | null {
  if (!team) return null;
  const plan = clubPlanFor(team, outcome);
  if (plan.mode === 'balanced') return null;
  return {
    id: `club-plan:${year}:${team.key}`,
    kind: 'system',
    title: `今オフの編成方針：${CLUB_PLAN_LABEL[plan.mode]}`,
    body:
      plan.mode === 'rebuild'
        ? `勝率${plan.winPct.toFixed(3).replace(/^0/, '')}・主力の平均${plan.coreAge.toFixed(1)}歳。ベテランを出して若手を集めます。`
        : `勝率${plan.winPct.toFixed(3).replace(/^0/, '')}。FAで即戦力の獲得に動きます。`,
    tone: 'info',
    date: `${year}年オフ`,
    teamKey: team.key,
  };
}

/** How the season that just ended went, for club revenue and FA decisions. */
export function seasonOutcome(
  current: Pick<RuntimeState, 'standings' | 'championHistory' | 'season'>,
): SeasonOutcome {
  const record = current.championHistory.find((entry) => entry.year === current.season.year);
  return {
    standings: current.standings,
    champion: record?.champion ?? null,
    runnerUp: record?.runnerUp ?? null,
  };
}

/**
 * One whole year handed to the CPU: the rest of the regular season, the postseason, and an
 * offseason in which the user's club is managed like every other (cuts, signings, the
 * draft, mandatory retirement). Starts from wherever the year currently stands.
 */
export function advanceOneYear(current: RuntimeState): RuntimeState {
  if (!current.teams || !current.playerTeam) return { ...current };
  const playerTeam = current.playerTeam;
  let state = current.season.schedule.every((game) => game.played)
    ? current
    : applySkip(current, 'season', true);
  const year = state.season.year;
  if (!state.championHistory.some((record) => record.year === year)) {
    const teams = { ...(state.teams as Teams) };
    const results = runPostseason({
      teams,
      standings: state.standings,
      schedule: state.season.schedule,
      year,
      leagueAccumulated: state.leagueAccumulated,
    });
    state = applyChampionship(
      { ...state, teams },
      results.japanSeries.winner,
      postseasonRunnerUp(results),
      postseasonNarrativeEvents(results),
    );
  }
  const events: NarrativeEvent[] = [];
  const offseason = runFullOffseason(
    state.teams as Teams,
    {
      year,
      seasonStats: state.leagueAccumulated,
      draftOrder: draftOrderFromStandings(
        state.standings,
        calcInterleagueStandings(state.season.schedule),
      ),
      userTeam: playerTeam,
      outcome: seasonOutcome(state),
      overseas: state.overseasPlayers,
    },
    { year, date: `${year}年オフ`, emit: (event) => events.push(event) },
  );
  const developmentNotices = [
    ...createOffseasonDevelopmentNotices(
      offseason.foreignReview.teams[playerTeam],
      offseason.growth.teams[playerTeam],
      offseason.growth.awakeEvents,
      playerTeam,
      year,
    ),
    ...createForeignLifecycleNotices(offseason.foreignReview.events, playerTeam, year),
    ...createFreeAgencyNotices(events, playerTeam, year),
    clubPlanNotice(state.teams?.[playerTeam], seasonOutcome(state), year),
  ].filter((notice): notice is Notice => notice !== null);
  return applyOffseasonCompletion(
    state,
    offseason.teams,
    developmentNotices,
    events,
    offseason.exits.map((exit) => exit.player),
    offseason.overseas,
  );
}

export interface AdvanceProgress {
  done: number;
  total: number;
}
