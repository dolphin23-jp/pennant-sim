import { useState } from 'react';

import { TINFO } from '../../data';
import { calcOVR, effectiveOVR, formatManYen } from '../../engine';
import type { Player, TeamKey } from '../../engine';
import { Button, Card, EmptyState, SectionTitle, teamTextColor } from '../ui';
import { PlayerStatusBadges } from '../widgets/PlayerStatusBadges';

/** Payroll against budget, with what a signing would leave. */
function BudgetSummary({
  finances,
  selected,
}: {
  finances: { payroll: number; budget: number };
  selected: Player | null;
}) {
  const room = finances.budget - finances.payroll;
  const after = selected ? room - (selected.ask ?? 0) : null;
  return (
    <div
      aria-label="球団予算"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 16px',
        padding: '8px 10px',
        marginBottom: 10,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-surface-raised)',
        fontSize: 12,
      }}
    >
      <span>予算 {formatManYen(finances.budget)}</span>
      <span>年俸総額 {formatManYen(finances.payroll)}</span>
      <strong style={{ color: room >= 0 ? 'var(--color-success)' : 'var(--color-warning)' }}>
        {room >= 0 ? `余力 ${formatManYen(room)}` : `予算超過 ${formatManYen(-room)}`}
      </strong>
      {after != null && (
        <span style={{ color: 'var(--color-text-muted)' }}>
          獲得後 {after >= 0 ? `余力 ${formatManYen(after)}` : `超過 ${formatManYen(-after)}`}
        </span>
      )}
    </div>
  );
}

function askText(player: Player): string {
  if (player.ask == null) return '';
  const years = player.askYears ?? 1;
  return years > 1 ? `${formatManYen(player.ask)}×${years}年` : formatManYen(player.ask);
}

export function MarketScreen({
  title,
  subtitle,
  players,
  accent,
  onSign,
  onNext,
  signDisabled = false,
  signDisabledReason,
  playerTeam,
  finances,
  unavailableReason,
}: {
  title: string;
  subtitle: string;
  players: Player[];
  accent: string;
  onSign(player: Player): void;
  onNext(): void;
  signDisabled?: boolean;
  signDisabledReason?: string;
  playerTeam?: TeamKey;
  finances?: { payroll: number; budget: number };
  /** Why this particular player cannot be signed (e.g. the budget), or null. */
  unavailableReason?(player: Player): string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((player) => player.id === selectedId) ?? null;
  const selectedBlocked = selected ? (unavailableReason?.(selected) ?? null) : null;
  const blockedReason = signDisabled ? (signDisabledReason ?? '獲得上限です') : selectedBlocked;
  return (
    <section aria-label={title}>
      <Card style={{ marginBottom: 14 }} ariaLabel={title}>
        <SectionTitle>{title}</SectionTitle>
        <p style={{ color: 'var(--color-text-faint)', fontSize: 12, marginTop: 0 }}>{subtitle}</p>
        {finances && <BudgetSummary finances={finances} selected={selected} />}
        {!players.length ? (
          <EmptyState>候補選手はいません。</EmptyState>
        ) : (
          <div
            role="listbox"
            aria-label={`${title}の候補選手`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
              gap: 8,
            }}
          >
            {players.map((player) => {
              const overall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
              const active = player.id === selectedId;
              const former = player.faFrom ? TINFO[player.faFrom] : null;
              const ownPlayer = player.faFrom != null && player.faFrom === playerTeam;
              const blocked = unavailableReason?.(player) ?? null;
              return (
                <button
                  className="selection-button"
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-pressed={active}
                  aria-label={`${player.name}、${player.isP ? player.role : player.pos}、OVR ${overall}、${askText(player)}を選択`}
                  key={player.id}
                  onClick={() => setSelectedId(active ? null : player.id)}
                  style={{
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${active ? accent : 'var(--color-border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{player.name}</div>
                      <div style={{ color: 'var(--color-text-faint)', fontSize: 11, marginTop: 4 }}>
                        {player.isP ? player.role : player.pos} / {player.age}歳 / {player.note}
                      </div>
                      {former && (
                        <div style={{ fontSize: 11, marginTop: 3 }}>
                          <span style={{ color: teamTextColor(former.c), fontWeight: 800 }}>
                            {former.ab}
                          </span>
                          {ownPlayer ? '（自球団）から宣言' : 'から宣言'}
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <PlayerStatusBadges player={player} compact />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{overall}</div>
                      <div
                        style={{
                          color: blocked ? 'var(--color-warning)' : 'var(--color-text-faint)',
                          fontSize: 10,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {askText(player)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      <nav
        aria-label={`${title}の操作`}
        style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
      >
        <Button onClick={onNext} color="var(--color-surface-muted)">
          スキップして次へ
        </Button>
        <Button
          onClick={() => {
            if (!selected) return;
            onSign(selected);
            setSelectedId(null);
          }}
          disabled={!selected || blockedReason != null}
          color={accent}
          ariaLabel={
            blockedReason
              ? blockedReason
              : selected
                ? `${selected.name}を獲得`
                : '選手を選択して獲得'
          }
        >
          {blockedReason ??
            (selected?.faFrom && selected.faFrom === playerTeam ? '再契約する' : '選手を獲得')}
        </Button>
      </nav>
    </section>
  );
}
