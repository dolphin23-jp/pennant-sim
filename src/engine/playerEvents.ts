import { PLAYER_DEVELOPMENT_BALANCE } from '../data';
import { applyInSeasonAwakening } from './growth';
import { clamp, random, randomChoice, randomInt } from './random';
import type {
  GrowthChange,
  InjuryEvent,
  Player,
  PlayerParams,
  PostGameEvents,
  Team,
  TeamKey,
} from './types';

function developmentParameters(player: Player): Array<keyof PlayerParams> {
  return player.isP
    ? ['vel', 'ctrl', 'stam', 'nobi', 'fld']
    : [
        'cf',
        'cb',
        'pw',
        'dc',
        'sp',
        'df',
        'arm',
        'stam',
        ...(player.pos === '捕手' ? (['ld'] as Array<keyof PlayerParams>) : []),
      ];
}

function recoverPlayer(player: Player): Player {
  const remaining = player.injuryDays ?? 0;
  if (remaining <= 0) return player;
  const nextDays = Math.max(0, remaining - 1);
  return {
    ...player,
    injuryDays: nextDays,
    injurySeverity: nextDays > 0 ? player.injurySeverity : undefined,
  };
}

function chooseSeverity(): NonNullable<Player['injurySeverity']> {
  const roll = random(),
    weights = PLAYER_DEVELOPMENT_BALANCE.injury.severityWeights;
  if (roll < weights.light) return 'light';
  if (roll < weights.light + weights.mid) return 'mid';
  return 'heavy';
}

function applyHeavyPermanentLoss(player: Player): {
  player: Player;
  changes: GrowthChange[];
} {
  const balance = PLAYER_DEVELOPMENT_BALANCE.injury.heavyPermanentLoss,
    candidates = developmentParameters(player).filter(
      (parameter) => typeof player.p[parameter] === 'number',
    ),
    params = { ...player.p },
    changes: GrowthChange[] = [],
    count = randomInt(balance.parameterMinimum, balance.parameterMaximum);
  for (let index = 0; index < count && candidates.length; index += 1) {
    const selected = randomChoice(candidates),
      selectedIndex = candidates.indexOf(selected);
    candidates.splice(selectedIndex, 1);
    const before = Number(params[selected] ?? 50),
      loss = randomInt(balance.amountMinimum, balance.amountMaximum),
      after = clamp(before - loss, 1, 99);
    (params as unknown as Record<string, unknown>)[selected] = after;
    changes.push({ param: selected, before, after, diff: after - before });
  }
  return { player: { ...player, p: params }, changes };
}

function applyInjury(
  teamKey: TeamKey,
  player: Player,
): { player: Player; event: InjuryEvent | null } {
  if (
    (player.injuryDays ?? 0) > 0 ||
    random() >= PLAYER_DEVELOPMENT_BALANCE.injury.participantGameRate
  )
    return { player, event: null };
  const severity = chooseSeverity(),
    range = PLAYER_DEVELOPMENT_BALANCE.injury.recoveryDays[severity],
    days = randomInt(range.minimum, range.maximum),
    heavyResult =
      severity === 'heavy'
        ? applyHeavyPermanentLoss(player)
        : { player, changes: [] as GrowthChange[] },
    injuredPlayer: Player = {
      ...heavyResult.player,
      injuryDays: days,
      injurySeverity: severity,
    };
  return {
    player: injuredPlayer,
    event: {
      teamKey,
      playerId: player.id,
      name: player.name,
      isP: player.isP,
      severity,
      days,
      permanentChanges: heavyResult.changes,
    },
  };
}

export function applyPostGamePlayerEvents(
  team: Team,
  participantIds: ReadonlySet<string>,
): { team: Team; events: PostGameEvents } {
  const recoveredTeam: Team = {
      ...team,
      pitchers: team.pitchers.map((player) =>
        participantIds.has(player.id) ? player : recoverPlayer(player),
      ),
      fielders: team.fielders.map((player) =>
        participantIds.has(player.id) ? player : recoverPlayer(player),
      ),
    },
    awakening = applyInSeasonAwakening(recoveredTeam, participantIds),
    injuries: InjuryEvent[] = [];
  const applyToPlayer = (player: Player): Player => {
    if (!participantIds.has(player.id)) return player;
    const result = applyInjury(team.key, player);
    if (result.event) injuries.push(result.event);
    return result.player;
  };
  return {
    team: {
      ...awakening.team,
      pitchers: awakening.team.pitchers.map(applyToPlayer),
      fielders: awakening.team.fielders.map(applyToPlayer),
    },
    events: {
      awakenings: awakening.events.map((event) => ({
        teamKey: team.key,
        playerId: event.player.id,
        name: event.name,
        isP: event.isP,
        isBreakthrough: event.isBreakthrough,
        newSpecial: event.newSpecial?.n ?? null,
      })),
      injuries,
    },
  };
}
