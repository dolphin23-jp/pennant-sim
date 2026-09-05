import { type ArticleArchive, type ArticleSnapshot, validSnapshot } from '../narrative/protocol';
import { appendNarrativeEvents } from '../narrative/ledger';
import { resumeSeasonScreen } from './seasonProgress';
import type { NarrativeEvent, NarrativeEventLedger } from '../narrative/types';
import { narrativeEventsFromPostGame, seasonReviewEvents } from '../engine/narrativeEvents';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  accumulateStats,
  accumulateStatsAll,
  aggregateTeamStats,
  bestLineup,
  buildGameBoxScore,
  calcOVR,
  calcStandings,
  createFictionalLeagueHistory,
  createPlayerSeasonRecords,
  detectAchievements,
  generateSchedule,
  initTeams,
  registerExistingNames,
  selectSeasonTitles,
  simCpuUntilNext,
  simulateGame,
  skipGamesWithPitcherPlan,
  toSummary,
} from '../engine';
import type {
  AccumulatedStats,
  AchievementEvent,
  GameBoxScore,
  GameState,
  GameSummary,
  Player,
  PlayerStats,
  SeasonTitleRecord,
  StandingRecord,
  TeamKey,
  Teams,
  YearlyPlayerRecords,
} from '../engine';
import {
  createAchievementNotices,
  createGameResultNotice,
  createInSeasonDevelopmentNotices,
  createSkippedInSeasonDevelopmentNotices,
  mergeNotices,
} from './notices';
import {
  createEmptyPitcherPlan,
  createEmptyRotations,
  loadGame,
  saveGame,
  type ChampionRecord,
  type GameSaveData,
  type Notice,
  type PitcherPlan,
  type SeasonState,
} from './storage';

export type GameScreen = 'welcome' | 'teamSelect' | 'season' | 'postseason' | 'offseason';

interface RuntimeState {
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
  notices: Notice[];
  championHistory: ChampionRecord[];
  awardHistory: SeasonTitleRecord[];
  achievementHistory: AchievementEvent[];
  narrativeEvents: NarrativeEventLedger;
  lastGame: GameState | null;
  selectedPlayer: Player | null;
  gameSummaries: Record<string, GameSummary>;
  gameBoxScores: Record<string, GameBoxScore>;
  selectedGameId: string | null;
}

interface GameContextValue extends RuntimeState {
  recordNarrativeArticle(world: string, snapshot: ArticleSnapshot): void;
  isSeasonOver: boolean;
  debugMode: boolean;
  startNewGame(): void;
  chooseTeam(teamKey: TeamKey): void;
  simulateNextGame(): void;
  skip(mode: 'next' | 'week' | 'month' | 'season'): void;
  saveCurrent(): Promise<boolean>;
  setScreen(screen: GameScreen): void;
  setViewTeam(teamKey: TeamKey): void;
  setLineup(lineup: Player[]): void;
  setPitcherPlan(plan: PitcherPlan): void;
  selectPlayer(player: Player | null): void;
  selectGame(gameId: string | null): void;
  dismissNotice(noticeId: string): void;
  clearNotices(): void;
  replaceTeams(teams: Teams): void;
  /** Debug-only: overwrite one player wherever they sit in `teams`, keeping the currently
   * selected player in sync so an open detail modal reflects the edit immediately. */
  updatePlayer(player: Player): void;
  toggleDebugMode(): void;
  completeOffseason(
    teams: Teams,
    developmentNotices?: Notice[],
    events?: NarrativeEvent[],
    retired?: Player[],
  ): void;
  recordChampionship(champion: TeamKey, runnerUp: TeamKey, events?: NarrativeEvent[]): void;
}

const DEBUG_MODE_KEY = 'pennant-sim:debugMode';

const initialState: RuntimeState = {
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
  notices: [],
  championHistory: [],
  awardHistory: [],
  achievementHistory: [],
  narrativeEvents: {},
  lastGame: null,
  selectedPlayer: null,
  gameSummaries: {},
  gameBoxScores: {},
  selectedGameId: null,
};

const GameContext = createContext<GameContextValue | null>(null);

function mergeStats(base: AccumulatedStats, addition: AccumulatedStats): AccumulatedStats {
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

function snapshotFromState(state: RuntimeState): GameSaveData | null {
  if (!state.teams) return null;
  return {
    worldId: state.worldId,
    narrativeArticles: state.narrativeArticles,
    teams: state.teams,
    playerTeam: state.playerTeam,
    viewTeam: state.viewTeam,
    season: state.season,
    rotN: state.rotN,
    lineup: state.lineup,
    pitcherPlan: state.pitcherPlan,
    standings: state.standings,
    accumulated: state.accumulated,
    leagueAccumulated: state.leagueAccumulated,
    careerAccumulated: state.careerAccumulated,
    leagueCareerAccumulated: state.leagueCareerAccumulated,
    yearlyStats: state.yearlyStats,
    retiredPlayers: state.retiredPlayers,
    notices: state.notices,
    championHistory: state.championHistory,
    awardHistory: state.awardHistory,
    achievementHistory: state.achievementHistory,
    narrativeEvents: state.narrativeEvents,
    gameSummaries: state.gameSummaries,
    gameBoxScores: state.gameBoxScores,
    uiVersion: 1,
  };
}

/**
 * Best-effort autosave: fire-and-forget, silently ignore failures. This runs
 * inside a setState updater (see simulateNextGame/skip/completeOffseason below),
 * which is already not a pure function in this codebase — it calls into the
 * simulation engine directly — so one more fire-and-forget side effect doesn't
 * introduce a new class of impurity. A failed autosave leaves the explicit
 * save button as the fallback; it must never surface as an error to the player.
 */
function autosave(next: RuntimeState): void {
  const snapshot = snapshotFromState(next);
  if (!snapshot) return;
  void saveGame(snapshot).catch((error: unknown) => {
    console.error('Autosave failed', error);
  });
}

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

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RuntimeState>(initialState);
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DEBUG_MODE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(DEBUG_MODE_KEY, debugMode ? '1' : '0');
  }, [debugMode]);

  useEffect(() => {
    let active = true;
    void loadGame()
      .then((saved) => {
        if (!active) return;
        if (!saved) {
          setState((current) => ({ ...current, loading: false }));
          return;
        }
        registerExistingNames(saved.teams);
        const lineup =
          saved.lineup.length || !saved.playerTeam
            ? saved.lineup
            : bestLineup(saved.teams[saved.playerTeam]);
        setState({
          ...initialState,
          ...saved,
          worldId: saved.worldId ?? crypto.randomUUID(),
          narrativeArticles: saved.narrativeArticles ?? {},
          narrativeEvents: saved.narrativeEvents ?? {},
          lineup,
          loading: false,
          screen: resumeSeasonScreen(saved),
          lastGame: null,
          selectedPlayer: null,
          selectedGameId: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Failed to load save data', error);
        setState((current) => ({
          ...current,
          loading: false,
          loadError:
            'セーブデータの読み込み中にエラーが発生しました。データは保持されていますが、いったん新規ゲームとして開始できます。',
        }));
      });
    return () => {
      active = false;
    };
  }, []);

  const startNewGame = useCallback(() => {
    setState({
      ...initialState,
      worldId: crypto.randomUUID(),
      loading: false,
      screen: 'teamSelect',
      teams: initTeams(),
    });
  }, []);

  const chooseTeam = useCallback((teamKey: TeamKey) => {
    setState((current) => {
      const initialTeams = current.teams ?? initTeams();
      // A fixed literal seed here would give every new game the same 20-year fictional
      // history (same legends, same past champions); draw a fresh one per new game instead.
      const history = createFictionalLeagueHistory(initialTeams, {
        endYear: 2025,
        seasons: 20,
        seed: Math.floor(Date.now() % 2 ** 31),
        legendsPerTeam: 2,
      });
      registerExistingNames(history.teams);
      const schedule = generateSchedule(2026);
      const rotations = createEmptyRotations();
      const prepared = simCpuUntilNext(schedule, history.teams, rotations, teamKey, {});
      const leagueCareerAccumulated = mergeStats(history.careerStats, prepared.leagueDistStats);
      return {
        ...initialState,
        loading: false,
        screen: 'season',
        teams: history.teams,
        playerTeam: teamKey,
        viewTeam: teamKey,
        lineup: bestLineup(history.teams[teamKey]),
        season: { year: 2026, schedule: prepared.sched },
        rotN: prepared.rotN,
        standings: calcStandings(prepared.sched),
        leagueAccumulated: prepared.leagueDistStats,
        careerAccumulated: history.careerStats,
        leagueCareerAccumulated,
        yearlyStats: history.yearlyStats,
        retiredPlayers: history.retiredPlayers,
        championHistory: history.championHistory,
        gameSummaries: prepared.gameSummaries,
        gameBoxScores: prepared.gameBoxScores,
        narrativeEvents: appendNarrativeEvents({}, prepared.narrativeEvents),
        notices: [
          {
            id: `system:2026:start:${teamKey}`,
            kind: 'system',
            title: `${history.teams[teamKey].ab}で新規開始`,
            body: '新しいペナントレースが開幕しました。',
            tone: 'good',
            date: '2026年開幕',
            teamKey,
          },
        ],
      };
    });
  }, []);

  const simulateNextGame = useCallback(() => {
    setState((current) => {
      if (!current.teams || !current.playerTeam) return current;
      const nextGame = current.season.schedule.find(
        (game) =>
          !game.played &&
          (game.homeKey === current.playerTeam || game.awayKey === current.playerTeam),
      );
      if (!nextGame) return { ...current, screen: 'postseason' };

      const result = simulateGame(
        nextGame.homeKey,
        nextGame.awayKey,
        current.teams,
        nextGame.homeKey === current.playerTeam ? current.lineup : null,
        nextGame.awayKey === current.playerTeam ? current.lineup : null,
        current.rotN[nextGame.homeKey] || 0,
        current.rotN[nextGame.awayKey] || 0,
        // League-wide totals, so in-season mastery ramps identically for all 12 clubs.
        // Passing the player-team-only map left every CPU player stuck at the opening
        // mastery value for the whole season.
        current.leagueAccumulated,
        nextGame.homeKey === current.playerTeam ? current.pitcherPlan : null,
        nextGame.awayKey === current.playerTeam ? current.pitcherPlan : null,
        nextGame.date,
      );
      const playedSchedule = current.season.schedule.map((game) =>
        game.id === nextGame.id
          ? { ...game, played: true, hs: result.score.home, as: result.score.away }
          : game,
      );
      const rotations = {
        ...current.rotN,
        [nextGame.homeKey]: (current.rotN[nextGame.homeKey] || 0) + 1,
        [nextGame.awayKey]: (current.rotN[nextGame.awayKey] || 0) + 1,
      };
      const playerGameStats = accumulateStats(result, current.playerTeam, {});
      const leagueGameStats = accumulateStatsAll(result, {});
      const accumulated = mergeStats(current.accumulated, playerGameStats);
      const leagueAccumulated = mergeStats(current.leagueAccumulated, leagueGameStats);
      const careerAccumulated = mergeStats(current.careerAccumulated, playerGameStats);
      const leagueCareerAccumulated = mergeStats(current.leagueCareerAccumulated, leagueGameStats);
      const playerGameBox = buildGameBoxScore(
        result,
        nextGame.id,
        nextGame.date,
        current.season.year,
        current.leagueAccumulated,
      );
      const gameNotice = createGameResultNotice(playerGameBox, current.playerTeam);
      const prepared = simCpuUntilNext(
        playedSchedule,
        current.teams,
        rotations,
        current.playerTeam,
        leagueAccumulated,
        leagueAccumulated,
      );
      const finalLeagueStats = mergeStats(leagueAccumulated, prepared.leagueDistStats);
      const finalCareerLeagueStats = mergeStats(leagueCareerAccumulated, prepared.leagueDistStats);
      const developmentNotices = createInSeasonDevelopmentNotices(
        result.postGameEvents,
        current.playerTeam,
        nextGame.date,
      );
      const achievements = detectAchievements({
        year: current.season.year,
        date: nextGame.date,
        teams: current.teams,
        beforeSeasonStats: current.leagueAccumulated,
        afterSeasonStats: finalLeagueStats,
        beforeCareerStats: current.leagueCareerAccumulated,
        afterCareerStats: finalCareerLeagueStats,
        yearlyStats: current.yearlyStats,
      });
      const achievementNotices = createAchievementNotices(achievements);
      const seasonOver = prepared.sched.every((game) => game.played);
      const next: RuntimeState = {
        ...current,
        screen: seasonOver ? 'postseason' : 'season',
        season: { ...current.season, schedule: prepared.sched },
        rotN: prepared.rotN,
        standings: calcStandings(prepared.sched),
        accumulated,
        leagueAccumulated: finalLeagueStats,
        careerAccumulated,
        leagueCareerAccumulated: finalCareerLeagueStats,
        achievementHistory: [...current.achievementHistory, ...achievements],
        narrativeEvents: appendNarrativeEvents(current.narrativeEvents, [
          ...narrativeEventsFromPostGame(nextGame.id, nextGame.date, result.postGameEvents),
          ...prepared.narrativeEvents,
        ]),
        gameSummaries: {
          ...current.gameSummaries,
          [nextGame.id]: toSummary(playerGameBox),
          ...prepared.gameSummaries,
        },
        gameBoxScores: {
          ...current.gameBoxScores,
          [nextGame.id]: playerGameBox,
          ...prepared.gameBoxScores,
        },
        notices: mergeNotices(current.notices, [
          ...(gameNotice ? [gameNotice] : []),
          ...developmentNotices,
          ...achievementNotices,
        ]),
        lastGame: result,
      };
      autosave(next);
      return next;
    });
  }, []);

  const skip = useCallback((mode: 'next' | 'week' | 'month' | 'season') => {
    setState((current) => {
      if (!current.teams || !current.playerTeam) return current;
      const beforeTeam = current.teams[current.playerTeam];
      const result = skipGamesWithPitcherPlan(
        current.season.schedule,
        current.teams,
        current.rotN,
        current.playerTeam,
        mode,
        current.leagueAccumulated,
        current.pitcherPlan,
        current.leagueAccumulated,
      );
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
        current.teams[current.playerTeam],
        current.playerTeam,
        noticeDate,
      );
      const gameNotices = Object.values(result.gameBoxScores)
        .map((box) => createGameResultNotice(box, current.playerTeam as TeamKey))
        .filter((notice): notice is Notice => notice !== null);
      const achievements = detectAchievements({
        year: current.season.year,
        date: noticeDate,
        teams: current.teams,
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
        season: { ...current.season, schedule: result.sched },
        rotN: result.rotN,
        standings: calcStandings(result.sched),
        accumulated,
        leagueAccumulated,
        careerAccumulated: mergeStats(current.careerAccumulated, result.distStats),
        leagueCareerAccumulated,
        achievementHistory: [...current.achievementHistory, ...achievements],
        narrativeEvents: appendNarrativeEvents(current.narrativeEvents, result.narrativeEvents),
        gameSummaries: { ...current.gameSummaries, ...result.gameSummaries },
        gameBoxScores: { ...current.gameBoxScores, ...result.gameBoxScores },
        notices: mergeNotices(current.notices, [
          ...gameNotices,
          ...developmentNotices,
          ...achievementNotices,
        ]),
      };
      autosave(next);
      return next;
    });
  }, []);

  const saveCurrent = useCallback(async () => {
    const snapshot = snapshotFromState(state);
    return snapshot ? saveGame(snapshot) : false;
  }, [state]);

  const updatePlayer = useCallback((updated: Player) => {
    setState((current) => {
      if (!current.teams) return current;
      let found = false;
      const replace = (candidate: Player): Player => {
        if (candidate.id !== updated.id) return candidate;
        found = true;
        return updated;
      };
      const teams = Object.fromEntries(
        Object.entries(current.teams).map(([teamKey, team]) => [
          teamKey,
          { ...team, fielders: team.fielders.map(replace), pitchers: team.pitchers.map(replace) },
        ]),
      ) as Teams;
      if (!found) return current;
      return {
        ...current,
        teams,
        selectedPlayer:
          current.selectedPlayer?.id === updated.id ? updated : current.selectedPlayer,
      };
    });
  }, []);

  const completeOffseason = useCallback(
    (
      teams: Teams,
      developmentNotices: Notice[] = [],
      events: NarrativeEvent[] = [],
      retired: Player[] = [],
    ) => {
      setState((current) => {
        if (!current.playerTeam) return current;
        // A duplicate completion callback belongs to the already committed old year.
        if (events.some((event) => event.year !== current.season.year)) return current;
        const completedYear = current.season.year;
        const seasonRecords = current.teams
          ? createPlayerSeasonRecords(completedYear, current.teams, current.leagueAccumulated)
          : [];
        const seasonTitles = current.teams
          ? selectSeasonTitles(
              completedYear,
              current.teams,
              current.leagueAccumulated,
              Object.fromEntries(
                Object.entries(current.standings).map(([teamKey, standing]) => [
                  teamKey,
                  standing.g,
                ]),
              ),
            )
          : [];
        const year = completedYear + 1;
        const schedule = generateSchedule(year);
        const prepared = simCpuUntilNext(
          schedule,
          teams,
          createEmptyRotations(),
          current.playerTeam,
          {},
          {},
        );
        const next: RuntimeState = {
          ...current,
          teams,
          narrativeEvents: appendNarrativeEvents(current.narrativeEvents, [
            ...events,
            ...seasonReviewEvents(
              completedYear,
              current.standings,
              current.championHistory.find((c) => c.year === completedYear)?.champion,
            ),
            ...prepared.narrativeEvents,
          ]),
          retiredPlayers: [
            ...new Map([...current.retiredPlayers, ...retired].map((p) => [p.id, p])).values(),
          ],
          screen: 'season',
          season: { year, schedule: prepared.sched },
          rotN: prepared.rotN,
          lineup: bestLineup(teams[current.playerTeam]),
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
          gameSummaries: { ...current.gameSummaries, ...prepared.gameSummaries },
          gameBoxScores: { ...current.gameBoxScores, ...prepared.gameBoxScores },
          notices: mergeNotices(current.notices, developmentNotices),
          lastGame: null,
        };
        autosave(next);
        return next;
      });
    },
    [],
  );

  const recordChampionship = useCallback(
    (champion: TeamKey, runnerUp: TeamKey, events: NarrativeEvent[] = []) => {
      setState((current) => {
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
          narrativeEvents: appendNarrativeEvents(current.narrativeEvents, events),
          championHistory: [
            ...current.championHistory.filter((entry) => entry.year !== current.season.year),
            record,
          ],
        };
        autosave(next);
        return next;
      });
    },
    [],
  );

  const recordNarrativeArticle = useCallback((world: string, snapshot: ArticleSnapshot) => {
    if (!validSnapshot(snapshot)) return;
    setState((current) => {
      if (current.worldId !== world || !current.teams) return current;
      const year = String(snapshot.year);
      const entries = current.narrativeArticles[year] ?? [];
      if (entries.some((s) => s.key === snapshot.key)) return current;
      const next = {
        ...current,
        narrativeArticles: {
          ...current.narrativeArticles,
          [year]: [...entries, structuredClone(snapshot)],
        },
      };
      autosave(next);
      return next;
    });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      ...state,
      recordNarrativeArticle,
      isSeasonOver:
        state.season.schedule.length > 0 && state.season.schedule.every((game) => game.played),
      debugMode,
      startNewGame,
      chooseTeam,
      simulateNextGame,
      skip,
      saveCurrent,
      setScreen: (screen) => setState((current) => ({ ...current, screen })),
      setViewTeam: (viewTeam) => setState((current) => ({ ...current, viewTeam })),
      setLineup: (lineup) => setState((current) => ({ ...current, lineup })),
      setPitcherPlan: (pitcherPlan) => setState((current) => ({ ...current, pitcherPlan })),
      selectPlayer: (selectedPlayer) => setState((current) => ({ ...current, selectedPlayer })),
      selectGame: (selectedGameId) => setState((current) => ({ ...current, selectedGameId })),
      dismissNotice: (noticeId) =>
        setState((current) => ({
          ...current,
          notices: current.notices.filter((notice) => notice.id !== noticeId),
        })),
      clearNotices: () => setState((current) => ({ ...current, notices: [] })),
      replaceTeams: (teams) => setState((current) => ({ ...current, teams })),
      updatePlayer,
      toggleDebugMode: () => setDebugMode((current) => !current),
      completeOffseason,
      recordChampionship,
    }),
    [
      state,
      recordNarrativeArticle,
      debugMode,
      startNewGame,
      chooseTeam,
      simulateNextGame,
      skip,
      saveCurrent,
      updatePlayer,
      completeOffseason,
      recordChampionship,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameState(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGameState must be used inside GameProvider');
  return value;
}
