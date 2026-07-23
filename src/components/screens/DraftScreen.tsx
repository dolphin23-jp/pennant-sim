import { useMemo, useState } from 'react';

import { TINFO } from '../../data';
import { calcOVR, effectiveOVR } from '../../engine';
import type { Player, TeamKey, Teams } from '../../engine';
import {
  applyDraftPicks,
  cpuDraftPick,
  draftOrder,
  generateDraftProspects,
  type DraftPick,
} from '../../state/offseason';
import { Button, Card, EmptyState, SectionTitle } from '../ui';

export function DraftScreen({
  teams,
  playerTeam,
  onComplete,
}: {
  teams: Teams;
  playerTeam: TeamKey;
  onComplete(teams: Teams, picks: DraftPick[]): void;
}) {
  const [round, setRound] = useState(1);
  const [prospects, setProspects] = useState<Player[]>(() => generateDraftProspects());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const order = useMemo(() => draftOrder(teams), [teams]);
  const selected = prospects.find((player) => player.id === selectedId) ?? null;

  const complete = (finalPicks: DraftPick[]) => {
    onComplete(applyDraftPicks(teams, finalPicks), finalPicks);
  };

  const makePick = () => {
    if (!selected) return;
    let remaining = prospects.filter((player) => player.id !== selected.id);
    const nextPicks: DraftPick[] = [
      ...picks,
      { ...selected, teamKey: playerTeam, round },
    ];
    for (const teamKey of order) {
      if (teamKey === playerTeam || !remaining.length) continue;
      const cpuPick = cpuDraftPick(teams[teamKey], remaining);
      if (!cpuPick) continue;
      nextPicks.push({ ...cpuPick, teamKey, round });
      remaining = remaining.filter((player) => player.id !== cpuPick.id);
    }
    if (round >= 6) {
      complete(nextPicks);
      return;
    }
    setProspects(remaining);
    setPicks(nextPicks);
    setSelectedId(null);
    setRound((current) => current + 1);
  };

  const autoFinish = () => {
    let remaining = [...prospects];
    const nextPicks = [...picks];
    for (let currentRound = round; currentRound <= 6; currentRound += 1) {
      for (const teamKey of order) {
        if (!remaining.length) break;
        const pick = cpuDraftPick(teams[teamKey], remaining);
        if (!pick) continue;
        nextPicks.push({ ...pick, teamKey, round: currentRound });
        remaining = remaining.filter((player) => player.id !== pick.id);
      }
    }
    complete(nextPicks);
  };

  const userPicks = picks.filter((pick) => pick.teamKey === playerTeam);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>ドラフト会議</h2>
          <div style={{ color: '#6f8ca8', fontSize: 12, marginTop: 4 }}>第{round}巡指名</div>
        </div>
        <Button onClick={autoFinish} color="#1a2535">以降を自動指名</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(260px,.5fr)', gap: 14 }}>
        <Card>
          <SectionTitle>候補選手</SectionTitle>
          {!prospects.length ? (
            <EmptyState>候補選手がいません。</EmptyState>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 7, maxHeight: 540, overflowY: 'auto' }}>
              {prospects.slice(0, 50).map((player) => {
                const overall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
                const active = selectedId === player.id;
                return (
                  <button
                    type="button"
                    key={player.id}
                    onClick={() => setSelectedId(active ? null : player.id)}
                    style={{
                      padding: 10,
                      borderRadius: 7,
                      border: `1px solid ${active ? TINFO[playerTeam].c : '#1a2535'}`,
                      background: active ? `${TINFO[playerTeam].c}22` : '#0a1218',
                      color: '#f3f7ff',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{player.name}</strong>
                      <strong>{overall}</strong>
                    </div>
                    <div style={{ color: '#6f8ca8', fontSize: 10, marginTop: 4 }}>
                      {player.isP ? player.role : player.pos} / {player.age}歳 / {player.note}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button onClick={makePick} disabled={!selected} color={TINFO[playerTeam].c}>
              {selected ? `${selected.name}を指名` : '選手を選択'}
            </Button>
          </div>
        </Card>
        <Card>
          <SectionTitle>指名済み</SectionTitle>
          {userPicks.length ? (
            userPicks.map((pick) => (
              <div key={`${pick.round}-${pick.id}`} style={{ padding: '8px 0', borderTop: '1px solid #17283a', fontSize: 12 }}>
                {pick.round}巡 {pick.name}
              </div>
            ))
          ) : (
            <EmptyState>まだ指名していません。</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
