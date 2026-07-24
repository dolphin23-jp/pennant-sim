import { CENTRAL, FIELD_POSITIONS, PACIFIC, TINFO } from '../data';
import {
  bestLineup,
  calcOVR,
  effectiveOVR,
  generateBatter,
  generatePitcher,
  gaussian,
  random,
  randomChoice,
  randomInt,
  sampleTradeCash,
  teamNeedsScore,
  topStarters,
} from '../engine';
import type { FieldPosition, Player, Team, TeamKey, Teams } from '../engine';

export interface TradeOffer {
  id: string;
  fromTeam: TeamKey;
  give: Player;
  receive: Player;
  cash: number;
  summary: string;
}

export type DraftPick = Player & { teamKey: TeamKey; round: number };

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

export function generateTradeOffers(teams: Teams, playerTeam: TeamKey): TradeOffer[] {
  const userTeam = teams[playerTeam];
  const bench = [...userTeam.fielders]
    .filter((player) => !bestLineup(userTeam).some((starter) => starter.id === player.id))
    .sort((first, second) => effectiveOVR(second, second.pos) - effectiveOVR(first, first.pos));
  const relief = [...userTeam.pitchers]
    .filter((player) => player.role !== '先発')
    .sort((first, second) => calcOVR(second) - calcOVR(first));
  const tradeChip = bench[0] ?? relief[0] ?? [...userTeam.fielders, ...userTeam.pitchers][0];
  if (!tradeChip) return [];

  return [...CENTRAL, ...PACIFIC]
    .filter((teamKey) => teamKey !== playerTeam)
    .slice(0, 5)
    .map((teamKey, index) => {
      const opponent = teams[teamKey];
      const target = [...opponent.fielders, ...opponent.pitchers].sort(
        (first, second) => teamNeedsScore(userTeam, second) - teamNeedsScore(userTeam, first),
      )[0];
      if (!target) return null;
      return {
        id: `${teamKey}-${tradeChip.id}-${target.id}-${index}`,
        fromTeam: teamKey,
        give: target,
        receive: tradeChip,
        cash: sampleTradeCash(),
        summary: `${TINFO[teamKey].ab}が ${target.name} ↔ ${tradeChip.name} を提示`,
      } satisfies TradeOffer;
    })
    .filter((offer): offer is TradeOffer => offer !== null)
    .slice(0, 3);
}

export function applyTrade(teams: Teams, playerTeam: TeamKey, offer: TradeOffer): Teams {
  const next = { ...teams };
  const user = { ...next[playerTeam] };
  const opponent = { ...next[offer.fromTeam] };
  const remove = (players: Player[], playerId: string) =>
    players.filter((player) => player.id !== playerId);

  if (offer.receive.isP) {
    user.pitchers = remove(user.pitchers, offer.receive.id);
    opponent.pitchers = [
      ...remove(opponent.pitchers, offer.give.id),
      { ...offer.receive, tk: offer.fromTeam },
    ];
  } else {
    user.fielders = remove(user.fielders, offer.receive.id);
    opponent.fielders = [
      ...remove(opponent.fielders, offer.give.id),
      { ...offer.receive, tk: offer.fromTeam },
    ];
  }
  if (offer.give.isP) {
    opponent.pitchers = remove(opponent.pitchers, offer.give.id);
    user.pitchers = [...remove(user.pitchers, offer.receive.id), { ...offer.give, tk: playerTeam }];
  } else {
    opponent.fielders = remove(opponent.fielders, offer.give.id);
    user.fielders = [...remove(user.fielders, offer.receive.id), { ...offer.give, tk: playerTeam }];
  }
  next[playerTeam] = user;
  next[offer.fromTeam] = opponent;
  return next;
}

export function generateDraftProspects(): Player[] {
  const pool: Player[] = [];
  const positions: Array<FieldPosition | '先発' | 'リリーフ' | 'クローザー'> = [
    '先発',
    '先発',
    'リリーフ',
    'クローザー',
    ...FIELD_POSITIONS,
    ...FIELD_POSITIONS,
    '先発',
  ];
  for (let index = 0; index < 80; index += 1) {
    const position = randomChoice(positions);
    const age = randomInt(18, 22);
    let quality = Math.max(32, Math.min(96, gaussian(58, 14)));
    if (random() < 0.1) quality = Math.max(60, Math.min(104, gaussian(78, 8)));
    if (random() < 0.02) quality = Math.max(82, Math.min(112, gaussian(94, 6)));
    const player =
      position === '先発' || position === 'リリーフ' || position === 'クローザー'
        ? generatePitcher('draft', age, quality, position)
        : generateBatter('draft', age, position, quality);
    player.note =
      quality >= 90 ? '怪物候補' : quality >= 75 ? '即戦力候補' : age <= 19 ? '素材型' : '有望株';
    pool.push(player);
  }
  return pool.sort(
    (first, second) =>
      (second.isP ? calcOVR(second) : calcOVR(second, second.pos)) -
      (first.isP ? calcOVR(first) : calcOVR(first, first.pos)),
  );
}

export function draftOrder(teams: Teams): TeamKey[] {
  return [...CENTRAL, ...PACIFIC].sort(
    (first, second) => teamStrength(teams[first]) - teamStrength(teams[second]),
  );
}

export function cpuDraftPick(team: Team, prospects: Player[]): Player | undefined {
  return [...prospects].sort(
    (first, second) => teamNeedsScore(team, second) - teamNeedsScore(team, first),
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
