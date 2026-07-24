import { useEffect, useMemo, useRef } from 'react';

import { calcOVR, effectiveOVR, ops } from '../../engine';
import type { AccumulatedStats, Player } from '../../engine';
import { Button, EmptyState, SectionTitle } from '../ui';

interface CompareMetric {
  id: string;
  label: string;
  value(player: Player): number | null;
  format(value: number): string;
}

const integerText = (value: number): string => String(Math.round(value));
const decimalText = (value: number): string => value.toFixed(2);
const rateText = (value: number): string => value.toFixed(3).replace(/^0/, '');

function playerOVR(player: Player): number {
  return calcOVR(player);
}

function playerEffectiveOVR(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player._assignedPos ?? player.pos);
}

const basicMetrics: CompareMetric[] = [
  { id: 'age', label: '年齢', value: (player) => player.age, format: integerText },
  { id: 'ovr', label: 'OVR', value: playerOVR, format: integerText },
  { id: 'effective-ovr', label: '実効OVR', value: playerEffectiveOVR, format: integerText },
];

const batterAbilityMetrics: CompareMetric[] = [
  { id: 'cf', label: '直球対応', value: (player) => player.isP ? null : (player.p.cf ?? null), format: integerText },
  { id: 'cb', label: '変化対応', value: (player) => player.isP ? null : (player.p.cb ?? null), format: integerText },
  { id: 'pw', label: '長打力', value: (player) => player.isP ? null : (player.p.pw ?? null), format: integerText },
  { id: 'dc', label: '選球眼', value: (player) => player.isP ? null : (player.p.dc ?? null), format: integerText },
  { id: 'sp', label: '走力', value: (player) => player.isP ? null : (player.p.sp ?? null), format: integerText },
  { id: 'df', label: '守備力', value: (player) => player.isP ? null : (player.p.df ?? null), format: integerText },
  { id: 'arm', label: '肩力', value: (player) => player.isP ? null : (player.p.arm ?? null), format: integerText },
  { id: 'bnt', label: 'バント', value: (player) => player.isP ? null : (player.p.bnt ?? null), format: integerText },
];

const pitcherAbilityMetrics: CompareMetric[] = [
  { id: 'vel', label: '球速', value: (player) => player.isP ? (player.p.vel ?? null) : null, format: integerText },
  { id: 'ctrl', label: '制球', value: (player) => player.isP ? (player.p.ctrl ?? null) : null, format: integerText },
  { id: 'stam', label: 'スタミナ', value: (player) => player.isP ? player.p.stam : null, format: integerText },
  { id: 'nobi', label: 'ノビ', value: (player) => player.isP ? (player.p.nobi ?? null) : null, format: integerText },
  { id: 'fld', label: '守備', value: (player) => player.isP ? (player.p.fld ?? null) : null, format: integerText },
];

function currentMetrics(accumulated: AccumulatedStats): CompareMetric[] {
  return [
    {
      id: 'games',
      label: '今季試合',
      value: (player) => accumulated[player.id]?.g ?? null,
      format: integerText,
    },
    {
      id: 'average',
      label: '今季打率',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'bat' && stats.ab > 0 ? stats.h / stats.ab : null;
      },
      format: rateText,
    },
    {
      id: 'home-runs',
      label: '今季本塁打',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'bat' ? stats.hr : null;
      },
      format: integerText,
    },
    {
      id: 'rbi',
      label: '今季打点',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'bat' ? stats.rbi : null;
      },
      format: integerText,
    },
    {
      id: 'ops',
      label: '今季OPS',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'bat' ? ops(stats) : null;
      },
      format: rateText,
    },
    {
      id: 'era',
      label: '今季防御率',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'pit' && stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null;
      },
      format: decimalText,
    },
    {
      id: 'wins',
      label: '今季勝利',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'pit' ? stats.w : null;
      },
      format: integerText,
    },
    {
      id: 'strikeouts',
      label: '今季奪三振',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'pit' ? stats.k : null;
      },
      format: integerText,
    },
    {
      id: 'saves',
      label: '今季セーブ',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'pit' ? stats.sv : null;
      },
      format: integerText,
    },
    {
      id: 'holds',
      label: '今季ホールド',
      value: (player) => {
        const stats = accumulated[player.id];
        return stats?.type === 'pit' ? stats.hld : null;
      },
      format: integerText,
    },
  ];
}

function MetricRows({ metrics, players }: { metrics: CompareMetric[]; players: Player[] }) {
  return (
    <>
      {metrics.map((metric) => {
        const values = players.map(metric.value);
        const available = values.filter((value): value is number => value !== null);
        const maximum = available.length ? Math.max(...available) : null;
        return (
          <tr key={metric.id}>
            <th scope="row" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
              {metric.label}
            </th>
            {values.map((value, index) => (
              <td
                key={players[index]?.id ?? `${metric.id}-${index}`}
                className={value !== null && value === maximum ? 'metric-highlight' : undefined}
                style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 800 }}
              >
                {value === null ? '-' : metric.format(value)}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

export function PlayerCompareModal({
  players,
  accumulated,
  onSelect,
  onClose,
}: {
  players: Player[];
  accumulated: AccumulatedStats;
  onSelect(player: Player): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const metrics = useMemo(() => currentMetrics(accumulated), [accumulated]);
  const hasBatter = players.some((player) => !player.isP);
  const hasPitcher = players.some((player) => player.isP);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="player-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className="player-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-compare-title"
        tabIndex={-1}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="player-compare-title">
              選手比較
            </h1>
            <div className="player-modal__meta">最大値を強調表示しています。</div>
          </div>
          <Button onClick={onClose} color="var(--color-surface-muted)" ariaLabel="選手比較を閉じる">
            閉じる
          </Button>
        </header>
        <div className="player-modal__body">
          {players.length < 2 ? (
            <EmptyState>比較する選手を2人以上選択してください。</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="data-table" aria-label="選手能力と今季成績の比較">
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left' }}>項目</th>
                    {players.map((player) => (
                      <th scope="col" key={player.id} style={{ minWidth: 150, textAlign: 'center' }}>
                        <button
                          type="button"
                          className="roster-player-button"
                          aria-label={`${player.name}の詳細を表示`}
                          onClick={() => onSelect(player)}
                        >
                          {player.name}
                        </button>
                        <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 11 }}>
                          {player.isP ? player.role : player._assignedPos ?? player.pos}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th colSpan={players.length + 1} style={{ textAlign: 'left', color: 'var(--color-accent)' }}>
                      <SectionTitle>Basic</SectionTitle>
                    </th>
                  </tr>
                  <MetricRows metrics={basicMetrics} players={players} />
                  {hasBatter && (
                    <>
                      <tr>
                        <th colSpan={players.length + 1} style={{ textAlign: 'left', color: 'var(--color-accent)' }}>
                          <SectionTitle>Batter Abilities</SectionTitle>
                        </th>
                      </tr>
                      <MetricRows metrics={batterAbilityMetrics} players={players} />
                    </>
                  )}
                  {hasPitcher && (
                    <>
                      <tr>
                        <th colSpan={players.length + 1} style={{ textAlign: 'left', color: 'var(--color-accent)' }}>
                          <SectionTitle>Pitcher Abilities</SectionTitle>
                        </th>
                      </tr>
                      <MetricRows metrics={pitcherAbilityMetrics} players={players} />
                    </>
                  )}
                  <tr>
                    <th colSpan={players.length + 1} style={{ textAlign: 'left', color: 'var(--color-accent)' }}>
                      <SectionTitle>Current Season</SectionTitle>
                    </th>
                  </tr>
                  <MetricRows metrics={metrics} players={players} />
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
