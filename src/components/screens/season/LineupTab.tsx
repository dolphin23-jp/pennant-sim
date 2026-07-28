import { useCallback, useEffect, useMemo, useState } from 'react';

import { bestLineup, calcOVR, effectiveOVR } from '../../../engine';
import type { AccumulatedStats, FieldPosition, Player, Team } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, SectionTitle } from '../../ui';
import { BattingOrderList } from '../../widgets/BattingOrderList';
import { BenchPanel } from '../../widgets/BenchPanel';
import { reorderIds, swapRecordValues } from '../../widgets/dragUtils';
import {
  FIELD_SLOT_ORDER,
  FieldDiagram,
  LINEUP_SLOT_ORDER,
  type LineupAssignments,
  type LineupSlot,
} from '../../widgets/FieldDiagram';
import { PositionPickerSheet } from '../../widgets/PositionPickerSheet';

interface EditorState {
  assignments: LineupAssignments;
  orderIds: string[];
}

function emptyAssignments(): LineupAssignments {
  return Object.fromEntries(LINEUP_SLOT_ORDER.map((slot) => [slot, null])) as LineupAssignments;
}

function normalizeOrder(orderIds: string[], assignments: LineupAssignments): string[] {
  const selectedIds = LINEUP_SLOT_ORDER.map((slot) => assignments[slot]?.id).filter(
    (id): id is string => Boolean(id),
  );
  const selectedSet = new Set(selectedIds);
  const seen = new Set<string>();
  const normalized = orderIds.filter((id) => {
    if (!selectedSet.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of selectedIds) {
    if (!seen.has(id)) {
      normalized.push(id);
      seen.add(id);
    }
  }
  return normalized.slice(0, 9);
}

function createEditorState(lineup: Player[], fielders: Player[]): EditorState {
  const assignments = emptyAssignments();
  const rosterById = new Map(fielders.map((player) => [player.id, player]));
  const savedPlayers = lineup
    .map<Player | null>((saved) => {
      const current = rosterById.get(saved.id);
      return current ? { ...current, _assignedPos: saved._assignedPos } : null;
    })
    .filter((player): player is Player => player !== null);
  const used = new Set<string>();
  // Auto-fill only pulls from the 一軍 roster; a saved slot referencing a
  // player since sent to 二軍 stays visible above (flagged, not dropped) so
  // the mismatch is legible instead of silently rewritten.
  const activeFielders = fielders.filter((player) => player.activeRoster !== false);

  for (const position of FIELD_SLOT_ORDER) {
    const savedAtPosition = savedPlayers.find(
      (player) => !used.has(player.id) && player._assignedPos === position,
    );
    const naturalAtPosition = savedPlayers.find(
      (player) => !used.has(player.id) && player.pos === position,
    );
    const bestAvailable = activeFielders
      .filter((player) => !used.has(player.id))
      .sort((first, second) => effectiveOVR(second, position) - effectiveOVR(first, position))[0];
    const selected = savedAtPosition ?? naturalAtPosition ?? bestAvailable ?? null;
    assignments[position] = selected;
    if (selected) used.add(selected.id);
  }

  const savedExtra = savedPlayers.find((player) => !used.has(player.id));
  const bestExtra = activeFielders
    .filter((player) => !used.has(player.id))
    .sort((first, second) => calcOVR(second) - calcOVR(first))[0];
  assignments.extra = savedExtra ?? bestExtra ?? null;

  return {
    assignments,
    orderIds: normalizeOrder(
      savedPlayers.map((player) => player.id),
      assignments,
    ),
  };
}

function editorSignature(editor: EditorState): string {
  return JSON.stringify({
    slots: LINEUP_SLOT_ORDER.map((slot) => [slot, editor.assignments[slot]?.id ?? null]),
    order: editor.orderIds,
  });
}

function selectedPlayers(editor: EditorState): Player[] {
  const byId = new Map<string, Player>(
    LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot])
      .filter((player): player is Player => player !== null)
      .map((player) => [player.id, player]),
  );
  return editor.orderIds
    .map((id) => byId.get(id))
    .filter((player): player is Player => player !== undefined);
}

function lineupFromEditor(editor: EditorState): Player[] {
  const assignedPositionById = new Map<string, FieldPosition>();
  for (const position of FIELD_SLOT_ORDER) {
    const player = editor.assignments[position];
    if (player) assignedPositionById.set(player.id, position);
  }
  const byId = new Map<string, Player>(
    LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot])
      .filter((player): player is Player => player !== null)
      .map((player) => [player.id, player]),
  );
  return editor.orderIds
    .map<Player | null>((id) => {
      const player = byId.get(id);
      if (!player) return null;
      const assignedPosition = assignedPositionById.get(id);
      return { ...player, _assignedPos: assignedPosition };
    })
    .filter((player): player is Player => player !== null);
}

function LineupEditor({
  team,
  lineup,
  accumulated,
  onCommit,
  onSelectPlayer,
  onDirtyChange,
}: {
  team: Team;
  lineup: Player[];
  accumulated: AccumulatedStats;
  onCommit(lineup: Player[]): void;
  onSelectPlayer(player: Player): void;
  onDirtyChange(dirty: boolean): void;
}) {
  const [editor, setEditor] = useState<EditorState>(() => createEditorState(lineup, team.fielders));
  const [savedSignature, setSavedSignature] = useState(() => editorSignature(editor));
  const [selectedSlot, setSelectedSlot] = useState<LineupSlot | null>(null);
  const [armedBenchId, setArmedBenchId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const signature = editorSignature(editor);
  const dirty = signature !== savedSignature;
  const battingOrder = useMemo(() => selectedPlayers(editor), [editor]);
  const complete =
    LINEUP_SLOT_ORDER.every((slot) => Boolean(editor.assignments[slot])) &&
    new Set(LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot]?.id)).size === 9 &&
    battingOrder.length === 9;
  const activeFielders = useMemo(
    () => team.fielders.filter((player) => player.activeRoster !== false),
    [team.fielders],
  );
  const benchPlayers = useMemo(() => {
    const startingIds = new Set(
      LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot]?.id).filter(
        (id): id is string => Boolean(id),
      ),
    );
    // Bench = 一軍 fielders not currently starting. 二軍 players aren't "on
    // the bench" in NPB terms, so they're excluded here (SquadBoard is where
    // 一軍/二軍 status changes, not this tab).
    return activeFielders
      .filter((player) => !startingIds.has(player.id))
      .sort((first, second) => calcOVR(second) - calcOVR(first));
  }, [activeFielders, editor.assignments]);
  const armedPlayer = armedBenchId
    ? (benchPlayers.find((player) => player.id === armedBenchId) ?? null)
    : null;

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

  const closePicker = useCallback(() => setSelectedSlot(null), []);

  const assignPlayer = (slot: LineupSlot, player: Player) => {
    setEditor((current) => {
      const assignments = { ...current.assignments };
      const existingSlot = LINEUP_SLOT_ORDER.find(
        (candidateSlot) => assignments[candidateSlot]?.id === player.id,
      );
      const displaced = assignments[slot];
      assignments[slot] = player;
      if (existingSlot && existingSlot !== slot) assignments[existingSlot] = displaced;

      let orderIds = [...current.orderIds];
      if (!orderIds.includes(player.id)) {
        const displacedIndex = displaced ? orderIds.indexOf(displaced.id) : -1;
        if (displacedIndex >= 0) orderIds[displacedIndex] = player.id;
        else orderIds.push(player.id);
      }
      orderIds = normalizeOrder(orderIds, assignments);
      return { assignments, orderIds };
    });
    setStatus('変更はまだ保存されていません。');
  };

  const handleSelectSlot = (slot: LineupSlot) => {
    if (armedPlayer) {
      assignPlayer(slot, armedPlayer);
      setArmedBenchId(null);
      return;
    }
    setSelectedSlot(slot);
  };

  const toggleArmBench = (player: Player) => {
    setArmedBenchId((current) => (current === player.id ? null : player.id));
    setSelectedSlot(null);
  };

  useEffect(() => {
    if (!armedBenchId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmedBenchId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [armedBenchId]);

  const swapSlots = useCallback((firstSlot: LineupSlot, secondSlot: LineupSlot) => {
    setEditor((current) => {
      const assignments = swapRecordValues(current.assignments, firstSlot, secondSlot);
      return {
        assignments,
        orderIds: normalizeOrder(current.orderIds, assignments),
      };
    });
    setStatus('守備位置を入れ替えました。変更はまだ保存されていません。');
  }, []);

  const moveBatter = (index: number, direction: -1 | 1) => {
    setEditor((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.orderIds.length) return current;
      const orderIds = [...current.orderIds];
      [orderIds[index], orderIds[target]] = [orderIds[target] as string, orderIds[index] as string];
      return { ...current, orderIds };
    });
    setStatus('変更はまだ保存されていません。');
  };

  const reorderBatters = useCallback((activeId: string, overId: string) => {
    setEditor((current) => ({
      ...current,
      orderIds: reorderIds(current.orderIds, activeId, overId),
    }));
    setStatus('打順を入れ替えました。変更はまだ保存されていません。');
  }, []);

  const saveLineup = () => {
    if (!complete) return;
    onCommit(lineupFromEditor(editor));
    setSavedSignature(signature);
    setStatus('✓ オーダーを保存しました。');
  };

  const discardChanges = () => {
    const next = createEditorState(lineup, team.fielders);
    setEditor(next);
    setSavedSignature(editorSignature(next));
    setSelectedSlot(null);
    setArmedBenchId(null);
    setStatus('変更を破棄しました。');
  };

  const applyRecommended = () => {
    const next = createEditorState(bestLineup(team), team.fielders);
    setEditor(next);
    setArmedBenchId(null);
    setStatus('AIおすすめを反映しました。保存するまで確定しません。');
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card ariaLabel="オーダー編成の操作">
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
            <SectionTitle>Lineup Editor</SectionTitle>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
              守備位置はタップまたはグリップのドラッグ、打順はドラッグまたは矢印、ベンチ選手はタップしてから配置先をタップで変更します。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              onClick={applyRecommended}
              color="var(--color-surface-muted)"
              ariaLabel="AIおすすめオーダーを編集画面に反映"
            >
              AIおすすめ
            </Button>
            <Button
              onClick={discardChanges}
              color="var(--color-surface-muted)"
              disabled={!dirty}
              ariaLabel="未保存のオーダー変更を破棄"
            >
              変更を破棄
            </Button>
            <Button
              onClick={saveLineup}
              disabled={!dirty || !complete}
              ariaLabel="編集したオーダーを保存"
            >
              オーダーを保存
            </Button>
          </div>
        </div>
        <div
          className="inline-status"
          role="status"
          aria-live="polite"
          style={{ marginTop: 10, color: dirty ? 'var(--color-warning)' : 'var(--color-text-muted)' }}
        >
          {armedPlayer
            ? `${armedPlayer.name}を配置する守備位置をタップしてください。`
            : !complete
              ? '9つの枠すべてに異なる選手を配置してください。'
              : status || (dirty ? '未保存の変更があります。' : '保存済みです。')}
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <FieldDiagram
          assignments={editor.assignments}
          selectedSlot={selectedSlot}
          armedPlayerName={armedPlayer?.name ?? null}
          onSelectSlot={handleSelectSlot}
          onSwapSlots={swapSlots}
        />
        <BattingOrderList
          players={battingOrder}
          assignments={editor.assignments}
          accumulated={accumulated}
          onMove={moveBatter}
          onReorder={reorderBatters}
          onSelectPlayer={onSelectPlayer}
        />
      </div>

      <BenchPanel
        players={benchPlayers}
        accumulated={accumulated}
        armedPlayerId={armedBenchId}
        onToggleArm={toggleArmBench}
        onSelectPlayer={onSelectPlayer}
      />

      {selectedSlot && (
        <PositionPickerSheet
          slot={selectedSlot}
          players={activeFielders}
          assignments={editor.assignments}
          onSelect={(player) => assignPlayer(selectedSlot, player)}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

export function LineupTab({ onDirtyChange }: { onDirtyChange(dirty: boolean): void }) {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;
  return (
    <LineupEditor
      team={game.teams[game.playerTeam]}
      lineup={game.lineup}
      accumulated={game.accumulated}
      onCommit={game.setLineup}
      onSelectPlayer={game.selectPlayer}
      onDirtyChange={onDirtyChange}
    />
  );
}
