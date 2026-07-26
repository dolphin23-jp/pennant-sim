import { CENTRAL, PACIFIC, TINFO } from '../data';
import { bestLineup, calcOVR, effectiveOVR, sampleTradeCash, teamNeedsScore } from '../engine';
import type { Player, TeamKey, Teams } from '../engine';

export interface TradeOffer {
  id: string;
  fromTeam: TeamKey;
  give: Player;
  receive: Player;
  cash: number;
  summary: string;
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

  // Guard against the same offer being applied twice (e.g. a duplicate click):
  // if either player is no longer on the roster the offer expects, the trade
  // was already applied, so return the input unchanged instead of duplicating
  // players across rosters.
  const userHasReceive = [...user.fielders, ...user.pitchers].some(
    (player) => player.id === offer.receive.id,
  );
  const opponentHasGive = [...opponent.fielders, ...opponent.pitchers].some(
    (player) => player.id === offer.give.id,
  );
  if (!userHasReceive || !opponentHasGive) return teams;

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
