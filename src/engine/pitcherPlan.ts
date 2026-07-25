import { calcOVR, topStarters } from './ratings';
import type { Player, Team } from './types';

export interface PitcherPlanInput {
  rotationOrder: string[];
  closerPriority: string[];
  /** CPU-only middle-relief order. Optional so existing saves and user plans stay compatible. */
  bullpenPriority?: string[];
}

function eligibleStarterPool(team: Team): Player[] {
  const healthy = team.pitchers.filter(
    (pitcher) =>
      pitcher.role === '先発' && (pitcher.injuryDays ?? 0) <= 0 && (pitcher.fatigue ?? 0) < 85,
  );
  return healthy.length
    ? healthy
    : team.pitchers.filter((pitcher) => pitcher.role === '先発' && (pitcher.injuryDays ?? 0) <= 0);
}

export function resolveStarterRotation(team: Team, rotationOrder: string[] = []): Player[] {
  const automatic = topStarters(team);
  if (!rotationOrder.length) return automatic;

  const eligible = eligibleStarterPool(team);
  const byId = new Map(eligible.map((pitcher) => [pitcher.id, pitcher]));
  const resolved: Player[] = [];
  const used = new Set<string>();
  const append = (pitcher: Player | undefined) => {
    if (!pitcher || used.has(pitcher.id)) return;
    used.add(pitcher.id);
    resolved.push(pitcher);
  };

  for (const pitcherId of rotationOrder) append(byId.get(pitcherId));
  for (const pitcher of automatic) append(pitcher);
  for (const pitcher of [...eligible].sort((first, second) => calcOVR(second) - calcOVR(first))) {
    append(pitcher);
  }

  return resolved.slice(0, team.rotSize || 6);
}

export function resolveCloserOrder(team: Team, closerPriority: string[] = []): Player[] {
  const closers = team.pitchers.filter((pitcher) => pitcher.role === 'クローザー');
  if (!closerPriority.length) return closers;

  const byId = new Map(closers.map((pitcher) => [pitcher.id, pitcher]));
  const ordered: Player[] = [];
  const used = new Set<string>();
  for (const pitcherId of closerPriority) {
    const pitcher = byId.get(pitcherId);
    if (!pitcher || used.has(pitcher.id)) continue;
    used.add(pitcher.id);
    ordered.push(pitcher);
  }
  for (const pitcher of closers) {
    if (!used.has(pitcher.id)) ordered.push(pitcher);
  }
  return ordered;
}

export function selectCloserByPriority(
  availableClosers: Player[],
  closerPriority: string[] = [],
): Player | undefined {
  if (!availableClosers.length) return undefined;
  if (!closerPriority.length) return availableClosers[0];
  const availableById = new Map(availableClosers.map((pitcher) => [pitcher.id, pitcher]));
  for (const pitcherId of closerPriority) {
    const pitcher = availableById.get(pitcherId);
    if (pitcher) return pitcher;
  }
  return availableClosers[0];
}
