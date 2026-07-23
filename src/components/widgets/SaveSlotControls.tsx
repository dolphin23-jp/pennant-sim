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
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ color: '#7f9ab4', fontSize: 12 }}>
        セーブ枠
        <select
          value={activeSlot}
          onChange={(event) => void handleSlotChange(Number(event.target.value) as SaveSlot)}
          style={{
            marginLeft: 6,
            background: '#0a1218',
            color: '#f3f7ff',
            border: '1px solid #1a2535',
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
        color="#1a2535"
      >
        JSON出力
      </Button>
      <Button onClick={() => fileInput.current?.click()} color="#1a2535">
        JSON読込
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void handleImport(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <span style={{ color: '#64d69a', fontSize: 12 }}>{status}</span>
    </div>
  );
}
