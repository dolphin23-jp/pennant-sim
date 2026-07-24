import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function PitcherSlot({
  label,
  pitcher,
  editable = false,
  onSelectSlot,
  onSelectPlayer,
}: {
  label: string;
  pitcher: Player | null;
  editable?: boolean;
  onSelectSlot?(): void;
  onSelectPlayer(player: Player): void;
}) {
  return (
    <div
      style={{
        minHeight: 88,
        padding: 10,
        border: `1px solid ${editable ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 10,
        background: editable ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 6,
          color: editable ? 'var(--color-accent)' : 'var(--color-text-faint)',
          fontSize: 10,
          fontWeight: 900,
        }}
      >
        <span>{label}</span>
        {editable && (
          <button
            type="button"
            aria-label={`${label}の投手を変更`}
            onClick={onSelectSlot}
            style={{
              minHeight: 30,
              padding: '4px 8px',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 7,
              color: 'var(--color-accent)',
              background: 'var(--color-surface)',
              fontSize: 10,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            変更
          </button>
        )}
      </div>
      {pitcher ? (
        <>
          <button
            type="button"
            className="roster-player-button"
            aria-label={`${pitcher.name}の詳細を表示`}
            onClick={() => onSelectPlayer(pitcher)}
          >
            {pitcher.name}
          </button>
          <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 11 }}>
            OVR {calcOVR(pitcher)} / 疲労 {Math.round(pitcher.fatigue ?? 0)}
          </div>
          <div style={{ marginTop: 4 }}>
            <PlayerStatusBadges player={pitcher} compact />
          </div>
        </>
      ) : (
        <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>該当投手なし</span>
      )}
    </div>
  );
}

export function BullpenBoard({
  closers,
  relievers,
  onSelectCloserSlot,
  onSelectPlayer,
}: {
  closers: Player[];
  relievers: Player[];
  onSelectCloserSlot(index: number): void;
  onSelectPlayer(player: Player): void;
}) {
  const setupPitchers = relievers.slice(0, 2);
  const others = [...closers.slice(2), ...relievers.slice(2)];

  return (
    <Card ariaLabel="ブルペン編成">
      <SectionTitle>Bullpen Board</SectionTitle>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
        抑え枠をタップして優先順位を変更できます。セットアップは現行仕様どおりOVR順の自動選出です。
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))',
          gap: 8,
        }}
      >
        <PitcherSlot
          label="抑え（第1）"
          pitcher={closers[0] ?? null}
          editable={closers.length > 0}
          onSelectSlot={() => onSelectCloserSlot(0)}
          onSelectPlayer={onSelectPlayer}
        />
        <PitcherSlot
          label="抑え（第2）"
          pitcher={closers[1] ?? null}
          editable={closers.length > 1}
          onSelectSlot={() => onSelectCloserSlot(1)}
          onSelectPlayer={onSelectPlayer}
        />
        <PitcherSlot
          label="セットアップ①"
          pitcher={setupPitchers[0] ?? null}
          onSelectPlayer={onSelectPlayer}
        />
        <PitcherSlot
          label="セットアップ②"
          pitcher={setupPitchers[1] ?? null}
          onSelectPlayer={onSelectPlayer}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 7, color: 'var(--color-text-faint)', fontSize: 10, fontWeight: 900 }}>
          その他
        </div>
        {!others.length ? (
          <EmptyState>その他のブルペン投手はいません。</EmptyState>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))',
              gap: 7,
            }}
          >
            {others.map((pitcher) => (
              <button
                key={pitcher.id}
                type="button"
                aria-label={`${pitcher.name}の詳細を表示`}
                onClick={() => onSelectPlayer(pitcher)}
                style={{
                  minHeight: 54,
                  padding: '8px 9px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  color: 'var(--color-text)',
                  background: 'var(--color-surface-raised)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <strong style={{ display: 'block' }}>{pitcher.name}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
                  {pitcher.role} / OVR {calcOVR(pitcher)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
