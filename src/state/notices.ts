import { calcOVR } from '../engine';
import type {
  InSeasonAwakeningEvent,
  Player,
  PlayerParams,
  PostGameEvents,
  Team,
  TeamKey,
} from '../engine';
import type { Notice } from './storage';

const PARAMETER_LABELS: Partial<Record<keyof PlayerParams, string>> = {
  vel: '球速',
  ctrl: '制球',
  stam: 'スタミナ',
  nobi: 'ノビ',
  fld: '守備',
  cf: '直球対応',
  cb: '変化球対応',
  pw: '長打力',
  dc: '選球眼',
  sp: '走力',
  df: '守備力',
  arm: '肩力',
  bnt: 'バント',
  ld: 'リード',
};

interface OffseasonAwakeningSummary {
  tk: string;
  name: string;
  player: Player;
  events: Array<{ param: keyof PlayerParams; boost: number }>;
  isBreakthrough: boolean;
  newSpecial: { n: string } | null;
}

function parameterLabel(parameter: keyof PlayerParams): string {
  return PARAMETER_LABELS[parameter] ?? String(parameter);
}

function awakeningBody(event: {
  changes: Array<{ param: keyof PlayerParams; boost: number }>;
  isBreakthrough: boolean;
  newSpecial: string | null;
}): string {
  const changes = event.changes
    .map((change) => `${parameterLabel(change.param)} +${change.boost}`)
    .join(' / ');
  const details = [changes];
  if (event.isBreakthrough) details.push('限界突破が発生');
  if (event.newSpecial) details.push(`特殊能力「${event.newSpecial}」を獲得`);
  return details.filter(Boolean).join('。');
}

function noticeId(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => String(part ?? '')).join(':');
}

export function mergeNotices(current: Notice[], incoming: Notice[], limit = 80): Notice[] {
  if (!incoming.length) return current;
  const seen = new Set<string>();
  return [...incoming, ...current]
    .filter((notice) => {
      if (seen.has(notice.id)) return false;
      seen.add(notice.id);
      return true;
    })
    .slice(0, limit);
}

export function createInSeasonDevelopmentNotices(
  events: PostGameEvents,
  playerTeam: TeamKey,
  date: string,
): Notice[] {
  return events.awakenings
    .filter((event) => event.teamKey === playerTeam)
    .map((event: InSeasonAwakeningEvent) => ({
      id: noticeId(['awakening', date, event.playerId]),
      kind: 'awakening',
      title: event.isBreakthrough ? `限界突破！ ${event.name}` : `覚醒！ ${event.name}`,
      body: awakeningBody(event),
      tone: 'good',
      date,
      playerId: event.playerId,
      teamKey: event.teamKey,
    }));
}

function latestAnnualGrowth(player: Player) {
  return [...(player.growthLog ?? [])]
    .reverse()
    .find((entry) => entry.type !== 'awakening' && Array.isArray(entry.changes));
}

export function createOffseasonDevelopmentNotices(
  originalTeam: Team,
  grownTeam: Team,
  awakeEvents: OffseasonAwakeningSummary[],
  playerTeam: TeamKey,
  year: number,
): Notice[] {
  const originalById = new Map(
    [...originalTeam.pitchers, ...originalTeam.fielders].map((player) => [player.id, player]),
  );
  const grownPlayers = [...grownTeam.pitchers, ...grownTeam.fielders];
  const growthNotices = grownPlayers
    .map((player): Notice | null => {
      const original = originalById.get(player.id);
      if (!original) return null;
      const before = calcOVR(original, original.pos);
      const after = calcOVR(player, player.pos);
      const delta = after - before;
      if (Math.abs(delta) < 3) return null;
      const latest = latestAnnualGrowth(player);
      const changeText = (latest?.changes ?? [])
        .slice()
        .sort((first, second) => Math.abs(second.diff) - Math.abs(first.diff))
        .slice(0, 5)
        .map((change) => `${parameterLabel(change.param)} ${change.diff > 0 ? '+' : ''}${change.diff}`)
        .join(' / ');
      return {
        id: noticeId(['growth', year, player.id]),
        kind: 'growth',
        title: delta > 0 ? `大きく成長：${player.name}` : `能力変動：${player.name}`,
        body: `OVR ${before} → ${after}（${delta > 0 ? '+' : ''}${delta}）${changeText ? `。${changeText}` : ''}`,
        tone: delta > 0 ? 'good' : 'warn',
        date: `${year}年オフシーズン`,
        playerId: player.id,
        teamKey: playerTeam,
      };
    })
    .filter((notice): notice is Notice => notice !== null)
    .sort((first, second) => {
      const firstDelta = Number(first.body.match(/（([+-]?\d+)）/)?.[1] ?? 0);
      const secondDelta = Number(second.body.match(/（([+-]?\d+)）/)?.[1] ?? 0);
      return Math.abs(secondDelta) - Math.abs(firstDelta);
    })
    .slice(0, 10);

  const awakeningNotices = awakeEvents
    .filter((event) => event.tk === playerTeam)
    .map<Notice>((event) => ({
      id: noticeId(['offseason-awakening', year, event.player.id]),
      kind: 'awakening',
      title: event.isBreakthrough ? `オフの限界突破！ ${event.name}` : `オフの覚醒！ ${event.name}`,
      body: awakeningBody({
        changes: event.events,
        isBreakthrough: event.isBreakthrough,
        newSpecial: event.newSpecial?.n ?? null,
      }),
      tone: 'good',
      date: `${year}年オフシーズン`,
      playerId: event.player.id,
      teamKey: playerTeam,
    }));

  return [...awakeningNotices, ...growthNotices];
}
