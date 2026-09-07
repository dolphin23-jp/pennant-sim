import { calcOVR, effectiveOVR } from './ratings';
import type { Player } from './types';

export interface DraftProspectSnapshot {
  schemaVersion: 1;
  source: 'draft-pool-v1';
  playerId: string;
  age: number;
  role: string;
  currentOverall: number;
  poolRank: number;
  poolSize: number;
  strongestSkill: {
    label: string;
    rating: number;
  };
  materialPotentialGap: {
    threshold: 12;
    count: number;
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function roleLabel(player: Player): string {
  return player.isP ? player.role ?? '投手' : player.pos ?? '野手';
}

function overall(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function strongestSkill(player: Player): DraftProspectSnapshot['strongestSkill'] {
  const skills: Array<[string, number]> = player.isP
    ? [
        ['球速', Number(player.p.vel ?? 0)],
        ['制球', Number(player.p.ctrl ?? 0)],
        ['スタミナ', Number(player.p.stam ?? 0)],
        ['球威', Number(player.p.nobi ?? 0)],
        ['守備', Number(player.p.fld ?? 0)],
      ]
    : [
        ['ミート', Math.max(Number(player.p.cf ?? 0), Number(player.p.cb ?? 0))],
        ['長打力', Number(player.p.pw ?? 0)],
        ['選球眼', Number(player.p.dc ?? 0)],
        ['走力', Number(player.p.sp ?? 0)],
        ['守備', Number(player.p.df ?? 0)],
        ['肩力', Number(player.p.arm ?? 0)],
      ];
  const [label, rating] = skills.reduce(
    (best, candidate) => (candidate[1] > best[1] ? candidate : best),
    skills[0],
  );
  return { label, rating };
}

function materialPotentialGapCount(player: Player): number {
  return Object.entries(player.pot).filter(([key, target]) => {
    if (typeof target !== 'number') return false;
    const current = player.p[key as keyof typeof player.p];
    return typeof current === 'number' && target >= current + 12;
  }).length;
}

export function buildDraftProspectSnapshot(
  player: Player,
  prospects: readonly Player[],
): DraftProspectSnapshot | null {
  const ranked = prospects
    .map((candidate) => ({ id: candidate.id, overall: overall(candidate) }))
    .sort((first, second) => second.overall - first.overall || first.id.localeCompare(second.id));
  const poolRank = ranked.findIndex((candidate) => candidate.id === player.id) + 1;
  if (poolRank <= 0) return null;

  return {
    schemaVersion: 1,
    source: 'draft-pool-v1',
    playerId: player.id,
    age: player.age,
    role: roleLabel(player),
    currentOverall: overall(player),
    poolRank,
    poolSize: prospects.length,
    strongestSkill: strongestSkill(player),
    materialPotentialGap: {
      threshold: 12,
      count: materialPotentialGapCount(player),
    },
  };
}

export function buildDraftProspectSnapshotMap(
  prospects: readonly Player[],
): ReadonlyMap<string, DraftProspectSnapshot> {
  return new Map(
    prospects.flatMap((player) => {
      const snapshot = buildDraftProspectSnapshot(player, prospects);
      return snapshot ? ([[player.id, snapshot]] as const) : [];
    }),
  );
}

export function isDraftProspectSnapshot(value: unknown): value is DraftProspectSnapshot {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.source !== 'draft-pool-v1' ||
    typeof value.playerId !== 'string' ||
    !value.playerId ||
    !Number.isSafeInteger(value.age) ||
    Number(value.age) < 0 ||
    typeof value.role !== 'string' ||
    !value.role ||
    typeof value.currentOverall !== 'number' ||
    !Number.isFinite(value.currentOverall) ||
    !Number.isSafeInteger(value.poolRank) ||
    Number(value.poolRank) <= 0 ||
    !Number.isSafeInteger(value.poolSize) ||
    Number(value.poolSize) <= 0 ||
    Number(value.poolRank) > Number(value.poolSize) ||
    !object(value.strongestSkill) ||
    typeof value.strongestSkill.label !== 'string' ||
    !value.strongestSkill.label ||
    typeof value.strongestSkill.rating !== 'number' ||
    !Number.isFinite(value.strongestSkill.rating) ||
    !object(value.materialPotentialGap) ||
    value.materialPotentialGap.threshold !== 12 ||
    !Number.isSafeInteger(value.materialPotentialGap.count) ||
    Number(value.materialPotentialGap.count) < 0
  )
    return false;
  return true;
}
