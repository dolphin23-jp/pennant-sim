import assert from 'node:assert/strict';
import test from 'node:test';

import { FINANCE_BALANCE } from '../src/data';
import {
  accrueServiceTime,
  advanceOverseasPlayers,
  baseBudget,
  calcOVR,
  canAffordSalary,
  configureRandom,
  cpuAutoSignMarket,
  declareFreeAgents,
  finalizeCpuRosters,
  financeOf,
  formatManYen,
  hasDomesticFreeAgency,
  initTeams,
  marketSalary,
  renewalSalary,
  resetRandom,
  resolveMlbDepartures,
  returnUnsignedFreeAgents,
  roundSalary,
  signFreeAgent,
  teamPayroll,
  updateTeamFinances,
  withTeamContractDefaults,
  type Player,
  type StandingRecord,
  type TeamKey,
  type Teams,
} from '../src/engine';
import { appendNarrativeEvents } from '../src/narrative/ledger';
import type { NarrativeEvent, NarrativeEventContext } from '../src/narrative/types';
import { migrateTeamsSpecialSchema } from '../src/state/storage';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Every roll succeeds: random() is always 0. */
const alwaysYes = () =>
  configureRandom(
    () => 0,
    () => 1_700_000_000_000,
  );

const ovr = (player: Player) => calcOVR(player, player.isP ? undefined : player.pos);
const roster = (teams: Teams, teamKey: TeamKey) => [
  ...teams[teamKey].pitchers,
  ...teams[teamKey].fielders,
];
const rosterSize = (teams: Teams) =>
  Object.values(teams).reduce(
    (total, team) => total + team.pitchers.length + team.fielders.length,
    0,
  );

function contextFor(events: NarrativeEvent[], year = 2026): NarrativeEventContext {
  return { year, date: `${year}年オフ`, emit: (event) => events.push(event) };
}

function replacePlayer(teams: Teams, teamKey: TeamKey, player: Player): Teams {
  const team = teams[teamKey];
  const swap = (players: Player[]) =>
    players.map((candidate) => (candidate.id === player.id ? player : candidate));
  return {
    ...teams,
    [teamKey]: { ...team, pitchers: swap(team.pitchers), fielders: swap(team.fielders) },
  };
}

test('salaries follow value and are quoted in NPB steps', () => {
  configureRandom(mulberry32(1), () => 1_700_000_000_000);
  try {
    const players = Object.values(initTeams()).flatMap((team) => [
      ...team.pitchers,
      ...team.fielders,
    ]);
    const sorted = [...players].sort((first, second) => ovr(first) - ovr(second));
    const young = sorted.filter((player) => player.age <= 30);
    assert.ok(marketSalary(young.at(-1)!) > marketSalary(young[0]!) * 5);
    assert.equal(roundSalary(1234), 1200);
    assert.equal(roundSalary(12345), 12000);
    assert.equal(roundSalary(1), 500, 'the minimum salary');
    assert.equal(formatManYen(12000), '1億2000万円');
    assert.equal(formatManYen(30000), '3億円');
    assert.equal(formatManYen(850), '850万円');
  } finally {
    resetRandom();
  }
});

test('renewals respect the NPB reduction limits', () => {
  configureRandom(mulberry32(2), () => 1_700_000_000_000);
  try {
    const weakest = Object.values(initTeams())
      .flatMap((team) => [...team.pitchers, ...team.fielders])
      .sort((first, second) => ovr(first) - ovr(second))[0]!;
    // Overpaid players can be cut by at most 40% above 1億 and 25% below it.
    assert.equal(renewalSalary({ ...weakest, salary: 30000 }), 18000);
    assert.equal(renewalSalary({ ...weakest, salary: 8000 }), 6000);
  } finally {
    resetRandom();
  }
});

test('service time counts seasons with the top team and runs contracts down', () => {
  configureRandom(mulberry32(3), () => 1_700_000_000_000);
  try {
    const teams = withTeamContractDefaults(initTeams());
    const [regular, bench] = teams.giants.fielders;
    const multiYear = teams.giants.fielders[2]!;
    const prepared = replacePlayer(teams, 'giants', { ...multiYear, contractYears: 3 });
    const stats = {
      [regular!.id]: { type: 'bat', g: 120, pa: 480 },
      [bench!.id]: { type: 'bat', g: 5, pa: 8 },
    } as never;
    const served = accrueServiceTime(prepared, stats);
    const find = (id: string) => served.giants.fielders.find((player) => player.id === id)!;
    assert.equal(find(regular!.id).serviceYears, (regular!.serviceYears ?? 0) + 1);
    assert.equal(find(bench!.id).serviceYears, bench!.serviceYears ?? 0);
    assert.equal(find(multiYear.id).contractYears, 2);
    assert.equal(find(regular!.id).contractYears, 0);
  } finally {
    resetRandom();
  }
});

test('FA rights need 8 seasons from high school, 7 otherwise, and return 4 after use', () => {
  const base = initTeams().giants.fielders[0]!;
  assert.equal(hasDomesticFreeAgency({ ...base, draftOrigin: '高卒', serviceYears: 7 }), false);
  assert.equal(hasDomesticFreeAgency({ ...base, draftOrigin: '高卒', serviceYears: 8 }), true);
  assert.equal(hasDomesticFreeAgency({ ...base, draftOrigin: '大卒', serviceYears: 7 }), true);
  assert.equal(
    hasDomesticFreeAgency({ ...base, draftOrigin: '大卒', serviceYears: 10, faExercisedAt: 8 }),
    false,
  );
  assert.equal(
    hasDomesticFreeAgency({ ...base, draftOrigin: '大卒', serviceYears: 12, faExercisedAt: 8 }),
    true,
  );
});

test('declared free agents leave their roster and carry their club and rank to market', () => {
  configureRandom(mulberry32(4), () => 1_700_000_000_000);
  try {
    let teams = withTeamContractDefaults(initTeams());
    const star = [...teams.giants.fielders].sort((first, second) => ovr(second) - ovr(first))[0]!;
    teams = replacePlayer(teams, 'giants', {
      ...star,
      draftOrigin: '大卒',
      serviceYears: 9,
      contractYears: 0,
      salary: 30000,
    });
    const before = rosterSize(teams);
    alwaysYes();
    const result = declareFreeAgents(teams);
    const declared = result.declared.find((player) => player.id === star.id);
    assert.ok(declared, 'the star declares');
    assert.equal(declared.faFrom, 'giants');
    assert.equal(declared.faRank, 'A');
    assert.ok((declared.ask ?? 0) > 0 && (declared.askYears ?? 0) >= 1);
    assert.equal(
      roster(result.teams, 'giants').some((player) => player.id === star.id),
      false,
    );
    assert.equal(rosterSize(result.teams), before - result.declared.length);
  } finally {
    resetRandom();
  }
});

test('an A-rank free agent changing clubs brings his former club a compensation player', () => {
  configureRandom(mulberry32(5), () => 1_700_000_000_000);
  try {
    let teams = withTeamContractDefaults(initTeams());
    const star = [...teams.giants.fielders].sort((first, second) => ovr(second) - ovr(first))[0]!;
    const declared: Player = {
      ...star,
      tk: 'FA',
      faFrom: 'giants',
      faRank: 'A',
      ask: 20000,
      askYears: 3,
      serviceYears: 9,
    };
    teams = {
      ...teams,
      giants: { ...teams.giants, fielders: teams.giants.fielders.filter((p) => p.id !== star.id) },
    };
    const events: NarrativeEvent[] = [];
    const giantsBefore = roster(teams, 'giants').length;
    const tigersBefore = roster(teams, 'tigers').length;
    const signed = signFreeAgent(teams, 'tigers', declared, contextFor(events));

    const joined = roster(signed, 'tigers').find((player) => player.id === star.id)!;
    assert.equal(joined.salary, 20000);
    assert.equal(joined.contractYears, 3);
    assert.equal(joined.faExercisedAt, 9);
    assert.equal(joined.faFrom, undefined, 'market fields are cleared');
    const compensation = events.find(
      (event) => event.type === 'transaction' && event.transactionKind === 'compensation',
    );
    assert.ok(compensation, 'a compensation player moves');
    assert.equal(roster(signed, 'giants').length, giantsBefore + 1);
    assert.equal(roster(signed, 'tigers').length, tigersBefore);
    assert.doesNotThrow(() => appendNarrativeEvents({}, events));
  } finally {
    resetRandom();
  }
});

test('clubs over budget cannot sign, and unsigned free agents go home', () => {
  configureRandom(mulberry32(6), () => 1_700_000_000_000);
  try {
    let teams = withTeamContractDefaults(initTeams());
    // Every club's budget is already spent.
    for (const teamKey of Object.keys(teams) as TeamKey[])
      teams = {
        ...teams,
        [teamKey]: {
          ...teams[teamKey],
          finance: { budget: teamPayroll(teams[teamKey]), revenue: 0 },
        },
      };
    const star = teams.carp.fielders[0]!;
    const market: Player = {
      ...star,
      tk: 'FA',
      faFrom: 'carp',
      faRank: 'B',
      ask: 30000,
      askYears: 2,
      serviceYears: 8,
    };
    teams = {
      ...teams,
      carp: { ...teams.carp, fielders: teams.carp.fielders.filter((p) => p.id !== star.id) },
    };
    assert.equal(canAffordSalary(teams.giants, 30000), false);
    const bidding = cpuAutoSignMarket(teams, [market], 'fa');
    assert.equal(bidding.remaining.length, 1);

    const events: NarrativeEvent[] = [];
    const home = returnUnsignedFreeAgents(bidding.teams, bidding.remaining, contextFor(events));
    const back = roster(home.teams, 'carp').find((player) => player.id === star.id)!;
    assert.equal(back.faExercisedAt, 8);
    assert.equal(back.contractYears, 1);
    assert.equal(back.salary, 24000, '80% of the asking salary');
    assert.equal(events[0]?.type === 'transaction' && events[0].fromTeamKey, 'carp');
  } finally {
    resetRandom();
  }
});

test('stars leave for MLB, and come back to the market after two seasons', () => {
  configureRandom(mulberry32(7), () => 1_700_000_000_000);
  try {
    let teams = withTeamContractDefaults(initTeams());
    const star = [...teams.hawks.pitchers].sort((first, second) => ovr(second) - ovr(first))[0]!;
    const boosted: Player = {
      ...star,
      age: 27,
      serviceYears: 9,
      contractYears: 0,
      p: { ...star.p, vel: 120, ctrl: 120, stam: 120, nobi: 120 },
    };
    teams = replacePlayer(teams, 'hawks', boosted);
    assert.ok(ovr(boosted) >= 95);
    alwaysYes();
    const events: NarrativeEvent[] = [];
    const departures = resolveMlbDepartures(teams, { year: 2026 }, contextFor(events));
    assert.ok(departures.departures.some((entry) => entry.player.id === star.id));
    assert.equal(
      roster(departures.teams, 'hawks').some((p) => p.id === star.id),
      false,
    );
    const abroad = departures.abroad.find((player) => player.id === star.id)!;
    assert.equal(abroad.homeTeam, 'hawks');
    assert.doesNotThrow(() => appendNarrativeEvents({}, events));

    // Too soon to come back after one season; back on the market after two.
    assert.equal(advanceOverseasPlayers([abroad], 2027).returning.length, 0);
    const later = advanceOverseasPlayers([abroad], 2028);
    const returning = later.returning.find((player) => player.id === star.id)!;
    assert.equal(returning.homeTeam, 'hawks');
    assert.equal(returning.mlbSeasons, 2);
    assert.ok((returning.ask ?? 0) > 0);
  } finally {
    resetRandom();
  }
});

test('winning and the postseason raise a club budget; losing lowers it', () => {
  const teams = withTeamContractDefaults(initTeams());
  const standings = Object.fromEntries(
    Object.keys(teams).map((teamKey) => [
      teamKey,
      { w: 71, l: 72, d: 0, rs: 0, ra: 0, g: 143 } satisfies StandingRecord,
    ]),
  ) as Record<TeamKey, StandingRecord>;
  standings.giants = { w: 90, l: 53, d: 0, rs: 0, ra: 0, g: 143 };
  standings.carp = { w: 50, l: 93, d: 0, rs: 0, ra: 0, g: 143 };
  const next = updateTeamFinances(teams, { standings, champion: 'giants', runnerUp: 'hawks' });
  assert.ok(financeOf(next.giants).budget > baseBudget('giants'));
  assert.ok(financeOf(next.carp).budget < baseBudget('carp'));
  assert.ok(financeOf(next.carp).budget >= baseBudget('carp') * FINANCE_BALANCE.minimumBudgetShare);
});

test('saves from before contracts load with salaries, service time and budgets', () => {
  const legacy = initTeams();
  for (const team of Object.values(legacy)) delete team.finance;
  const migrated = migrateTeamsSpecialSchema(legacy)!;
  for (const team of Object.values(migrated)) {
    assert.ok(team.finance && team.finance.budget > 0);
    for (const player of [...team.pitchers, ...team.fielders]) {
      assert.ok((player.salary ?? 0) >= 500);
      assert.ok(player.serviceYears != null && player.contractYears != null);
    }
  }
});

test('a club left short after free agency promotes development players to its roster', () => {
  configureRandom(mulberry32(9), () => 1_700_000_000_000);
  try {
    const teams = withTeamContractDefaults(initTeams());
    const short: Teams = {
      ...teams,
      lions: {
        ...teams.lions,
        pitchers: teams.lions.pitchers.slice(0, 26),
        fielders: teams.lions.fielders.slice(0, 34),
      },
    };
    const finalized = finalizeCpuRosters(short).teams;
    assert.equal(finalized.lions.pitchers.length, 28);
    assert.equal(finalized.lions.fielders.length, 35);
    const promoted = roster(finalized, 'lions').filter(
      (player) => player.signedVia === '育成から支配下登録',
    );
    assert.equal(promoted.length, 3);
    assert.ok(promoted.every((player) => player.tk === 'lions' && (player.salary ?? 0) >= 500));
  } finally {
    resetRandom();
  }
});
