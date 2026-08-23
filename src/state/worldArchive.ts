export const WORLD_STORAGE_VERSION = 4 as const;
export const WORLD_ARCHIVE_SCHEMA_VERSION = 1 as const;

export interface ArchiveStorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface ArchiveChunkRef {
  key: string;
  revision: string;
}

export interface WorldArchiveIndex {
  schemaVersion: typeof WORLD_ARCHIVE_SCHEMA_VERSION;
  seasons: Record<string, ArchiveChunkRef>;
  retiredPlayerBuckets: Record<string, ArchiveChunkRef>;
}

export function createEmptyWorldArchiveIndex(): WorldArchiveIndex {
  return {
    schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
    seasons: {},
    retiredPlayerBuckets: {},
  };
}

/**
 * A small deterministic content revision. It is not a security hash: its job is to
 * avoid rewriting unchanged archive chunks and to make chunk keys immutable once
 * referenced by a committed current-state envelope.
 */
export function contentRevision(serialized: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${serialized.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function createWorldId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function safeSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_');
}

export function seasonArchiveKey(
  slot: number,
  worldId: string,
  year: number,
  revision: string,
): string {
  return `npb_sim_v4_slot_${slot}_world_${safeSegment(worldId)}_season_${year}_${revision}`;
}

export function retiredPlayerArchiveKey(
  slot: number,
  worldId: string,
  bucket: number,
  revision: string,
): string {
  return `npb_sim_v4_slot_${slot}_world_${safeSegment(worldId)}_retired_${bucket}_${revision}`;
}

export async function writeArchiveChunk(
  backend: ArchiveStorageBackend,
  key: string,
  serialized: string,
): Promise<void> {
  await backend.set(key, serialized);
}

export async function readArchiveChunk(
  backend: ArchiveStorageBackend,
  ref: ArchiveChunkRef,
): Promise<string> {
  const raw = await backend.get(ref.key);
  if (!raw) throw new Error(`Archive chunk ${ref.key} is missing or unreadable.`);
  if (contentRevision(raw) !== ref.revision) {
    throw new Error(`Archive chunk ${ref.key} failed its revision check.`);
  }
  return raw;
}

/**
 * Backends intentionally share the old get/set contract. Empty-string tombstones are
 * enough because every reader treats them as absent, and resilient fallback storage
 * stops at the first non-null value (including the tombstone).
 */
export async function tombstoneArchiveChunk(
  backend: ArchiveStorageBackend,
  ref: ArchiveChunkRef,
): Promise<void> {
  await backend.set(ref.key, '');
}
