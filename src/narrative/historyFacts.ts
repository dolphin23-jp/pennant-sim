import { TINFO } from '../data';
import type { PlayerSeasonRecord, TeamKey } from '../engine/types';
import type { NarrativeSource } from './generate';
import type { NarrativeMemoryIndex } from './memory';
import type { NarrativeArticle, NarrativeFactRef, TransactionNarrativeEvent } from './types';

export interface NarrativeHistoryFact {
  id: string;
  text: string;
  factRefs: NarrativeFactRef[];
  value: unknown;
}

const ref = (kind: NarrativeFactRef['kind'], key: string): NarrativeFactRef => ({ kind, key });

function seasonAvailable(article: NarrativeArticle, record: PlayerSeasonRecord): boolean {
  if (record.year < article.year) return true;
  return record.year === article.year && article.asOfDate === `${article.year}-12-31`;
}

function eventDate(year: number, date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : `${year}-12-31`;
}

function active(record: PlayerSeasonRecord): boolean {
  return record.stats.g > 0;
}

function careerSummary(
  playerId: string,
  article: NarrativeArticle,
  index: NarrativeMemoryIndex,
): NarrativeHistoryFact[] {
  const records = (index.seasonRecordsByPlayer.get(playerId) ?? []).filter(
    (record) => seasonAvailable(article, record) && active(record),
  );
  if (!records.length) return [];
  const first = records[0];
  const last = records.at(-1)!;
  const factRef = ref('CAREER_SUMMARY', `${article.asOfDate}:${playerId}`);
  const facts: NarrativeHistoryFact[] = [];
  const seasons = records.length;
  const teamKeys = [...new Set(records.map((record) => record.teamKey))];

  facts.push({
    id: `history:career:${playerId}:span`,
    text:
      seasons === 1
        ? `${first.playerName}は${first.year}年に${first.teamName}で一軍公式戦に初出場した。`
        : `${last.year}年終了時点で、${first.playerName}は${first.year}年の一軍初出場から${seasons}シーズンに出場している。`,
    factRefs: [factRef],
    value: {
      playerId,
      playerName: first.playerName,
      firstActiveYear: first.year,
      latestCompletedYear: last.year,
      activeSeasons: seasons,
      teamKeys,
    },
  });

  if (teamKeys.length > 1) {
    facts.push({
      id: `history:career:${playerId}:clubs`,
      text: `${first.playerName}は一軍キャリアで${teamKeys.length}球団に所属し、最初の所属は${first.teamName}、直近は${last.teamName}だった。`,
      factRefs: [factRef],
      value: {
        playerId,
        playerName: first.playerName,
        teams: teamKeys.map((teamKey) => ({ teamKey, teamName: TINFO[teamKey].n })),
      },
    });
  }

  if (last.stats.type === 'bat') {
    const batting = records.filter((record) => record.stats.type === 'bat');
    const totals = batting.reduce(
      (sum, record) => {
        if (record.stats.type !== 'bat') return sum;
        sum.games += record.stats.g;
        sum.hits += record.stats.h;
        sum.homeRuns += record.stats.hr;
        sum.rbi += record.stats.rbi;
        sum.stolenBases += record.stats.sb;
        return sum;
      },
      { games: 0, hits: 0, homeRuns: 0, rbi: 0, stolenBases: 0 },
    );
    const bestHr = batting
      .slice()
      .sort((a, b) =>
        a.stats.type === 'bat' && b.stats.type === 'bat'
          ? b.stats.hr - a.stats.hr || b.year - a.year
          : 0,
      )[0];
    facts.push({
      id: `history:career:${playerId}:totals`,
      text: `${last.year}年終了時点の通算成績は${totals.games}試合、${totals.hits}安打、${totals.homeRuns}本塁打、${totals.rbi}打点、${totals.stolenBases}盗塁。`,
      factRefs: [factRef],
      value: { playerId, playerName: first.playerName, throughYear: last.year, ...totals },
    });
    if (bestHr?.stats.type === 'bat' && records.length >= 2) {
      facts.push({
        id: `history:career:${playerId}:best`,
        text: `${first.playerName}のシーズン最多本塁打は${bestHr.year}年の${bestHr.stats.hr}本。`,
        factRefs: [factRef],
        value: {
          playerId,
          playerName: first.playerName,
          metric: 'homeRuns',
          bestYear: bestHr.year,
          value: bestHr.stats.hr,
        },
      });
    }
  } else {
    const pitching = records.filter((record) => record.stats.type === 'pit');
    const totals = pitching.reduce(
      (sum, record) => {
        if (record.stats.type !== 'pit') return sum;
        sum.games += record.stats.g;
        sum.wins += record.stats.w;
        sum.strikeouts += record.stats.k;
        sum.saves += record.stats.sv;
        sum.holds += record.stats.hld;
        return sum;
      },
      { games: 0, wins: 0, strikeouts: 0, saves: 0, holds: 0 },
    );
    const bestWins = pitching
      .slice()
      .sort((a, b) =>
        a.stats.type === 'pit' && b.stats.type === 'pit'
          ? b.stats.w - a.stats.w || b.year - a.year
          : 0,
      )[0];
    facts.push({
      id: `history:career:${playerId}:totals`,
      text: `${last.year}年終了時点の通算成績は${totals.games}登板、${totals.wins}勝、${totals.strikeouts}奪三振、${totals.saves}セーブ、${totals.holds}ホールド。`,
      factRefs: [factRef],
      value: { playerId, playerName: first.playerName, throughYear: last.year, ...totals },
    });
    if (bestWins?.stats.type === 'pit' && records.length >= 2) {
      facts.push({
        id: `history:career:${playerId}:best`,
        text: `${first.playerName}のシーズン最多勝利は${bestWins.year}年の${bestWins.stats.w}勝。`,
        factRefs: [factRef],
        value: {
          playerId,
          playerName: first.playerName,
          metric: 'wins',
          bestYear: bestWins.year,
          value: bestWins.stats.w,
        },
      });
    }
  }
  return facts;
}

function titleHistory(
  playerId: string,
  article: NarrativeArticle,
  source: NarrativeSource,
): NarrativeHistoryFact | null {
  const titles = source.awardHistory.filter(
    (award) =>
      award.playerId === playerId &&
      (award.year < article.year ||
        (award.year === article.year && article.asOfDate === `${article.year}-12-31`)),
  );
  if (!titles.length) return null;
  const counts = new Map<string, number>();
  for (const title of titles) counts.set(title.titleLabel, (counts.get(title.titleLabel) ?? 0) + 1);
  const latest = titles.slice().sort((a, b) => b.year - a.year)[0];
  return {
    id: `history:titles:${playerId}`,
    text: `${latest.playerName}は${latest.year}年までに個人タイトルを延べ${titles.length}回獲得している（${[...counts.entries()]
      .map(([label, count]) => `${label}${count}回`)
      .join('、')}）。`,
    factRefs: [ref('CAREER_SUMMARY', `${article.asOfDate}:${playerId}:titles`)],
    value: {
      playerId,
      playerName: latest.playerName,
      throughYear: latest.year,
      totalTitles: titles.length,
      titles: [...counts.entries()].map(([label, count]) => ({ label, count })),
    },
  };
}

function championshipHistory(
  teamKey: TeamKey,
  article: NarrativeArticle,
  source: NarrativeSource,
): NarrativeHistoryFact[] {
  const records = source.championHistory
    .filter(
      (record) =>
        record.champion === teamKey &&
        (record.year < article.year ||
          (record.year === article.year && article.asOfDate === `${article.year}-12-31`)),
    )
    .sort((a, b) => a.year - b.year);
  if (!records.length) return [];
  const facts: NarrativeHistoryFact[] = [];
  const current = records.at(-1)!;
  const previous = records.at(-2);
  const factRef = ref('TEAM_HISTORY', `${article.asOfDate}:${teamKey}`);

  if (previous) {
    const gap = current.year - previous.year;
    facts.push({
      id: `history:team:${teamKey}:titles`,
      text:
        gap === 1
          ? `${TINFO[teamKey].n}は${current.year}年に2年連続で日本一となった。`
          : `${TINFO[teamKey].n}の${current.year}年日本一は、${previous.year}年以来${gap}年ぶりだった。`,
      factRefs: [factRef],
      value: {
        teamKey,
        currentChampionshipYear: current.year,
        previousChampionshipYear: previous.year,
        yearsSincePrevious: gap,
        consecutive: gap === 1,
      },
    });
  }

  let streak = 1;
  for (let index = records.length - 2; index >= 0; index--) {
    if (records[index].year !== current.year - streak) break;
    streak++;
  }
  if (streak >= 3) {
    facts.push({
      id: `history:team:${teamKey}:dynasty`,
      text: `${TINFO[teamKey].n}は${current.year}年まで${streak}年連続で日本一となっている。`,
      factRefs: [factRef],
      value: { teamKey, throughYear: current.year, consecutiveChampionships: streak },
    });
  }
  return facts;
}

function repeatFinal(article: NarrativeArticle, source: NarrativeSource): NarrativeHistoryFact | null {
  if (article.kind !== 'championship' || article.teamKeys.length < 2) return null;
  const [first, second] = article.teamKeys;
  const prior = source.championHistory
    .filter(
      (record) =>
        record.year < article.year &&
        record.runnerUp &&
        new Set([record.champion, record.runnerUp]).has(first) &&
        new Set([record.champion, record.runnerUp]).has(second),
    )
    .sort((a, b) => b.year - a.year)[0];
  if (!prior?.runnerUp) return null;
  return {
    id: `history:final:${first}:${second}`,
    text: `${TINFO[first].n}と${TINFO[second].n}は${prior.year}年の日本シリーズでも対戦している。`,
    factRefs: [ref('TEAM_HISTORY', `${article.year}:${first}:${second}:final`) ],
    value: {
      teams: [first, second],
      previousFinalYear: prior.year,
      previousChampion: prior.champion,
      previousRunnerUp: prior.runnerUp,
    },
  };
}

function formerTeamFacts(
  article: NarrativeArticle,
  source: NarrativeSource,
): NarrativeHistoryFact[] {
  if (article.kind !== 'gameRecap') return [];
  const events = Object.values(source.narrativeEvents ?? {}).flat();
  const facts: NarrativeHistoryFact[] = [];
  for (const playerId of article.playerIds) {
    const moves = events
      .filter(
        (event): event is TransactionNarrativeEvent =>
          event.type === 'transaction' &&
          event.playerId === playerId &&
          event.fromTeamKey != null &&
          event.toTeamKey != null &&
          eventDate(event.year, event.date) < article.asOfDate,
      )
      .sort((a, b) => eventDate(b.year, b.date).localeCompare(eventDate(a.year, a.date)));
    const latest = moves[0];
    if (!latest?.fromTeamKey || !latest.toTeamKey) continue;
    if (!article.teamKeys.includes(latest.fromTeamKey) || !article.teamKeys.includes(latest.toTeamKey))
      continue;
    facts.push({
      id: `history:former:${playerId}`,
      text: `${latest.playerName}にとって${TINFO[latest.fromTeamKey].n}は古巣で、${latest.year}年に${TINFO[latest.toTeamKey].n}へ移籍している。`,
      factRefs: [
        ref('RELATIONSHIP_HISTORY', `${article.id}:${playerId}:former-team`),
        ref('TRANSACTION', latest.id),
      ],
      value: {
        playerId,
        playerName: latest.playerName,
        formerTeamKey: latest.fromTeamKey,
        currentTeamAtMove: latest.toTeamKey,
        moveYear: latest.year,
        transactionId: latest.id,
        gameArticleId: article.id,
      },
    });
    if (facts.length >= 2) break;
  }
  return facts;
}

/**
 * Deterministic editorial facts derived only from archived canonical ledgers. These facts are
 * recomputable projections, not LLM memory and not simulation state. They exist so prose can say
 * "4年ぶり", "8シーズン目", "通算1500安打" or "古巣戦" without inventing arithmetic or history.
 */
export function buildNarrativeHistoryFacts(
  article: NarrativeArticle,
  source: NarrativeSource,
  index: NarrativeMemoryIndex,
  limit = 8,
): NarrativeHistoryFact[] {
  const facts: NarrativeHistoryFact[] = [];
  const push = (fact: NarrativeHistoryFact | null | undefined) => {
    if (fact && facts.length < limit) facts.push(fact);
  };

  for (const playerId of article.playerIds.slice(0, 3)) {
    for (const fact of careerSummary(playerId, article, index)) push(fact);
    push(titleHistory(playerId, article, source));
    if (facts.length >= limit) break;
  }
  for (const teamKey of article.teamKeys) {
    for (const fact of championshipHistory(teamKey, article, source)) push(fact);
    if (facts.length >= limit) break;
  }
  push(repeatFinal(article, source));
  for (const fact of formerTeamFacts(article, source)) push(fact);

  return facts.slice(0, limit);
}
