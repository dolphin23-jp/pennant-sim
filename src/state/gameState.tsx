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
  bestLineup,
  calcStandings,
  createFictionalLeagueHistory,
  createPlayerSeasonRecords,
  generateSchedule,
  initTeams,
  registerExistingNames,
  simCpuUntilNext,
  simulateGame,
  skipGamesWithPitcherPlan,
} from '../engine';
import type {
  AccumulatedStats,
  GameState,
  Player,
  PlayerStats,
  StandingRecord,
  TeamKey,
  Teams,
  YearlyPlayerRecords,
} from '../engine';
import {
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

export type GameScreen =
  | 'welcome'
  | 'teamSelect'
  | 'season'
  | 'postseason'
  | 'offseason';

interface RuntimeState {
  loading: boolean;
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
  lastGame: GameState | null;
  selectedPlayer: Player | null;
}

interface GameContextValue extends RuntimeState {
  isSeasonOver: boolean;
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
  dismissNotice(noticeId: string): void;
  clearNotices(): void;
  replaceTeams(teams: Teams): void;
  completeOffseason(teams: Teams, developmentNotices?: Notice[]): void;
}

const initialState: RuntimeState = {
  loading: true,
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
  lastGame: null,
  selectedPlayer: null,
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
    uiVersion: 1,
  };
}

function lastNewPlayerGameDate(
  before: SeasonState['schedule'],
  after: SeasonState['schedule'],
  playerTeam: TeamKey,
): string | null {
  const beforeById = new Map(before.map((game) => [game.id, game]));
  return after
    .filter(
      (game) =>
        game.played &&
        !beforeById.get(game.id)?.played &&
        (game.homeKey === playerTeam || game.awayKey === playerTeam),
    )
    .map((game) => game.date)
    .sort((first, second) => second.localeCompare(first))[0] ?? null;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RuntimeState>(initialState);

  useEffect(() => {
    let active = true;
    void loadGame().then((saved) => {
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
      const seasonOver =
        saved.season.schedule.length > 0 &&
        saved.season.schedule.every((game) => game.played);
      setState({
        ...initialState,
        ...saved,
        lineup,
        loading: false,
        screen: seasonOver ? 'postseason' : saved.playerTeam ? 'season' : 'teamSelect',
        lastGame: null,
        selectedPlayer: null,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const startNewGame = useCallback(() => {
    setState({ ...initialState, loading: false, screen: 'teamSelect', teams: initTeams() });
  }, []);

  const chooseTeam = useCallback((teamKey: TeamKey) => {
    setState((current) => {
      const initialTeams = current.teams ?? initTeams();
      const history = createFictionalLeagueHistory(initialTeams, {
        endYear: 2025,
        seasons: 20,
        seed: 2026,
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
        notices: [
          {
            id: `system:2026:start:${teamKey}`,
            kind: 'system',
            title: `${teams[teamKey].ab}で新規開始`,
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
        current.accumulated,
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
      const leagueCareerAccumulated = mergeStats(
        current.leagueCareerAccumulated,
        leagueGameStats,
      );
      const prepared = simCpuUntilNext(
        playedSchedule,
        current.teams,
        rotations,
        current.playerTeam,
        accumulated,
      );
      const finalLeagueStats = mergeStats(leagueAccumulated, prepared.leagueDistStats);
      const finalCareerLeagueStats = mergeStats(
        leagueCareerAccumulated,
        prepared.leagueDistStats,
      );
      const developmentNotices = createInSeasonDevelopmentNotices(
        result.postGameEvents,
        current.playerTeam,
        nextGame.date,
      );
      const seasonOver = prepared.sched.every((game) => game.played);
      return {
        ...current,
        screen: seasonOver ? 'postseason' : 'season',
        season: { ...current.season, schedule: prepared.sched },
        rotN: prepared.rotN,
        standings: calcStandings(prepared.sched),
        accumulated,
        leagueAccumulated: finalLeagueStats,
        careerAccumulated,
        leagueCareerAccumulated: finalCareerLeagueStats,
        notices: mergeNotices(current.notices, developmentNotices),
        lastGame: result,
      };
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
        current.accumulated,
        current.pitcherPlan,
      );
      const accumulated = mergeStats(current.accumulated, result.distStats);
      const leagueAccumulated = mergeStats(current.leagueAccumulated, result.leagueDistStats);
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
      return {
        ...current,
        screen: seasonOver ? 'postseason' : 'season',
        season: { ...current.season, schedule: result.sched },
        rotN: result.rotN,
        standings: calcStandings(result.sched),
        accumulated,
        leagueAccumulated,
        careerAccumulated: mergeStats(current.careerAccumulated, result.distStats),
        leagueCareerAccumulated: mergeStats(
          current.leagueCareerAccumulated,
          result.leagueDistStats,
        ),
        notices: mergeNotices(current.notices, developmentNotices),
      };
    });
  }, []);

  const saveCurrent = useCallback(async () => {
    const snapshot = snapshotFromState(state);
    return snapshot ? saveGame(snapshot) : false;
  }, [state]);

  const completeOffseason = useCallback((teams: Teams, developmentNotices: Notice[] = []) => {
    setState((current) => {
      if (!current.playerTeam) return current;
      const completedYear = current.season.year;
      const seasonRecords = current.teams
        ? createPlayerSeasonRecords(completedYear, current.teams, current.leagueAccumulated)
        : [];
      const year = completedYear + 1;
      const schedule = generateSchedule(year);
      const prepared = simCpuUntilNext(
        schedule,
        teams,
        createEmptyRotations(),
        current.playerTeam,
        {},
      );
      return {
        ...current,
        teams,
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
        notices: mergeNotices(current.notices, developmentNotices),
        lastGame: null,
      };
    });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      ...state,
      isSeasonOver:
        state.season.schedule.length > 0 && state.season.schedule.every((game) => game.played),
      startNewGame,
      chooseTeam,
      simulateNextGame,
      skip,
      saveCurrent,
      setScreen: (screen) => setState((current) => ({ ...current, screen })),
      setViewTeam: (viewTeam) => setState((current) => ({ ...current, viewTeam })),
      setLineup: (lineup) => setState((current) => ({ ...current, lineup })),
      setPitcherPlan: (pitcherPlan) => setState((current) => ({ ...current, pitcherPlan })),
      selectPlayer: (selectedPlayer) =>
        setState((current) => ({ ...current, selectedPlayer })),
      dismissNotice: (noticeId) =>
        setState((current) => ({
          ...current,
          notices: current.notices.filter((notice) => notice.id !== noticeId),
        })),
      clearNotices: () => setState((current) => ({ ...current, notices: [] })),
      replaceTeams: (teams) => setState((current) => ({ ...current, teams })),
      completeOffseason,
    }),
    [
      state,
      startNewGame,
      chooseTeam,
      simulateNextGame,
      skip,
      saveCurrent,
      completeOffseason,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameState(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGameState must be used inside GameProvider');
  return value;
}
