import { CENTRAL, PACIFIC, TINFO } from '../data';
import {
  calcStandings,
  createBatterStats,
  createPitcherStats,
  ensureSpecialLevels,
  syncSpecialsFromLevels,
} from '../engine';
import type {
  AccumulatedStats,
  AchievementEvent,
  GameBoxScore,
  GameSummary,
  Player,
  PlayerStats,
  ScheduleGame,
  SeasonTitleRecord,
  StandingRecord,
  TeamKey,
  Teams,
  TeamStatLine,
  YearlyPlayerRecords,
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
  id: string;
  title: string;
  body: string;
  tone?: 'good' | 'warn' | 'info';
  date?: string;
  kind?: 'system' | 'awakening' | 'growth' | 'game' | 'achievement';
  playerId?: string;
  teamKey?: TeamKey;
  gameId?: string;
}

export interface ChampionLineupEntry {
  playerId: string;
  playerName: string;
  pos: string;
  isPitcher: boolean;
}

export interface ChampionRecord {
  year: number;
  champion: TeamKey;
  runnerUp?: TeamKey | null;
  keyBatters?: string[];
  keyPitchers?: string[];
  /** The champion's starting lineup at the moment of winning, for the archive viewer. */
  lineup?: ChampionLineupEntry[];
  /** The champion's season batting/pitching aggregate, frozen at the moment of winning. */
  teamStats?: TeamStatLine;
  /** The champion's regular-season record, frozen at the moment of winning. */
  record?: { w: number; l: number; d: number };
}

export interface PitcherPlan {
  rotationOrder: string[];
  closerPriority: string[];
}

export const createEmptyPitcherPlan = (): PitcherPlan => ({
  rotationOrder: [],
  closerPriority: [],
});

export interface GameSaveData {
  teams: Teams;
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
  gameSummaries?: Record<string, GameSummary>;
  gameBoxScores?: Record<string, GameBoxScore>;
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

const INDEXED_DB_NAME = 'pennant-sim';
const INDEXED_DB_STORE = 'save-data';

// The canonical list of team keys lives once in data/teams.ts (CENTRAL/PACIFIC);
// deriving it here avoids a second hand-maintained copy that could drift out of sync.
const teamKeys: TeamKey[] = [...CENTRAL, ...PACIFIC];

export const createEmptyRotations = (): Record<TeamKey, number> =>
  Object.fromEntries(teamKeys.map((teamKey) => [teamKey, 0])) as Record<TeamKey, number>;

const hostStorage: StorageBackend = {
  async get(key) {
    if (typeof window === 'undefined') throw new Error('Host storage is unavailable');
    const enhancedWindow = window as WindowWithStorage;
    if (!enhancedWindow.storage?.get) throw new Error('Host storage is unavailable');
    const result = await enhancedWindow.storage.get(key);
    return result?.value ?? null;
  },
  async set(key, value) {
    if (typeof window === 'undefined') throw new Error('Host storage is unavailable');
    const enhancedWindow = window as WindowWithStorage;
    if (!enhancedWindow.storage?.set) throw new Error('Host storage is unavailable');
    await enhancedWindow.storage.set(key, value);
  },
};

const localStorageBackend: StorageBackend = {
  async get(key) {
    if (typeof window === 'undefined') throw new Error('Local storage is unavailable');
    return window.localStorage?.getItem(key) ?? null;
  },
  async set(key, value) {
    if (typeof window === 'undefined') throw new Error('Local storage is unavailable');
    window.localStorage.setItem(key, value);
  },
};

function openSaveDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(INDEXED_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE))
        database.createObjectStore(INDEXED_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  });
}

const indexedDbStorage: StorageBackend = {
  async get(key) {
    const database = await openSaveDatabase();
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const transaction = database.transaction(INDEXED_DB_STORE, 'readonly');
        const request = transaction.objectStore(INDEXED_DB_STORE).get(key);
        request.onsuccess = () =>
          resolve(typeof request.result === 'string' ? request.result : null);
        request.onerror = () =>
          reject(request.error ?? new Error('IndexedDB read could not be completed'));
      });
    } finally {
      database.close();
    }
  },
  async set(key, value) {
    const database = await openSaveDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
        transaction.objectStore(INDEXED_DB_STORE).put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB write could not be completed'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('IndexedDB write was aborted'));
      });
    } finally {
      database.close();
    }
  },
};

/**
 * Try durable browser stores in order. IndexedDB is the primary store for large
 * multi-season saves. The host API and localStorage remain readable fallbacks for
 * existing saves and restricted browser environments.
 */
export function createResilientStorageBackend(backends: StorageBackend[]): StorageBackend {
  return {
    async get(key) {
      for (const backend of backends) {
        try {
          const value = await backend.get(key);
          if (value !== null) return value;
        } catch {
          // A blocked/unavailable backend must not hide a valid save in the next store.
        }
      }
      return null;
    },
    async set(key, value) {
      let lastError: unknown = new Error('No storage backend available');
      for (const backend of backends) {
        try {
          await backend.set(key, value);
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}

const browserStorage = createResilientStorageBackend([
  indexedDbStorage,
  hostStorage,
  localStorageBackend,
]);

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
          game.doubleHeaderGame === 1 || game.doubleHeaderGame === 2 ? game.doubleHeaderGame : null,
      }))
    : [];

const migratePitcherPlan = (plan: PitcherPlan | undefined): PitcherPlan => ({
  rotationOrder: Array.isArray(plan?.rotationOrder)
    ? plan.rotationOrder.filter((id): id is string => typeof id === 'string')
    : [],
  closerPriority: Array.isArray(plan?.closerPriority)
    ? plan.closerPriority.filter((id): id is string => typeof id === 'string')
    : [],
});

/**
 * Normalize one stat line so fields added after the save was written come back as 0
 * instead of undefined. Without this every downstream `a + b` turns into NaN, and the
 * damage spreads silently through career totals and rankings.
 */
function migrateStatLine(value: unknown): PlayerStats | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const line = value as Record<string, unknown>;
  const name = typeof line.name === 'string' ? line.name : '';
  if (line.type !== 'bat' && line.type !== 'pit') return null;
  const base = line.type === 'pit' ? createPitcherStats(name) : createBatterStats(name);
  const merged = { ...base } as unknown as Record<string, unknown>;
  for (const [key, entry] of Object.entries(line)) {
    if (key === 'type' || key === 'name') continue;
    if (typeof entry === 'number' && Number.isFinite(entry)) merged[key] = entry;
  }
  return merged as unknown as PlayerStats;
}

function migrateAccumulatedStats(value: unknown): AccumulatedStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: AccumulatedStats = {};
  for (const [playerId, line] of Object.entries(value)) {
    const migrated = migrateStatLine(line);
    if (migrated) output[playerId] = migrated;
  }
  return output;
}

function migrateYearlyStats(value: unknown): YearlyPlayerRecords {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: YearlyPlayerRecords = {};
  for (const [year, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    output[year] = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      if (
        typeof record.playerId !== 'string' ||
        typeof record.playerName !== 'string' ||
        typeof record.year !== 'number' ||
        typeof record.age !== 'number' ||
        typeof record.teamKey !== 'string' ||
        !teamKeys.includes(record.teamKey as TeamKey) ||
        typeof record.teamName !== 'string' ||
        typeof record.teamAbbreviation !== 'string' ||
        typeof record.isPitcher !== 'boolean' ||
        typeof record.ovr !== 'number' ||
        !record.params ||
        typeof record.params !== 'object' ||
        !record.stats ||
        typeof record.stats !== 'object'
      )
        return [];
      // Historical seasons embed a frozen copy of the stat line, so they need the same
      // field normalization as the live maps.
      const stats = migrateStatLine(record.stats);
      if (!stats) return [];
      return [{ ...record, stats } as unknown as YearlyPlayerRecords[string][number]];
    });
  }
  return output;
}

function migrateNotices(value: unknown): Notice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<Notice>((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Partial<Notice>;
    if (typeof raw.title !== 'string' || typeof raw.body !== 'string') return [];
    const tone =
      raw.tone === 'good' || raw.tone === 'warn' || raw.tone === 'info' ? raw.tone : undefined;
    const kind =
      raw.kind === 'system' ||
      raw.kind === 'awakening' ||
      raw.kind === 'growth' ||
      raw.kind === 'game' ||
      raw.kind === 'achievement'
        ? raw.kind
        : 'system';
    const teamKey =
      typeof raw.teamKey === 'string' && teamKeys.includes(raw.teamKey as TeamKey)
        ? (raw.teamKey as TeamKey)
        : undefined;
    const date = typeof raw.date === 'string' ? raw.date : undefined;
    return [
      {
        id:
          typeof raw.id === 'string' && raw.id.length > 0
            ? raw.id
            : `legacy:${index}:${date ?? 'unknown'}:${raw.title}`,
        title: raw.title,
        body: raw.body,
        tone,
        date,
        kind,
        playerId: typeof raw.playerId === 'string' ? raw.playerId : undefined,
        teamKey,
        gameId: typeof raw.gameId === 'string' ? raw.gameId : undefined,
      },
    ];
  });
}

function migrateAwardHistory(value: unknown): SeasonTitleRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Partial<SeasonTitleRecord>;
    if (
      typeof raw.year !== 'number' ||
      (raw.league !== 'central' && raw.league !== 'pacific') ||
      typeof raw.titleId !== 'string' ||
      typeof raw.titleLabel !== 'string' ||
      typeof raw.playerId !== 'string' ||
      typeof raw.playerName !== 'string' ||
      typeof raw.teamKey !== 'string' ||
      !teamKeys.includes(raw.teamKey as TeamKey) ||
      typeof raw.value !== 'number' ||
      typeof raw.displayValue !== 'string'
    )
      return [];
    return [raw as SeasonTitleRecord];
  });
}

function isValidGameSummaryShape(value: unknown): value is GameSummary {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<GameSummary>;
  return (
    typeof raw.gameId === 'string' &&
    typeof raw.date === 'string' &&
    typeof raw.homeKey === 'string' &&
    teamKeys.includes(raw.homeKey as TeamKey) &&
    typeof raw.awayKey === 'string' &&
    teamKeys.includes(raw.awayKey as TeamKey) &&
    typeof raw.homeScore === 'number' &&
    typeof raw.awayScore === 'number' &&
    Array.isArray(raw.innings)
  );
}

function migrateGameSummaries(value: unknown): Record<string, GameSummary> {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, GameSummary> = {};
  for (const [gameId, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (isValidGameSummaryShape(candidate)) output[gameId] = candidate;
  }
  return output;
}

function migrateGameBoxScores(value: unknown): Record<string, GameBoxScore> {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, GameBoxScore> = {};
  for (const [gameId, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!isValidGameSummaryShape(candidate)) continue;
    const raw = candidate as Partial<GameBoxScore>;
    if (!Array.isArray(raw.batterLines) || !Array.isArray(raw.pitcherLines)) continue;
    output[gameId] = candidate as GameBoxScore;
  }
  return output;
}

function isValidTeamKey(value: unknown): value is TeamKey {
  return typeof value === 'string' && teamKeys.includes(value as TeamKey);
}

/**
 * Loosely validate the structurally load-bearing fields only (id/name/age/isP/p/pot).
 * Not a full Player shape check — the goal is to reject obviously malformed entries
 * (wrong type, missing core fields) rather than to re-validate every optional field.
 */
function isValidPlayerShape(value: unknown): value is Player {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<Player>;
  return (
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    typeof raw.age === 'number' &&
    typeof raw.isP === 'boolean' &&
    !!raw.p &&
    typeof raw.p === 'object' &&
    !!raw.pot &&
    typeof raw.pot === 'object'
  );
}

function migratePlayerArray(value: unknown): Player[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidPlayerShape);
}

function migrateChampionLineup(value: unknown): ChampionLineupEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Partial<ChampionLineupEntry>;
    if (
      typeof raw.playerId !== 'string' ||
      typeof raw.playerName !== 'string' ||
      typeof raw.pos !== 'string' ||
      typeof raw.isPitcher !== 'boolean'
    )
      return [];
    return [
      { playerId: raw.playerId, playerName: raw.playerName, pos: raw.pos, isPitcher: raw.isPitcher },
    ];
  });
  return entries.length ? entries : undefined;
}

function migrateTeamStatLine(value: unknown): TeamStatLine | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<TeamStatLine>;
  if (
    typeof raw.avg !== 'number' ||
    typeof raw.hr !== 'number' ||
    typeof raw.sb !== 'number' ||
    typeof raw.era !== 'number' ||
    typeof raw.k !== 'number'
  )
    return undefined;
  return { avg: raw.avg, hr: raw.hr, sb: raw.sb, era: raw.era, k: raw.k };
}

function migrateChampionRecordSeries(
  value: unknown,
): { w: number; l: number; d: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<{ w: number; l: number; d: number }>;
  if (typeof raw.w !== 'number' || typeof raw.l !== 'number' || typeof raw.d !== 'number')
    return undefined;
  return { w: raw.w, l: raw.l, d: raw.d };
}

function migrateChampionHistory(value: unknown): ChampionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Partial<ChampionRecord>;
    if (typeof raw.year !== 'number' || !isValidTeamKey(raw.champion)) return [];
    const runnerUp = isValidTeamKey(raw.runnerUp) ? raw.runnerUp : null;
    return [
      {
        year: raw.year,
        champion: raw.champion,
        runnerUp,
        keyBatters: Array.isArray(raw.keyBatters)
          ? raw.keyBatters.filter((entry): entry is string => typeof entry === 'string')
          : undefined,
        keyPitchers: Array.isArray(raw.keyPitchers)
          ? raw.keyPitchers.filter((entry): entry is string => typeof entry === 'string')
          : undefined,
        lineup: migrateChampionLineup(raw.lineup),
        teamStats: migrateTeamStatLine(raw.teamStats),
        record: migrateChampionRecordSeries(raw.record),
      },
    ];
  });
}

function migrateAchievementHistory(value: unknown): AchievementEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Partial<AchievementEvent>;
    if (
      typeof raw.id !== 'string' ||
      (raw.kind !== 'milestone' && raw.kind !== 'seasonRecord' && raw.kind !== 'careerRecord') ||
      typeof raw.playerId !== 'string' ||
      typeof raw.playerName !== 'string' ||
      !isValidTeamKey(raw.teamKey) ||
      typeof raw.metricLabel !== 'string' ||
      typeof raw.value !== 'number' ||
      typeof raw.year !== 'number' ||
      typeof raw.date !== 'string'
    )
      return [];
    return [
      {
        id: raw.id,
        kind: raw.kind,
        playerId: raw.playerId,
        playerName: raw.playerName,
        teamKey: raw.teamKey,
        metricLabel: raw.metricLabel,
        value: raw.value,
        previousValue: typeof raw.previousValue === 'number' ? raw.previousValue : null,
        previousHolderName:
          typeof raw.previousHolderName === 'string' ? raw.previousHolderName : null,
        year: raw.year,
        date: raw.date,
      },
    ];
  });
}

function isValidStandingRecord(value: unknown): value is StandingRecord {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<StandingRecord>;
  return (
    typeof raw.w === 'number' &&
    typeof raw.l === 'number' &&
    typeof raw.d === 'number' &&
    typeof raw.rs === 'number' &&
    typeof raw.ra === 'number' &&
    typeof raw.g === 'number'
  );
}

function migrateStandings(
  value: unknown,
  fallback: () => Record<TeamKey, StandingRecord>,
): Record<TeamKey, StandingRecord> {
  if (!value || typeof value !== 'object') return fallback();
  const raw = value as Record<string, unknown>;
  if (!teamKeys.every((teamKey) => isValidStandingRecord(raw[teamKey]))) return fallback();
  return raw as Record<TeamKey, StandingRecord>;
}

function migrateRotations(value: unknown): Record<TeamKey, number> {
  const rotations = createEmptyRotations();
  if (!value || typeof value !== 'object') return rotations;
  const raw = value as Record<string, unknown>;
  for (const teamKey of teamKeys) {
    const candidate = raw[teamKey];
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0) {
      rotations[teamKey] = candidate;
    }
  }
  return rotations;
}

export function migrateSaveData(raw: unknown): GameSaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw as Partial<GameSaveData>;
  const teams = migrateTeamsSpecialSchema(legacy.teams);
  if (!teams) return null;

  const season: SeasonState = {
    year: Number(legacy.season?.year ?? 2026),
    schedule: migrateSchedule(legacy.season?.schedule),
  };
  const playerTeam = isValidTeamKey(legacy.playerTeam) ? legacy.playerTeam : null;
  const viewTeam = isValidTeamKey(legacy.viewTeam) ? legacy.viewTeam : playerTeam;

  return {
    teams,
    playerTeam,
    viewTeam,
    season,
    rotN: migrateRotations(legacy.rotN),
    lineup: migratePlayerArray(legacy.lineup),
    pitcherPlan: migratePitcherPlan(legacy.pitcherPlan ?? createEmptyPitcherPlan()),
    standings: migrateStandings(legacy.standings, () => calcStandings(season.schedule)),
    accumulated: migrateAccumulatedStats(legacy.accumulated),
    leagueAccumulated: migrateAccumulatedStats(legacy.leagueAccumulated),
    careerAccumulated: migrateAccumulatedStats(legacy.careerAccumulated),
    leagueCareerAccumulated: migrateAccumulatedStats(legacy.leagueCareerAccumulated),
    yearlyStats: migrateYearlyStats(legacy.yearlyStats),
    retiredPlayers: migratePlayerArray(legacy.retiredPlayers),
    notices: migrateNotices(legacy.notices),
    championHistory: migrateChampionHistory(legacy.championHistory),
    awardHistory: migrateAwardHistory(legacy.awardHistory),
    achievementHistory: migrateAchievementHistory(legacy.achievementHistory),
    gameSummaries: migrateGameSummaries(legacy.gameSummaries),
    gameBoxScores: migrateGameBoxScores(legacy.gameBoxScores),
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

/**
 * Loads a slot's save data. Deliberately does NOT swallow every failure into `null`:
 * a slot with no data at all is a legitimate `null` (new player), but a slot that
 * holds a string that fails to parse/migrate is a corrupted save, and silently
 * treating it the same as "no save" risks the caller starting a new game and
 * overwriting the only copy of the corrupted-but-possibly-recoverable data. Backend
 * read failures (e.g. every storage backend unavailable) are allowed to propagate for
 * the same reason — callers should be able to tell "we couldn't read storage" apart
 * from "there's nothing here yet".
 */
export async function loadGameFromSlot(
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<GameSaveData | null> {
  await migrateLegacySaveToSlotOne(backend);
  const raw = await backend.get(SAVE_KEY(slot));
  if (!raw) return null;
  const data = importSaveData(raw);
  if (!data) {
    throw new Error(
      `Save data in slot ${slot} could not be read. It may be corrupted or from an incompatible version.`,
    );
  }
  return data;
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
      if (!raw) return { slot, exists: false, playerTeam: null, year: null, updatedAt: null };
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
