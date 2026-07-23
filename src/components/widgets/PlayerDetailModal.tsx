import { calcOVR, effectiveOVR, specialLevel } from '../../engine';
import type { AccumulatedStats, Player } from '../../engine';
import { Button, Card, SectionTitle } from '../ui';

function ValueRow({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
      <span style={{ color: '#7f9ab4' }}>{label}</span>
      <strong>{Math.round(value ?? 0)}</strong>
    </div>
  );
}

export function PlayerDetailModal({
  player,
  accumulated,
  careerAccumulated,
  onClose,
}: {
  player: Player | null;
  accumulated: AccumulatedStats;
  careerAccumulated: AccumulatedStats;
  onClose(): void;
}) {
  if (!player) return null;
  const overall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
  const current = accumulated[player.id];
  const career = careerAccumulated[player.id];
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(1,8,18,.86)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name}の詳細`}
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(900px,100%)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <Card style={{ background: '#071827' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24 }}>{player.name}</h2>
              <div style={{ color: '#8eb3d6', fontSize: 12, marginTop: 4 }}>
                {player.age}歳 / {player.isP ? player.role : player.pos} / OVR {overall}
              </div>
            </div>
            <Button onClick={onClose} color="#14324d">閉じる</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>
            <Card style={{ background: '#0b1d2d' }}>
              <SectionTitle>能力値</SectionTitle>
              {player.isP ? (
                <>
                  <ValueRow label="球速" value={player.p.vel} />
                  <ValueRow label="制球" value={player.p.ctrl} />
                  <ValueRow label="スタミナ" value={player.p.stam} />
                  <ValueRow label="ノビ" value={player.p.nobi} />
                  <ValueRow label="守備" value={player.p.fld} />
                </>
              ) : (
                <>
                  <ValueRow label="直球対応" value={player.p.cf} />
                  <ValueRow label="変化対応" value={player.p.cb} />
                  <ValueRow label="長打力" value={player.p.pw} />
                  <ValueRow label="選球眼" value={player.p.dc} />
                  <ValueRow label="走力" value={player.p.sp} />
                  <ValueRow label="守備力" value={player.p.df} />
                  <ValueRow label="肩力" value={player.p.arm} />
                </>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                {(player.specials ?? []).map((special) => (
                  <span
                    key={special.id}
                    style={{
                      border: `1px solid ${special.c}66`,
                      borderRadius: 999,
                      padding: '3px 8px',
                      color: special.c,
                      fontSize: 10,
                    }}
                  >
                    {special.rarity === 'gold' ? '★' : ''}{special.n}
                    {special.rarity === 'gold' ? '' : ` Lv${specialLevel(player, special.id)}`}
                  </span>
                ))}
              </div>
            </Card>
            <Card style={{ background: '#0b1d2d' }}>
              <SectionTitle>成績</SectionTitle>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#b9cee0', fontSize: 11 }}>
                {JSON.stringify({ current: current ?? null, career: career ?? null }, null, 2)}
              </pre>
            </Card>
          </div>
        </Card>
      </div>
    </div>
  );
}
