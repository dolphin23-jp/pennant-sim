import { useMemo } from 'react';

import { calcOVR, effectiveOVR } from '../../engine';
import type { Player, Team } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function playerOverall(player: Player): number {
  if (player.isP) return calcOVR(player);
  return effectiveOVR(player, player._assignedPos ?? player.pos);
}

function SquadRow({
  player,
  onSelectPlayer,
  onToggleActive,
}: {
  player: Player;
  onSelectPlayer(player: Player): void;
  onToggleActive(player: Player): void;
}) {
  const active = player.activeRoster !== false;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto',
        alignItems: 'center',
        gap: 8,
        padding: '7px 9px',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-surface-raised)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          className="roster-player-button"
          aria-label={`${player.name}の詳細を表示`}
          onClick={() => onSelectPlayer(player)}
          style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {player.name}
        </button>
        <div style={{ marginTop: 2, color: 'var(--color-text-muted)', fontSize: 10 }}>
          {player.isP ? player.role : (player._assignedPos ?? player.pos)} / OVR {playerOverall(player)}
        </div>
        <div style={{ marginTop: 2 }}>
          <PlayerStatusBadges player={player} compact />
        </div>
      </div>
      <button
        type="button"
        aria-label={active ? `${player.name}を二軍へ登録` : `${player.name}を一軍へ登録`}
        onClick={() => onToggleActive(player)}
        style={{
          minHeight: 30,
          padding: '5px 8px',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 7,
          color: active ? 'var(--color-warning)' : 'var(--color-accent)',
          background: 'var(--color-surface)',
          fontSize: 10,
          fontWeight: 900,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {active ? '二軍へ' : '一軍へ'}
      </button>
    </div>
  );
}

function SquadColumn({
  title,
  players,
  emptyText,
  onSelectPlayer,
  onToggleActive,
}: {
  title: string;
  players: Player[];
  emptyText: string;
  onSelectPlayer(player: Player): void;
  onToggleActive(player: Player): void;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            color: 'var(--color-text-faint)',
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>{players.length}名</span>
      </div>
      {!players.length ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))',
            gap: 6,
          }}
        >
          {players.map((player) => (
            <SquadRow
              key={player.id}
              player={player}
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SquadBoard({
  team,
  onSelectPlayer,
  onToggleActive,
}: {
  team: Team;
  onSelectPlayer(player: Player): void;
  onToggleActive(player: Player): void;
}) {
  const grouped = useMemo(() => {
    const byActive = (players: Player[]) => ({
      active: players
        .filter((player) => player.activeRoster !== false)
        .sort((first, second) => playerOverall(second) - playerOverall(first)),
      inactive: players
        .filter((player) => player.activeRoster === false)
        .sort((first, second) => playerOverall(second) - playerOverall(first)),
    });
    return {
      fielders: byActive(team.fielders),
      pitchers: byActive(team.pitchers),
    };
  }, [team.fielders, team.pitchers]);

  return (
    <Card ariaLabel="一軍・二軍の登録状況" style={{ marginBottom: 12 }}>
      <SectionTitle>Squad Board</SectionTitle>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 12 }}>
        選手のボタンで一軍・二軍を切り替えます。人数上限や抹消日数の制約はまだありません。
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div
            style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 8, fontWeight: 700 }}
          >
            野手
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 14 }}>
            <SquadColumn
              title="一軍"
              players={grouped.fielders.active}
              emptyText="一軍登録の野手がいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
            <SquadColumn
              title="二軍"
              players={grouped.fielders.inactive}
              emptyText="二軍登録の野手はいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
          </div>
        </div>
        <div>
          <div
            style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 8, fontWeight: 700 }}
          >
            投手
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 14 }}>
            <SquadColumn
              title="一軍"
              players={grouped.pitchers.active}
              emptyText="一軍登録の投手がいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
            <SquadColumn
              title="二軍"
              players={grouped.pitchers.inactive}
              emptyText="二軍登録の投手はいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
