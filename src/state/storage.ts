import { TINFO } from '../data';
import { calcStandings, ensureSpecialLevels, syncSpecialsFromLevels } from '../engine';
import type {
  AccumulatedStats,
  Player,
  ScheduleGame,
  StandingRecord,
  TeamKey,
  Teams,
} from '../engine';

export const SAVE_KEY = 'npb_sim_v3_restored';

export interface SeasonState {
  year: number;
  schedule: ScheduleGame[];
}

export interface Notice {
  title: string;
  body: string;
  tone?: 'good' | 'warn' | 'info';
  date?: string;
}

export interface ChampionRecord {
  year: number;
  champion: TeamKey;
  runnerUp?: TeamKey | null;
  keyBatters?: string[];
  keyPitchers?: string[];
}

export interface GameSaveData {
  teams: Teams;
  playerTeam: TeamKey | null;
  viewTeam: TeamKey | null;
  season: SeasonState;
  rotN: Record<TeamKey, number>;
  lineup: Player[];
  standings: Record<TeamKey, StandingRecord>;
  accumulated: AccumulatedStats;
  leagueAccumulated: AccumulatedStats;
  careerAccumulated: AccumulatedStats;
  leagueCareerAccumulated: AccumulatedStats;
  yearlyStats: Record<string, unknown[]>;
  retiredPlayers: Player[];
  notices: Notice[];
  championHistory: ChampionRecord[];
  ts?: number;
  uiVersion?: number;
}

interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

interface WindowWithStorage extends Window {
  storage?: {
    get(key: string): Promise<{ value?: string | null } | null>;
    set(key: string, value: string): Promise<void>;
  };
}

const teamKeys: TeamKey[] = [
  'giants',
  'tigers',
  'baystars',
  'dragons',
  'carp',
  'swallows',
  'hawks',
  'eagles',
  'marines',
  'lions',
  'buffaloes',
  'fighters',
];

export const createEmptyRotations = (): Record<TeamKey, number> =>
  Object.fromEntries(teamKeys.map((teamKey) => [teamKey, 0])) as Record<TeamKey, number>;

const browserStorage: StorageBackend = {
  async get(key) {
    if (typeof window === 'undefined') return null;
    const enhancedWindow = window as WindowWithStorage;
    if (enhancedWindow.storage?.get) {
      const result = await enhancedWindow.storage.get(key);
      return result?.value ?? null;
    }
    return window.localStorage?.getItem(key) ?? null;
  },
  async set(key, value) {
    if (typeof window === 'undefined') throw new Error('No storage backend available');
    const enhancedWindow = window as WindowWithStorage;
    if (enhancedWindow.storage?.set) {
      await enhancedWindow.storage.set(key, value);
      return;
    }
    window.localStorage.setItem(key, value);
  },
};

export function migrateTeamsSpecialSchema(teams: Teams | null | undefined): Teams | null {
  if (!teams) return null;
  const migrated = { ...teams };
  for (const teamKey of teamKeys) {
    const team = migrated[teamKey];
    if (!team) continue;
    migrated[teamKey] = {
      ...team,
      park: team.park ?? TINFO[teamKey].park,
      pitchers: (team.pitchers ?? []).map((player) =>
        syncSpecialsFromLevels({ ...player, specialLevels: ensureSpecialLevels(player) }),
      ),
      fielders: (team.fielders ?? []).map((player) =>
        syncSpecialsFromLevels({ ...player, specialLevels: ensureSpecialLevels(player) }),
      ),
    };
  }
  return migrated;
}

export function migrateSaveData(raw: unknown): GameSaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw as Partial<GameSaveData>;
  const teams = migrateTeamsSpecialSchema(legacy.teams);
  if (!teams) return null;

  const season: SeasonState = {
    year: Number(legacy.season?.year ?? 2026),
    schedule: Array.isArray(legacy.season?.schedule) ? legacy.season.schedule : [],
  };
  const playerTeam = legacy.playerTeam ?? null;
  const rotations = { ...createEmptyRotations(), ...(legacy.rotN ?? {}) };

  return {
    teams,
    playerTeam,
    viewTeam: legacy.viewTeam ?? playerTeam,
    season,
    rotN: rotations,
    lineup: Array.isArray(legacy.lineup) ? legacy.lineup : [],
    standings: legacy.standings ?? calcStandings(season.schedule),
    accumulated: legacy.accumulated ?? {},
    leagueAccumulated: legacy.leagueAccumulated ?? {},
    careerAccumulated: legacy.careerAccumulated ?? {},
    leagueCareerAccumulated: legacy.leagueCareerAccumulated ?? {},
    yearlyStats: legacy.yearlyStats ?? {},
    retiredPlayers: Array.isArray(legacy.retiredPlayers) ? legacy.retiredPlayers : [],
    notices: Array.isArray(legacy.notices) ? legacy.notices : [],
    championHistory: Array.isArray(legacy.championHistory) ? legacy.championHistory : [],
    ts: legacy.ts,
    uiVersion: 1,
  };
}

export async function saveGame(
  data: GameSaveData,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  try {
    await backend.set(SAVE_KEY, JSON.stringify({ ...data, uiVersion: 1, ts: Date.now() }));
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function loadGame(
  backend: StorageBackend = browserStorage,
): Promise<GameSaveData | null> {
  try {
    const raw = await backend.get(SAVE_KEY);
    return raw ? migrateSaveData(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}
