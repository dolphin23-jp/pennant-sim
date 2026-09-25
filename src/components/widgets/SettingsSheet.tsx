import { useEffect, useRef } from 'react';

import {
  NOTICE_KIND_LABEL,
  NOTICE_KIND_ORDER,
  useSettings,
  type Theme,
} from '../../state/settings';
import { Button, SectionTitle, SegmentedControl } from '../ui';
import { SOUND_PREVIEW, sound } from '../../audio/sound';
import { SaveSlotControls } from './SaveSlotControls';
import { useFocusTrap } from './useFocusTrap';

const THEME_OPTIONS = [
  { id: 'dark' as Theme, label: 'ダーク' },
  { id: 'light' as Theme, label: 'ライト' },
];

export function SettingsSheet({
  debugMode,
  onToggleDebugMode,
  hasActiveGame,
  onSaveCurrent,
  onActiveSlotCleared,
  onClose,
}: {
  debugMode: boolean;
  onToggleDebugMode(): void;
  hasActiveGame: boolean;
  onSaveCurrent?: () => Promise<boolean>;
  onActiveSlotCleared(): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const {
    theme,
    setTheme,
    skipConfirmations,
    setSkipConfirmations,
    hiddenNoticeKinds,
    toggleNoticeKind,
    soundEnabled,
    setSoundEnabled,
    volume,
    setVolume,
    reduceEffects,
    setReduceEffects,
    autoLiveWatch,
    setAutoLiveWatch,
  } = useSettings();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useFocusTrap(dialogRef, true);

  return (
    <div
      className="player-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className="player-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-sheet-title"
        tabIndex={-1}
        style={{ maxWidth: 560 }}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="settings-sheet-title">
              設定
            </h1>
          </div>
          <Button onClick={onClose} color="var(--color-surface-muted)" ariaLabel="設定を閉じる">
            閉じる
          </Button>
        </header>
        <div className="player-modal__body">
          <section className="settings-sheet__section">
            <SectionTitle>表示</SectionTitle>
            <div className="settings-sheet__row">
              <span>テーマ</span>
              <SegmentedControl
                options={THEME_OPTIONS}
                value={theme}
                onChange={setTheme}
                ariaLabel="テーマ"
              />
            </div>
          </section>

          <section className="settings-sheet__section">
            <SectionTitle>サウンドと演出</SectionTitle>
            <div className="settings-sheet__row">
              <div>
                <span>効果音</span>
                <div className="settings-sheet__description">
                  打球音・歓声・オルガン・サイレンなど。音声ファイルは使わず、ブラウザ内で合成します。
                </div>
              </div>
              <label className="settings-sheet__checkbox">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(event) => {
                    setSoundEnabled(event.target.checked);
                    if (event.target.checked) {
                      sound.configure(true, volume);
                      sound.unlock();
                      sound.play('chime');
                    }
                  }}
                  aria-label="効果音を鳴らす"
                />
                {soundEnabled ? 'ON' : 'OFF'}
              </label>
            </div>
            {soundEnabled && (
              <div className="settings-sheet__row">
                <label htmlFor="settings-volume">音量</label>
                <div className="settings-sheet__volume">
                  <input
                    id="settings-volume"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(volume * 100)}
                    onChange={(event) => setVolume(Number(event.target.value) / 100)}
                  />
                  <Button
                    onClick={() => {
                      sound.unlock();
                      SOUND_PREVIEW.forEach((cue, index) =>
                        window.setTimeout(() => sound.play(cue), index * 700),
                      );
                    }}
                    color="var(--color-surface-muted)"
                  >
                    試し聴き
                  </Button>
                </div>
              </div>
            )}
            <div className="settings-sheet__row">
              <div>
                <span>演出を控えめに</span>
                <div className="settings-sheet__description">
                  画面の揺れ・紙吹雪・アニメーションを止めます。
                </div>
              </div>
              <label className="settings-sheet__checkbox">
                <input
                  type="checkbox"
                  checked={reduceEffects}
                  onChange={(event) => setReduceEffects(event.target.checked)}
                  aria-label="演出を控えめにする"
                />
                {reduceEffects ? 'ON' : 'OFF'}
              </label>
            </div>
            <div className="settings-sheet__row">
              <div>
                <span>次の試合をライブで観戦</span>
                <div className="settings-sheet__description">
                  「次の試合」のあと、自球団の試合を1打席ずつ再生します。スキップやおまかせ進行では開きません。
                </div>
              </div>
              <label className="settings-sheet__checkbox">
                <input
                  type="checkbox"
                  checked={autoLiveWatch}
                  onChange={(event) => setAutoLiveWatch(event.target.checked)}
                  aria-label="次の試合をライブで観戦する"
                />
                {autoLiveWatch ? 'ON' : 'OFF'}
              </label>
            </div>
          </section>

          <section className="settings-sheet__section">
            <SectionTitle>操作</SectionTitle>
            <div className="settings-sheet__row">
              <div>
                <span>確認ダイアログを省略</span>
                <div className="settings-sheet__description">
                  新しいゲームの開始やセーブ枠の切替・上書きの確認をスキップします。データを完全に削除する操作は対象外です。
                </div>
              </div>
              <label className="settings-sheet__checkbox">
                <input
                  type="checkbox"
                  checked={skipConfirmations}
                  onChange={(event) => setSkipConfirmations(event.target.checked)}
                  aria-label="確認ダイアログを省略する"
                />
                省略する
              </label>
            </div>
            <div className="settings-sheet__row">
              <div>
                <span>デバッグモード</span>
                <div className="settings-sheet__description">
                  選手エディット機能（デバッグ用）の表示切替です。試合結果には影響しません。
                </div>
              </div>
              <label className="settings-sheet__checkbox">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={onToggleDebugMode}
                  aria-label={
                    debugMode ? 'デバッグモードを無効にする' : 'デバッグモードを有効にする'
                  }
                />
                {debugMode ? 'ON' : 'OFF'}
              </label>
            </div>
          </section>

          <section className="settings-sheet__section">
            <SectionTitle>お知らせの表示</SectionTitle>
            <div className="settings-sheet__description" style={{ marginBottom: 8 }}>
              チーム通知センターに表示する種類を選べます。
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {NOTICE_KIND_ORDER.map((kind) => (
                <label key={kind} className="settings-sheet__checkbox">
                  <input
                    type="checkbox"
                    checked={!hiddenNoticeKinds.has(kind)}
                    onChange={() => toggleNoticeKind(kind)}
                    aria-label={`${NOTICE_KIND_LABEL[kind]}の通知を表示する`}
                  />
                  {NOTICE_KIND_LABEL[kind]}
                </label>
              ))}
            </div>
          </section>

          {hasActiveGame && (
            <section className="settings-sheet__section">
              <SectionTitle>セーブデータ管理</SectionTitle>
              <SaveSlotControls
                beforeExport={onSaveCurrent}
                warnBeforeSwitch
                allowClear
                onActiveSlotCleared={onActiveSlotCleared}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
