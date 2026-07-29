import { useEffect, useRef, useState } from 'react';

import { TINFO } from '../../data';
import { useSettings } from '../../state/settings';
import {
  SAVE_SLOTS,
  clearSaveSlot,
  downloadSaveSlot,
  getActiveSaveSlot,
  importSaveFileToSlot,
  listSaveSlots,
  setActiveSaveSlot,
  type SaveSlot,
  type SaveSlotSummary,
} from '../../state/storage';
import { Button } from '../ui';

export function SaveSlotControls({
  beforeExport,
  warnBeforeSwitch = false,
  deferLoad = false,
  allowClear = false,
  onSlotChange,
  onActiveSlotCleared,
}: {
  beforeExport?: () => Promise<boolean>;
  warnBeforeSwitch?: boolean;
  /**
   * When true, picking a slot in the dropdown only targets it for the other actions
   * (JSON export/import, and the caller's own load/new-game buttons) - it does NOT
   * immediately reload into that slot's save. Without this, merely browsing slots on
   * the title screen silently resumed whatever game was saved there, so there was never
   * a chance to press "start new" before the old save had already loaded. Renders an
   * explicit "続きから読み込む" button instead.
   */
  deferLoad?: boolean;
  /** Renders a destructive "この枠を初期化" button that wipes the selected slot's data.
   * Always confirms regardless of any "skip confirmations" preference - unlike switching
   * or overwriting a slot, this can't be undone by picking a different slot afterward. */
  allowClear?: boolean;
  /** Fires whenever the targeted slot changes, so a parent (e.g. the title screen's
   * "start new game" button) knows which slot to act on. */
  onSlotChange?(slot: SaveSlot): void;
  /** Fires only when the slot just cleared was the *active* slot (the one actually
   * loaded), so a parent can reset its in-memory game state - otherwise the next
   * autosave would silently recreate the save that was just wiped. Clearing any other
   * slot needs no such reaction, since nothing in memory is backed by it. */
  onActiveSlotCleared?(): void;
}) {
  const { skipConfirmations } = useSettings();
  const [activeSlot, setActiveSlot] = useState<SaveSlot>(1);
  const [selectedSlot, setSelectedSlot] = useState<SaveSlot>(1);
  const [summaries, setSummaries] = useState<SaveSlotSummary[]>([]);
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getActiveSaveSlot(), listSaveSlots()]).then(([slot, slots]) => {
      if (!active) return;
      setActiveSlot(slot);
      setSelectedSlot(slot);
      onSlotChange?.(slot);
      setSummaries(slots);
    });
    return () => {
      active = false;
    };
    // Only run once on mount - `onSlotChange` is a fresh closure each render and
    // including it would re-fire this effect (and the callback) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => setSummaries(await listSaveSlots());
  const selectedSummary = summaries.find((summary) => summary.slot === selectedSlot);

  const handleSlotChange = async (slot: SaveSlot) => {
    if (!deferLoad) {
      if (
        warnBeforeSwitch &&
        slot !== activeSlot &&
        !skipConfirmations &&
        !window.confirm('未保存の変更は失われます。別のセーブスロットへ切り替えますか？')
      )
        return;
      await setActiveSaveSlot(slot);
      setActiveSlot(slot);
      setSelectedSlot(slot);
      onSlotChange?.(slot);
      window.location.reload();
      return;
    }
    setSelectedSlot(slot);
    onSlotChange?.(slot);
  };

  const handleLoadSelected = async () => {
    await setActiveSaveSlot(selectedSlot);
    window.location.reload();
  };

  const handleExport = async () => {
    if (beforeExport && !(await beforeExport())) {
      setStatus('保存に失敗したため出力を中止しました');
      return;
    }
    const success = await downloadSaveSlot(selectedSlot);
    setStatus(success ? `スロット${selectedSlot}を出力しました` : '出力できるセーブがありません');
    await refresh();
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    if (
      selectedSummary?.exists &&
      !skipConfirmations &&
      !window.confirm(`スロット${selectedSlot}のセーブをアップロード内容で上書きしますか？`)
    )
      return;
    const success = await importSaveFileToSlot(file, selectedSlot);
    setStatus(success ? `スロット${selectedSlot}へ読み込みました` : 'JSONを読み込めませんでした');
    if (success) {
      await setActiveSaveSlot(selectedSlot);
      window.location.reload();
    }
  };

  const handleClear = async () => {
    if (
      !window.confirm(
        `スロット${selectedSlot}のセーブデータを完全に削除しますか？この操作は元に戻せません。`,
      )
    )
      return;
    const wasActiveSlot = selectedSlot === activeSlot;
    const success = await clearSaveSlot(selectedSlot);
    setStatus(success ? `スロット${selectedSlot}を初期化しました` : '初期化に失敗しました');
    if (success) {
      if (wasActiveSlot) onActiveSlotCleared?.();
      await refresh();
    }
  };

  return (
    <div
      aria-label="セーブスロット操作"
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <label style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
        セーブ枠
        <select
          aria-label="使用するセーブスロット"
          value={selectedSlot}
          onChange={(event) => void handleSlotChange(Number(event.target.value) as SaveSlot)}
          style={{
            marginLeft: 6,
            background: 'var(--color-bg-soft)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 7,
            padding: '8px 10px',
          }}
        >
          {SAVE_SLOTS.map((slot) => {
            const summary = summaries.find((candidate) => candidate.slot === slot),
              team = summary?.playerTeam ? TINFO[summary.playerTeam].ab : null;
            return (
              <option key={slot} value={slot}>
                スロット{slot} — {summary?.exists ? `${team ?? '未選択'} ${summary.year ?? '-'}年` : '空き'}
                {slot === activeSlot ? '（読込中）' : ''}
              </option>
            );
          })}
        </select>
      </label>
      {deferLoad && (
        <Button
          onClick={() => void handleLoadSelected()}
          disabled={!selectedSummary?.exists}
          color="var(--color-surface-muted)"
          ariaLabel={`スロット${selectedSlot}のセーブを読み込んで続きから再開`}
        >
          続きから読み込む
        </Button>
      )}
      <Button
        onClick={() => void handleExport()}
        disabled={!selectedSummary?.exists && !beforeExport}
        color="var(--color-surface-muted)"
        ariaLabel={`スロット${selectedSlot}をJSONファイルとして出力`}
      >
        JSON出力
      </Button>
      <Button
        onClick={() => fileInput.current?.click()}
        color="var(--color-surface-muted)"
        ariaLabel={`JSONファイルをスロット${selectedSlot}へ読み込む`}
      >
        JSON読込
      </Button>
      {allowClear && (
        <Button
          onClick={() => void handleClear()}
          disabled={!selectedSummary?.exists}
          color="var(--color-danger)"
          ariaLabel={`スロット${selectedSlot}のセーブデータを初期化`}
        >
          この枠を初期化
        </Button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="読み込むセーブJSONファイル"
        onChange={(event) => {
          void handleImport(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <span className="inline-status" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
