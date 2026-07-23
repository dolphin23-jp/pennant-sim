import { OVR_W, OVR_W_PIT } from '../data';
import type { AccumulatedStats, FieldPosition, Player, Team } from './types';
export function calcOVR(player: Player | undefined, position?: FieldPosition): number {
  if (!player) return 50;
  if (player.isP) {
    const weights = OVR_W_PIT[player.role ?? 'リリーフ'],
      params = player.p;
    return Math.round(
      (params.vel ?? 50) * weights.vel +
        (params.ctrl ?? 50) * weights.ctrl +
        (params.stam ?? 50) * weights.stam +
        (params.nobi ?? 50) * weights.nobi +
        (params.fld ?? 50) * weights.fld,
    );
  }
  const resolved = position ?? player._assignedPos ?? player.pos ?? '左翼手',
    weights = OVR_W[resolved],
    params = player.p;
  return Math.round(
    (params.cf ?? 50) * weights.cf +
      (params.cb ?? 50) * weights.cb +
      (params.pw ?? 50) * weights.pw +
      (params.dc ?? 50) * weights.dc +
      (params.sp ?? 50) * weights.sp +
      (params.df ?? 50) * weights.df +
      (params.arm ?? 50) * weights.arm +
      (params.ld ?? 0) * weights.ld +
      (params.stam ?? 50) * weights.stam,
  );
}
export function aptitudeFor(player: Player, position: FieldPosition): number {
  if (!player.positions) return player.pos === position ? 100 : 55;
  const aptitude = player.positions.find((candidate) => candidate.pos === position);
  return aptitude?.apt ?? (player.pos === position ? 100 : 45);
}
export function effectiveOVR(player: Player | undefined, position?: FieldPosition): number {
  if (!player) return 50;
  const resolved = position ?? player._assignedPos ?? player.pos ?? '左翼手';
  return Math.round(
    calcOVR(player, resolved) * (0.7 + (aptitudeFor(player, resolved) / 100) * 0.3),
  );
}
export function bestLineup(team: Team): Player[] {
  const used = new Set<string>(),
    lineup: Player[] = [];
  const healthy = team.fielders.filter((f) => (f.injuryDays ?? 0) <= 0 && (f.fatigue ?? 0) < 85);
  const pool =
    healthy.length >= 9 ? healthy : team.fielders.filter((f) => (f.injuryDays ?? 0) <= 0);
  const priority: FieldPosition[] = [
    '捕手',
    '遊撃手',
    '中堅手',
    '二塁手',
    '三塁手',
    '左翼手',
    '右翼手',
    '一塁手',
  ];
  for (const position of priority) {
    const candidates = pool
      .filter(
        (f) =>
          !used.has(f.id) &&
          (f.pos === position || f.positions?.some((entry) => entry.pos === position)),
      )
      .sort((a, b) => effectiveOVR(b, position) - effectiveOVR(a, position));
    if (candidates.length) {
      const selected = candidates[0] as Player;
      used.add(selected.id);
      lineup.push({ ...selected, _assignedPos: position });
    }
  }
  pool
    .filter((f) => !used.has(f.id))
    .sort((a, b) => calcOVR(b) - calcOVR(a))
    .slice(0, 9 - lineup.length)
    .forEach((f) => lineup.push({ ...f, _assignedPos: f.pos }));
  return lineup.slice(0, 9);
}
export function topStarters(team: Team): Player[] {
  const healthy = team.pitchers.filter(
    (p) => p.role === '先発' && (p.injuryDays ?? 0) <= 0 && (p.fatigue ?? 0) < 85,
  );
  const pool = healthy.length
    ? healthy
    : team.pitchers.filter((p) => p.role === '先発' && (p.injuryDays ?? 0) <= 0);
  return pool.sort((a, b) => calcOVR(b) - calcOVR(a)).slice(0, team.rotSize || 6);
}
export function masteryFromAccum(player: Player, accumulated: AccumulatedStats): number {
  const stats = accumulated[player.id];
  if (player.isP) {
    const outs = stats?.type === 'pit' ? stats.ip3 : 0;
    return Math.min(1, 0.75 + (outs / 300) * 0.25);
  }
  const pa = stats?.type === 'bat' ? stats.pa : 0;
  return Math.min(1, 0.75 + (pa / 500) * 0.25);
}
