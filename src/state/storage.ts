import { migrateArticleArchive, type ArticleArchive } from '../narrative/protocol';
import { migrateNarrativeEvents } from '../narrative/ledger';
import type { NarrativeEvent, NarrativeEventLedger } from '../narrative/types';
import { CENTRAL, PACIFIC, TINFO } from '../data';
import {
  calcStandings,
  createBatterStats,
  createPitcherStats,
  ensureCatcherAttributes,
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
import {
  WORLD_ARCHIVE_SCHEMA_VERSION,
  WORLD_STORAGE_VERSION,
  contentRevision,
  createEmptyWorldArchiveIndex,
  createWorldId,
  readArchiveChunk,
  retiredPlayerArchiveKey,
  seasonArchiveKey,
  tombstoneArchiveChunk,
  writeArchiveChunk,
} from './worldArchive';
import type { ArchiveChunkRef, WorldArchiveIndex } from './worldArchive';

export const LEGACY_SAVE_KEY = 'npb_sim_v3_restored';
export const ACTIVE_SAVE_SLOT_KEY = 'npb_sim_v3_active_slot';
export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
export const SAVE_KEY = (slot: SaveSlot): string => `npb_sim_v3_slot_${slot}`;
export const SAVE_STORAGE_VERSION = WORLD_STORAGE_VERSION;

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
  worldId?: string;
  narrativeArticles?: ArticleArchive;
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
  narrativeEvents?: NarrativeEventLedger;
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

interface SeasonArchiveChunk {
  /** Optional on pre-ledger v4 chunks; empty years preserve their original revision. */
  narrativeEvents?: NarrativeEvent[];
  schemaVersion: typeof WORLD_ARCHIVE_SCHEMA_VERSION;
  year: number;
  yearlyStats: YearlyPlayerRecords[string];
  championHistory: ChampionRecord[];
  awardHistory: SeasonTitleRecord[];
  achievementHistory: AchievementEvent[];
  gameSummaries: Record<string, GameSummary>;
  gameBoxScores: Record<string, GameBoxScore>;
}

interface RetiredPlayerArchiveEntry {
  order: number;
  player: Player;
  careerStats?: PlayerStats;
  leagueCareerStats?: PlayerStats;
}

interface RetiredPlayerArchiveChunk {
  schemaVersion: typeof WORLD_ARCHIVE_SCHEMA_VERSION;
  bucket: number;
  entries: RetiredPlayerArchiveEntry[];
}

interface PersistedSaveV4 {
  storageVersion: typeof WORLD_STORAGE_VERSION;
  uiVersion: 2;
  worldId: string;
  current: GameSaveData;
  archive: WorldArchiveIndex;
  ts: number;
}

const INDEXED_DB_NAME = 'pennant-sim';
const INDEXED_DB_STORE = 'save-data';
const RETIRED_PLAYER_BUCKET_COUNT = 64;

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
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
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

let persistenceRequestStarted = false;

/** Best-effort protection against browser eviction. Capacity is still browser/device limited. */
export async function requestPersistentBrowserStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function requestPersistenceOnce(): void {
  if (persistenceRequestStarted) return;
  persistenceRequestStarted = true;
  void requestPersistentBrowserStorage();
}

const isSaveSlot = (value: number): value is SaveSlot => SAVE_SLOTS.includes(value as SaveSlot);

export async function getActiveSaveSlot(
  backend: StorageBackend = browserStorage,
): Promise<SaveSlot> {
  const raw = await backend.get(ACTIVE_SAVE_SLOT_KEY);
  const parsed = Number.parseInt(raw ?? '', 10);
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
        ensureCatcherAttributes(
          syncSpecialsFromLevels({ ...player, specialLevels: ensureSpecialLevels(player) }),
        ),
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

/** Normalize stat lines so fields added after a save was written come back as zero. */
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
      ) {
        return [];
      }
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
    ) {
      return [];
    }
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, GameSummary> = {};
  for (const [gameId, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (isValidGameSummaryShape(candidate)) output[gameId] = candidate;
  }
  return output;
}

function migrateGameBoxScores(value: unknown): Record<string, GameBoxScore> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
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
    ) {
      return [];
    }
    return [
      {
        playerId: raw.playerId,
        playerName: raw.playerName,
        pos: raw.pos,
        isPitcher: raw.isPitcher,
      },
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
  ) {
    return undefined;
  }
  return { avg: raw.avg, hr: raw.hr, sb: raw.sb, era: raw.era, k: raw.k };
}

function migrateChampionRecordSeries(
  value: unknown,
): { w: number; l: number; d: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<{ w: number; l: number; d: number }>;
  if (typeof raw.w !== 'number' || typeof raw.l !== 'number' || typeof raw.d !== 'number') {
    return undefined;
  }
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
    ) {
      return [];
    }
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
    worldId:
      typeof legacy.worldId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(legacy.worldId)
        ? legacy.worldId
        : undefined,
    narrativeArticles: migrateArticleArchive(legacy.narrativeArticles),
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
    narrativeEvents: migrateNarrativeEvents(legacy.narrativeEvents),
    ts: legacy.ts,
    uiVersion: 2,
  };
}

function yearFromDate(date: string, fallback: number): number {
  const match = /^(\d{4})/.exec(date);
  const parsed = match ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptySeasonArchive(year: number): SeasonArchiveChunk {
  return {
    schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
    year,
    yearlyStats: [],
    championHistory: [],
    awardHistory: [],
    achievementHistory: [],
    gameSummaries: {},
    gameBoxScores: {},
  };
}

function buildSeasonArchives(data: GameSaveData): Map<number, SeasonArchiveChunk> {
  const chunks = new Map<number, SeasonArchiveChunk>();
  const getChunk = (year: number): SeasonArchiveChunk => {
    const existing = chunks.get(year);
    if (existing) return existing;
    const created = emptySeasonArchive(year);
    chunks.set(year, created);
    return created;
  };

  for (const [yearKey, entries] of Object.entries(data.yearlyStats)) {
    const year = Number.parseInt(yearKey, 10);
    if (Number.isFinite(year) && entries.length) getChunk(year).yearlyStats = entries;
  }
  for (const record of data.championHistory) getChunk(record.year).championHistory.push(record);
  for (const record of data.awardHistory) getChunk(record.year).awardHistory.push(record);
  for (const event of data.achievementHistory) getChunk(event.year).achievementHistory.push(event);
  for (const [gameId, summary] of Object.entries(data.gameSummaries ?? {})) {
    getChunk(yearFromDate(summary.date, data.season.year)).gameSummaries[gameId] = summary;
  }
  for (const [gameId, boxScore] of Object.entries(data.gameBoxScores ?? {})) {
    getChunk(yearFromDate(boxScore.date, data.season.year)).gameBoxScores[gameId] = boxScore;
  }
  for (const [year, events] of Object.entries(data.narrativeEvents ?? {})) {
    if (events.length) getChunk(Number(year)).narrativeEvents = events;
  }
  return chunks;
}

function retiredBucket(playerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % RETIRED_PLAYER_BUCKET_COUNT;
}

function buildRetiredPlayerArchives(data: GameSaveData): Map<number, RetiredPlayerArchiveChunk> {
  const chunks = new Map<number, RetiredPlayerArchiveChunk>();
  data.retiredPlayers.forEach((player, order) => {
    const bucket = retiredBucket(player.id);
    let chunk = chunks.get(bucket);
    if (!chunk) {
      chunk = { schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION, bucket, entries: [] };
      chunks.set(bucket, chunk);
    }
    chunk.entries.push({
      order,
      player,
      careerStats: data.careerAccumulated[player.id],
      leagueCareerStats: data.leagueCareerAccumulated[player.id],
    });
  });
  return chunks;
}

function currentStateWithoutArchive(data: GameSaveData, timestamp: number): GameSaveData {
  const retiredIds = new Set(data.retiredPlayers.map((player) => player.id));
  const activeCareer = Object.fromEntries(
    Object.entries(data.careerAccumulated).filter(([playerId]) => !retiredIds.has(playerId)),
  ) as AccumulatedStats;
  const activeLeagueCareer = Object.fromEntries(
    Object.entries(data.leagueCareerAccumulated).filter(([playerId]) => !retiredIds.has(playerId)),
  ) as AccumulatedStats;

  return {
    ...data,
    careerAccumulated: activeCareer,
    leagueCareerAccumulated: activeLeagueCareer,
    yearlyStats: {},
    retiredPlayers: [],
    championHistory: [],
    awardHistory: [],
    achievementHistory: [],
    gameSummaries: {},
    gameBoxScores: {},
    narrativeEvents: {},
    narrativeArticles: {},
    ts: timestamp,
    uiVersion: 2,
  };
}

function isArchiveRef(value: unknown): value is ArchiveChunkRef {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<ArchiveChunkRef>;
  return typeof raw.key === 'string' && typeof raw.revision === 'string';
}

function parseArchiveRefMap(value: unknown): Record<string, ArchiveChunkRef> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const refs: Record<string, ArchiveChunkRef> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isArchiveRef(candidate)) return null;
    refs[key] = candidate;
  }
  return refs;
}

function parsePersistedSaveV4(value: unknown): PersistedSaveV4 | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PersistedSaveV4> & { archive?: Partial<WorldArchiveIndex> };
  if (
    raw.storageVersion !== WORLD_STORAGE_VERSION ||
    raw.uiVersion !== 2 ||
    typeof raw.worldId !== 'string' ||
    !raw.current ||
    typeof raw.current !== 'object' ||
    !raw.archive ||
    raw.archive.schemaVersion !== WORLD_ARCHIVE_SCHEMA_VERSION ||
    typeof raw.ts !== 'number'
  ) {
    return null;
  }
  const seasons = parseArchiveRefMap(raw.archive.seasons);
  const retiredPlayerBuckets = parseArchiveRefMap(raw.archive.retiredPlayerBuckets);
  const articleYears = parseArchiveRefMap(raw.archive.articleYears ?? {}) ?? {};
  if (!seasons || !retiredPlayerBuckets) return null;
  return {
    storageVersion: WORLD_STORAGE_VERSION,
    uiVersion: 2,
    worldId: raw.worldId,
    current: raw.current as GameSaveData,
    archive: {
      schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
      seasons,
      retiredPlayerBuckets,
      ...(Object.keys(articleYears).length ? { articleYears } : {}),
    },
    ts: raw.ts,
  };
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

function migrateSeasonArchive(value: unknown, expectedYear: number): SeasonArchiveChunk | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SeasonArchiveChunk>;
  if (raw.schemaVersion !== WORLD_ARCHIVE_SCHEMA_VERSION || raw.year !== expectedYear) return null;
  const yearly = migrateYearlyStats({ [String(expectedYear)]: raw.yearlyStats ?? [] });
  return {
    schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
    year: expectedYear,
    yearlyStats: yearly[String(expectedYear)] ?? [],
    championHistory: migrateChampionHistory(raw.championHistory),
    awardHistory: migrateAwardHistory(raw.awardHistory),
    achievementHistory: migrateAchievementHistory(raw.achievementHistory),
    gameSummaries: migrateGameSummaries(raw.gameSummaries),
    gameBoxScores: migrateGameBoxScores(raw.gameBoxScores),
    ...(raw.narrativeEvents === undefined
      ? {}
      : {
          narrativeEvents:
            migrateNarrativeEvents({ [String(expectedYear)]: raw.narrativeEvents })[
              String(expectedYear)
            ] ?? [],
        }),
  };
}

function migrateRetiredPlayerArchive(
  value: unknown,
  expectedBucket: number,
): RetiredPlayerArchiveChunk | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RetiredPlayerArchiveChunk>;
  if (
    raw.schemaVersion !== WORLD_ARCHIVE_SCHEMA_VERSION ||
    raw.bucket !== expectedBucket ||
    !Array.isArray(raw.entries)
  ) {
    return null;
  }
  const entries = raw.entries.flatMap<RetiredPlayerArchiveEntry>((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const entry = candidate as Partial<RetiredPlayerArchiveEntry>;
    if (typeof entry.order !== 'number' || !isValidPlayerShape(entry.player)) return [];
    const careerStats = migrateStatLine(entry.careerStats);
    const leagueCareerStats = migrateStatLine(entry.leagueCareerStats);
    return [
      {
        order: entry.order,
        player: entry.player,
        careerStats: careerStats ?? undefined,
        leagueCareerStats: leagueCareerStats ?? undefined,
      },
    ];
  });
  return { schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION, bucket: expectedBucket, entries };
}

function changedArchiveRefs(
  before: Record<string, ArchiveChunkRef>,
  after: Record<string, ArchiveChunkRef>,
): ArchiveChunkRef[] {
  return Object.entries(before).flatMap(([id, ref]) => (after[id]?.key === ref.key ? [] : [ref]));
}

async function writeSeasonArchives(
  data: GameSaveData,
  slot: SaveSlot,
  worldId: string,
  previous: Record<string, ArchiveChunkRef>,
  backend: StorageBackend,
): Promise<Record<string, ArchiveChunkRef>> {
  const refs: Record<string, ArchiveChunkRef> = {};
  for (const [year, chunk] of [...buildSeasonArchives(data)].sort(([a], [b]) => a - b)) {
    const serialized = JSON.stringify(chunk);
    const revision = contentRevision(serialized);
    const id = String(year);
    const oldRef = previous[id];
    if (oldRef?.revision === revision) {
      refs[id] = oldRef;
      continue;
    }
    const key = seasonArchiveKey(slot, worldId, year, revision);
    await writeArchiveChunk(backend, key, serialized);
    refs[id] = { key, revision };
  }
  return refs;
}

async function writeRetiredPlayerArchives(
  data: GameSaveData,
  slot: SaveSlot,
  worldId: string,
  previous: Record<string, ArchiveChunkRef>,
  backend: StorageBackend,
): Promise<Record<string, ArchiveChunkRef>> {
  const refs: Record<string, ArchiveChunkRef> = {};
  for (const [bucket, chunk] of [...buildRetiredPlayerArchives(data)].sort(([a], [b]) => a - b)) {
    const serialized = JSON.stringify(chunk);
    const revision = contentRevision(serialized);
    const id = String(bucket);
    const oldRef = previous[id];
    if (oldRef?.revision === revision) {
      refs[id] = oldRef;
      continue;
    }
    const key = retiredPlayerArchiveKey(slot, worldId, bucket, revision);
    await writeArchiveChunk(backend, key, serialized);
    refs[id] = { key, revision };
  }
  return refs;
}

async function persistGameV4(
  data: GameSaveData,
  slot: SaveSlot,
  backend: StorageBackend,
  timestamp = Date.now(),
): Promise<void> {
  const migrated = migrateSaveData(data);
  if (!migrated) throw new Error('Save data could not be migrated before persistence.');

  let previous: PersistedSaveV4 | null = null;
  const previousRaw = await backend.get(SAVE_KEY(slot));
  if (previousRaw) {
    try {
      previous = parsePersistedSaveV4(parseJson(previousRaw));
    } catch {
      previous = null;
    }
  }

  const worldId = migrated.worldId ?? previous?.worldId ?? createWorldId();
  const previousArchive =
    previous?.worldId === worldId ? previous.archive : createEmptyWorldArchiveIndex();
  const seasons = await writeSeasonArchives(
    migrated,
    slot,
    worldId,
    previousArchive.seasons,
    backend,
  );
  const retiredPlayerBuckets = await writeRetiredPlayerArchives(
    migrated,
    slot,
    worldId,
    previousArchive.retiredPlayerBuckets,
    backend,
  );
  const articleYears = { ...(previousArchive.articleYears ?? {}) };
  for (const [year, entries] of Object.entries(migrated.narrativeArticles ?? {})) {
    const serialized = JSON.stringify({ schemaVersion: 1, year: Number(year), entries });
    const revision = contentRevision(serialized);
    const key = `npb_sim_v4_slot_${slot}_world_${worldId}_articles_${year}_${revision}`;
    try {
      if (articleYears[year]?.revision === revision && (await backend.get(key)) === serialized)
        continue;
      await backend.set(key, serialized);
      articleYears[year] = { key, revision };
    } catch {
      /* Presentation storage failure must not prevent a factual save. */
    }
  }
  const archive: WorldArchiveIndex = {
    schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
    seasons,
    retiredPlayerBuckets,
    ...(Object.keys(articleYears).length ? { articleYears } : {}),
  };
  const envelope: PersistedSaveV4 = {
    storageVersion: WORLD_STORAGE_VERSION,
    uiVersion: 2,
    worldId,
    current: currentStateWithoutArchive({ ...migrated, worldId }, timestamp),
    archive,
    ts: timestamp,
  };

  // Archive chunks are written first. The small current-state envelope is the commit point.
  // If that write fails, the previous envelope still references its intact immutable chunks.
  await backend.set(SAVE_KEY(slot), JSON.stringify(envelope));

  const stale = [
    ...changedArchiveRefs(previousArchive.seasons, seasons),
    ...changedArchiveRefs(previousArchive.retiredPlayerBuckets, retiredPlayerBuckets),
    ...changedArchiveRefs(previousArchive.articleYears ?? {}, articleYears),
  ];
  for (const ref of stale) {
    try {
      await tombstoneArchiveChunk(backend, ref);
    } catch {
      // Cleanup failure only leaves an unreachable old revision; it must never fail a save.
    }
  }
}

async function loadPersistedSaveV4(
  persisted: PersistedSaveV4,
  backend: StorageBackend,
): Promise<GameSaveData> {
  const current = migrateSaveData(persisted.current);
  if (!current) throw new Error('Current-state portion of the save is unreadable.');

  const narrativeEvents: NarrativeEventLedger = { ...current.narrativeEvents };
  const narrativeArticles: ArticleArchive = { ...current.narrativeArticles };
  for (const [year, ref] of Object.entries(persisted.archive.articleYears ?? {})) {
    try {
      const chunk = JSON.parse(await readArchiveChunk(backend, ref)) as {
        schemaVersion: number;
        year: number;
        entries: unknown;
      };
      if (chunk.schemaVersion === 1 && String(chunk.year) === year)
        Object.assign(narrativeArticles, migrateArticleArchive({ [year]: chunk.entries }));
    } catch {
      /* Lost optional prose falls back to canonical facts. */
    }
  }
  const yearlyStats: YearlyPlayerRecords = {};
  const championHistory: ChampionRecord[] = [];
  const awardHistory: SeasonTitleRecord[] = [];
  const achievementHistory: AchievementEvent[] = [];
  const gameSummaries: Record<string, GameSummary> = {};
  const gameBoxScores: Record<string, GameBoxScore> = {};

  for (const [yearKey, ref] of Object.entries(persisted.archive.seasons).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    const year = Number.parseInt(yearKey, 10);
    const raw = await readArchiveChunk(backend, ref);
    const chunk = migrateSeasonArchive(parseJson(raw), year);
    if (!chunk) throw new Error(`Season archive ${yearKey} is corrupted or incompatible.`);
    if (chunk.yearlyStats.length) yearlyStats[yearKey] = chunk.yearlyStats;
    championHistory.push(...chunk.championHistory);
    awardHistory.push(...chunk.awardHistory);
    achievementHistory.push(...chunk.achievementHistory);
    Object.assign(gameSummaries, chunk.gameSummaries);
    Object.assign(gameBoxScores, chunk.gameBoxScores);
    if (chunk.narrativeEvents?.length) {
      narrativeEvents[yearKey] = [...(narrativeEvents[yearKey] ?? []), ...chunk.narrativeEvents];
    }
  }

  const retiredEntries: RetiredPlayerArchiveEntry[] = [];
  for (const [bucketKey, ref] of Object.entries(persisted.archive.retiredPlayerBuckets).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    const bucket = Number.parseInt(bucketKey, 10);
    const raw = await readArchiveChunk(backend, ref);
    const chunk = migrateRetiredPlayerArchive(parseJson(raw), bucket);
    if (!chunk) throw new Error(`Retired-player archive bucket ${bucketKey} is corrupted.`);
    retiredEntries.push(...chunk.entries);
  }
  retiredEntries.sort((a, b) => a.order - b.order);

  const careerAccumulated = { ...current.careerAccumulated };
  const leagueCareerAccumulated = { ...current.leagueCareerAccumulated };
  for (const entry of retiredEntries) {
    if (entry.careerStats) careerAccumulated[entry.player.id] = entry.careerStats;
    if (entry.leagueCareerStats) leagueCareerAccumulated[entry.player.id] = entry.leagueCareerStats;
  }

  return {
    ...current,
    worldId: current.worldId ?? persisted.worldId,
    narrativeArticles,
    careerAccumulated,
    leagueCareerAccumulated,
    yearlyStats,
    retiredPlayers: retiredEntries.map((entry) => entry.player),
    championHistory,
    awardHistory,
    achievementHistory,
    gameSummaries,
    gameBoxScores,
    narrativeEvents: migrateNarrativeEvents(narrativeEvents),
    ts: persisted.ts,
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
    return migrateSaveData(parseJson(serialized));
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
  await persistGameV4(migrated, 1, backend, migrated.ts ?? Date.now());
  return true;
}

const saveQueues = new WeakMap<StorageBackend, Map<SaveSlot, Promise<unknown>>>();
async function queueSlotWrite<T>(
  backend: StorageBackend,
  slot: SaveSlot,
  write: () => Promise<T>,
): Promise<T> {
  const queues = saveQueues.get(backend) ?? new Map<SaveSlot, Promise<unknown>>();
  saveQueues.set(backend, queues);
  const pending = (queues.get(slot) ?? Promise.resolve()).catch(() => {}).then(write);
  queues.set(slot, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(slot) === pending) queues.delete(slot);
  }
}

export async function saveGameToSlot(
  data: GameSaveData,
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  try {
    if (backend === browserStorage) requestPersistenceOnce();
    await queueSlotWrite(backend, slot, () => persistGameV4(data, slot, backend));
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function clearSaveSlot(
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<boolean> {
  return queueSlotWrite(backend, slot, async () => {
    try {
      const raw = await backend.get(SAVE_KEY(slot));
      if (raw) {
        try {
          const persisted = parsePersistedSaveV4(parseJson(raw));
          if (persisted) {
            for (const ref of [
              ...Object.values(persisted.archive.seasons),
              ...Object.values(persisted.archive.retiredPlayerBuckets),
              ...Object.values(persisted.archive.articleYears ?? {}),
            ]) {
              try {
                await tombstoneArchiveChunk(backend, ref);
              } catch {
                // The slot itself is still cleared even if an unreachable chunk remains.
              }
            }
          }
        } catch {
          // Corrupted roots can still be cleared deliberately.
        }
      }
      await backend.set(SAVE_KEY(slot), '');
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  });
}

/** Empty slots return null; corrupted roots or archive chunks throw instead of being overwritten silently. */
export async function loadGameFromSlot(
  slot: SaveSlot,
  backend: StorageBackend = browserStorage,
): Promise<GameSaveData | null> {
  await migrateLegacySaveToSlotOne(backend);
  const raw = await backend.get(SAVE_KEY(slot));
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error(
      `Save data in slot ${slot} could not be read. It may be corrupted or from an incompatible version.`,
    );
  }

  const persistedV4 = parsePersistedSaveV4(parsed);
  if (persistedV4) return loadPersistedSaveV4(persistedV4, backend);

  const legacy = migrateSaveData(parsed);
  if (!legacy) {
    throw new Error(
      `Save data in slot ${slot} could not be read. It may be corrupted or from an incompatible version.`,
    );
  }
  return legacy;
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

function slotSummaryFromRaw(slot: SaveSlot, raw: string): SaveSlotSummary {
  try {
    const parsed = parseJson(raw);
    const persisted = parsePersistedSaveV4(parsed);
    if (persisted) {
      const current = migrateSaveData(persisted.current);
      if (!current) {
        return { slot, exists: false, playerTeam: null, year: null, updatedAt: null };
      }
      return {
        slot,
        exists: true,
        playerTeam: current.playerTeam,
        year: current.season.year,
        updatedAt: persisted.ts,
      };
    }
    const legacy = migrateSaveData(parsed);
    return legacy
      ? {
          slot,
          exists: true,
          playerTeam: legacy.playerTeam,
          year: legacy.season.year,
          updatedAt: legacy.ts ?? null,
        }
      : { slot, exists: false, playerTeam: null, year: null, updatedAt: null };
  } catch {
    return { slot, exists: false, playerTeam: null, year: null, updatedAt: null };
  }
}

export async function listSaveSlots(
  backend: StorageBackend = browserStorage,
): Promise<SaveSlotSummary[]> {
  await migrateLegacySaveToSlotOne(backend);
  return Promise.all(
    SAVE_SLOTS.map(async (slot) => {
      const raw = await backend.get(SAVE_KEY(slot));
      return raw
        ? slotSummaryFromRaw(slot, raw)
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
    const blob = new Blob([exportSaveData(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
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
