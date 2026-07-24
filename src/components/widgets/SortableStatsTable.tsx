import { useMemo, useState } from 'react';

import { TINFO } from '../../data';
import {
  STATS_QUALIFICATION,
  averageText,
  inningsText,
  ops,
  qualifiesForRate,
  strikeoutsPerNine,
  whip,
  yearlyRows,
} from '../../engine';
import type {
  AccumulatedStats,
  Player,
  PlayerStats,
  TeamKey,
} from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

type StatsSource = 'current' | 'career' | 'yearly';
type PlayerKind = 'bat' | 'pit';
type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'name'
  | 'team'
  | 'g'
  | 'pa'
  | 'ab'
  | 'average'
  | 'h'
  | 'hr'
  | 'rbi'
  | 'bb'
  | 'k'
  | 'sb'
  | 'ops'
  | 'gs'
  | 'w'
  | 'l'
  | 'era'
  | 'ip3'
  | 'whip'
  | 'k9'
  | 'sv'
  | 'hld';

interface StatsRow {
  player: Player;
  stats: PlayerStats;
  teamKey: TeamKey | null;
  qualificationGames: number;
}

interface Column {
  key: SortKey;
  label: string;
  description?: string;
  align?: 'left' | 'center';
}

const sourceOptions: Array<{ id: StatsSource; label: string }> = [
  { id: 'current', label: '今季' },
  { id: 'career', label: '通算' },
  { id: 'yearly', label: '年度別' },
];

const batterColumns: Column[] = [
  { key: 'name', label: '選手', align: 'left' },
  { key: 'team', label: '球団' },
  { key: 'g', label: '試合' },
  { key: 'pa', label: '打席' },
  { key: 'ab', label: '打数' },
  { key: 'average', label: '打率' },
  { key: 'h', label: '安打' },
  { key: 'hr', label: '本塁打' },
  { key: 'rbi', label: '打点' },
  { key: 'bb', label: '四球' },
  { key: 'k', label: '三振' },
  { key: 'sb', label: '盗塁' },
  { key: 'ops', label: 'OPS', description: '出塁率と長打率を足した指標' },
];

const pitcherColumns: Column[] = [
  { key: 'name', label: '選手', align: 'left' },
  { key: 'team', label: '球団' },
  { key: 'g', label: '登板' },
  { key: 'gs', label: '先発' },
  { key: 'w', label: '勝' },
  { key: 'l', label: '敗' },
  { key: 'era', label: '防御率' },
  { key: 'ip3', label: '投球回' },
  { key: 'k', label: '奪三振' },
  { key: 'whip', label: 'WHIP', description: '1投球回あたりの被安打と与四球' },
  { key: 'k9', label: 'K/9', description: '9投球回あたりの奪三振数' },
  { key: 'sv', label: 'セーブ' },
  { key: 'hld', label: 'ホールド' },
];

const teamKeySet = new Set<string>(Object.keys(TINFO));

function teamKeyFor(player: Player): TeamKey | null {
  const candidate = String(player.tk);
  return teamKeySet.has(candidate) ? (candidate as TeamKey) : null;
}

function sourceStats(
  source: StatsSource,
  player: Player,
  currentStats: AccumulatedStats,
  careerStats: AccumulatedStats,
  yearlyStats: Record<string, unknown[]>,
  year: string,
): PlayerStats | undefined {
  if (source === 'current') return currentStats[player.id];
  if (source === 'career') return careerStats[player.id];
  return yearlyRows(yearlyStats, player.id).find((row) => row.year === year)?.stats;
}

function sortValue(row: StatsRow, key: SortKey): number | string | null {
  if (key === 'name') return row.player.name;
  if (key === 'team') return row.teamKey ? TINFO[row.teamKey].ab : '';
  const stats = row.stats;
  if (key === 'g') return stats.g;
  if (key === 'k') return stats.k;
  if (key === 'h') return stats.h;
  if (key === 'bb') return stats.bb;

  if (stats.type === 'bat') {
    if (key === 'pa') return stats.pa;
    if (key === 'ab') return stats.ab;
    if (key === 'average') return stats.ab > 0 ? stats.h / stats.ab : null;
    if (key === 'hr') return stats.hr;
    if (key === 'rbi') return stats.rbi;
    if (key === 'sb') return stats.sb;
    if (key === 'ops') return ops(stats);
    return null;
  }

  if (key === 'gs') return stats.gs;
  if (key === 'w') return stats.w;
  if (key === 'l') return stats.l;
  if (key === 'era') return stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null;
  if (key === 'ip3') return stats.ip3;
  if (key === 'whip') return whip(stats);
  if (key === 'k9') return strikeoutsPerNine(stats);
  if (key === 'sv') return stats.sv;
  if (key === 'hld') return stats.hld;
  return null;
}

function formattedValue(row: StatsRow, key: SortKey): string {
  if (key === 'name') return row.player.name;
  if (key === 'team') return row.teamKey ? TINFO[row.teamKey].ab : '-';
  const stats = row.stats;
  if (key === 'g') return String(stats.g);
  if (key === 'k') return String(stats.k);
  if (key === 'h') return String(stats.h);
  if (key === 'bb') return String(stats.bb);

  if (stats.type === 'bat') {
    if (key === 'pa') return String(stats.pa);
    if (key === 'ab') return String(stats.ab);
    if (key === 'average') return averageText(stats.h, stats.ab);
    if (key === 'hr') return String(stats.hr);
    if (key === 'rbi') return String(stats.rbi);
    if (key === 'sb') return String(stats.sb);
    if (key === 'ops') {
      const value = ops(stats);
      return value === null ? '.---' : value.toFixed(3).replace(/^0/, '');
    }
    return '-';
  }

  if (key === 'gs') return String(stats.gs);
  if (key === 'w') return String(stats.w);
  if (key === 'l') return String(stats.l);
  if (key === 'era') return stats.ip3 > 0 ? ((stats.er * 27) / stats.ip3).toFixed(2) : '-.--';
  if (key === 'ip3') return inningsText(stats.ip3);
  if (key === 'whip') {
    const value = whip(stats);
    return value === null ? '-.--' : value.toFixed(2);
  }
  if (key === 'k9') {
    const value = strikeoutsPerNine(stats);
    return value === null ? '-.--' : value.toFixed(2);
  }
  if (key === 'sv') return String(stats.sv);
  if (key === 'hld') return String(stats.hld);
  return '-';
}

function compareValues(
  first: number | string | null,
  second: number | string | null,
  direction: SortDirection,
): number {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  const comparison =
    typeof first === 'string' && typeof second === 'string'
      ? first.localeCompare(second, 'ja')
      : Number(first) - Number(second);
  return direction === 'asc' ? comparison : -comparison;
}

export function SortableStatsTable({
  players,
  currentStats,
  careerStats,
  yearlyStats,
  gamesByTeam,
  onSelect,
}: {
  players: Player[];
  currentStats: AccumulatedStats;
  careerStats: AccumulatedStats;
  yearlyStats: Record<string, unknown[]>;
  gamesByTeam: Partial<Record<TeamKey, number>>;
  onSelect(player: Player): void;
}) {
  const [source, setSource] = useState<StatsSource>('current');
  const [playerKind, setPlayerKind] = useState<PlayerKind>('bat');
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [year, setYear] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'average',
    direction: 'desc',
  });

  const availableYears = useMemo(
    () => Object.keys(yearlyStats).sort((first, second) => second.localeCompare(first)),
    [yearlyStats],
  );
  const selectedYear = availableYears.includes(year) ? year : (availableYears[0] ?? '');
  const columns = playerKind === 'bat' ? batterColumns : pitcherColumns;
  const defaultSort = playerKind === 'bat'
    ? { key: 'average' as SortKey, direction: 'desc' as SortDirection }
    : { key: 'era' as SortKey, direction: 'asc' as SortDirection };
  const effectiveSort = columns.some((column) => column.key === sort.key) ? sort : defaultSort;

  const rows = useMemo(() => {
    const result: StatsRow[] = [];
    for (const player of players) {
      const stats = sourceStats(
        source,
        player,
        currentStats,
        careerStats,
        yearlyStats,
        selectedYear,
      );
      if (!stats || stats.type !== playerKind) continue;
      const teamKey = teamKeyFor(player);
      const qualificationGames =
        source === 'current'
          ? teamKey
            ? (gamesByTeam[teamKey] ?? 0)
            : 0
          : STATS_QUALIFICATION.fullSeasonTeamGames;
      if (qualifiedOnly && !qualifiesForRate(stats, qualificationGames)) continue;
      result.push({ player, stats, teamKey, qualificationGames });
    }
    return result.sort((first, second) => {
      const comparison = compareValues(
        sortValue(first, effectiveSort.key),
        sortValue(second, effectiveSort.key),
        effectiveSort.direction,
      );
      return comparison || first.player.name.localeCompare(second.player.name, 'ja');
    });
  }, [
    careerStats,
    currentStats,
    effectiveSort.direction,
    effectiveSort.key,
    gamesByTeam,
    playerKind,
    players,
    qualifiedOnly,
    selectedYear,
    source,
    yearlyStats,
  ]);

  const handleSort = (key: SortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      const direction: SortDirection =
        key === 'name' || key === 'team' || key === 'era' ? 'asc' : 'desc';
      return { key, direction };
    });
  };

  return (
    <Card ariaLabel="選手成績テーブル">
      <SectionTitle>Stats Table</SectionTitle>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div role="group" aria-label="成績の集計期間" style={{ display: 'flex', gap: 5 }}>
          {sourceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-label={`${option.label}成績を表示`}
              aria-pressed={source === option.id}
              onClick={() => setSource(option.id)}
              style={{
                minHeight: 38,
                padding: '7px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: source === option.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background:
                  source === option.id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        {source === 'yearly' && (
          <select
            aria-label="表示する年度"
            value={selectedYear}
            onChange={(event) => setYear(event.target.value)}
            disabled={!availableYears.length}
            style={{
              minHeight: 38,
              padding: '7px 10px',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-text)',
              background: 'var(--color-bg-soft)',
            }}
          >
            {!availableYears.length && <option value="">年度データなし</option>}
            {availableYears.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}年
              </option>
            ))}
          </select>
        )}
        <div role="group" aria-label="投打の切り替え" style={{ display: 'flex', gap: 5 }}>
          {([
            ['bat', '打者'],
            ['pit', '投手'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-label={`${label}成績を表示`}
              aria-pressed={playerKind === id}
              onClick={() => setPlayerKind(id)}
              style={{
                minHeight: 38,
                padding: '7px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: playerKind === id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background:
                  playerKind === id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label
          style={{
            display: 'inline-flex',
            minHeight: 38,
            alignItems: 'center',
            gap: 7,
            color: 'var(--color-text-muted)',
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            aria-label="規定到達選手だけを表示"
            checked={qualifiedOnly}
            onChange={(event) => setQualifiedOnly(event.target.checked)}
          />
          規定到達のみ
        </label>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
          規定: 打席=試合×3.1 / 投球回=試合×1.0
        </span>
      </div>

      {!rows.length ? (
        <EmptyState>
          {source === 'yearly' && !availableYears.length
            ? '年度別成績はまだ保存されていません。'
            : '条件に一致する成績がありません。'}
        </EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table" aria-label={`${playerKind === 'bat' ? '打者' : '投手'}成績一覧`}>
            <caption>
              列名を選択すると昇順・降順を切り替えます。{rows.length}名を表示中です。
            </caption>
            <thead>
              <tr>
                {columns.map((column) => {
                  const selected = effectiveSort.key === column.key;
                  const nextDirection =
                    selected && effectiveSort.direction === 'asc' ? '降順' : '昇順';
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      title={column.description}
                      style={{ textAlign: column.align ?? 'center', whiteSpace: 'nowrap' }}
                    >
                      <button
                        type="button"
                        aria-label={`${column.label}で${nextDirection}に並べ替え`}
                        onClick={() => handleSort(column.key)}
                        style={{
                          padding: 0,
                          border: 0,
                          color: selected ? 'var(--color-accent)' : 'var(--color-text-faint)',
                          background: 'transparent',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        {column.label}
                        {selected ? (effectiveSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.player.id}>
                  {columns.map((column) => {
                    if (column.key === 'name') {
                      return (
                        <th key={column.key} scope="row" style={{ textAlign: 'left' }}>
                          <button
                            className="roster-player-button"
                            type="button"
                            aria-label={`${row.player.name}の詳細を表示`}
                            onClick={() => onSelect(row.player)}
                          >
                            {row.player.name}
                          </button>
                          <div style={{ marginTop: 4 }}>
                            <PlayerStatusBadges player={row.player} compact />
                          </div>
                        </th>
                      );
                    }
                    const value = sortValue(row, column.key);
                    const highlighted =
                      (column.key === 'average' && typeof value === 'number' && value >= 0.3) ||
                      (column.key === 'ops' && typeof value === 'number' && value >= 0.8) ||
                      (column.key === 'era' && typeof value === 'number' && value < 3) ||
                      (column.key === 'w' && typeof value === 'number' && value >= 10);
                    const power =
                      column.key === 'hr' && typeof value === 'number' && value >= 30;
                    return (
                      <td
                        key={column.key}
                        className={
                          highlighted ? 'metric-highlight' : power ? 'metric-power' : undefined
                        }
                        style={{ textAlign: 'center', whiteSpace: 'nowrap' }}
                      >
                        {formattedValue(row, column.key)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
