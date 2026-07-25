import { CENTRAL, FIELD_POSITIONS, PACIFIC } from '../data';
import { generateBatter, generatePitcher } from './players';
import { gaussian, random, randomChoice, randomInt } from './random';
import { bestLineup, calcOVR, effectiveOVR, topStarters } from './ratings';
import { teamNeedsScore } from './market';
import type { DraftOrigin, FieldPosition, Player, Team, TeamKey, Teams } from './types';

export type DraftPick = Player & { teamKey: TeamKey; round: number };

function prospectFutureBonus(player: Player): number {
  const maximumPotentialGap = Math.max(
    0,
    ...Object.entries(player.pot).map(([key, value]) => {
      const current = player.p[key as keyof typeof player.p];
      return typeof value === 'number' && typeof current === 'number' ? value - current : 0;
    }),
  );
  return maximumPotentialGap * 0.12 + (player.potentialClass === 'elite' ? 6 : 0);
}

function applyGenerationalTalent(player: Player, quality: number): void {
  if (quality < 90) return;
  player.potentialClass = 'elite';
  if (player.isP) {
    const signature = randomChoice(['vel', 'ctrl', 'nobi'] as const);
    const current = Number(player.p[signature] ?? 0);
    const boosted = Math.max(current, randomInt(92, 112));
    player.p = { ...player.p, [signature]: boosted };
    player.pot = {
      ...player.pot,
      [signature]: Math.max(Number(player.pot[signature] ?? 0), boosted + randomInt(8, 18)),
    };
    return;
  }

  const power = Math.max(Number(player.p.pw ?? 0), randomInt(100, 120));
  const secondary = randomChoice(['cf', 'cb', 'sp'] as const);
  const secondaryValue = Math.max(Number(player.p[secondary] ?? 0), randomInt(72, 96));
  player.p = { ...player.p, pw: power, [secondary]: secondaryValue };
  player.pot = {
    ...player.pot,
    pw: Math.max(Number(player.pot.pw ?? 0), power + randomInt(10, 20)),
    [secondary]: Math.max(Number(player.pot[secondary] ?? 0), secondaryValue + randomInt(8, 16)),
  };
}

export function teamStrength(team: Team): number {
  const lineup = bestLineup(team).slice(0, 9);
  const batting = lineup.length
    ? lineup.reduce(
        (total, player) => total + effectiveOVR(player, player._assignedPos ?? player.pos),
        0,
      ) / lineup.length
    : 50;
  const starters = topStarters(team).slice(0, 5);
  const starting = starters.length
    ? starters.reduce((total, player) => total + calcOVR(player), 0) / starters.length
    : 50;
  const bullpen = team.pitchers
    .filter((player) => player.role !== '先発')
    .sort((first, second) => calcOVR(second) - calcOVR(first))
    .slice(0, 6);
  const relief = bullpen.length
    ? bullpen.reduce((total, player) => total + calcOVR(player), 0) / bullpen.length
    : 50;
  return Math.round(batting * 0.45 + starting * 0.3 + relief * 0.25);
}

export function generateDraftProspects(): Player[] {
  const pool: Player[] = [];
  const pitcherRoles = [
    '先発',
    '先発',
    '先発',
    '先発',
    'リリーフ',
    'リリーフ',
    'リリーフ',
    'クローザー',
  ] as const;
  for (let index = 0; index < 96; index += 1) {
    const position: FieldPosition | (typeof pitcherRoles)[number] =
        index < 40 ? randomChoice([...pitcherRoles]) : randomChoice(FIELD_POSITIONS),
      originRoll = random(),
      draftOrigin: DraftOrigin = originRoll < 0.46 ? '高卒' : originRoll < 0.82 ? '大卒' : '社会人',
      age =
        draftOrigin === '高卒'
          ? randomInt(18, 19)
          : draftOrigin === '大卒'
            ? randomInt(21, 22)
            : randomInt(23, 25),
      immediateChance = draftOrigin === '高卒' ? 0.07 : draftOrigin === '大卒' ? 0.13 : 0.16,
      monsterChance = draftOrigin === '高卒' ? 0.012 : draftOrigin === '大卒' ? 0.027 : 0.035;
    let quality = Math.max(32, Math.min(96, gaussian(58, 14)));
    if (random() < immediateChance) quality = Math.max(60, Math.min(104, gaussian(78, 8)));
    if (random() < monsterChance) quality = Math.max(82, Math.min(112, gaussian(94, 6)));
    const player =
      position === '先発' || position === 'リリーフ' || position === 'クローザー'
        ? generatePitcher('draft', age, quality, position)
        : generateBatter('draft', age, position, quality);
    applyGenerationalTalent(player, quality);
    player.draftOrigin = draftOrigin;
    const prospectLabel =
      quality >= 90 ? '怪物候補' : quality >= 75 ? '即戦力候補' : age <= 19 ? '素材型' : '有望株';
    player.note = `${draftOrigin}・${prospectLabel}`;
    pool.push(player);
  }
  return pool.sort(
    (first, second) =>
      (second.isP ? calcOVR(second) : calcOVR(second, second.pos)) +
      prospectFutureBonus(second) -
      ((first.isP ? calcOVR(first) : calcOVR(first, first.pos)) + prospectFutureBonus(first)),
  );
}

export function draftOrder(teams: Teams): TeamKey[] {
  return [...CENTRAL, ...PACIFIC].sort(
    (first, second) => teamStrength(teams[first]) - teamStrength(teams[second]),
  );
}

export function cpuDraftPick(team: Team, prospects: Player[]): Player | undefined {
  const pitcherDeficit = Math.max(0, 28 - team.pitchers.length);
  const fielderDeficit = Math.max(0, 35 - team.fielders.length);
  const positionPool =
    pitcherDeficit > fielderDeficit
      ? prospects.filter((player) => player.isP)
      : fielderDeficit > pitcherDeficit
        ? prospects.filter((player) => !player.isP)
        : prospects;
  return [...(positionPool.length ? positionPool : prospects)].sort(
    (first, second) =>
      teamNeedsScore(team, second) +
      prospectFutureBonus(second) -
      (teamNeedsScore(team, first) + prospectFutureBonus(first)),
  )[0];
}

export function applyDraftPicks(teams: Teams, picks: DraftPick[]): Teams {
  const next = { ...teams };
  for (const pick of picks) {
    const team = { ...next[pick.teamKey] };
    const signed = { ...pick, tk: pick.teamKey };
    if (signed.isP) team.pitchers = [...team.pitchers, signed];
    else team.fielders = [...team.fielders, signed];
    next[pick.teamKey] = team;
  }
  return next;
}

export function runCpuDraft(teams: Teams, rounds = 6): { teams: Teams; picks: DraftPick[] } {
  const order = draftOrder(teams);
  let prospects = generateDraftProspects();
  let nextTeams = teams;
  const picks: DraftPick[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const teamKey of order) {
      const selected = cpuDraftPick(nextTeams[teamKey], prospects);
      if (!selected) throw new Error(`Draft pool exhausted in round ${round}.`);
      const pick = { ...selected, teamKey, round };
      picks.push(pick);
      nextTeams = applyDraftPicks(nextTeams, [pick]);
      prospects = prospects.filter((prospect) => prospect.id !== selected.id);
    }
  }
  return { teams: nextTeams, picks };
}
