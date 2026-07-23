import { useState } from 'react';

import { calcOVR, effectiveOVR } from '../../engine';
import type { Player } from '../../engine';
import { Button, Card, EmptyState, SectionTitle } from '../ui';

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
    <div>
      <Card style={{ marginBottom: 14 }}>
        <SectionTitle>{title}</SectionTitle>
        <p style={{ color: '#6f8ca8', fontSize: 12, marginTop: 0 }}>{subtitle}</p>
        {!players.length ? (
          <EmptyState>候補選手はいません。</EmptyState>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 8 }}>
            {players.map((player) => {
              const overall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
              const active = player.id === selectedId;
              return (
                <button
                  type="button"
                  key={player.id}
                  onClick={() => setSelectedId(active ? null : player.id)}
                  style={{
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${active ? accent : '#1a2535'}`,
                    background: active ? `${accent}22` : '#0a1218',
                    color: '#f3f7ff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{player.name}</div>
                      <div style={{ color: '#6f8ca8', fontSize: 11, marginTop: 4 }}>
                        {player.isP ? player.role : player.pos} / {player.age}歳 / {player.note}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{overall}</div>
                      <div style={{ color: '#6f8ca8', fontSize: 10 }}>¥{player.ask?.toLocaleString()}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Button onClick={onNext} color="#1a2535">スキップして次へ</Button>
        <Button
          onClick={() => {
            if (!selected) return;
            onSign(selected);
            setSelectedId(null);
          }}
          disabled={!selected}
          color={accent}
        >
          選手を獲得
        </Button>
      </div>
    </div>
  );
}
