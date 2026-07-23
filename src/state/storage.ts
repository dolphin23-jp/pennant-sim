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

export const LEGACY_SAVE_KEY = 'npb_sim_v3_restored';
export const ACTIVE_SAVE_SLOT_KEY = 'npb_sim_v3_active_slot';
export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
export const SAVE_KEY = (slot: SaveSlot): string => `npb_sim_v3_slot_${slot}`;

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

export interface SaveSlotSummary {
  slot: SaveSlot;
  exists: boolean;
  playerTeam: TeamKey | null;
  year: number | null;
  updatedAt: number | null;
}

export interface StorageBackend {
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

const isSaveSlot = (value: number): value is SaveSlot => SAVE_SLOTS.includes(value as SaveSlot);

export async function getActiveSaveSlot(
  backend: StorageBackend = browserStorage,
): Promise<SaveSlot> {
  const raw = await backend.get(ACTIVE_SAVE_SLOT_KEY),
    parsed = Number.parseInt(raw ?? '', 10);
  return isSaveSlot(parsed) ? parsed : 1;
}

export async function setActiveSaveSlot(
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<void> {
  await backend.set(ACTIVE_SAVE_SLOT_KEY, String(slot));
}

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

const migrateSchedule = (schedule: ScheduleGame[] | undefined): ScheduleGame[] =>
  Array.isArray(schedule)
    ? schedule.map((game) => ({
        ...game,
        originalDate: game.originalDate ?? game.date,
        postponedFrom: game.postponedFrom ?? null,
        doubleHeaderGame:
          game.doubleHeaderGame === 1 || game.doubleHeaderGame === 2
            ? game.doubleHeaderGame
            : null,
      }))
    : [];

export function migrateSaveData(raw: unknown): GameSaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw as Partial<GameSaveData>;
  const teams = migrateTeamsSpecialSchema(legacy.teams);
  if (!teams) return null;

  const season: SeasonState = {
    year: Number(legacy.season?.year ?? 2026),
    schedule: migrateSchedule(legacy.season?.schedule),
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
    uiVersion: 2,
  };
}

export function exportSaveData(data: GameSaveData): string {
  const migrated = migrateSaveData(data);
  if (!migrated) throw new Error('Save data could not be exported.');
  return `${JSON.stringify({ ...migrated, uiVersion: 2 }, null, 2)}\n`;
}

export function importSaveData(serialized: string): GameSaveData | null {
  try {
    return migrateSaveData(JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
}

export async function migrateLegacySaveToSlotOne(
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  const currentSlotOne = await backend.get(SAVE_KEY(1));
  if (currentSlotOne) return false;
  const legacyRaw = await backend.get(LEGACY_SAVE_KEY);
  if (!legacyRaw) return false;
  const migrated = importSaveData(legacyRaw);
  if (!migrated) return false;
  await backend.set(
    SAVE_KEY(1),
    JSON.stringify({ ...migrated, uiVersion: 2, ts: migrated.ts ?? Date.now() }),
  );
  return true;
}

export async function saveGameToSlot(
  data: GameSaveData,
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  try {
    const migrated = migrateSaveData(data);
    if (!migrated) return false;
    await backend.set(
      SAVE_KEY(slot),
      JSON.stringify({ ...migrated, uiVersion: 2, ts: Date.now() }),
    );
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function loadGameFromSlot(
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<GameSaveData | null> {
  try {
    await migrateLegacySaveToSlotOne(backend);
    const raw = await backend.get(SAVE_KEY(slot));
    return raw ? importSaveData(raw) : null;
  } catch {
    return null;
  }
}

export async function saveGame(
  data: GameSaveData,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  const slot = await getActiveSaveSlot(backend);
  return saveGameToSlot(data, slot, backend);
}

export async function loadGame(
  backend: StorageBackend = browserStorage,
): Promise<GameSaveData | null> {
  await migrateLegacySaveToSlotOne(backend);
  const slot = await getActiveSaveSlot(backend);
  return loadGameFromSlot(slot, backend);
}

export async function listSaveSlots(
  backend: StorageBackend = browserStorage,
): Promise<SaveSlotSummary[]> {
  await migrateLegacySaveToSlotOne(backend);
  return Promise.all(
    SAVE_SLOTS.map(async (slot) => {
      const raw = await backend.get(SAVE_KEY(slot));
      if (!raw)
        return { slot, exists: false, playerTeam: null, year: null, updatedAt: null };
      const data = importSaveData(raw);
      return data
        ? {
            slot,
            exists: true,
            playerTeam: data.playerTeam,
            year: data.season.year,
            updatedAt: data.ts ?? null,
          }
        : { slot, exists: false, playerTeam: null, year: null, updatedAt: null };
    }),
  );
}

export async function importSaveToSlot(
  serialized: string,
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  const data = importSaveData(serialized);
  return data ? saveGameToSlot(data, slot, backend) : false;
}

export async function importSaveFileToSlot(
  file: File,
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  return importSaveToSlot(await file.text(), slot, backend);
}

export async function downloadSaveSlot(
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  const data = await loadGameFromSlot(slot, backend);
  if (!data) return false;
  try {
    const blob = new Blob([exportSaveData(data)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pennant-sim-slot-${slot}-${data.season.year}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
