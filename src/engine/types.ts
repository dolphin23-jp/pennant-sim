export type TeamKey =
  | 'giants'
  | 'tigers'
  | 'baystars'
  | 'dragons'
  | 'carp'
  | 'swallows'
  | 'hawks'
  | 'eagles'
  | 'marines'
  | 'lions'
  | 'buffaloes'
  | 'fighters';
export type League = 'central' | 'pacific';
export type FieldPosition =
  '捕手' | '一塁手' | '二塁手' | '三塁手' | '遊撃手' | '左翼手' | '中堅手' | '右翼手';
export type PitcherRole = '先発' | 'リリーフ' | 'クローザー';
export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';
export type PotentialClass = 'standard' | 'elite';
export type DraftOrigin = '高卒' | '大卒' | '社会人';
export type ForeignOrigin =
  | 'アメリカ'
  | 'ドミニカ共和国'
  | 'ベネズエラ'
  | 'キューバ'
  | 'メキシコ'
  | '韓国'
  | '台湾'
  | 'その他';
export interface ForeignPlayerProfile {
  origin: ForeignOrigin;
  arrivalYear: number;
  contractYearsRemaining: number;
  npbSeasons: number;
  adaptationFactor: number;
}
export type TrainPolicyId =
  'balanced' | 'power' | 'contact' | 'speed' | 'defense' | 'velocity' | 'control' | 'stamina_t';
export type PlayerTeamKey = TeamKey | 'foreign' | '外' | 'fa' | 'FA' | 'draft';
export interface TeamPolicy {
  fa: number;
  for: number;
  pitF: number;
  pwrF: number;
  dev: number;
}
export interface ParkFactors {
  homeRun: number;
  hit: number;
}
export interface TeamInfo {
  n: string;
  ab: string;
  lg: League;
  c: string;
  bd: number;
  park: ParkFactors;
  pol: TeamPolicy;
}
export interface PositionAptitude {
  pos: FieldPosition;
  apt: number;
}
export interface PitchDefinition {
  type: string;
  shr: number;
  brk: number;
  ctl: number;
}
export interface PlayerParams {
  vel?: number;
  ctrl?: number;
  stam: number;
  nobi?: number;
  fld?: number;
  pitches?: PitchDefinition[];
  cf?: number;
  cb?: number;
  pw?: number;
  dc?: number;
  sp?: number;
  df?: number;
  arm?: number;
  bnt?: number;
  ld?: number;
}
export type PotentialParams = Partial<Record<keyof PlayerParams, number>>;
export interface SpecialAbility {
  id: string;
  n: string;
  c: string;
  p: number;
  tierMax: number;
  rarity: 'normal' | 'gold';
}
export interface GrowthChange {
  param: keyof PlayerParams;
  before: number;
  after: number;
  diff: number;
}
export interface GrowthLogEntry {
  year: number;
  ovrBefore?: number;
  ovrAfter?: number;
  delta?: number;
  changes?: GrowthChange[];
  type?: 'awakening';
  isBreakthrough?: boolean;
  events?: Array<{ param: keyof PlayerParams; boost: number }>;
  newSpecial?: string | null;
}
export interface Player {
  id: string;
  name: string;
  age: number;
  tk: PlayerTeamKey;
  isP: boolean;
  role?: PitcherRole;
  pos?: FieldPosition;
  _assignedPos?: FieldPosition;
  positions?: PositionAptitude[];
  mat: Maturity;
  hand: { th?: '右' | '左'; bat?: '右' | '左' | '両' };
  p: PlayerParams;
  pot: PotentialParams;
  potentialClass?: PotentialClass;
  specials?: SpecialAbility[];
  specialLevels?: Record<string, number>;
  trainPolicy: TrainPolicyId;
  fatigue?: number;
  fatigueUpdatedOn?: string;
  lastPitchedOn?: string;
  consecutivePitchingGames?: number;
  injuryDays?: number;
  injurySeverity?: 'light' | 'mid' | 'heavy';
  awakeCount?: number;
  seasonAwakenDone?: boolean;
  growthLog?: GrowthLogEntry[];
  ask?: number;
  note?: string;
  signedVia?: string;
  draftOrigin?: DraftOrigin;
  /** 一軍登録フラグ。undefined/true = 一軍、false = 二軍。既存セーブは全員一軍扱い。 */
  activeRoster?: boolean;
  foreignProfile?: ForeignPlayerProfile;
  [key: string]: unknown;
}
export interface Team extends TeamInfo {
  key: TeamKey;
  pitchers: Player[];
  fielders: Player[];
  rotSize: number;
}
export type Teams = Record<TeamKey, Team>;
export type Side = 'home' | 'away';
export type PlateAppearanceResult =
  'K' | 'BB' | 'HBP' | 'HR' | '3B' | '2B' | '1B' | 'GO' | 'FO' | 'DP';
export type RunningResult = 'SB' | 'CS';
export type AtBatResult = PlateAppearanceResult | RunningResult;
export type BaseRunner = Player | boolean;
export type BaseState = [BaseRunner, BaseRunner, BaseRunner];
export interface AtBatSituation {
  pStam?: number;
  isPinch: boolean;
  isLead: boolean;
  outs: number;
  bases: BaseState;
}
export interface AtBatOutcome {
  result: PlateAppearanceResult;
  pc: number;
  dir: string | null;
}
export interface Score {
  home: number;
  away: number;
}
export interface AtBatLogEntry {
  inning: number;
  isBot: boolean;
  batter: string;
  batterId: string;
  bSide: TeamKey;
  pitcher: string;
  pitcherId: string;
  pSide: TeamKey;
  result: AtBatResult;
  dir?: string | null;
  pc?: number;
  rbi: number;
  desc: string;
  snap: Score;
}
export interface InjuryEvent {
  teamKey: TeamKey;
  playerId: string;
  name: string;
  isP: boolean;
  severity: NonNullable<Player['injurySeverity']>;
  days: number;
  permanentChanges: GrowthChange[];
}
export interface InSeasonAwakeningEvent {
  teamKey: TeamKey;
  playerId: string;
  name: string;
  isP: boolean;
  isBreakthrough: boolean;
  newSpecial: string | null;
  changes: Array<{ param: keyof PlayerParams; boost: number }>;
}
export interface PostGameEvents {
  awakenings: InSeasonAwakeningEvent[];
  injuries: InjuryEvent[];
}
export interface DatedPostGameEvents {
  date: string;
  events: PostGameEvents;
}
export interface GameState {
  teams: Record<Side, Team>;
  lineups: Record<Side, Player[]>;
  park: ParkFactors;
  matchupCounts: Record<string, number>;
  score: Score;
  innings: Score[];
  atBatLog: AtBatLogEntry[];
  changes: Array<{ inning: number; isBot: boolean; pitcher: string; side: Side }>;
  curP: Record<Side, Player>;
  pc: Record<Side, number>;
  batIdx: Record<Side, number>;
  usedR: Record<Side, Set<string>>;
  starterH: Player;
  starterA: Player;
  winnerPitcherId?: string | null;
  loserPitcherId?: string | null;
  savePitcherId?: string | null;
  holdPitcherIds?: string[];
  postGameEvents: PostGameEvents;
}
export interface HalfInningResult {
  runs: number;
  atBats: AtBatLogEntry[];
}
export interface ScheduleGame {
  id: string;
  date: string;
  originalDate?: string;
  postponedFrom?: string | null;
  doubleHeaderGame?: 1 | 2 | null;
  homeKey: TeamKey;
  awayKey: TeamKey;
  played: boolean;
  hs: number | null;
  as: number | null;
  seriesType: 'league' | 'interleague';
  isInterleague: boolean;
}
export interface StandingRecord {
  w: number;
  l: number;
  d: number;
  rs: number;
  ra: number;
  g: number;
  pct?: number;
  gb?: string;
  rank?: number;
}
export interface TeamForm {
  streak: string;
  last10: { w: number; l: number; d: number };
  home: { w: number; l: number; d: number };
  away: { w: number; l: number; d: number };
}
export interface BatterStats {
  type: 'bat';
  name: string;
  g: number;
  pa: number;
  ab: number;
  h: number;
  s: number;
  d: number;
  t: number;
  hr: number;
  bb: number;
  k: number;
  rbi: number;
  sb: number;
  cs: number;
  bnt: number;
  sf: number;
}
export interface PitcherStats {
  type: 'pit';
  name: string;
  g: number;
  gs: number;
  w: number;
  l: number;
  sv: number;
  hld: number;
  bs: number;
  ip3: number;
  h: number;
  bb: number;
  k: number;
  er: number;
  pc: number;
}
export type PlayerStats = BatterStats | PitcherStats;
export type AccumulatedStats = Record<string, PlayerStats>;
export interface PlayerSeasonRecord {
  playerId: string;
  playerName: string;
  year: number;
  age: number;
  teamKey: TeamKey;
  teamName: string;
  teamAbbreviation: string;
  isPitcher: boolean;
  role?: PitcherRole;
  position?: FieldPosition;
  ovr: number;
  params: PlayerParams;
  stats: PlayerStats;
}
export type YearlyPlayerRecords = Record<string, PlayerSeasonRecord[]>;
export interface AwakeningEvent {
  param: keyof PlayerParams;
  boost: number;
  isBreakthrough: boolean;
}
export interface AwakeningResult {
  player: Player;
  events: AwakeningEvent[];
  isBreakthrough: boolean;
  newSpecial: SpecialAbility | null;
}
