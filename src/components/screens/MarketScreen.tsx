import { useState } from 'react';

import { calcOVR, effectiveOVR } from '../../engine';
import type { Player } from '../../engine';
import { Button, Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from '../widgets/PlayerStatusBadges';

export function MarketScreen({
  title,
  subtitle,
  players,
  accent,
  onSign,
  onNext,
}: {
  title: string;
  subtitle: string;
  players: Player[];
  accent: string;
  onSign(player: Player): void;
  onNext(): void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((player) => player.id === selectedId) ?? null;
  return (
    <section aria-label={title}>
      <Card style={{ marginBottom: 14 }} ariaLabel={title}>
        <SectionTitle>{title}</SectionTitle>
        <p style={{ color: 'var(--color-text-faint)', fontSize: 12, marginTop: 0 }}>{subtitle}</p>
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
              return (
                <button
                  className="selection-button"
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-pressed={active}
                  aria-label={`${player.name}、${player.isP ? player.role : player.pos}、OVR ${overall}を選択`}
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
                      <div style={{ marginTop: 6 }}>
                        <PlayerStatusBadges player={player} compact />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{overall}</div>
                      <div style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>
                        ¥{player.ask?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      <nav aria-label={`${title}の操作`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Button onClick={onNext} color="var(--color-surface-muted)">
          スキップして次へ
        </Button>
        <Button
          onClick={() => {
            if (!selected) return;
            onSign(selected);
            setSelectedId(null);
          }}
          disabled={!selected}
          color={accent}
          ariaLabel={selected ? `${selected.name}を獲得` : '選手を選択して獲得'}
        >
          選手を獲得
        </Button>
      </nav>
    </section>
  );
}
