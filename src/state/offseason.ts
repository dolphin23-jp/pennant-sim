import { CENTRAL, PACIFIC, TINFO } from '../data';
import {
  bestLineup,
  calcOVR,
  clamp,
  effectiveOVR,
  random,
  sampleTradeCash,
  teamNeedsScore,
} from '../engine';
import type { Player, Team, TeamKey, Teams } from '../engine';

export interface TradeOffer {
  id: string;
  fromTeam: TeamKey;
  /** Players moving from fromTeam to the player's team. */
  give: Player[];
  /** Players moving from the player's team to fromTeam. */
  receive: Player[];
  /** Cash the player's team receives as part of the package (always >= 0). */
  cash: number;
  summary: string;
}

function playerValue(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

/** Bench fielders and non-starting pitchers, interleaved so both groups are represented
 * near the front - the same shortlist a CPU team would realistically be willing to move. */
function tradeableChips(team: Team): Player[] {
  const bench = [...team.fielders]
    .filter((player) => !bestLineup(team).some((starter) => starter.id === player.id))
    .sort((first, second) => playerValue(second) - playerValue(first));
  const relief = [...team.pitchers]
    .filter((player) => player.role !== '先発')
    .sort((first, second) => playerValue(second) - playerValue(first));
  const combined: Player[] = [];
  for (let index = 0; index < Math.max(bench.length, relief.length); index += 1) {
    if (bench[index]) combined.push(bench[index]);
    if (relief[index]) combined.push(relief[index]);
  }
  return combined;
}

function bestFit(pool: Player[], forTeam: Team, exclude: Set<string>): Player | undefined {
  return [...pool]
    .filter((player) => !exclude.has(player.id))
    .sort((first, second) => teamNeedsScore(forTeam, second) - teamNeedsScore(forTeam, first))[0];
}

/** A rough cash equivalent for a leftover value gap, on the same scale as sampleTradeCash. */
function gapCash(gap: number): number {
  return clamp(Math.round(gap) * 60, 0, 2400);
}

export function generateTradeOffers(teams: Teams, playerTeam: TeamKey): TradeOffer[] {
  const userTeam = teams[playerTeam];
  const userChips = tradeableChips(userTeam);
  if (!userChips.length) return [];
  const primaryChip = userChips[0]!;

  return [...CENTRAL, ...PACIFIC]
    .filter((teamKey) => teamKey !== playerTeam)
    .slice(0, 6)
    .map((teamKey, index) => {
      const opponent = teams[teamKey];
      const opponentPool = [...opponent.fielders, ...opponent.pitchers];
      const primaryTarget = bestFit(opponentPool, userTeam, new Set());
      if (!primaryTarget) return null;

      const give: Player[] = [primaryTarget];
      const receive: Player[] = [primaryChip];
      const usedUserIds = new Set([primaryChip.id]);
      const usedOpponentIds = new Set([primaryTarget.id]);
      let cash = 0;
      const gap = playerValue(primaryTarget) - playerValue(primaryChip);

      if (gap >= 10) {
        // The target outweighs the user's lone chip: sweeten with a second piece or cash.
        const secondaryChip = userChips.find((player) => !usedUserIds.has(player.id));
        if (secondaryChip && random() < 0.65) {
          receive.push(secondaryChip);
          usedUserIds.add(secondaryChip.id);
        } else {
          cash = sampleTradeCash() + gapCash(gap);
        }
      } else if (gap <= -10) {
        // The user's chip outweighs the target: the opponent adds a throw-in or cash.
        const throwIn = bestFit(opponentPool, userTeam, usedOpponentIds);
        if (throwIn && playerValue(throwIn) <= playerValue(primaryTarget) && random() < 0.65) {
          give.push(throwIn);
          usedOpponentIds.add(throwIn.id);
        } else {
          cash = sampleTradeCash() + gapCash(-gap);
        }
      } else if (random() < 0.25) {
        cash = sampleTradeCash();
      }

      const giveNames = give.map((player) => player.name).join('・');
      const receiveNames = receive.map((player) => player.name).join('・');
      const cashNote = cash > 0 ? `＋金銭${cash}万円` : '';
      return {
        id: `${teamKey}-${primaryChip.id}-${primaryTarget.id}-${index}`,
        fromTeam: teamKey,
        give,
        receive,
        cash,
        summary: `${TINFO[teamKey].ab}が ${receiveNames} ↔ ${giveNames}${cashNote} を提示`,
      } satisfies TradeOffer;
    })
    .filter((offer): offer is TradeOffer => offer !== null)
    .slice(0, 3);
}

export function applyTrade(teams: Teams, playerTeam: TeamKey, offer: TradeOffer): Teams {
  const next = { ...teams };
  const user = { ...next[playerTeam] };
  const opponent = { ...next[offer.fromTeam] };

  // Guard against the same offer being applied twice (e.g. a duplicate click): if any
  // player is no longer on the roster the offer expects, the trade was already applied,
  // so return the input unchanged instead of duplicating players across rosters.
  const userRoster = [...user.fielders, ...user.pitchers];
  const opponentRoster = [...opponent.fielders, ...opponent.pitchers];
  const userHasAllReceive = offer.receive.every((player) =>
    userRoster.some((candidate) => candidate.id === player.id),
  );
  const opponentHasAllGive = offer.give.every((player) =>
    opponentRoster.some((candidate) => candidate.id === player.id),
  );
  if (!userHasAllReceive || !opponentHasAllGive) return teams;

  const receiveIds = new Set(offer.receive.map((player) => player.id));
  const giveIds = new Set(offer.give.map((player) => player.id));

  const userPitchers = user.pitchers.filter((player) => !receiveIds.has(player.id));
  const userFielders = user.fielders.filter((player) => !receiveIds.has(player.id));
  const opponentPitchers = opponent.pitchers.filter((player) => !giveIds.has(player.id));
  const opponentFielders = opponent.fielders.filter((player) => !giveIds.has(player.id));

  for (const player of offer.give) {
    const moved = { ...player, tk: playerTeam };
    if (moved.isP) userPitchers.push(moved);
    else userFielders.push(moved);
  }
  for (const player of offer.receive) {
    const moved = { ...player, tk: offer.fromTeam };
    if (moved.isP) opponentPitchers.push(moved);
    else opponentFielders.push(moved);
  }

  next[playerTeam] = { ...user, pitchers: userPitchers, fielders: userFielders };
  next[offer.fromTeam] = { ...opponent, pitchers: opponentPitchers, fielders: opponentFielders };
  return next;
}
