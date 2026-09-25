import { CENTRAL, FINANCE_BALANCE, PACIFIC } from '../data';
import { baseBudget, financeOf } from './contracts';
import { teamStrength } from './draft';
import type { Team, TeamKey, Teams } from './types';

/** What the owner asks of the manager for one season, set on opening day. */
export interface SeasonExpectation {
  year: number;
  /** The worst final league rank that still meets the goal. */
  targetRank: number;
  label: string;
  /** Where the club's roster ranks in its league, which the goal is set from. */
  strengthRank: number;
}

export type PostseasonReach = 'champion' | 'japanSeries' | 'climax' | 'none';
export type ManagerGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface ManagerSeason {
  year: number;
  targetRank: number;
  targetLabel: string;
  finalRank: number;
  postseason: PostseasonReach;
  grade: ManagerGrade;
  trustBefore: number;
  trustAfter: number;
  /** Change to next year's budget the owner granted, as a share (0.03 = +3%). */
  budgetChange: number;
  comment: string;
}

export interface ManagerRecord {
  /** The owner's trust in the manager, 0 to 100. */
  trust: number;
  expectation: SeasonExpectation | null;
  history: ManagerSeason[];
}

export const INITIAL_TRUST = 60;

/** Goals by where the roster ranks in its six-club league. */
const GOALS: Record<number, { targetRank: number; label: string }> = {
  1: { targetRank: 1, label: 'リーグ優勝' },
  2: { targetRank: 3, label: 'CS進出' },
  3: { targetRank: 3, label: 'CS進出' },
  4: { targetRank: 3, label: 'Aクラス入り' },
  5: { targetRank: 4, label: '4位以上' },
  6: { targetRank: 5, label: '最下位脱出' },
};

const leagueOf = (team: TeamKey) => (CENTRAL.includes(team) ? CENTRAL : PACIFIC);

/** The owner's goal for the coming season, from how the roster ranks in its league. */
export function seasonExpectation(teams: Teams, team: TeamKey, year: number): SeasonExpectation {
  const ranked = [...leagueOf(team)].sort(
    (first, second) => teamStrength(teams[second]) - teamStrength(teams[first]),
  );
  const strengthRank = ranked.indexOf(team) + 1;
  const goal = GOALS[strengthRank] ?? GOALS[6]!;
  return { year, strengthRank, ...goal };
}

const GRADE_TRUST: Record<ManagerGrade, number> = { S: 15, A: 8, B: 2, C: -8, D: -15 };
const GRADE_BUDGET: Record<ManagerGrade, number> = { S: 0.04, A: 0.02, B: 0, C: -0.02, D: -0.04 };
const POSTSEASON_BONUS: Record<PostseasonReach, number> = {
  champion: 3,
  japanSeries: 2,
  climax: 0,
  none: 0,
};

/** The owner's grade: goal met or missed by how many places, and how far October went. */
export function gradeSeason(
  expectation: Pick<SeasonExpectation, 'targetRank'>,
  finalRank: number,
  postseason: PostseasonReach,
): ManagerGrade {
  const score = expectation.targetRank - finalRank + POSTSEASON_BONUS[postseason];
  if (score >= 3) return 'S';
  if (score >= 1) return 'A';
  if (score === 0) return 'B';
  if (score >= -2) return 'C';
  return 'D';
}

export function trustLabel(trust: number): string {
  if (trust >= 80) return '厚い信頼';
  if (trust >= 60) return '信頼';
  if (trust >= 40) return '様子見';
  if (trust >= 20) return '不満';
  return '解任の危機';
}

function ownerComment(
  grade: ManagerGrade,
  season: { finalRank: number; postseason: PostseasonReach },
) {
  if (season.postseason === 'champion') return '日本一、見事だった。来季も頼む。';
  if (grade === 'S') return '期待をはるかに超える一年だった。補強も惜しまない。';
  if (grade === 'A') return '目標以上の結果だ。この調子で頼む。';
  if (grade === 'B') return '目標は果たした。来季はもう一段上を。';
  if (grade === 'C') return '目標に届かなかった。来季は結果で示してほしい。';
  return season.finalRank === 6
    ? '最下位は受け入れられない。立て直しを求める。'
    : '期待を大きく裏切った。予算は削らせてもらう。';
}

/** The season's evaluation, and the owner's trust after it. */
export function evaluateSeason(
  record: ManagerRecord,
  expectation: SeasonExpectation,
  finalRank: number,
  postseason: PostseasonReach,
): ManagerSeason {
  const grade = gradeSeason(expectation, finalRank, postseason);
  const trustAfter = Math.max(0, Math.min(100, record.trust + GRADE_TRUST[grade]));
  return {
    year: expectation.year,
    targetRank: expectation.targetRank,
    targetLabel: expectation.label,
    finalRank,
    postseason,
    grade,
    trustBefore: record.trust,
    trustAfter,
    budgetChange: GRADE_BUDGET[grade],
    comment: ownerComment(grade, { finalRank, postseason }),
  };
}

/** The owner's budget decision, kept within the league's usual budget range. */
export function applyOwnerBudget(team: Team, change: number): Team {
  if (!change) return team;
  const finance = financeOf(team);
  const base = baseBudget(team.key);
  const budget = Math.round(
    Math.min(
      base * FINANCE_BALANCE.maximumBudgetShare,
      Math.max(base * FINANCE_BALANCE.minimumBudgetShare, finance.budget * (1 + change)),
    ),
  );
  return { ...team, finance: { ...finance, budget } };
}

export const GRADE_LABEL: Record<ManagerGrade, string> = {
  S: '期待以上',
  A: '好評価',
  B: '合格',
  C: '不満',
  D: '失望',
};
