import { useCallback, useEffect, useMemo, useState } from 'react';

import { calcOVR, resolveCloserOrder } from '../../../engine';
import type { Player, Team } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import type { PitcherPlan } from '../../../state/storage';
import { Button, Card, SectionTitle } from '../../ui';
import { BullpenBoard } from '../../widgets/BullpenBoard';
import { BullpenPickerSheet } from '../../widgets/BullpenPickerSheet';
import { reorderIds } from '../../widgets/dragUtils';
import { RotationCandidatesList } from '../../widgets/RotationCandidatesList';
import { RotationOrderList } from '../../widgets/RotationOrderList';
import { RotationSwapSheet } from '../../widgets/RotationSwapSheet';

interface EditorState {
  rotationIds: string[];
  candidateIds: string[];
  closerIds: string[];
  rotationAutomatic: boolean;
  closerAutomatic: boolean;
}

function orderedIds(players: Player[], preferredIds: string[]): string[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  const output: string[] = [];
  const used = new Set<string>();
  for (const id of preferredIds) {
    if (!byId.has(id) || used.has(id)) continue;
    used.add(id);
    output.push(id);
  }
  for (const player of players) {
    if (!used.has(player.id)) output.push(player.id);
  }
  return output;
}

export function rotationSlotCount(team: Team): number {
  return Math.max(1, team.rotSize || 6);
}

function createEditorState(team: Team, plan: PitcherPlan): EditorState {
  const starters = team.pitchers
    .filter((pitcher) => pitcher.role === '先発')
    .sort((first, second) => calcOVR(second) - calcOVR(first));
  const startersById = new Map(starters.map((pitcher) => [pitcher.id, pitcher]));
  // Closers/candidates only ever surface 一軍 pitchers as new picks; a 二軍
  // pitcher already holding a rotation slot stays put (badged), matching the
  // lineup editor's bench behavior.
  const closers = resolveCloserOrder(team, plan.closerPriority).filter(
    (pitcher) => pitcher.activeRoster !== false,
  );
  // The rotation itself holds only rotSize slots (engine slices to the same
  // count in resolveStarterRotation); the rest of the 先発 staff becomes the
  // candidate pool. Old saves that stored every starter migrate by slicing.
  const orderedStarterIds = orderedIds(starters, plan.rotationOrder);
  const slotCount = rotationSlotCount(team);
  return {
    rotationIds: orderedStarterIds.slice(0, slotCount),
    candidateIds: orderedStarterIds
      .slice(slotCount)
      .filter((id) => startersById.get(id)?.activeRoster !== false),
    closerIds: closers.map((pitcher) => pitcher.id),
    rotationAutomatic: plan.rotationOrder.length === 0,
    closerAutomatic: plan.closerPriority.length === 0,
  };
}

function planFromEditor(editor: EditorState): PitcherPlan {
  return {
    rotationOrder: editor.rotationAutomatic ? [] : editor.rotationIds,
    closerPriority: editor.closerAutomatic ? [] : editor.closerIds,
  };
}

function planSignature(plan: PitcherPlan): string {
  return JSON.stringify(plan);
}

function playersFromIds(ids: string[], pitchers: Player[]): Player[] {
  const byId = new Map(pitchers.map((pitcher) => [pitcher.id, pitcher]));
  return ids
    .map((id) => byId.get(id))
    .filter((pitcher): pitcher is Player => Boolean(pitcher));
}

function RotationEditor({
  team,
  plan,
  onCommit,
  onSelectPlayer,
  onDirtyChange,
}: {
  team: Team;
  plan: PitcherPlan;
  onCommit(plan: PitcherPlan): void;
  onSelectPlayer(player: Player): void;
  onDirtyChange(dirty: boolean): void;
}) {
  const [editor, setEditor] = useState<EditorState>(() => createEditorState(team, plan));
  // Signature comes from the normalized editor state, not the raw saved plan:
  // old saves stored every starter, and comparing against the sliced rotation
  // would flag a phantom "unsaved change" on load.
  const [savedSignature, setSavedSignature] = useState(() =>
    planSignature(planFromEditor(createEditorState(team, plan))),
  );
  const [selectedCloserIndex, setSelectedCloserIndex] = useState<number | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const currentPlan = planFromEditor(editor);
  const signature = planSignature(currentPlan);
  const dirty = signature !== savedSignature;
  const rotationPitchers = useMemo(
    () => playersFromIds(editor.rotationIds, team.pitchers),
    [editor.rotationIds, team.pitchers],
  );
  const candidatePitchers = useMemo(
    () => playersFromIds(editor.candidateIds, team.pitchers),
    [editor.candidateIds, team.pitchers],
  );
  const promotingPitcher = useMemo(
    () => (promotingId ? candidatePitchers.find((pitcher) => pitcher.id === promotingId) ?? null : null),
    [candidatePitchers, promotingId],
  );
  const closerPitchers = useMemo(
    () => playersFromIds(editor.closerIds, team.pitchers),
    [editor.closerIds, team.pitchers],
  );
  const relievers = useMemo(
    () =>
      team.pitchers
        .filter((pitcher) => pitcher.role === 'リリーフ' && pitcher.activeRoster !== false)
        .sort((first, second) => calcOVR(second) - calcOVR(first)),
    [team.pitchers],
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const moveStarter = (index: number, direction: -1 | 1) => {
    setEditor((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.rotationIds.length) return current;
      const rotationIds = [...current.rotationIds];
      [rotationIds[index], rotationIds[target]] = [
        rotationIds[target] as string,
        rotationIds[index] as string,
      ];
      return { ...current, rotationIds, rotationAutomatic: false };
    });
    setStatus('変更はまだ保存されていません。');
  };

  const reorderStarters = useCallback((activeId: string, overId: string) => {
    setEditor((current) => ({
      ...current,
      rotationIds: reorderIds(current.rotationIds, activeId, overId),
      rotationAutomatic: false,
    }));
    setStatus('先発順を入れ替えました。変更はまだ保存されていません。');
  }, []);

  const promoteCandidate = (slotIndex: number) => {
    const candidateId = promotingId;
    if (!candidateId) return;
    setEditor((current) => {
      if (slotIndex < 0 || slotIndex >= current.rotationIds.length) return current;
      if (!current.candidateIds.includes(candidateId)) return current;
      const rotationIds = [...current.rotationIds];
      const displacedId = rotationIds[slotIndex] as string;
      rotationIds[slotIndex] = candidateId;
      const overallById = new Map(team.pitchers.map((pitcher) => [pitcher.id, calcOVR(pitcher)]));
      const candidateIds = [
        ...current.candidateIds.filter((id) => id !== candidateId),
        displacedId,
      ].sort((first, second) => (overallById.get(second) ?? 0) - (overallById.get(first) ?? 0));
      return { ...current, rotationIds, candidateIds, rotationAutomatic: false };
    });
    setPromotingId(null);
    setStatus('ローテーションを入れ替えました。変更はまだ保存されていません。');
  };

  const selectCloser = (pitcher: Player) => {
    if (selectedCloserIndex === null) return;
    setEditor((current) => {
      const currentIndex = current.closerIds.indexOf(pitcher.id);
      if (currentIndex < 0 || currentIndex === selectedCloserIndex) {
        return { ...current, closerAutomatic: false };
      }
      const closerIds = [...current.closerIds];
      [closerIds[selectedCloserIndex], closerIds[currentIndex]] = [
        closerIds[currentIndex] as string,
        closerIds[selectedCloserIndex] as string,
      ];
      return { ...current, closerIds, closerAutomatic: false };
    });
    setSelectedCloserIndex(null);
    setStatus('変更はまだ保存されていません。');
  };

  const savePlan = () => {
    onCommit(currentPlan);
    setSavedSignature(signature);
    setStatus('✓ 投手編成を保存しました。');
  };

  const discardChanges = () => {
    const next = createEditorState(team, plan);
    setEditor(next);
    setSavedSignature(planSignature(planFromEditor(next)));
    setSelectedCloserIndex(null);
    setPromotingId(null);
    setStatus('変更を破棄しました。');
  };

  const restoreAutomatic = () => {
    const next = createEditorState(team, { rotationOrder: [], closerPriority: [] });
    setEditor(next);
    setSelectedCloserIndex(null);
    setPromotingId(null);
    setStatus('自動選出へ戻しました。保存するまで確定しません。');
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card ariaLabel="投手編成の操作">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <SectionTitle>Pitcher Plan Editor</SectionTitle>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
              ローテーションは{rotationSlotCount(team)}枠。先発順はドラッグまたは矢印、候補からの入れ替えは「昇格」、抑えは枠のタップで変更します。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              onClick={restoreAutomatic}
              color="var(--color-surface-muted)"
              ariaLabel="先発と抑えを自動選出へ戻す"
            >
              自動選出に戻す
            </Button>
            <Button
              onClick={discardChanges}
              color="var(--color-surface-muted)"
              disabled={!dirty}
              ariaLabel="未保存の投手編成変更を破棄"
            >
              変更を破棄
            </Button>
            <Button
              onClick={savePlan}
              disabled={!dirty}
              ariaLabel="編集した投手編成を保存"
            >
              投手編成を保存
            </Button>
          </div>
        </div>
        <div
          className="inline-status"
          role="status"
          aria-live="polite"
          style={{ marginTop: 10, color: dirty ? 'var(--color-warning)' : 'var(--color-text-muted)' }}
        >
          {status || (dirty ? '未保存の変更があります。' : '保存済みです。')}
        </div>
        <div style={{ marginTop: 6, color: 'var(--color-text-faint)', fontSize: 11 }}>
          {editor.rotationAutomatic ? '先発: OVR自動選出' : '先発: 指定順を使用'} /{' '}
          {editor.closerAutomatic ? '抑え: 登録順を使用' : '抑え: 指定優先順を使用'}
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <RotationOrderList
            pitchers={rotationPitchers}
            slotCount={rotationSlotCount(team)}
            onMove={moveStarter}
            onReorder={reorderStarters}
            onSelectPlayer={onSelectPlayer}
          />
          <RotationCandidatesList
            pitchers={candidatePitchers}
            onPromote={(pitcher) => setPromotingId(pitcher.id)}
            onSelectPlayer={onSelectPlayer}
          />
        </div>
        <BullpenBoard
          closers={closerPitchers}
          relievers={relievers}
          onSelectCloserSlot={setSelectedCloserIndex}
          onSelectPlayer={onSelectPlayer}
        />
      </div>

      {selectedCloserIndex !== null && closerPitchers[selectedCloserIndex] && (
        <BullpenPickerSheet
          targetIndex={selectedCloserIndex}
          closers={closerPitchers}
          onSelect={selectCloser}
          onClose={() => setSelectedCloserIndex(null)}
        />
      )}

      {promotingPitcher && (
        <RotationSwapSheet
          candidate={promotingPitcher}
          rotation={rotationPitchers}
          onSwap={promoteCandidate}
          onClose={() => setPromotingId(null)}
        />
      )}
    </div>
  );
}

export function RotationTab({ onDirtyChange }: { onDirtyChange(dirty: boolean): void }) {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;
  return (
    <RotationEditor
      team={game.teams[game.playerTeam]}
      plan={game.pitcherPlan}
      onCommit={game.setPitcherPlan}
      onSelectPlayer={game.selectPlayer}
      onDirtyChange={onDirtyChange}
    />
  );
}
