import { CENTRAL, FIELD_POSITIONS, PACIFIC, PLAYER_DEVELOPMENT_BALANCE } from '../data';
import { generateBatter, generatePitcher } from './players';
import { gaussian, random, randomChoice, randomInt } from './random';
import { bestLineup, calcOVR, effectiveOVR, topStarters } from './ratings';
import { teamNeedsScore } from './market';
import type {
  DraftOrigin,
  FieldPosition,
  Player,
  StandingRecord,
  Team,
  TeamKey,
  Teams,
} from './types';

export type DraftPick = Player & { teamKey: TeamKey; round: number };
export interface FirstRoundWaveResult {
  picks: DraftPick[];
  unresolvedTeams: TeamKey[];
  bids: Record<string, TeamKey[]>;
}

function prospectFutureBonus(player: Player): number {
  const maximumPotentialGap = Math.max(
    0,
    ...Object.entries(player.pot).map(([key, value]) => {
      const current = player.p[key as keyof typeof player.p];
      return typeof value === 'number' && typeof current === 'number' ? value - current : 0;
    }),
  );
  return (
    maximumPotentialGap * 0.12 +
    (player.potentialClass === 'elite' ? 6 : 0) +
    (player.generationalTalent ? 12 : 0) +
    (player.age <= 19 ? 1 : 0)
  );
}

function applyGenerationalTalent(player: Player, quality: number): Player {
  if (quality < 88) return player;
  const developmentParameters = player.isP
    ? (['vel', 'ctrl', 'stam', 'nobi', 'fld'] as const)
    : ([
        'cf',
        'cb',
        'pw',
        'dc',
        'sp',
        ...(player.pos === '捕手' ? (['ld'] as const) : []),
      ] as const);
  const broadPotential = { ...player.pot };
  for (const parameter of developmentParameters) {
    const current = Number(player.p[parameter] ?? 0);
    broadPotential[parameter] = Math.min(
      PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.elite,
      Math.max(
        Number(broadPotential[parameter] ?? current),
        current + randomInt(38, 62),
        Math.round(quality * (1.03 + random() * 0.24)),
      ),
    );
  }
  const talented: Player = {
    ...player,
    potentialClass: 'elite',
    generationalTalent: true,
    pot: broadPotential,
  };
  if (talented.isP) {
    const signature = randomChoice(['vel', 'ctrl', 'nobi'] as const);
    const current = Number(talented.p[signature] ?? 0);
    const boosted = Math.max(current, randomInt(92, 112));
    return {
      ...talented,
      p: { ...talented.p, [signature]: boosted },
      pot: {
        ...talented.pot,
        [signature]: Math.max(Number(talented.pot[signature] ?? 0), boosted + randomInt(8, 18)),
      },
    };
  }

  const signature = randomChoice(['cf', 'cf', 'cb', 'cb', 'pw', 'sp', 'df'] as const);
  const signatureValue = Math.max(
    Number(talented.p[signature] ?? 0),
    signature === 'pw' ? randomInt(96, 114) : randomInt(92, 114),
  );
  const secondary = randomChoice(
    (['cf', 'cb', 'pw', 'sp', 'df'] as const).filter((parameter) => parameter !== signature),
  );
  const secondaryValue = Math.max(Number(talented.p[secondary] ?? 0), randomInt(74, 98));
  return {
    ...talented,
    p: { ...talented.p, [signature]: signatureValue, [secondary]: secondaryValue },
    pot: {
      ...talented.pot,
      [signature]: Math.max(
        Number(talented.pot[signature] ?? 0),
        signatureValue + randomInt(10, 20),
      ),
      [secondary]: Math.max(
        Number(talented.pot[secondary] ?? 0),
        secondaryValue + randomInt(8, 16),
      ),
    },
  };
}

function calibrateDraftBatter(player: Player): Player {
  if (player.isP) return player;
  const contactBonus = 3;
  const fieldingAdjustment = -3;
  const ratingCeiling = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;
  const potentialCeiling =
    player.potentialClass === 'elite'
      ? PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.elite
      : PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.standard;
  const cf = Math.min(ratingCeiling, Number(player.p.cf ?? 0) + contactBonus);
  const cb = Math.min(ratingCeiling, Number(player.p.cb ?? 0) + contactBonus);
  const df = Math.max(1, Number(player.p.df ?? 0) + fieldingAdjustment);
  return {
    ...player,
    p: { ...player.p, cf, cb, df },
    pot: {
      ...player.pot,
      cf: Math.max(cf, Math.min(potentialCeiling, Number(player.pot.cf ?? cf) + contactBonus)),
      cb: Math.max(cb, Math.min(potentialCeiling, Number(player.pot.cb ?? cb) + contactBonus)),
      df: Math.max(df, Number(player.pot.df ?? df) + fieldingAdjustment),
    },
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
      monsterChance = draftOrigin === '高卒' ? 0.012 : draftOrigin === '大卒' ? 0.023 : 0.03;
    let quality = Math.max(32, Math.min(96, gaussian(58, 14)));
    if (random() < immediateChance) quality = Math.max(60, Math.min(104, gaussian(78, 8)));
    if (random() < monsterChance) quality = Math.max(88, Math.min(124, gaussian(102, 8)));
    const generated =
      position === '先発' || position === 'リリーフ' || position === 'クローザー'
        ? generatePitcher('draft', age, quality, position)
        : generateBatter('draft', age, position, quality);
    const prospectLabel =
      quality >= 90 ? '怪物候補' : quality >= 75 ? '即戦力候補' : age <= 19 ? '素材型' : '有望株';
    const player: Player = {
      ...applyGenerationalTalent(calibrateDraftBatter(generated), quality),
      draftOrigin,
      note: `${draftOrigin}・${prospectLabel}`,
    };
    pool.push(player);
  }
  return pool.sort(
    (first, second) =>
      (second.isP ? calcOVR(second) : calcOVR(second, second.pos)) +
      prospectFutureBonus(second) -
      ((first.isP ? calcOVR(first) : calcOVR(first, first.pos)) + prospectFutureBonus(first)),
  );
}

/** Headless fallback for callers that do not have a completed season table. The playable
 * offseason uses draftOrderFromStandings so FA/trades can never rewrite the prior season. */
export function draftOrder(teams: Teams): TeamKey[] {
  return [...CENTRAL, ...PACIFIC].sort(
    (first, second) => teamStrength(teams[first]) - teamStrength(teams[second]),
  );
}

/** Freeze the NPB-style second-round order from the completed regular season. Within
 * each league the worst club picks first; the league that performed better in
 * interleague play gets the first slot at each rank. */
export function draftOrderFromStandings(
  standings: Record<TeamKey, StandingRecord>,
  interleagueStandings?: Record<TeamKey, StandingRecord>,
): TeamKey[] {
  const worstFirst = (league: readonly TeamKey[]) =>
    [...league].sort((first, second) => {
      const firstRank = standings[first].rank ?? 0;
      const secondRank = standings[second].rank ?? 0;
      if (firstRank !== secondRank) return secondRank - firstRank;
      return (standings[first].pct ?? 0) - (standings[second].pct ?? 0);
    });
  const central = worstFirst(CENTRAL);
  const pacific = worstFirst(PACIFIC);
  const leagueWins = (league: readonly TeamKey[]) =>
    league.reduce((sum, teamKey) => sum + (interleagueStandings?.[teamKey].w ?? 0), 0);
  const centralFirst = leagueWins(CENTRAL) >= leagueWins(PACIFIC);
  const first = centralFirst ? central : pacific;
  const second = centralFirst ? pacific : central;
  const order: TeamKey[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    if (first[index]) order.push(first[index] as TeamKey);
    if (second[index]) order.push(second[index] as TeamKey);
  }
  return order;
}

/** Round 1 is simultaneous bidding. Round 2 starts from the frozen reverse-standing
 * order, then subsequent rounds alternate direction. */
export function draftRoundOrder(order: TeamKey[], round: number): TeamKey[] {
  return round >= 3 && round % 2 === 1 ? [...order].reverse() : [...order];
}

/** Resolve one simultaneous first-round nomination wave. A contested prospect is awarded
 * by equal-probability lottery; losing clubs remain unresolved and bid again next wave. */
export function resolveFirstRoundWave(
  teams: Teams,
  prospects: Player[],
  biddingTeams: readonly TeamKey[],
  playerTeam: TeamKey | null = null,
  userChoice: Player | null = null,
): FirstRoundWaveResult {
  const bidsByProspect = new Map<string, TeamKey[]>();
  const unresolvedWithoutBid: TeamKey[] = [];
  for (const teamKey of biddingTeams) {
    const selected =
      teamKey === playerTeam
        ? userChoice && prospects.some((prospect) => prospect.id === userChoice.id)
          ? userChoice
          : undefined
        : cpuDraftPick(teams[teamKey], prospects);
    if (!selected) {
      unresolvedWithoutBid.push(teamKey);
      continue;
    }
    const bidders = bidsByProspect.get(selected.id) ?? [];
    bidders.push(teamKey);
    bidsByProspect.set(selected.id, bidders);
  }

  const picks: DraftPick[] = [];
  const unresolvedTeams = [...unresolvedWithoutBid];
  for (const [prospectId, bidders] of bidsByProspect) {
    const prospect = prospects.find((candidate) => candidate.id === prospectId);
    if (!prospect || !bidders.length) {
      unresolvedTeams.push(...bidders);
      continue;
    }
    const winner = randomChoice(bidders);
    picks.push({ ...prospect, teamKey: winner, round: 1 });
    unresolvedTeams.push(...bidders.filter((teamKey) => teamKey !== winner));
  }
  return {
    picks,
    unresolvedTeams,
    bids: Object.fromEntries(bidsByProspect.entries()),
  };
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
    const signed = { ...pick, tk: pick.teamKey, rookieSeason: true };
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
  let unresolved = [...order];
  while (unresolved.length && rounds >= 1) {
    const wave = resolveFirstRoundWave(nextTeams, prospects, unresolved);
    if (!wave.picks.length) throw new Error('Draft first-round bidding could not resolve.');
    picks.push(...wave.picks);
    nextTeams = applyDraftPicks(nextTeams, wave.picks);
    const wonIds = new Set(wave.picks.map((pick) => pick.id));
    prospects = prospects.filter((prospect) => !wonIds.has(prospect.id));
    unresolved = wave.unresolvedTeams;
  }
  for (let round = 2; round <= rounds; round += 1) {
    for (const teamKey of draftRoundOrder(order, round)) {
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
