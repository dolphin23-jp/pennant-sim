import { TINFO } from '../../data';
import type { NarrativeArticle, NarrativeArticleKind } from '../../narrative/types';

/**
 * A big story laid out as a sports-paper front page (号外). Built from the article the
 * news feed already shows, AI-written or template, so the paper never says more than the
 * article does. The masthead is a made-up paper.
 */
export const MASTHEAD = 'ダイヤモンド新報';

/** The full-width space newspapers set between sentences. */
export const IDEOGRAPHIC_SPACE = '\u3000';

export const FRONT_PAGE_KINDS: ReadonlySet<NarrativeArticleKind> = new Set([
  'championship',
  'pennantClinch',
  'seasonAwards',
  'achievement',
]);

export type FrontImage = 'celebration' | 'stadium' | 'scoreboard';

export interface NewspaperFront {
  articleId: string;
  masthead: string;
  /** 号外 for a title, 特報 for a record, 特集 otherwise. */
  edition: string;
  dateLine: string;
  /** The small line over the headline: the club, or the kind of record. */
  kicker: string;
  /** The giant words, a few characters. */
  banner: string;
  /** The rest of the headline. */
  subhead: string;
  lead: string;
  body: string[];
  teamColor: string;
  teamName: string | null;
  image: FrontImage;
}

const pad = (value: number) => String(value);

function dateLineFor(article: NarrativeArticle): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(article.asOfDate);
  if (!match) return `${article.year}年`;
  const [, year, month, day] = match;
  const weekday = '日月火水木金土'[new Date(`${article.asOfDate}T00:00:00Z`).getUTCDay()];
  return `${year}年${pad(Number(month))}月${pad(Number(day))}日（${weekday}）`;
}

/** Splits 「巨人、2026年セ・リーグ優勝」 into its subject and its news. */
function splitHeadline(headline: string): [string, string] {
  const bracket = /^【([^】]+)】(.*)$/.exec(headline);
  if (bracket) return [bracket[1]!, bracket[2]!];
  const comma = headline.indexOf('、');
  if (comma > 0) return [headline.slice(0, comma), headline.slice(comma + 1)];
  return ['', headline];
}

function bannerFor(article: NarrativeArticle, news: string): string {
  switch (article.kind) {
    case 'championship':
      return '日本一';
    case 'pennantClinch':
      return '優勝';
    case 'seasonAwards':
      return 'タイトル';
    case 'achievement': {
      // 「村上 宗隆、通算300本塁打」→ the achievement itself.
      const [, what] = splitHeadline(news);
      return (what || news).replace(/^通算/, '').slice(0, 10);
    }
    default:
      return news.slice(0, 8);
  }
}

export function newspaperFront(article: NarrativeArticle): NewspaperFront {
  const team = article.teamKeys[0] ? TINFO[article.teamKeys[0]] : null;
  const [subject, news] = splitHeadline(article.headline);
  const texts = article.segments.map((segment) => segment.text.trim()).filter(Boolean);
  const edition =
    article.kind === 'championship' || article.kind === 'pennantClinch'
      ? '号外'
      : article.kind === 'achievement'
        ? '特報'
        : '特集';
  return {
    articleId: article.id,
    masthead: MASTHEAD,
    edition,
    dateLine: dateLineFor(article),
    kicker: article.kind === 'achievement' ? subject : (team?.n ?? subject),
    banner: bannerFor(article, news),
    subhead: article.dek
      ? `${article.headline}${IDEOGRAPHIC_SPACE}${article.dek}`
      : article.headline,
    lead: texts[0] ?? '',
    body: texts.slice(1),
    teamColor: team?.c ?? '#b3261e',
    teamName: team?.ab ?? null,
    image:
      article.kind === 'championship'
        ? 'celebration'
        : article.kind === 'pennantClinch'
          ? 'stadium'
          : 'scoreboard',
  };
}

/** Runs of 1-3 ASCII digits are set sideways in one cell (縦中横); everything else is
 * one character per cell. */
export function verticalCells(text: string): string[] {
  const cells: string[] = [];
  for (const match of text.matchAll(/[0-9]{1,3}(?![0-9])|[0-9]{4,}|./gsu)) {
    const token = match[0];
    if (/^[0-9]{4,}$/.test(token)) cells.push(...token);
    else cells.push(token);
  }
  return cells;
}

/** Splits text into vertical columns of at most `perColumn` cells. */
export function verticalColumns(text: string, perColumn: number): string[][] {
  const cells = verticalCells(text);
  const columns: string[][] = [];
  for (let index = 0; index < cells.length; index += perColumn)
    columns.push(cells.slice(index, index + perColumn));
  return columns;
}
