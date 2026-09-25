import { useMemo } from 'react';

import { ACTIVE_ROSTER_BALANCE } from '../../data';
import { calcOVR, effectiveOVR } from '../../engine';
import type { Player, Team } from '../../engine';
import { Button, Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function playerOverall(player: Player): number {
  if (player.isP) return calcOVR(player);
  return effectiveOVR(player, player._assignedPos ?? player.pos);
}

function SquadRow({
  player,
  onSelectPlayer,
  onToggleActive,
  promotionBlocked,
}: {
  player: Player;
  onSelectPlayer(player: Player): void;
  onToggleActive(player: Player): void;
  promotionBlocked: boolean;
}) {
  const active = player.activeRoster !== false;
  const blocked = !active && promotionBlocked;
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
          {player.isP ? player.role : (player._assignedPos ?? player.pos)} / OVR{' '}
          {playerOverall(player)}
        </div>
        <div style={{ marginTop: 2 }}>
          <PlayerStatusBadges player={player} compact />
        </div>
      </div>
      <button
        type="button"
        aria-label={
          blocked
            ? `一軍登録が上限のため${player.name}を登録できません`
            : active
              ? `${player.name}を二軍へ登録`
              : `${player.name}を一軍へ登録`
        }
        disabled={blocked}
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
          cursor: blocked ? 'not-allowed' : 'pointer',
          opacity: blocked ? 0.5 : 1,
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
  promotionBlocked = false,
}: {
  title: string;
  players: Player[];
  emptyText: string;
  onSelectPlayer(player: Player): void;
  onToggleActive(player: Player): void;
  promotionBlocked?: boolean;
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
              promotionBlocked={promotionBlocked}
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
  onAutoAssign,
}: {
  team: Team;
  onSelectPlayer(player: Player): void;
  onToggleActive(player: Player): void;
  /** Let the AI register the 一軍 as CPU clubs do. */
  onAutoAssign?(): void;
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

  const activeTotal = grouped.pitchers.active.length + grouped.fielders.active.length;
  const full = activeTotal >= ACTIVE_ROSTER_BALANCE.limit;
  return (
    <Card ariaLabel="一軍・二軍の登録状況" style={{ marginBottom: 12 }}>
      <SectionTitle>一軍・二軍の登録</SectionTitle>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 12 }}>
        選手のボタンで一軍・二軍を切り替えます。一軍登録は{ACTIVE_ROSTER_BALANCE.limit}
        人までです。開幕時とおまかせ進行中は、投手{ACTIVE_ROSTER_BALANCE.pitchers}
        人・野手{ACTIVE_ROSTER_BALANCE.limit - ACTIVE_ROSTER_BALANCE.pitchers}
        人を自動で登録します。CPU球団は毎週、故障者の抹消と入れ替えを行います。
      </div>
      <div
        aria-live="polite"
        style={{
          fontSize: 13,
          fontWeight: 800,
          marginBottom: 10,
          color: full ? 'var(--color-warning)' : undefined,
        }}
      >
        一軍登録 {activeTotal}/{ACTIVE_ROSTER_BALANCE.limit}人（投手
        {grouped.pitchers.active.length}・野手{grouped.fielders.active.length}）
      </div>
      {onAutoAssign && (
        <div style={{ marginBottom: 12 }}>
          <Button onClick={onAutoAssign} ariaLabel="AIの判断で一軍登録を組み直す">
            AIで一軍を登録
          </Button>
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-faint)' }}>
            故障者を外し、先発6・抑え2を含む投手
            {ACTIVE_ROSTER_BALANCE.pitchers}人と野手
            {ACTIVE_ROSTER_BALANCE.limit - ACTIVE_ROSTER_BALANCE.pitchers}人を選びます。
          </span>
        </div>
      )}
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div
            style={{
              color: 'var(--color-text-faint)',
              fontSize: 11,
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            野手
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))',
              gap: 14,
            }}
          >
            <SquadColumn
              title="一軍"
              players={grouped.fielders.active}
              emptyText="一軍登録の野手がいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
            <SquadColumn
              title="二軍"
              promotionBlocked={full}
              players={grouped.fielders.inactive}
              emptyText="二軍登録の野手はいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
          </div>
        </div>
        <div>
          <div
            style={{
              color: 'var(--color-text-faint)',
              fontSize: 11,
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            投手
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))',
              gap: 14,
            }}
          >
            <SquadColumn
              title="一軍"
              players={grouped.pitchers.active}
              emptyText="一軍登録の投手がいません。"
              onSelectPlayer={onSelectPlayer}
              onToggleActive={onToggleActive}
            />
            <SquadColumn
              title="二軍"
              promotionBlocked={full}
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
