import { CENTRAL, PACIFIC } from '../data';
import type { NarrativeEvent, NarrativeEventLedger } from './types';

const prefixes = {
  transaction: 'transaction',
  draft: 'draft',
  career: 'career',
  seasonReview: 'season-review',
  injury: 'injury',
  development: 'development',
} as const;

/** Keep legacy unprefixed subsystem ids usable, without adding a prefix twice. */
export function narrativeEventArticleId(event: Pick<NarrativeEvent, 'type' | 'id'>): string {
  const prefix = `${prefixes[event.type]}:`;
  return event.id.startsWith(prefix) ? event.id : `${prefix}${event.id}`;
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown): value is number =>
  number(value) && Number.isSafeInteger(value) && value >= 0;
const team = (value: unknown): boolean => [...CENTRAL, ...PACIFIC].includes(value as never);
const optionalTeam = (value: unknown): boolean => value == null || team(value);
const player = (value: Record<string, unknown>): boolean =>
  text(value.playerId) && text(value.playerName);
function validDate(value: string, year: number): boolean {
  if (value.startsWith(`${year}年`)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) !== year) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
const params = new Set([
  'vel',
  'ctrl',
  'stam',
  'nobi',
  'fld',
  'cf',
  'cb',
  'pw',
  'dc',
  'sp',
  'df',
  'arm',
  'bnt',
  'ld',
]);

function validEvent(value: unknown, year: number): value is NarrativeEvent {
  if (
    !object(value) ||
    !text(value.type) ||
    !Object.prototype.hasOwnProperty.call(prefixes, value.type) ||
    !text(value.id) ||
    value.year !== year ||
    !text(value.date) ||
    !validDate(value.date, year)
  )
    return false;
  if (value.type !== 'seasonReview' && !player(value)) return false;
  if (value.type !== 'transaction' && !team(value.teamKey)) return false;
  switch (value.type) {
    case 'transaction': {
      if (
        !['trade', 'faSigning', 'foreignSigning', 'release', 'retirement'].includes(
          String(value.transactionKind),
        ) ||
        !optionalTeam(value.fromTeamKey) ||
        !optionalTeam(value.toTeamKey) ||
        (value.terms != null && !text(value.terms)) ||
        (value.cashAmountManYen != null && !integer(value.cashAmountManYen)) ||
        (value.exitReason != null && !text(value.exitReason))
      )
        return false;
      if (
        value.movements !== undefined &&
        (!Array.isArray(value.movements) ||
          !value.movements.length ||
          !value.movements.every(
            (m) => object(m) && player(m) && team(m.fromTeamKey) && team(m.toTeamKey),
          ))
      )
        return false;
      if (value.transactionKind === 'trade')
        return Boolean(value.movements || (team(value.fromTeamKey) && team(value.toTeamKey)));
      if (value.transactionKind === 'faSigning' || value.transactionKind === 'foreignSigning')
        return team(value.toTeamKey);
      return team(value.fromTeamKey);
    }
    case 'draft':
      return (
        integer(value.round) &&
        value.round > 0 &&
        (value.overallPick == null || (integer(value.overallPick) && value.overallPick > 0)) &&
        (value.origin == null || text(value.origin))
      );
    case 'career':
      return (
        ['debut', 'roleChange', 'returnFromInjury', 'breakthrough', 'retirement'].includes(
          String(value.careerKind),
        ) &&
        (text(value.detail) ||
          (value.careerKind === 'returnFromInjury' && value.injuryDaysBefore === 1))
      );
    case 'injury':
      return (
        integer(value.days) &&
        value.days > 0 &&
        ['light', 'mid', 'heavy'].includes(String(value.severity))
      );
    case 'seasonReview':
      return (
        integer(value.rank) &&
        value.rank > 0 &&
        integer(value.wins) &&
        integer(value.losses) &&
        integer(value.draws) &&
        typeof value.champion === 'boolean' &&
        (value.titleHolders === undefined ||
          (Array.isArray(value.titleHolders) &&
            value.titleHolders.every((p) => object(p) && player(p) && text(p.titleLabel))))
      );
    case 'development':
      if (value.developmentKind === undefined) return text(value.detail);
      if (value.developmentKind === 'growth')
        return (
          number(value.ovrBefore) &&
          number(value.ovrAfter) &&
          Array.isArray(value.changes) &&
          value.changes.every(
            (c) =>
              object(c) &&
              params.has(String(c.param)) &&
              number(c.before) &&
              number(c.after) &&
              number(c.diff) &&
              Math.abs(c.after - c.before - c.diff) < 1e-8,
          )
        );
      return (
        value.developmentKind === 'awakening' &&
        typeof value.isBreakthrough === 'boolean' &&
        (value.newSpecial == null || text(value.newSpecial)) &&
        Array.isArray(value.boosts) &&
        value.boosts.every((c) => object(c) && params.has(String(c.param)) && number(c.boost))
      );
  }
  return false;
}

function eventSnapshot(event: NarrativeEvent): string {
  return JSON.stringify(event, (_key, value: unknown) =>
    object(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

/** Missing fields are legacy saves. Present but invalid facts are corruption, never silently lost. */
export function migrateNarrativeEvents(raw: unknown): NarrativeEventLedger {
  if (raw === undefined) return {};
  if (!object(raw)) throw new Error('Narrative event ledger is corrupted.');
  const ledger: NarrativeEventLedger = {};
  const seen = new Map<string, string>();
  for (const [yearKey, events] of Object.entries(raw)) {
    const year = Number(yearKey);
    if (!integer(year) || year < 1 || String(year) !== yearKey || !Array.isArray(events))
      throw new Error(`Narrative event year ${yearKey} is corrupted.`);
    const entries: NarrativeEvent[] = [];
    for (const event of events) {
      if (!validEvent(event, year)) throw new Error(`Narrative event in ${yearKey} is corrupted.`);
      const id = narrativeEventArticleId(event);
      const snapshot = eventSnapshot(event);
      if (seen.has(id)) {
        if (seen.get(id) !== snapshot) throw new Error(`Conflicting narrative event ${id}.`);
        continue;
      }
      seen.set(id, snapshot);
      entries.push(structuredClone(event));
    }
    if (entries.length) ledger[yearKey] = entries;
  }
  return ledger;
}

/** Copy only touched years. Previously saved facts are immutable; exact replays are no-ops. */
export function appendNarrativeEvents(
  ledger: NarrativeEventLedger,
  events: readonly NarrativeEvent[],
): NarrativeEventLedger {
  if (!events.length) return ledger;
  const next = { ...ledger };
  const byYear = new Map<number, Map<string, NarrativeEvent>>();
  let changed = false;
  for (const event of events) {
    if (!validEvent(event, event.year)) throw new Error(`Invalid narrative event.`);
    let entries = byYear.get(event.year);
    if (!entries) {
      entries = new Map(
        (ledger[String(event.year)] ?? []).map((e) => [narrativeEventArticleId(e), e]),
      );
      byYear.set(event.year, entries);
    }
    const id = narrativeEventArticleId(event);
    const prior = entries.get(id);
    if (prior) {
      if (eventSnapshot(prior) !== eventSnapshot(event))
        throw new Error(`Conflicting narrative event ${id}.`);
      continue;
    }
    entries.set(id, structuredClone(event));
    changed = true;
  }
  if (!changed) return ledger;
  for (const [year, entries] of byYear) next[String(year)] = [...entries.values()];
  return next;
}
