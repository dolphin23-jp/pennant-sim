import type { GrowthChange, PlayerParams, TeamKey } from '../engine/types';

export const NARRATIVE_GENERATOR_VERSION = 2 as const;

/**
 * Every sentence belongs to one of three editorial classes.
 * FACTUAL may only restate supplied facts, ANALYTICAL may only evaluate supplied
 * metrics/rules, and COLOR may change tone without introducing a new factual claim.
 */
export type NarrativeStatementClass = 'FACTUAL' | 'ANALYTICAL' | 'COLOR';

export type NarrativeArticleKind =
  | 'gameRecap'
  | 'achievement'
  | 'championship'
  | 'seasonAwards'
  | 'seasonReview'
  | 'transaction'
  | 'draft'
  | 'career'
  | 'injury'
  | 'development';

export type NarrativeFactKind =
  | 'GAME_RESULT'
  | 'SCORE_TIMELINE'
  | 'GO_AHEAD_PLAY'
  | 'WALK_OFF'
  | 'COMEBACK'
  | 'PLAYER_GAME_LINE'
  | 'PITCHING_DECISION'
  | 'ACHIEVEMENT'
  | 'CHAMPIONSHIP'
  | 'SEASON_TITLE'
  | 'SEASON_STANDING'
  | 'PLAYER_SEASON'
  | 'CAREER_SUMMARY'
  | 'TEAM_HISTORY'
  | 'RELATIONSHIP_HISTORY'
  | 'TRANSACTION'
  | 'DRAFT_SELECTION'
  | 'CAREER_EVENT'
  | 'INJURY'
  | 'DEVELOPMENT';

export interface NarrativeFactRef {
  kind: NarrativeFactKind;
  /** Stable key in the source ledger, e.g. game id or achievement id. */
  key: string;
}

export interface NarrativeSegment {
  class: NarrativeStatementClass;
  text: string;
  factRefs: NarrativeFactRef[];
}

export interface NarrativeArticle {
  /** Canonical id. The same source event must always produce the same article id. */
  id: string;
  generatorVersion: typeof NARRATIVE_GENERATOR_VERSION;
  kind: NarrativeArticleKind;
  year: number;
  /** Publication label/date from the world, not the wall-clock time of rendering. */
  publishedAt: string;
  /** Facts after this date must not leak into an archival rendering. */
  asOfDate: string;
  viewMode: 'archival' | 'live';
  headline: string;
  dek?: string;
  teamKeys: TeamKey[];
  playerIds: string[];
  segments: NarrativeSegment[];
  factRefs: NarrativeFactRef[];
}

export interface NarrativeFeedFilter {
  kinds?: NarrativeArticleKind[];
  teamKey?: TeamKey;
  playerId?: string;
  year?: number;
  limit?: number;
  offset?: number;
  asOfDate?: string;
}

export type TransactionNarrativeKind =
  'trade' | 'faSigning' | 'foreignSigning' | 'release' | 'retirement';

export interface TransactionNarrativeEvent {
  type: 'transaction';
  id: string;
  year: number;
  date: string;
  transactionKind: TransactionNarrativeKind;
  playerId: string;
  playerName: string;
  fromTeamKey?: TeamKey | null;
  toTeamKey?: TeamKey | null;
  /** Optional already-resolved factual terms. Never inferred by the writer. */
  terms?: string | null;
  /** One trade is one event, including every player on both sides. */
  movements?: Array<{
    playerId: string;
    playerName: string;
    fromTeamKey: TeamKey;
    toTeamKey: TeamKey;
  }>;
  cashAmountManYen?: number;
  exitReason?: string;
}

export interface DraftNarrativeEvent {
  type: 'draft';
  id: string;
  year: number;
  date: string;
  teamKey: TeamKey;
  playerId: string;
  playerName: string;
  round: number;
  overallPick?: number | null;
  origin?: string | null;
}

export type CareerNarrativeKind =
  'debut' | 'roleChange' | 'returnFromInjury' | 'breakthrough' | 'retirement';

interface CareerNarrativeBase {
  type: 'career';
  id: string;
  year: number;
  date: string;
  careerKind: CareerNarrativeKind;
  teamKey: TeamKey;
  playerId: string;
  playerName: string;
  /** A factual description produced by the subsystem that owns the event. */
  detail?: string;
  /** Recovery means injury eligibility cleared, not an appearance in a game. */
  injuryDaysBefore?: number;
}

export type CareerNarrativeEvent = CareerNarrativeBase &
  ({ detail: string } | { careerKind: 'returnFromInjury'; injuryDaysBefore: 1; detail?: never });

export interface SeasonReviewNarrativeEvent {
  type: 'seasonReview';
  id: string;
  year: number;
  date: string;
  teamKey: TeamKey;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  champion: boolean;
  titleHolders?: Array<{ playerId: string; playerName: string; titleLabel: string }>;
}

export interface InjuryNarrativeEvent {
  type: 'injury';
  id: string;
  year: number;
  date: string;
  teamKey: TeamKey;
  playerId: string;
  playerName: string;
  days: number;
  severity: 'light' | 'mid' | 'heavy';
}

interface DevelopmentNarrativeBase {
  type: 'development';
  id: string;
  year: number;
  date: string;
  teamKey: TeamKey;
  playerId: string;
  playerName: string;
  /** Legacy explicitly supplied fact description; new emitters use numeric facts. */
  detail?: string;
  developmentKind?: 'growth' | 'awakening';
  ovrBefore?: number;
  ovrAfter?: number;
  changes?: GrowthChange[];
  boosts?: Array<{ param: keyof PlayerParams; boost: number }>;
  isBreakthrough?: boolean;
  newSpecial?: string | null;
}

export type DevelopmentNarrativeEvent = DevelopmentNarrativeBase &
  (
    | { developmentKind?: undefined; detail: string }
    | {
        developmentKind: 'growth';
        ovrBefore: number;
        ovrAfter: number;
        changes: GrowthChange[];
        detail?: never;
      }
    | {
        developmentKind: 'awakening';
        boosts: Array<{ param: keyof PlayerParams; boost: number }>;
        isBreakthrough: boolean;
        detail?: never;
      }
  );

export type FutureNarrativeEvent =
  | TransactionNarrativeEvent
  | DraftNarrativeEvent
  | CareerNarrativeEvent
  | SeasonReviewNarrativeEvent
  | InjuryNarrativeEvent
  | DevelopmentNarrativeEvent;

export type NarrativeEvent = FutureNarrativeEvent;
/** In memory and portable exports are year keyed; v4 stores each year in its chunk. */
export type NarrativeEventLedger = Record<string, NarrativeEvent[]>;

/** Optional observation channel. Emitters must never consume simulation randomness. */
export interface NarrativeEventContext {
  year: number;
  date: string;
  /** Stable command/batch key when a subsystem can run more than once per year. */
  scope?: string;
  emit(event: NarrativeEvent): void;
}
