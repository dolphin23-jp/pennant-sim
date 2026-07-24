import { useCallback, useEffect, useMemo, useState } from 'react';

import { bestLineup, calcOVR, effectiveOVR } from '../../../engine';
import type { FieldPosition, Player } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, SectionTitle } from '../../ui';
import { BattingOrderList } from '../../widgets/BattingOrderList';
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
    .map((saved) => {
      const current = rosterById.get(saved.id);
      return current ? { ...current, _assignedPos: saved._assignedPos } : null;
    })
    .filter((player): player is Player => Boolean(player));
  const used = new Set<string>();

  for (const position of FIELD_SLOT_ORDER) {
    const savedAtPosition = savedPlayers.find(
      (player) => !used.has(player.id) && player._assignedPos === position,
    );
    const naturalAtPosition = savedPlayers.find(
      (player) => !used.has(player.id) && player.pos === position,
    );
    const bestAvailable = fielders
      .filter((player) => !used.has(player.id))
      .sort((first, second) => effectiveOVR(second, position) - effectiveOVR(first, position))[0];
    const selected = savedAtPosition ?? naturalAtPosition ?? bestAvailable ?? null;
    assignments[position] = selected;
    if (selected) used.add(selected.id);
  }

  const savedExtra = savedPlayers.find((player) => !used.has(player.id));
  const bestExtra = fielders
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
  const byId = new Map(
    LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot])
      .filter((player): player is Player => Boolean(player))
      .map((player) => [player.id, player]),
  );
  return editor.orderIds.map((id) => byId.get(id)).filter((player): player is Player => Boolean(player));
}

function lineupFromEditor(editor: EditorState): Player[] {
  const assignedPositionById = new Map<string, FieldPosition>();
  for (const position of FIELD_SLOT_ORDER) {
    const player = editor.assignments[position];
    if (player) assignedPositionById.set(player.id, position);
  }
  const byId = new Map(
    LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot])
      .filter((player): player is Player => Boolean(player))
      .map((player) => [player.id, player]),
  );
  return editor.orderIds
    .map((id) => {
      const player = byId.get(id);
      if (!player) return null;
      const assignedPosition = assignedPositionById.get(id);
      return { ...player, _assignedPos: assignedPosition };
    })
    .filter((player): player is Player => Boolean(player));
}

export function LineupTab({ onDirtyChange }: { onDirtyChange(dirty: boolean): void }) {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;
  const team = game.teams[game.playerTeam];
  const [editor, setEditor] = useState<EditorState>(() => createEditorState(game.lineup, team.fielders));
  const [savedSignature, setSavedSignature] = useState(() => editorSignature(editor));
  const [selectedSlot, setSelectedSlot] = useState<LineupSlot | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const next = createEditorState(game.lineup, team.fielders);
    setEditor(next);
    setSavedSignature(editorSignature(next));
    setSelectedSlot(null);
  }, [game.lineup, team.fielders]);

  const signature = editorSignature(editor);
  const dirty = signature !== savedSignature;
  const battingOrder = useMemo(() => selectedPlayers(editor), [editor]);
  const complete =
    LINEUP_SLOT_ORDER.every((slot) => Boolean(editor.assignments[slot])) &&
    new Set(LINEUP_SLOT_ORDER.map((slot) => editor.assignments[slot]?.id)).size === 9 &&
    battingOrder.length === 9;

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

  const assignPlayer = (player: Player) => {
    if (!selectedSlot) return;
    setEditor((current) => {
      const assignments = { ...current.assignments };
      const existingSlot = LINEUP_SLOT_ORDER.find(
        (slot) => assignments[slot]?.id === player.id,
      );
      const displaced = assignments[selectedSlot];
      assignments[selectedSlot] = player;
      if (existingSlot && existingSlot !== selectedSlot) assignments[existingSlot] = displaced;

      let orderIds = [...current.orderIds];
      if (!orderIds.includes(player.id)) {
        const displacedIndex = displaced ? orderIds.indexOf(displaced.id) : -1;
        if (displacedIndex >= 0) orderIds[displacedIndex] = player.id;
        else orderIds.push(player.id);
      }
      orderIds = normalizeOrder(orderIds, assignments);
      return { assignments, orderIds };
    });
    setSelectedSlot(null);
    setStatus('変更はまだ保存されていません。');
  };

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

  const saveLineup = () => {
    if (!complete) return;
    const lineup = lineupFromEditor(editor);
    game.setLineup(lineup);
    setSavedSignature(signature);
    setStatus('✓ オーダーを保存しました。');
  };

  const discardChanges = () => {
    const next = createEditorState(game.lineup, team.fielders);
    setEditor(next);
    setSavedSignature(editorSignature(next));
    setSelectedSlot(null);
    setStatus('変更を破棄しました。');
  };

  const applyRecommended = () => {
    const next = createEditorState(bestLineup(team), team.fielders);
    setEditor(next);
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
              守備位置をタップして選手を選び、打順は矢印で変更します。
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
          {!complete ? '9つの枠すべてに異なる選手を配置してください。' : status || (dirty ? '未保存の変更があります。' : '保存済みです。')}
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.55fr) minmax(280px,0.75fr)',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <FieldDiagram
          assignments={editor.assignments}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
        />
        <BattingOrderList
          players={battingOrder}
          assignments={editor.assignments}
          onMove={moveBatter}
          onSelectPlayer={game.selectPlayer}
        />
      </div>

      {selectedSlot && (
        <PositionPickerSheet
          slot={selectedSlot}
          players={team.fielders}
          assignments={editor.assignments}
          onSelect={assignPlayer}
          onClose={closePicker}
        />
      )}
    </div>
  );
}
