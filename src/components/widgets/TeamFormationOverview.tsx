import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function FormationRow({
  index,
  player,
  subLabel,
  onSelectPlayer,
}: {
  index: number;
  player: Player;
  subLabel: string;
  onSelectPlayer(player: Player): void;
}) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '30px minmax(0,1fr) auto',
        alignItems: 'center',
        gap: 8,
        minHeight: 50,
        padding: '7px 9px',
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
          {subLabel}
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
        <div style={{ marginTop: 2 }}>
          <PlayerStatusBadges player={player} compact />
        </div>
      </div>
      <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{calcOVR(player)}</strong>
    </li>
  );
}

function FormationList({
  title,
  ariaLabel,
  emptyText,
  rows,
  onSelectPlayer,
}: {
  title: string;
  ariaLabel: string;
  emptyText: string;
  rows: { player: Player; subLabel: string }[];
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
  onSelectPlayer,
}: {
  lineup: Player[];
  rotation: Player[];
  bullpenClosers: Player[];
  bullpenRelievers: Player[];
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
        gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
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
        onSelectPlayer={onSelectPlayer}
      />
      <FormationList
        title="Rotation"
        ariaLabel="現在の先発ローテーション"
        emptyText="先発ロールの投手がいません。"
        rows={rotation.map((player) => ({
          player,
          subLabel: `スタミナ ${Math.round(player.p.stam)}`,
        }))}
        onSelectPlayer={onSelectPlayer}
      />
      <FormationList
        title="Bullpen"
        ariaLabel="現在のブルペン編成"
        emptyText="ブルペン投手がいません。"
        rows={bullpenRows}
        onSelectPlayer={onSelectPlayer}
      />
    </div>
  );
}
