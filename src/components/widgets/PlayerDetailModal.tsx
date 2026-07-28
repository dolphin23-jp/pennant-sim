import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type TouchEvent,
} from 'react';

import {
  FIELD_POSITIONS,
  MATURITY_PEAK_AGE,
  PLAYER_DEVELOPMENT_BALANCE,
  SPECIAL_DESCRIPTIONS,
  SPECIAL_INDEX,
  TINFO,
} from '../../data';
import {
  aptitudeRank,
  calcOVR,
  cancelPositionConversion,
  displayOVRBreakdown,
  effectiveOVR,
  specialLevel,
  startPositionConversion,
  statItems,
  velocityKmhText,
  yearlyRows,
} from '../../engine';
import type {
  AccumulatedStats,
  FieldPosition,
  Player,
  PlayerStats,
  SeasonTitleRecord,
  TeamKey,
} from '../../engine';
import { Button, Card, EmptyState, LampFigure, SectionTitle, TermTooltip } from '../ui';
import { TitleIcon } from '../icons';
import { AbilityRadarChart, type AbilityRadarItem } from './AbilityRadarChart';
import { AptitudeFieldMap } from './AptitudeFieldMap';
import { DisplayOVRValue } from './DisplayOVRValue';
import { PlayerEditTab } from './PlayerEditTab';
import { PlayerStatusBadges } from './PlayerStatusBadges';
import { useFocusTrap } from './useFocusTrap';

const TEAM_KEY_SET = new Set<string>(Object.keys(TINFO));

function teamColorFor(player: Player): string | null {
  const candidate = String(player.tk);
  return TEAM_KEY_SET.has(candidate) ? TINFO[candidate as TeamKey].c : null;
}

type TabId = 'basic' | 'season' | 'career' | 'special' | 'edit';
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
const DEBUG_EDIT_TAB: { id: TabId; label: string } = { id: 'edit', label: '編集(Debug)' };

function StatGrid({ stats }: { stats: PlayerStats | undefined }) {
  const items = statItems(stats);
  if (!items.length) return <EmptyState>記録された成績はありません。</EmptyState>;
  return (
    <dl className="stat-grid">
      {items.map((item, index) => (
        <div key={`${item.label}-${item.value}-${index}`}>
          <dt>
            {item.description ? (
              <TermTooltip term={item.label} description={item.description} />
            ) : (
              item.label
            )}
          </dt>
          <dd
            className={item.elite ? 'stat-value--elite' : item.power ? 'metric-power' : undefined}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const ABILITY_DISPLAY_MAX = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;

function AbilityBar({
  label,
  value,
  displayText,
}: {
  label: string;
  value: number | undefined;
  displayText?: string;
}) {
  const rounded = Math.round(value ?? 0);
  const percentage = Math.max(0, Math.min(100, (rounded / ABILITY_DISPLAY_MAX) * 100));
  const strong = rounded >= 50;
  const text = displayText ?? String(rounded);
  return (
    <div className={`ability-row${strong ? ' ability-row--strong' : ''}`}>
      <div className="ability-row__label">
        <span>{label}</span>
        <strong>{text}</strong>
      </div>
      <div
        className="ability-meter"
        role="meter"
        aria-label={`${label} ${text}`}
        aria-valuemin={0}
        aria-valuemax={ABILITY_DISPLAY_MAX}
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
      <line
        className="growth-chart__grid"
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
      />
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

const positionStyle = (aptitude: number): CSSProperties =>
  ({ '--aptitude': `${Math.max(0, Math.min(100, aptitude))}%` }) as CSSProperties;

function ConversionControls({
  player,
  onUpdatePlayer,
}: {
  player: Player;
  onUpdatePlayer(player: Player): void;
}) {
  const [target, setTarget] = useState<FieldPosition | ''>('');
  const active = player.conversionTarget;
  const candidates = FIELD_POSITIONS.filter((pos) => {
    if (pos === player.pos) return false;
    const apt = player.positions?.find((entry) => entry.pos === pos)?.apt ?? 0;
    return apt < 45;
  });

  if (active) {
    const apt = player.positions?.find((entry) => entry.pos === active.pos)?.apt ?? 0;
    return (
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          {active.pos}への守備適性訓練中（{active.startedAge}歳開始・現在適性{apt}%）
        </span>
        <Button
          onClick={() => onUpdatePlayer(cancelPositionConversion(player))}
          color="var(--color-surface-muted)"
          ariaLabel="守備位置コンバート練習を中止"
        >
          練習を中止
        </Button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {candidates.length ? (
        <>
          <select
            aria-label="コンバート練習の対象ポジション"
            value={target}
            onChange={(event) => setTarget(event.target.value as FieldPosition | '')}
            style={{
              padding: '7px 9px',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)',
              background: 'var(--color-surface-raised)',
            }}
          >
            <option value="">コンバート先のポジションを選択</option>
            {candidates.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
          <Button
            onClick={() => target && onUpdatePlayer(startPositionConversion(player, target))}
            disabled={!target}
            color="var(--color-surface-muted)"
            ariaLabel="選択したポジションのコンバート練習を開始"
          >
            コンバート練習を開始
          </Button>
        </>
      ) : (
        <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>
          適性の低い（45%未満の）別ポジションがありません。
        </span>
      )}
    </div>
  );
}

function BasicTab({
  player,
  overall,
  onUpdatePlayer,
}: {
  player: Player;
  overall: number;
  onUpdatePlayer?(player: Player): void;
}) {
  const abilities: AbilityRadarItem[] = player.isP
    ? [
        { label: '球速', value: player.p.vel, displayText: velocityKmhText(player.p.vel) },
        { label: '制球', value: player.p.ctrl },
        { label: 'スタミナ', value: player.p.stam },
        { label: 'ノビ', value: player.p.nobi },
        { label: '守備', value: player.p.fld },
      ]
    : [
        { label: '直球対応', value: player.p.cf },
        { label: '変化対応', value: player.p.cb },
        { label: '長打力', value: player.p.pw },
        { label: '選球眼', value: player.p.dc },
        { label: '走力', value: player.p.sp },
        { label: '守備力', value: player.p.df },
        { label: '肩力', value: player.p.arm },
        { label: 'バント', value: player.p.bnt },
      ];
  const radarAbilities = player.isP
    ? abilities
    : abilities.filter((ability) => ability.label !== 'バント');
  const positions = player.positions?.length
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
            <dt>
              <TermTooltip
                term="成長タイプ"
                description="能力が伸びやすい時期と、衰え始める時期の目安です。ピーク後の低下は年数とともに強くなります。"
              />
            </dt>
            <dd>
              {player.mat}（目安{MATURITY_PEAK_AGE[player.mat]}歳）
            </dd>
          </div>
          <div>
            <dt>投打</dt>
            <dd>
              {player.hand.th ?? '-'}投 {player.hand.bat ?? '-'}打
            </dd>
          </div>
          {player.foreignProfile && (
            <>
              <div>
                <dt>出身</dt>
                <dd>{player.foreignProfile.origin}</dd>
              </div>
              <div>
                <dt>NPB在籍</dt>
                <dd>{player.foreignProfile.npbSeasons}季</dd>
              </div>
              <div>
                <dt>残り契約</dt>
                <dd>{player.foreignProfile.contractYearsRemaining}年</dd>
              </div>
              <div>
                <dt>
                  <TermTooltip
                    term="適応"
                    description="日本野球への適応度です。1.00を基準に、実際の打席・投球能力へ反映されます。毎年の経験と成績で変化します。"
                  />
                </dt>
                <dd>{player.foreignProfile.adaptationFactor.toFixed(2)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>
              <TermTooltip
                term="総合値"
                description="基本総合値は従来の実効OVR、特殊込みは特殊能力を表示上だけ加減した値です。"
              />
            </dt>
            <dd>
              <DisplayOVRValue player={player} position={player.isP ? undefined : player.pos} />
            </dd>
          </div>
        </dl>
      </Card>
      <Card className="detail-card detail-card--wide" ariaLabel="能力値">
        <SectionTitle>Abilities</SectionTitle>
        <div className="abilities-layout">
          <AbilityRadarChart items={radarAbilities} />
          <div className="ability-list">
            {abilities.map((ability) => (
              <AbilityBar
                key={ability.label}
                label={ability.label}
                value={ability.value}
                displayText={ability.displayText}
              />
            ))}
          </div>
        </div>
      </Card>
      {!player.isP && (
        <Card className="detail-card detail-card--wide" ariaLabel="ポジション適性">
          <SectionTitle>Position Aptitude</SectionTitle>
          {positions.length ? (
            <>
              <AptitudeFieldMap positions={positions} />
              <div className="position-grid">
                {positions.map((position) => {
                  const rank = aptitudeRank(position.apt);
                  return (
                    <div
                      className="position-chip"
                      key={position.pos}
                      style={positionStyle(position.apt)}
                      aria-label={`${position.pos} 適性ランク ${rank}、${position.apt}%`}
                    >
                      <span>
                        <span>{position.pos}</span>
                        <strong>
                          {rank} {position.apt}%
                        </strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState>ポジション適性が登録されていません。</EmptyState>
          )}
          {onUpdatePlayer && <ConversionControls player={player} onUpdatePlayer={onUpdatePlayer} />}
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
          const definition = SPECIAL_INDEX[special.id] ?? special;
          const level = specialLevel(player, special.id);
          const tier = definition.rarity === 'gold' ? 'gold' : level >= 3 ? 'silver' : 'bronze';
          const icon = tier === 'gold' ? '★' : tier === 'silver' ? '◆' : '●';
          const tierLabel = tier === 'gold' ? '金' : tier === 'silver' ? '銀' : '銅';
          return (
            <div
              className="special-ability-detail"
              key={special.id}
              aria-label={`${tierLabel}特殊能力 ${definition.n}${definition.rarity === 'gold' ? '' : ` レベル${level}`}。${SPECIAL_DESCRIPTIONS[special.id] ?? '試合中の能力判定へ補正を加えます。'}`}
            >
              <span className={`special-badge special-badge--${tier}`}>
                <span aria-hidden="true">{icon}</span>
                <span>{definition.n}</span>
                {definition.rarity !== 'gold' && <span>Lv{level}</span>}
              </span>
              <p>{SPECIAL_DESCRIPTIONS[special.id] ?? '試合中の能力判定へ補正を加えます。'}</p>
            </div>
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
  awardHistory,
  roster,
  onSelect,
  onClose,
  debugMode = false,
  onUpdatePlayer,
  isOwnTeam = false,
}: {
  player: Player | null;
  accumulated: AccumulatedStats;
  careerAccumulated: AccumulatedStats;
  yearlyStats: Record<string, unknown[]>;
  awardHistory: SeasonTitleRecord[];
  roster: Player[];
  onSelect(player: Player): void;
  onClose(): void;
  /** Dev/QA-only: shows the "編集(Debug)" tab and lets it write changes back. */
  debugMode?: boolean;
  onUpdatePlayer?(player: Player): void;
  /** Gates position-conversion practice to the viewer's own roster. */
  isOwnTeam?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const visibleTabs = debugMode && onUpdatePlayer ? [...tabs, DEBUG_EDIT_TAB] : tabs;
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
    // Re-run only when navigating to a different player (by id), not when the same
    // player's object is replaced in place - e.g. after a debug edit saves, which would
    // otherwise reset the active tab and steal focus away from the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  useEffect(() => {
    if (!player) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, player]);

  useFocusTrap(dialogRef, Boolean(player));

  if (!player) return null;
  const baseOverall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
  const headline = displayOVRBreakdown(player, player.isP ? undefined : player.pos);
  const teamColor = teamColorFor(player);
  const current = accumulated[player.id];
  const career = careerAccumulated[player.id];
  const history = yearlyRows(yearlyStats, player.id);
  const titles = awardHistory
    .filter((record) => record.playerId === player.id)
    .sort((first, second) => second.year - first.year);
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
    const nextIndex = (index + direction + visibleTabs.length) % visibleTabs.length;
    const nextTab = visibleTabs[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    window.requestAnimationFrame(() =>
      document.getElementById(`player-tab-${nextTab.id}`)?.focus(),
    );
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
        <header
          className="player-modal__header"
          style={{
            borderLeft: `5px solid ${teamColor ?? 'var(--color-accent)'}`,
          }}
        >
          <div>
            <h1 className="player-modal__title" id="player-modal-title">
              {player.name}
            </h1>
            <div className="player-modal__meta" id="player-modal-description">
              <span
                className="player-modal__ticket"
                style={{ borderColor: teamColor ?? undefined }}
              >
                {player.age}歳
              </span>
              <span
                className="player-modal__ticket"
                style={{ borderColor: teamColor ?? undefined }}
              >
                {player.isP ? player.role : player.pos}
              </span>
              <PlayerStatusBadges player={player} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: '0 0 auto' }}>
            <LampFigure
              label="特殊込みOVR"
              value={headline.total}
              elite={headline.total >= 80}
              compact
              ariaLabel={`特殊込みOVR ${headline.total}、基本総合値 ${headline.base}から算出`}
            />
            <Button
              onClick={onClose}
              color="var(--color-surface-muted)"
              ariaLabel="選手詳細を閉じる"
            >
              閉じる
            </Button>
          </div>
        </header>

        <div className="player-modal__tabs" role="tablist" aria-label="選手詳細の表示項目">
          {visibleTabs.map((tab, index) => (
            <button
              className="player-modal__tab"
              id={`player-tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-label={`${tab.label}を表示`}
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
            {activeTab === 'basic' && (
              <BasicTab
                player={player}
                overall={baseOverall}
                onUpdatePlayer={isOwnTeam ? onUpdatePlayer : undefined}
              />
            )}
            {activeTab === 'season' && (
              <Card className="detail-card" ariaLabel="今季成績">
                <SectionTitle>Current Season</SectionTitle>
                <StatGrid stats={current} />
              </Card>
            )}
            {activeTab === 'career' && (
              <div className="detail-grid">
                <Card className="detail-card detail-card--wide" ariaLabel="獲得タイトル">
                  <SectionTitle>Titles</SectionTitle>
                  {titles.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {titles.map((record) => (
                        <span
                          className="special-badge special-badge--gold"
                          key={`${record.year}:${record.league}:${record.titleId}`}
                        >
                          <TitleIcon titleId={record.titleId} size={13} />
                          {record.year} {record.titleLabel}（{record.displayValue}）
                        </span>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>獲得タイトルはまだありません。</EmptyState>
                  )}
                </Card>
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
            {activeTab === 'edit' && debugMode && onUpdatePlayer && (
              <PlayerEditTab player={player} onSave={onUpdatePlayer} />
            )}
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
