import { useMemo, useState } from 'react';

import { TINFO } from '../../data';
import {
  applyDraftPicks,
  calcOVR,
  cpuDraftPick,
  draftOrder,
  draftRoundOrder,
  effectiveOVR,
  generateDraftProspects,
  type DraftPick,
  type Player,
  type TeamKey,
  type Teams,
} from '../../engine';
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
    const nextPicks: DraftPick[] = [...picks, { ...selected, teamKey: playerTeam, round }];
    let draftTeams = applyDraftPicks(teams, nextPicks);
    for (const teamKey of draftRoundOrder(order, round)) {
      if (teamKey === playerTeam || !remaining.length) continue;
      const cpuPick = cpuDraftPick(draftTeams[teamKey], remaining);
      if (!cpuPick) continue;
      const pick = { ...cpuPick, teamKey, round };
      nextPicks.push(pick);
      draftTeams = applyDraftPicks(draftTeams, [pick]);
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
    let draftTeams = applyDraftPicks(teams, nextPicks);
    for (let currentRound = round; currentRound <= 6; currentRound += 1) {
      for (const teamKey of draftRoundOrder(order, currentRound)) {
        if (!remaining.length) break;
        const selected = cpuDraftPick(draftTeams[teamKey], remaining);
        if (!selected) continue;
        const pick = { ...selected, teamKey, round: currentRound };
        nextPicks.push(pick);
        draftTeams = applyDraftPicks(draftTeams, [pick]);
        remaining = remaining.filter((player) => player.id !== selected.id);
      }
    }
    complete(nextPicks);
  };

  const userPicks = picks.filter((pick) => pick.teamKey === playerTeam);
  return (
    <section aria-labelledby="draft-title">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'end',
          marginBottom: 14,
          gap: 12,
        }}
      >
        <div>
          <h2 id="draft-title" style={{ margin: 0 }}>
            ドラフト会議
          </h2>
          <div style={{ color: 'var(--color-text-faint)', fontSize: 12, marginTop: 4 }}>
            第{round}巡指名
          </div>
        </div>
        <Button onClick={autoFinish} color="var(--color-surface-muted)">
          以降を自動指名
        </Button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.5fr) minmax(260px,.5fr)',
          gap: 14,
        }}
      >
        <Card ariaLabel="ドラフト候補選手">
          <SectionTitle>候補選手</SectionTitle>
          {!prospects.length ? (
            <EmptyState>候補選手がいません。</EmptyState>
          ) : (
            <div
              role="listbox"
              aria-label={`ドラフト第${round}巡候補`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
                gap: 7,
                maxHeight: 540,
                overflowY: 'auto',
              }}
            >
              {prospects.slice(0, 50).map((player) => {
                const overall = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
                const active = selectedId === player.id;
                return (
                  <button
                    className="selection-button"
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-pressed={active}
                    aria-label={`${player.name}、${player.isP ? player.role : player.pos}、OVR ${overall}を指名候補に選択`}
                    key={player.id}
                    onClick={() => setSelectedId(active ? null : player.id)}
                    style={{
                      padding: 10,
                      borderRadius: 7,
                      border: `1px solid ${active ? TINFO[playerTeam].c : 'var(--color-border)'}`,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{player.name}</strong>
                      <strong>{overall}</strong>
                    </div>
                    <div style={{ color: 'var(--color-text-faint)', fontSize: 10, marginTop: 4 }}>
                      {player.isP ? player.role : player.pos} / {player.age}歳 / {player.note}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button
              onClick={makePick}
              disabled={!selected}
              color={TINFO[playerTeam].c}
              ariaLabel={selected ? `${selected.name}を第${round}巡で指名` : '指名する選手を選択'}
            >
              {selected ? `${selected.name}を指名` : '選手を選択'}
            </Button>
          </div>
        </Card>
        <Card ariaLabel="自球団の指名済み選手">
          <SectionTitle>指名済み</SectionTitle>
          {userPicks.length ? (
            userPicks.map((pick) => (
              <div
                key={`${pick.round}-${pick.id}`}
                style={{
                  padding: '8px 0',
                  borderTop: '1px solid var(--color-border)',
                  fontSize: 12,
                }}
              >
                {pick.round}巡 {pick.name}
              </div>
            ))
          ) : (
            <EmptyState>まだ指名していません。</EmptyState>
          )}
        </Card>
      </div>
    </section>
  );
}
