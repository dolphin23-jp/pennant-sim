import { useEffect, useRef, useState } from 'react';

import { TINFO } from '../../data';
import {
  SAVE_SLOTS,
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
}: {
  beforeExport?: () => Promise<boolean>;
  warnBeforeSwitch?: boolean;
}) {
  const [activeSlot, setActiveSlot] = useState<SaveSlot>(1);
  const [summaries, setSummaries] = useState<SaveSlotSummary[]>([]);
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getActiveSaveSlot(), listSaveSlots()]).then(([slot, slots]) => {
      if (!active) return;
      setActiveSlot(slot);
      setSummaries(slots);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = async () => setSummaries(await listSaveSlots());

  const handleSlotChange = async (slot: SaveSlot) => {
    if (
      warnBeforeSwitch &&
      slot !== activeSlot &&
      !window.confirm('未保存の変更は失われます。別のセーブスロットへ切り替えますか？')
    )
      return;
    await setActiveSaveSlot(slot);
    setActiveSlot(slot);
    window.location.reload();
  };

  const handleExport = async () => {
    if (beforeExport && !(await beforeExport())) {
      setStatus('保存に失敗したため出力を中止しました');
      return;
    }
    const success = await downloadSaveSlot(activeSlot);
    setStatus(success ? `スロット${activeSlot}を出力しました` : '出力できるセーブがありません');
    await refresh();
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    const current = summaries.find((summary) => summary.slot === activeSlot);
    if (
      current?.exists &&
      !window.confirm(`スロット${activeSlot}のセーブをアップロード内容で上書きしますか？`)
    )
      return;
    const success = await importSaveFileToSlot(file, activeSlot);
    setStatus(success ? `スロット${activeSlot}へ読み込みました` : 'JSONを読み込めませんでした');
    if (success) window.location.reload();
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
          value={activeSlot}
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
              </option>
            );
          })}
        </select>
      </label>
      <Button
        onClick={() => void handleExport()}
        disabled={!summaries.find((summary) => summary.slot === activeSlot)?.exists && !beforeExport}
        color="var(--color-surface-muted)"
        ariaLabel={`スロット${activeSlot}をJSONファイルとして出力`}
      >
        JSON出力
      </Button>
      <Button
        onClick={() => fileInput.current?.click()}
        color="var(--color-surface-muted)"
        ariaLabel={`JSONファイルをスロット${activeSlot}へ読み込む`}
      >
        JSON読込
      </Button>
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
