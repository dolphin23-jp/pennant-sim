import { calcOVR } from '../../engine';
import type { AccumulatedStats, BatterStats, PitcherStats, Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function battingAverage(stats: BatterStats): string {
  return stats.ab > 0 ? (stats.h / stats.ab).toFixed(3).replace(/^0/, '') : '.---';
}

function earnedRunAverage(stats: PitcherStats): string {
  return stats.ip3 > 0 ? ((stats.er * 27) / stats.ip3).toFixed(2) : '-.--';
}

function inningsPitched(ip3: number): string {
  return `${Math.floor(ip3 / 3)}.${ip3 % 3}`;
}

function seasonStatLine(player: Player, statsSource: AccumulatedStats): string {
  const stats = statsSource[player.id];
  if (!stats) return '今季出場なし';
  if (stats.type === 'bat') {
    return `${stats.g}試合 ${battingAverage(stats)} ${stats.hr}本 ${stats.rbi}打点 ${stats.sb}盗塁`;
  }
  return `${stats.g}登板 ${stats.w}勝${stats.l}敗 防${earnedRunAverage(stats)} ${inningsPitched(stats.ip3)}回 ${stats.k}奪三振`;
}

function conditionLabel(player: Player): string {
  const raw = player.condition ?? player.form;
  if (typeof raw === 'number') return `調子 ${Math.round(raw)}`;
  if (typeof raw === 'string') {
    const normalized = raw.toLowerCase();
    if (['good', 'hot', '好調'].includes(normalized)) return '調子 好調';
    if (['bad', 'cold', '不調'].includes(normalized)) return '調子 不調';
    return `調子 ${raw}`;
  }
  return '調子 標準';
}

function workloadLabel(player: Player): string {
  const fatigue = Math.round(player.fatigue ?? 0);
  if ((player.injuryDays ?? 0) > 0) return `故障 復帰まで${player.injuryDays}日`;
  return `疲労 ${fatigue}`;
}

function FormationRow({
  index,
  player,
  subLabel,
  statsSource,
  onSelectPlayer,
}: {
  index: number;
  player: Player;
  subLabel: string;
  statsSource: AccumulatedStats;
  onSelectPlayer(player: Player): void;
}) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '30px minmax(0,1fr) auto',
        alignItems: 'center',
        gap: 8,
        minHeight: 72,
        padding: '8px 9px',
        border: '1px solid var(--color-border)',
        borderRadius: 9,
        background: 'var(--color-surface-raised)',
      }}
    >
      <strong
        aria-hidden="true"
        style={{
          display: 'grid',
          width: 28,
          height: 28,
          placeItems: 'center',
          borderRadius: 999,
          color: 'var(--color-accent)',
          background: 'var(--color-accent-soft)',
          fontFamily: 'var(--font-display)',
          fontSize: 13,
        }}
      >
        {index + 1}
      </strong>
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          className="roster-player-button"
          aria-label={`${player.name}の詳細を表示${player.activeRoster === false ? '、二軍登録中' : ''}`}
          onClick={() => onSelectPlayer(player)}
          style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {player.name}
        </button>
        <div style={{ marginTop: 2, color: 'var(--color-text-muted)', fontSize: 11 }}>
          {subLabel} / {player.age}歳
          {player.activeRoster === false && (
            <span
              title="二軍に登録されています"
              style={{
                marginLeft: 5,
                padding: '1px 4px',
                borderRadius: 4,
                color: 'var(--color-warning)',
                background: 'color-mix(in srgb, var(--color-warning) 20%, transparent)',
                fontSize: 9,
                fontWeight: 900,
              }}
            >
              二軍
            </span>
          )}
        </div>
        <div style={{ marginTop: 3, color: 'var(--color-text)', fontSize: 11, fontWeight: 700 }}>
          {seasonStatLine(player, statsSource)}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 3,
            color: 'var(--color-text-faint)',
            fontSize: 10,
            flexWrap: 'wrap',
          }}
        >
          <span>{conditionLabel(player)}</span>
          <span>{workloadLabel(player)}</span>
          <PlayerStatusBadges player={player} compact />
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: 'var(--color-text-faint)', fontSize: 9, fontWeight: 800 }}>OVR</div>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{calcOVR(player)}</strong>
      </div>
    </li>
  );
}

function FormationList({
  title,
  ariaLabel,
  emptyText,
  rows,
  statsSource,
  onSelectPlayer,
}: {
  title: string;
  ariaLabel: string;
  emptyText: string;
  rows: { player: Player; subLabel: string }[];
  statsSource: AccumulatedStats;
  onSelectPlayer(player: Player): void;
}) {
  return (
    <Card ariaLabel={ariaLabel}>
      <SectionTitle>{title}</SectionTitle>
      {!rows.length ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <ol style={{ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
          {rows.map(({ player, subLabel }, index) => (
            <FormationRow
              key={player.id}
              index={index}
              player={player}
              subLabel={subLabel}
              statsSource={statsSource}
              onSelectPlayer={onSelectPlayer}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

export function TeamFormationOverview({
  lineup,
  rotation,
  bullpenClosers,
  bullpenRelievers,
  statsSource,
  onSelectPlayer,
}: {
  lineup: Player[];
  rotation: Player[];
  bullpenClosers: Player[];
  bullpenRelievers: Player[];
  statsSource: AccumulatedStats;
  onSelectPlayer(player: Player): void;
}) {
  const bullpenRows = [
    ...bullpenClosers.map((player) => ({ player, subLabel: '抑え' })),
    ...bullpenRelievers.map((player) => ({ player, subLabel: 'リリーフ' })),
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <FormationList
        title="Batting Order"
        ariaLabel="現在の打順"
        emptyText="打順に選手がいません。"
        rows={lineup.map((player) => ({
          player,
          subLabel: `${player._assignedPos ?? player.pos}${player.hand.bat ? ` / ${player.hand.bat}打` : ''}`,
        }))}
        statsSource={statsSource}
        onSelectPlayer={onSelectPlayer}
      />
      <FormationList
        title="Rotation"
        ariaLabel="現在の先発ローテーション"
        emptyText="先発ロールの投手がいません。"
        rows={rotation.map((player) => ({
          player,
          subLabel: `先発 / スタミナ ${Math.round(player.p.stam)}`,
        }))}
        statsSource={statsSource}
        onSelectPlayer={onSelectPlayer}
      />
      <FormationList
        title="Bullpen"
        ariaLabel="現在のブルペン編成"
        emptyText="ブルペン投手がいません。"
        rows={bullpenRows}
        statsSource={statsSource}
        onSelectPlayer={onSelectPlayer}
      />
    </div>
  );
}
