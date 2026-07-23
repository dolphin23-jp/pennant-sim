import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';

import { calcOVR, effectiveOVR, specialLevel } from '../../engine';
import type { AccumulatedStats, Player, PlayerStats } from '../../engine';
import { Button, Card, EmptyState, SectionTitle, TermTooltip } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

type TabId = 'basic' | 'season' | 'career' | 'special';
interface StatItem {
  label: ReactNode;
  value: string;
  elite?: boolean;
  power?: boolean;
}
interface YearlyRow {
  year: string;
  stats: PlayerStats;
}
interface GrowthPoint {
  age: number;
  value: number;
}

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'basic', label: '基本情報' },
  { id: 'season', label: '今季成績' },
  { id: 'career', label: '通算・年度別' },
  { id: 'special', label: '特殊能力' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isPlayerStats = (value: unknown): value is PlayerStats =>
  isRecord(value) && (value.type === 'bat' || value.type === 'pit');

const averageText = (hits: number, atBats: number): string =>
  atBats > 0 ? (hits / atBats).toFixed(3).replace(/^0/, '') : '.---';

const inningsText = (outs: number): string => {
  const innings = Math.floor(outs / 3);
  const remainder = outs % 3;
  return `${innings}${remainder ? `.${remainder}` : ''}`;
};

const babip = (stats: Extract<PlayerStats, { type: 'bat' }>): number | null => {
  const denominator = stats.ab - stats.k - stats.hr;
  return denominator > 0 ? (stats.h - stats.hr) / denominator : null;
};

function statItems(stats: PlayerStats | undefined): StatItem[] {
  if (!stats) return [];
  if (stats.type === 'pit') {
    const era = stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null;
    return [
      { label: '登板', value: String(stats.g) },
      { label: '先発', value: String(stats.gs) },
      { label: '勝敗', value: `${stats.w}勝 ${stats.l}敗`, elite: stats.w >= 10 },
      { label: '防御率', value: era === null ? '-.--' : era.toFixed(2), elite: era !== null && era < 3 },
      { label: '投球回', value: inningsText(stats.ip3) },
      { label: '奪三振', value: String(stats.k), elite: stats.k >= 100 },
      { label: '被安打', value: String(stats.h) },
      { label: '与四球', value: String(stats.bb) },
      { label: 'セーブ', value: String(stats.sv), elite: stats.sv >= 30 },
      { label: 'ホールド', value: String(stats.hld), elite: stats.hld >= 30 },
    ];
  }
  const average = stats.ab > 0 ? stats.h / stats.ab : null;
  const calculatedBabip = babip(stats);
  return [
    { label: '試合', value: String(stats.g) },
    { label: '打席', value: String(stats.pa) },
    { label: '打数', value: String(stats.ab) },
    {
      label: '打率',
      value: averageText(stats.h, stats.ab),
      elite: average !== null && average >= 0.3,
    },
    { label: '安打', value: String(stats.h) },
    { label: '本塁打', value: String(stats.hr), power: stats.hr >= 30 },
    { label: '打点', value: String(stats.rbi), elite: stats.rbi >= 100 },
    { label: '四球', value: String(stats.bb) },
    { label: '三振', value: String(stats.k) },
    { label: '盗塁', value: String(stats.sb), elite: stats.sb >= 20 },
    {
      label: (
        <TermTooltip
          term="BABIP"
          description="本塁打を除くインプレー打球が安打になった割合です。"
        />
      ),
      value: calculatedBabip === null ? '.---' : calculatedBabip.toFixed(3).replace(/^0/, ''),
      elite: calculatedBabip !== null && calculatedBabip >= 0.32,
    },
  ];
}

function StatGrid({ stats }: { stats: PlayerStats | undefined }) {
  const items = statItems(stats);
  if (!items.length) return <EmptyState>記録された成績はありません。</EmptyState>;
  return (
    <dl className="stat-grid">
      {items.map((item, index) => (
        <div key={`${String(item.value)}-${index}`}>
          <dt>{item.label}</dt>
          <dd
            className={
              item.elite ? 'stat-value--elite' : item.power ? 'metric-power' : undefined
            }
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AbilityBar({ label, value }: { label: string; value: number | undefined }) {
  const rounded = Math.round(value ?? 0);
  const percentage = Math.max(0, Math.min(100, (rounded / 120) * 100));
  const strong = rounded >= 50;
  return (
    <div className={`ability-row${strong ? ' ability-row--strong' : ''}`}>
      <div className="ability-row__label">
        <span>{label}</span>
        <strong>{rounded}</strong>
      </div>
      <div
        className="ability-meter"
        role="meter"
        aria-label={`${label} ${rounded}`}
        aria-valuemin={0}
        aria-valuemax={120}
        aria-valuenow={rounded}
      >
        <div className="ability-meter__fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function GrowthChart({ player, overall }: { player: Player; overall: number }) {
  const points = useMemo<GrowthPoint[]>(() => {
    const logs = (player.growthLog ?? []).slice(-8);
    return logs
      .map((entry, index) => {
        const fromChanges = entry.changes?.length
          ? entry.changes.reduce((total, change) => total + change.after, 0) / entry.changes.length
          : undefined;
        const value = entry.ovrAfter ?? entry.ovrBefore ?? fromChanges;
        if (typeof value !== 'number') return null;
        return {
          age: player.age - (logs.length - 1 - index),
          value: Math.round(value),
        };
      })
      .filter((point): point is GrowthPoint => point !== null);
  }, [player]);

  const displayed = points.length === 1 ? [...points, { age: player.age, value: overall }] : points;
  if (!displayed.length) return <EmptyState>能力推移の履歴はまだありません。</EmptyState>;

  const width = 420;
  const height = 150;
  const padding = 24;
  const values = displayed.map((point) => point.value);
  const minimum = Math.min(...values) - 4;
  const maximum = Math.max(...values) + 4;
  const range = Math.max(1, maximum - minimum);
  const coordinates = displayed.map((point, index) => ({
    ...point,
    x:
      displayed.length === 1
        ? width / 2
        : padding + (index / (displayed.length - 1)) * (width - padding * 2),
    y: height - padding - ((point.value - minimum) / range) * (height - padding * 2),
  }));

  return (
    <svg
      className="growth-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`年齢ごとのOVR推移。${displayed
        .map((point) => `${point.age}歳 ${point.value}`)
        .join('、')}`}
    >
      <line className="growth-chart__grid" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      <polyline
        className="growth-chart__line"
        points={coordinates.map((point) => `${point.x},${point.y}`).join(' ')}
      />
      {coordinates.map((point) => (
        <g key={`${point.age}-${point.x}`}>
          <circle className="growth-chart__point" cx={point.x} cy={point.y} r={5} />
          <text className="growth-chart__label" x={point.x} y={height - 7}>
            {point.age}歳
          </text>
          <text className="growth-chart__label" x={point.x} y={point.y - 10}>
            {point.value}
          </text>
        </g>
      ))}
    </svg>
  );
}

function yearlyRows(yearlyStats: Record<string, unknown[]>, playerId: string): YearlyRow[] {
  const rows: YearlyRow[] = [];
  for (const [year, entries] of Object.entries(yearlyStats)) {
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      let candidate: unknown;
      if (entry.playerId === playerId || entry.id === playerId || entry.pid === playerId) {
        candidate = entry.stats ?? entry;
      } else if (isRecord(entry[playerId])) {
        candidate = entry[playerId];
      }
      if (isPlayerStats(candidate)) rows.push({ year, stats: candidate });
    }
  }
  return rows.sort((first, second) => second.year.localeCompare(first.year));
}

const positionStyle = (aptitude: number): CSSProperties =>
  ({ '--aptitude': `${Math.max(0, Math.min(100, aptitude))}%` }) as CSSProperties;

function BasicTab({ player, overall }: { player: Player; overall: number }) {
  const abilities = player.isP
    ? [
        ['球速', player.p.vel],
        ['制球', player.p.ctrl],
        ['スタミナ', player.p.stam],
        ['ノビ', player.p.nobi],
        ['守備', player.p.fld],
      ]
    : [
        ['直球対応', player.p.cf],
        ['変化対応', player.p.cb],
        ['長打力', player.p.pw],
        ['選球眼', player.p.dc],
        ['走力', player.p.sp],
        ['守備力', player.p.df],
        ['肩力', player.p.arm],
        ['バント', player.p.bnt],
      ];
  const positions =
    player.positions?.length
      ? [...player.positions].sort((first, second) => second.apt - first.apt)
      : player.pos
        ? [{ pos: player.pos, apt: 100 }]
        : [];

  return (
    <div className="detail-grid">
      <Card className="detail-card" ariaLabel="選手基本情報">
        <SectionTitle>Profile</SectionTitle>
        <dl className="identity-list">
          <div>
            <dt>年齢</dt>
            <dd>{player.age}歳</dd>
          </div>
          <div>
            <dt>役割</dt>
            <dd>{player.isP ? player.role : player.pos}</dd>
          </div>
          <div>
            <dt>投打</dt>
            <dd>{player.hand.th ?? '-'}投 {player.hand.bat ?? '-'}打</dd>
          </div>
          <div>
            <dt>
              <TermTooltip
                term="OVR"
                description="複数の能力値を役割ごとの重みでまとめた総合評価です。"
              />
            </dt>
            <dd>{overall}</dd>
          </div>
        </dl>
      </Card>
      <Card className="detail-card" ariaLabel="能力値">
        <SectionTitle>Abilities</SectionTitle>
        <div className="ability-list">
          {abilities.map(([label, value]) => (
            <AbilityBar key={String(label)} label={String(label)} value={value as number | undefined} />
          ))}
        </div>
      </Card>
      {!player.isP && (
        <Card className="detail-card detail-card--wide" ariaLabel="ポジション適性">
          <SectionTitle>Position Aptitude</SectionTitle>
          {positions.length ? (
            <div className="position-grid">
              {positions.map((position) => (
                <div
                  className="position-chip"
                  key={position.pos}
                  style={positionStyle(position.apt)}
                  aria-label={`${position.pos} 適性 ${position.apt}`}
                >
                  <span>
                    <span>{position.pos}</span>
                    <strong>{position.apt}</strong>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>ポジション適性が登録されていません。</EmptyState>
          )}
        </Card>
      )}
      <Card className="detail-card detail-card--wide" ariaLabel="能力値推移">
        <SectionTitle>Growth History</SectionTitle>
        <GrowthChart player={player} overall={overall} />
      </Card>
    </div>
  );
}

function SpecialTab({ player }: { player: Player }) {
  const specials = player.specials ?? [];
  if (!specials.length) return <EmptyState>特殊能力はありません。</EmptyState>;
  return (
    <Card className="detail-card" ariaLabel="特殊能力一覧">
      <SectionTitle>Special Abilities</SectionTitle>
      <div className="special-list">
        {specials.map((special) => {
          const level = specialLevel(player, special.id);
          const tier = special.rarity === 'gold' ? 'gold' : level >= 3 ? 'silver' : 'bronze';
          const icon = tier === 'gold' ? '★' : tier === 'silver' ? '◆' : '●';
          const tierLabel = tier === 'gold' ? '金' : tier === 'silver' ? '銀' : '銅';
          return (
            <span
              className={`special-badge special-badge--${tier}`}
              key={special.id}
              aria-label={`${tierLabel}特殊能力 ${special.n}${special.rarity === 'gold' ? '' : ` レベル${level}`}`}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{special.n}</span>
              {special.rarity !== 'gold' && <span>Lv{level}</span>}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

export function PlayerDetailModal({
  player,
  accumulated,
  careerAccumulated,
  yearlyStats,
  roster,
  onSelect,
  onClose,
}: {
  player: Player | null;
  accumulated: AccumulatedStats;
  careerAccumulated: AccumulatedStats;
  yearlyStats: Record<string, unknown[]>;
  roster: Player[];
  onSelect(player: Player): void;
  onClose(): void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!player) return;
    setActiveTab('basic');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [player]);

  useEffect(() => {
    if (!player) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, player]);

  if (!player) return null;
  const overall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
  const current = accumulated[player.id];
  const career = careerAccumulated[player.id];
  const history = yearlyRows(yearlyStats, player.id);
  const currentIndex = roster.findIndex((candidate) => candidate.id === player.id);
  const canNavigate = roster.length > 1 && currentIndex >= 0;

  const navigate = (offset: number) => {
    if (!canNavigate) return;
    const index = (currentIndex + offset + roster.length) % roster.length;
    const target = roster[index];
    if (target) onSelect(target);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`player-tab-${nextTab.id}`)?.focus());
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (deltaY > 90 && Math.abs(deltaY) > Math.abs(deltaX)) {
      onClose();
      return;
    }
    if (Math.abs(deltaX) > 75 && Math.abs(deltaX) > Math.abs(deltaY)) {
      navigate(deltaX < 0 ? 1 : -1);
    }
  };

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
        aria-labelledby="player-modal-title"
        aria-describedby="player-modal-description"
        tabIndex={-1}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="player-modal-title">
              {player.name}
            </h1>
            <div className="player-modal__meta" id="player-modal-description">
              <span>{player.age}歳</span>
              <span>{player.isP ? player.role : player.pos}</span>
              <span>
                <TermTooltip
                  term="OVR"
                  description="複数の能力値を役割ごとの重みでまとめた総合評価です。"
                />{' '}
                {overall}
              </span>
              <PlayerStatusBadges player={player} />
            </div>
          </div>
          <Button onClick={onClose} color="var(--color-surface-muted)" ariaLabel="選手詳細を閉じる">
            閉じる
          </Button>
        </header>

        <div className="player-modal__tabs" role="tablist" aria-label="選手詳細の表示項目">
          {tabs.map((tab, index) => (
            <button
              className="player-modal__tab"
              id={`player-tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`player-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="player-modal__body">
          <div
            id={`player-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`player-tab-${activeTab}`}
          >
            {activeTab === 'basic' && <BasicTab player={player} overall={overall} />}
            {activeTab === 'season' && (
              <Card className="detail-card" ariaLabel="今季成績">
                <SectionTitle>Current Season</SectionTitle>
                <StatGrid stats={current} />
              </Card>
            )}
            {activeTab === 'career' && (
              <div className="detail-grid">
                <Card className="detail-card detail-card--wide" ariaLabel="通算成績">
                  <SectionTitle>Career</SectionTitle>
                  <StatGrid stats={career} />
                </Card>
                <Card className="detail-card detail-card--wide" ariaLabel="年度別成績">
                  <SectionTitle>Year by Year</SectionTitle>
                  {history.length ? (
                    <div className="detail-grid">
                      {history.map((row, index) => (
                        <Card
                          className="detail-card"
                          key={`${row.year}-${index}`}
                          ariaLabel={`${row.year}年成績`}
                        >
                          <SectionTitle>{row.year}年</SectionTitle>
                          <StatGrid stats={row.stats} />
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>年度別成績はまだ保存されていません。</EmptyState>
                  )}
                </Card>
              </div>
            )}
            {activeTab === 'special' && <SpecialTab player={player} />}
          </div>
        </div>

        <footer className="player-modal__footer" aria-label="同一ロスター内の選手移動">
          <Button
            onClick={() => navigate(-1)}
            disabled={!canNavigate}
            color="var(--color-surface-muted)"
            ariaLabel="前の選手を表示"
          >
            ← 前の選手
          </Button>
          <span className="player-modal__counter" aria-live="polite">
            {canNavigate ? `${currentIndex + 1} / ${roster.length}` : 'ロスター内移動なし'}
          </span>
          <Button
            onClick={() => navigate(1)}
            disabled={!canNavigate}
            color="var(--color-surface-muted)"
            ariaLabel="次の選手を表示"
          >
            次の選手 →
          </Button>
        </footer>
      </div>
    </div>
  );
}
