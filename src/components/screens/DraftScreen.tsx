import type { NarrativeEvent, NarrativeEventContext } from '../../narrative/types';
import { useState } from 'react';

import { TINFO } from '../../data';
import {
  applyDraftPicks,
  calcOVR,
  cpuDraftPick,
  draftRoundOrder,
  effectiveOVR,
  generateDraftProspects,
  resolveFirstRoundWave,
  type DraftPick,
  type Player,
  type TeamKey,
  type Teams,
} from '../../engine';
import { Button, Card, EmptyState, SectionTitle } from '../ui';

interface DraftProgress {
  teams: Teams;
  prospects: Player[];
  picks: DraftPick[];
}

function runSequentialCpuPicks(
  progress: DraftProgress,
  teamKeys: readonly TeamKey[],
  round: number,
): DraftProgress {
  let nextTeams = progress.teams;
  let remaining = [...progress.prospects];
  const nextPicks = [...progress.picks];
  for (const teamKey of teamKeys) {
    const selected = cpuDraftPick(nextTeams[teamKey], remaining);
    if (!selected) continue;
    const pick: DraftPick = { ...selected, teamKey, round };
    nextPicks.push(pick);
    nextTeams = applyDraftPicks(nextTeams, [pick]);
    remaining = remaining.filter((prospect) => prospect.id !== selected.id);
  }
  return { teams: nextTeams, prospects: remaining, picks: nextPicks };
}

function prepareUserTurn(
  progress: DraftProgress,
  order: TeamKey[],
  playerTeam: TeamKey,
  round: number,
): DraftProgress {
  const roundOrder = draftRoundOrder(order, round);
  const userIndex = roundOrder.indexOf(playerTeam);
  if (userIndex < 0) return progress;
  return runSequentialCpuPicks(progress, roundOrder.slice(0, userIndex), round);
}

export function DraftScreen({
  teams,
  playerTeam,
  order,
  onComplete,
  narrativeYear,
}: {
  teams: Teams;
  playerTeam: TeamKey;
  order: TeamKey[];
  onComplete(teams: Teams, picks: DraftPick[], events: NarrativeEvent[]): void;
  narrativeYear?: number;
}) {
  const [round, setRound] = useState(1);
  const [prospects, setProspects] = useState<Player[]>(() => generateDraftProspects());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [pendingFirstRoundTeams, setPendingFirstRoundTeams] = useState<TeamKey[]>(() => [...order]);
  const [firstRoundMessage, setFirstRoundMessage] = useState('');
  const selected = prospects.find((player) => player.id === selectedId) ?? null;

  const complete = (finalPicks: DraftPick[]) => {
    const events: NarrativeEvent[] = [];
    const context: NarrativeEventContext | undefined =
      narrativeYear == null
        ? undefined
        : {
            year: narrativeYear,
            date: `${narrativeYear}年オフ`,
            emit: (event) => events.push(event),
          };
    onComplete(applyDraftPicks(teams, finalPicks, context), finalPicks, events);
  };

  const makePick = () => {
    if (!selected) return;
    if (round === 1) {
      let draftTeams = applyDraftPicks(teams, picks);
      let remaining = [...prospects];
      let nextPicks = [...picks];
      const wave = resolveFirstRoundWave(
        draftTeams,
        remaining,
        pendingFirstRoundTeams,
        playerTeam,
        selected,
      );
      nextPicks = [...nextPicks, ...wave.picks];
      draftTeams = applyDraftPicks(draftTeams, wave.picks);
      const wonIds = new Set(wave.picks.map((pick) => pick.id));
      remaining = remaining.filter((prospect) => !wonIds.has(prospect.id));
      let pending = wave.unresolvedTeams;
      const userWon = wave.picks.some((pick) => pick.teamKey === playerTeam);
      if (!userWon) {
        const competition =
          Object.values(wave.bids).find((bidders) => bidders.includes(playerTeam))?.length ?? 1;
        setFirstRoundMessage(
          competition > 1
            ? `${competition}球団競合の抽選に外れました。外れ1位を選択してください。`
            : '指名を確定できませんでした。候補を選び直してください。',
        );
        setProspects(remaining);
        setPicks(nextPicks);
        setPendingFirstRoundTeams(pending);
        setSelectedId(null);
        return;
      }

      while (pending.length) {
        const cpuWave = resolveFirstRoundWave(draftTeams, remaining, pending);
        if (!cpuWave.picks.length) break;
        nextPicks = [...nextPicks, ...cpuWave.picks];
        draftTeams = applyDraftPicks(draftTeams, cpuWave.picks);
        const cpuWonIds = new Set(cpuWave.picks.map((pick) => pick.id));
        remaining = remaining.filter((prospect) => !cpuWonIds.has(prospect.id));
        pending = cpuWave.unresolvedTeams;
      }

      const prepared = prepareUserTurn(
        { teams: draftTeams, prospects: remaining, picks: nextPicks },
        order,
        playerTeam,
        2,
      );
      setProspects(prepared.prospects);
      setPicks(prepared.picks);
      setPendingFirstRoundTeams([]);
      setFirstRoundMessage('');
      setSelectedId(null);
      setRound(2);
      return;
    }

    const draftTeams = applyDraftPicks(teams, picks);
    const userPick: DraftPick = { ...selected, teamKey: playerTeam, round };
    let progress: DraftProgress = {
      teams: applyDraftPicks(draftTeams, [userPick]),
      prospects: prospects.filter((prospect) => prospect.id !== selected.id),
      picks: [...picks, userPick],
    };
    const roundOrder = draftRoundOrder(order, round);
    const userIndex = roundOrder.indexOf(playerTeam);
    progress = runSequentialCpuPicks(progress, roundOrder.slice(userIndex + 1), round);
    if (round >= 6) {
      complete(progress.picks);
      return;
    }
    const nextRound = round + 1;
    progress = prepareUserTurn(progress, order, playerTeam, nextRound);
    setProspects(progress.prospects);
    setPicks(progress.picks);
    setSelectedId(null);
    setRound(nextRound);
  };

  const autoFinish = () => {
    let remaining = [...prospects];
    let nextPicks = [...picks];
    let draftTeams = applyDraftPicks(teams, nextPicks);
    let currentRound = round;
    if (currentRound === 1) {
      let pending = [...pendingFirstRoundTeams];
      while (pending.length) {
        const wave = resolveFirstRoundWave(draftTeams, remaining, pending);
        if (!wave.picks.length) break;
        nextPicks = [...nextPicks, ...wave.picks];
        draftTeams = applyDraftPicks(draftTeams, wave.picks);
        const wonIds = new Set(wave.picks.map((pick) => pick.id));
        remaining = remaining.filter((prospect) => !wonIds.has(prospect.id));
        pending = wave.unresolvedTeams;
      }
      currentRound = 2;
    } else {
      const roundOrder = draftRoundOrder(order, currentRound);
      const userIndex = roundOrder.indexOf(playerTeam);
      const current = runSequentialCpuPicks(
        { teams: draftTeams, prospects: remaining, picks: nextPicks },
        roundOrder.slice(Math.max(0, userIndex)),
        currentRound,
      );
      draftTeams = current.teams;
      remaining = current.prospects;
      nextPicks = current.picks;
      currentRound += 1;
    }
    for (; currentRound <= 6; currentRound += 1) {
      for (const teamKey of draftRoundOrder(order, currentRound)) {
        if (!remaining.length) break;
        const cpuSelected = cpuDraftPick(draftTeams[teamKey], remaining);
        if (!cpuSelected) continue;
        const pick: DraftPick = { ...cpuSelected, teamKey, round: currentRound };
        nextPicks.push(pick);
        draftTeams = applyDraftPicks(draftTeams, [pick]);
        remaining = remaining.filter((player) => player.id !== cpuSelected.id);
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
            {round === 1 ? '第1巡 入札・競合抽選' : `第${round}巡指名`}
          </div>
        </div>
        <Button onClick={autoFinish} color="var(--color-surface-muted)">
          以降を自動指名
        </Button>
      </div>
      {firstRoundMessage && (
        <div style={{ marginBottom: 10, color: 'var(--color-warning)', fontSize: 12 }}>
          {firstRoundMessage}
        </div>
      )}
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
