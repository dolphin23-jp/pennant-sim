import { type ArticleSnapshot, validSnapshot } from '../narrative/protocol';

import { resumeSeasonScreen } from './seasonProgress';
import type { NarrativeEvent } from '../narrative/types';
import { narrativeEventsFromPostGame } from '../engine/narrativeEvents';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  accumulateStats,
  accumulateStatsAll,
  bestLineup,
  buildGameBoxScore,
  calcStandings,
  createFictionalLeagueHistory,
  detectAchievements,
  generateSchedule,
  initSettledWorld,
  registerExistingNames,
  simCpuUntilNext,
  simulateGame,
  toSummary,
} from '../engine';
import type { Player, TeamKey, Teams } from '../engine';
import {
  createAchievementNotices,
  createGameResultNotice,
  createInSeasonDevelopmentNotices,
  mergeNotices,
} from './notices';
import {
  createEmptyRotations,
  loadGame,
  saveGame,
  type GameSaveData,
  type Notice,
  type PitcherPlan,
} from './storage';
import {
  advanceOneYear,
  applyChampionship,
  applyOffseasonCompletion,
  applySkip,
  initialState,
  mergeStats,
  nextAutosaveSeq,
  withNarrativeEvents,
  type AdvanceProgress,
  type GameScreen,
  type RuntimeState,
} from './runtime';

export type { AdvanceProgress, GameScreen } from './runtime';

interface GameContextValue extends RuntimeState {
  recordNarrativeArticle(world: string, snapshot: ArticleSnapshot): void;
  isSeasonOver: boolean;
  debugMode: boolean;
  startNewGame(): void;
  chooseTeam(teamKey: TeamKey): void;
  simulateNextGame(): void;
  skip(mode: 'next' | 'week' | 'month' | 'season'): void;
  /** Hand whole years to the CPU (season, postseason, offseason), one year per render. */
  advanceYears(years: number): Promise<void>;
  /** Stop a running advanceYears after the year in progress. */
  cancelAdvance(): void;
  advanceProgress: AdvanceProgress | null;
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
    overseas?: Player[],
  ): void;
  recordChampionship(champion: TeamKey, runnerUp: TeamKey, events?: NarrativeEvent[]): void;
}

const DEBUG_MODE_KEY = 'pennant-sim:debugMode';
const GameContext = createContext<GameContextValue | null>(null);
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
    overseasPlayers: state.overseasPlayers,
    notices: state.notices,
    championHistory: state.championHistory,
    awardHistory: state.awardHistory,
    achievementHistory: state.achievementHistory,
    honorHistory: state.honorHistory,
    narrativeEvents: state.narrativeEvents,
    ...(state.narrativeQuarantine?.length
      ? { narrativeQuarantine: state.narrativeQuarantine }
      : {}),
    gameSummaries: state.gameSummaries,
    gameBoxScores: state.gameBoxScores,
    uiVersion: 1,
  };
}
/**
 * Best-effort autosave: fire-and-forget, silently ignore failures. Updaters only bump
 * `autosaveSeq`; the provider's effect calls this once per committed state, so a replayed
 * updater (StrictMode) never persists twice and saves are issued in commit order. A failed
 * autosave leaves the explicit save button as the fallback; it must never surface as an
 * error to the player.
 */
function autosave(next: RuntimeState): void {
  const snapshot = snapshotFromState(next);
  if (!snapshot) return;
  void saveGame(snapshot).catch((error: unknown) => {
    console.error('Autosave failed', error);
  });
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

  // Resolved once React has committed a state update, so advanceYears renders between years.
  const commitWaiter = useRef<(() => void) | null>(null);
  useEffect(() => {
    commitWaiter.current?.();
    commitWaiter.current = null;
  }, [state]);

  const lastAutosaveSeq = useRef(0);
  useEffect(() => {
    if (state.autosaveSeq === lastAutosaveSeq.current) return;
    lastAutosaveSeq.current = state.autosaveSeq;
    autosave(state);
  }, [state]);

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
          overseasPlayers: saved.overseasPlayers ?? [],
          honorHistory: saved.honorHistory ?? [],
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
            'セーブデータの読み込み中にエラーが発生しました。新規ゲームとして開始できます。読み込めなかった元データは、同じスロットへ保存する際に別キーへ退避され、上書きされません。',
        }));
      });
    return () => {
      active = false;
    };
  }, []);

  const startNewGame = useCallback(() => {
    // Rosters after twenty silent offseasons, so the first decades play at the same talent
    // level as the rest of the world's history (see initSettledTeams).
    const world = initSettledWorld();
    setState({
      ...initialState,
      worldId: crypto.randomUUID(),
      loading: false,
      screen: 'teamSelect',
      teams: world.teams,
      overseasPlayers: world.overseas,
    });
  }, []);

  const chooseTeam = useCallback((teamKey: TeamKey) => {
    setState((current) => {
      const world = current.teams
        ? { teams: current.teams, overseas: current.overseasPlayers }
        : initSettledWorld();
      const initialTeams = world.teams;
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
        overseasPlayers: world.overseas,
        championHistory: history.championHistory,
        gameSummaries: prepared.gameSummaries,
        gameBoxScores: prepared.gameBoxScores,
        ...withNarrativeEvents({ narrativeEvents: {} }, prepared.narrativeEvents),
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

      // The engine writes post-game rosters back into the map it is given. Hand it a copy so
      // the previous state stays untouched (StrictMode replays updaters in development).
      const teams = { ...current.teams };
      const result = simulateGame(
        nextGame.homeKey,
        nextGame.awayKey,
        teams,
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
        teams,
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
        teams,
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
        teams,
        season: { ...current.season, schedule: prepared.sched },
        rotN: prepared.rotN,
        standings: calcStandings(prepared.sched),
        accumulated,
        leagueAccumulated: finalLeagueStats,
        careerAccumulated,
        leagueCareerAccumulated: finalCareerLeagueStats,
        achievementHistory: [...current.achievementHistory, ...achievements],
        ...withNarrativeEvents(current, [
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
        autosaveSeq: nextAutosaveSeq(),
      };
      return next;
    });
  }, []);

  const skip = useCallback((mode: 'next' | 'week' | 'month' | 'season') => {
    setState((current) => applySkip(current, mode));
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
      overseas?: Player[],
    ) => {
      setState((current) =>
        applyOffseasonCompletion(current, teams, developmentNotices, events, retired, overseas),
      );
    },
    [],
  );

  const recordChampionship = useCallback(
    (champion: TeamKey, runnerUp: TeamKey, events: NarrativeEvent[] = []) => {
      setState((current) => applyChampionship(current, champion, runnerUp, events));
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
        autosaveSeq: nextAutosaveSeq(),
      };
      return next;
    });
  }, []);

  const [advanceProgress, setAdvanceProgress] = useState<AdvanceProgress | null>(null);
  const advanceRunning = useRef(false);
  const advanceCancelled = useRef(false);
  const advanceYears = useCallback(async (years: number) => {
    if (advanceRunning.current) return;
    advanceRunning.current = true;
    advanceCancelled.current = false;
    setAdvanceProgress({ done: 0, total: years });
    try {
      for (let done = 0; done < years && !advanceCancelled.current; done += 1) {
        // Let the progress indicator paint before the next (multi-second) year runs.
        await new Promise((resolve) => setTimeout(resolve, 30));
        await new Promise<void>((resolve) => {
          commitWaiter.current = resolve;
          setState((current) => {
            try {
              return advanceOneYear(current);
            } catch (error) {
              console.error('Automatic advance failed', error);
              advanceCancelled.current = true;
              return {
                ...current,
                notices: mergeNotices(current.notices, [
                  {
                    id: `system:advance-error:${Date.now()}`,
                    kind: 'system',
                    title: 'おまかせ進行を中断しました',
                    body: '処理中にエラーが発生したため、直前の状態で停止しています。',
                    tone: 'warn',
                    date: `${current.season.year}年`,
                  },
                ]),
              };
            }
          });
        });
        setAdvanceProgress({ done: done + 1, total: years });
      }
    } finally {
      advanceRunning.current = false;
      setAdvanceProgress(null);
    }
  }, []);
  const cancelAdvance = useCallback(() => {
    advanceCancelled.current = true;
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
      advanceYears,
      cancelAdvance,
      advanceProgress,
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
      advanceYears,
      cancelAdvance,
      advanceProgress,
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
