import { calcOVR } from './ratings';
import { createBatterStats, createPitcherStats } from './stats';
import type {
  AccumulatedStats,
  BatterStats,
  PitcherStats,
  Player,
  PlayerParams,
  PlayerSeasonRecord,
  PlayerStats,
  Team,
  TeamKey,
  Teams,
  YearlyPlayerRecords,
} from './types';

export interface GeneratedChampionRecord {
  year: number;
  champion: TeamKey;
  runnerUp: TeamKey;
  keyBatters?: string[];
  keyPitchers?: string[];
}

export interface FictionalLeagueHistory {
  teams: Teams;
  yearlyStats: YearlyPlayerRecords;
  retiredPlayers: Player[];
  championHistory: GeneratedChampionRecord[];
  careerStats: AccumulatedStats;
}

export interface FictionalLeagueHistoryOptions {
  endYear?: number;
  seasons?: number;
  seed?: number;
  legendsPerTeam?: number;
}

const LEGEND_SURNAMES = [
  '神谷', '黒川', '榊原', '久世', '真田', '橘', '相馬', '鳴海', '御堂', '桐生', '高城', '東雲',
  '白石', '赤城', '水野', '風間', '早瀬', '藤堂', '大河内', '結城', '鷹野', '月島', '朝倉', '冬木',
];
const LEGEND_GIVEN_NAMES = [
  '隆志', '俊介', '誠司', '雄大', '直樹', '健吾', '拓真', '亮平', '和也', '慎一', '雅人', '浩二',
  '大輔', '智也', '将吾', '祐介', '航平', '圭吾', '達也', '晃', '修平', '一成', '康介', '哲也',
];

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let output = value;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

function gaussian(random: () => number, mean = 0, standardDeviation = 1): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return mean + Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second) * standardDeviation;
}

function randomInt(random: () => number, minimum: number, maximum: number): number {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function copyTeams(teams: Teams): Teams {
  return structuredClone(teams);
}

// Reuse the canonical factories so a new stat field never needs a second zero literal.
const emptyBatter = (name: string): BatterStats => createBatterStats(name);
const emptyPitcher = (name: string): PitcherStats => createPitcherStats(name);

function agePerformance(age: number, isPitcher: boolean): number {
  const peak = isPitcher ? 28 : 27;
  const distance = Math.abs(age - peak);
  return clamp(1.04 - distance * (age < peak ? 0.025 : 0.035), 0.48, 1.04);
}

function generateBatterStats(player: Player, age: number, random: () => number): BatterStats {
  const factor = agePerformance(age, false);
  const games = clamp(Math.round(118 * factor + gaussian(random, 0, 18)), 18, 143);
  const pa = Math.round(games * clamp(3.55 + gaussian(random, 0, 0.35), 2.1, 4.5));
  const ab = Math.max(1, Math.round(pa * clamp(0.88 + gaussian(random, 0, 0.025), 0.8, 0.94)));
  const contact = ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2;
  const power = player.p.pw ?? 50;
  const discipline = player.p.dc ?? 50;
  const speed = player.p.sp ?? 50;
  const average = clamp(0.205 + contact * 0.00105 * factor + gaussian(random, 0, 0.014), 0.16, 0.385);
  const hits = Math.min(ab, Math.round(ab * average));
  const homeRuns = clamp(Math.round((power - 35) * games / 265 * factor + gaussian(random, 0, 3.2)), 0, 68);
  const doubles = clamp(Math.round(hits * (0.16 + power / 1000) + gaussian(random, 0, 3)), 0, hits - homeRuns);
  const triples = clamp(Math.round((speed - 30) / 22 + gaussian(random, 0, 1.2)), 0, 14);
  const singles = Math.max(0, hits - homeRuns - doubles - triples);
  const walks = clamp(Math.round(pa * (0.045 + discipline * 0.00075) + gaussian(random, 0, 6)), 0, pa - ab);
  const strikeouts = clamp(Math.round(pa * (0.25 - contact * 0.00125) + gaussian(random, 0, 9)), 0, pa);
  return {
    ...emptyBatter(player.name),
    g: games,
    pa,
    ab,
    h: hits,
    s: singles,
    d: doubles,
    t: triples,
    hr: homeRuns,
    bb: walks,
    k: strikeouts,
    rbi: clamp(Math.round(homeRuns * 1.9 + hits * 0.25 + gaussian(random, 0, 10)), 0, 150),
    sb: clamp(Math.round((speed - 38) * games / 270 * factor + gaussian(random, 0, 3)), 0, 75),
    cs: clamp(Math.round((speed - 35) * games / 900 + gaussian(random, 0, 1.5)), 0, 20),
    bnt: clamp(Math.round((player.p.bnt ?? 40) * games / 600 + gaussian(random, 0, 1.5)), 0, 24),
    sf: clamp(Math.round(games / 24 + gaussian(random, 0, 1.5)), 0, 14),
  };
}

function generatePitcherStats(player: Player, age: number, random: () => number): PitcherStats {
  const factor = agePerformance(age, true);
  const role = player.role ?? 'リリーフ';
  const starts = role === '先発' ? clamp(Math.round(22 * factor + gaussian(random, 0, 5)), 3, 31) : 0;
  const games = role === '先発'
    ? starts
    : clamp(Math.round((role === 'クローザー' ? 53 : 47) * factor + gaussian(random, 0, 9)), 8, 72);
  const innings = role === '先発'
    ? starts * clamp(5.2 + (player.p.stam - 50) / 35 + gaussian(random, 0, 0.55), 3.6, 7.5)
    : games * clamp(0.88 + gaussian(random, 0, 0.12), 0.5, 1.35);
  const ip3 = Math.max(3, Math.round(innings * 3));
  const ability = ((player.p.vel ?? 50) + (player.p.ctrl ?? 50) + (player.p.nobi ?? 50)) / 3;
  const era = clamp(5.55 - ability * 0.035 * factor + gaussian(random, 0, 0.42), 1.15, 7.8);
  const hits = clamp(Math.round(innings * clamp(1.12 - ability * 0.0045 + gaussian(random, 0, 0.05), 0.55, 1.2)), 0, 260);
  const walks = clamp(Math.round(innings * clamp(0.58 - (player.p.ctrl ?? 50) * 0.006 + gaussian(random, 0, 0.035), 0.08, 0.65)), 0, 130);
  const strikeouts = clamp(Math.round(innings * clamp(0.45 + ((player.p.vel ?? 50) + (player.p.nobi ?? 50)) * 0.005 + gaussian(random, 0, 0.08), 0.35, 1.45)), 0, 330);
  const wins = role === '先発' ? clamp(Math.round(starts * 0.42 + gaussian(random, 0, 2.1)), 0, 24) : clamp(Math.round(games / 22 + gaussian(random, 0, 1.3)), 0, 10);
  return {
    ...emptyPitcher(player.name),
    g: games,
    gs: starts,
    w: wins,
    l: role === '先発' ? clamp(Math.round(starts * 0.34 + gaussian(random, 0, 2)), 0, 20) : clamp(Math.round(games / 28 + gaussian(random, 0, 1)), 0, 9),
    sv: role === 'クローザー' ? clamp(Math.round(games * 0.62 + gaussian(random, 0, 5)), 0, 55) : 0,
    hld: role === 'リリーフ' ? clamp(Math.round(games * 0.37 + gaussian(random, 0, 5)), 0, 48) : 0,
    bs: role === 'クローザー' ? clamp(Math.round(games * 0.08 + gaussian(random, 0, 1.5)), 0, 12) : 0,
    ip3,
    h: hits,
    bb: walks,
    k: strikeouts,
    er: Math.round(era * ip3 / 27),
    pc: Math.round(innings * 15.6),
  };
}

function generateStats(player: Player, age: number, random: () => number): PlayerStats {
  return player.isP ? generatePitcherStats(player, age, random) : generateBatterStats(player, age, random);
}

function adjustedParams(params: PlayerParams, age: number, currentAge: number): PlayerParams {
  const factor = clamp(1 - Math.abs(age - Math.min(currentAge, 28)) * 0.012, 0.78, 1.05);
  const output = structuredClone(params);
  for (const [key, value] of Object.entries(output)) {
    if (key !== 'pitches' && typeof value === 'number')
      (output as unknown as Record<string, unknown>)[key] = Math.round(value * factor);
  }
  return output;
}

function recordFor(
  player: Player,
  teamKey: TeamKey,
  team: Team,
  year: number,
  age: number,
  random: () => number,
): PlayerSeasonRecord {
  return {
    playerId: player.id,
    playerName: player.name,
    year,
    age,
    teamKey,
    teamName: team.n,
    teamAbbreviation: team.ab,
    isPitcher: player.isP,
    role: player.role,
    position: player.pos,
    ovr: Math.round(calcOVR(player) * agePerformance(age, player.isP)),
    params: adjustedParams(player.p, age, player.age),
    stats: generateStats(player, age, random),
  };
}

function mergeStats(base: PlayerStats | undefined, addition: PlayerStats): PlayerStats {
  if (!base || base.type !== addition.type) return structuredClone(addition);
  const merged = { ...base } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(addition)) {
    if (typeof value === 'number') merged[key] = Number(merged[key] ?? 0) + value;
    else if (key === 'name' || key === 'type') merged[key] = value;
  }
  return merged as unknown as PlayerStats;
}

function addRecord(
  yearlyStats: YearlyPlayerRecords,
  careerStats: AccumulatedStats,
  record: PlayerSeasonRecord,
): void {
  const key = String(record.year);
  (yearlyStats[key] ??= []).push(record);
  careerStats[record.playerId] = mergeStats(careerStats[record.playerId], record.stats);
}

function createLegend(
  template: Player,
  teamKey: TeamKey,
  index: number,
  endYear: number,
  random: () => number,
): Player {
  const surname = LEGEND_SURNAMES[(index * 5 + randomInt(random, 0, LEGEND_SURNAMES.length - 1)) % LEGEND_SURNAMES.length];
  const given = LEGEND_GIVEN_NAMES[(index * 7 + randomInt(random, 0, LEGEND_GIVEN_NAMES.length - 1)) % LEGEND_GIVEN_NAMES.length];
  const retiredYears = randomInt(random, 2, 16);
  return {
    ...structuredClone(template),
    id: `legend:${teamKey}:${index}:${endYear}`,
    name: `${surname} ${given}`,
    age: randomInt(random, 40, 59),
    tk: teamKey,
    fatigue: 0,
    injuryDays: 0,
    activeRoster: false,
    note: `${endYear - retiredYears}年引退の球団OB`,
    proYears: randomInt(random, 10, 19),
  };
}

export function createFictionalLeagueHistory(
  sourceTeams: Teams,
  options: FictionalLeagueHistoryOptions = {},
): FictionalLeagueHistory {
  const endYear = options.endYear ?? 2025;
  const seasons = options.seasons ?? 20;
  const startYear = endYear - seasons + 1;
  const legendsPerTeam = options.legendsPerTeam ?? 2;
  const random = mulberry32(options.seed ?? endYear);
  const teams = copyTeams(sourceTeams);
  const yearlyStats: YearlyPlayerRecords = {};
  const careerStats: AccumulatedStats = {};
  const retiredPlayers: Player[] = [];
  const entries = Object.entries(teams) as Array<[TeamKey, Team]>;

  for (const [teamKey, team] of entries) {
    for (const player of [...team.fielders, ...team.pitchers]) {
      const possibleYears = clamp(player.age - 18, 0, 14);
      const proYears = possibleYears === 0 ? 0 : clamp(possibleYears - randomInt(random, 0, 3), 1, possibleYears);
      player.proYears = proYears;
      const firstYear = endYear - proYears + 1;
      for (let year = Math.max(startYear, firstYear); year <= endYear; year += 1) {
        const age = player.age - (endYear + 1 - year);
        if (age < 18) continue;
        addRecord(yearlyStats, careerStats, recordFor(player, teamKey, team, year, age, random));
      }
    }

    const templates = [...team.fielders, ...team.pitchers].sort((first, second) => calcOVR(second) - calcOVR(first));
    for (let index = 0; index < legendsPerTeam; index += 1) {
      const template = templates[index % templates.length];
      const legend = createLegend(template, teamKey, index, endYear, random);
      retiredPlayers.push(legend);
      const careerLength = Number(legend.proYears ?? 12);
      const finalYear = endYear - randomInt(random, 2, 16);
      const firstYear = Math.max(startYear, finalYear - careerLength + 1);
      for (let year = firstYear; year <= finalYear; year += 1) {
        const age = Math.max(18, legend.age - (endYear - year));
        addRecord(yearlyStats, careerStats, recordFor(legend, teamKey, team, year, age, random));
      }
    }
  }

  const championHistory: GeneratedChampionRecord[] = [];
  const teamKeys = entries.map(([teamKey]) => teamKey);
  for (let year = startYear; year <= endYear; year += 1) {
    const champion = teamKeys[randomInt(random, 0, teamKeys.length - 1)];
    let runnerUp = champion;
    while (runnerUp === champion) runnerUp = teamKeys[randomInt(random, 0, teamKeys.length - 1)];
    const championTeam = teams[champion];
    championHistory.push({
      year,
      champion,
      runnerUp,
      keyBatters: championTeam.fielders.slice().sort((a, b) => calcOVR(b) - calcOVR(a)).slice(0, 2).map((player) => player.name),
      keyPitchers: championTeam.pitchers.slice().sort((a, b) => calcOVR(b) - calcOVR(a)).slice(0, 2).map((player) => player.name),
    });
  }

  return { teams, yearlyStats, retiredPlayers, championHistory, careerStats };
}
