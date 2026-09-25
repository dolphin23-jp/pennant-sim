import { useEffect, useState, type CSSProperties } from 'react';

import { TINFO } from '../../data';
import { useGameState } from '../../state/gameState';
import { useSettings } from '../../state/settings';
import {
  SAVE_SLOTS,
  getActiveSaveSlot,
  listSaveSlots,
  setActiveSaveSlot,
  type SaveSlot,
  type SaveSlotSummary,
} from '../../state/storage';
import { useConfirm } from '../ConfirmDialog';
import { Button } from '../ui';
import { SaveSlotControls } from '../widgets/SaveSlotControls';

const updatedText = (time: number | null): string =>
  time
    ? new Date(time).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

function SlotCard({
  slot,
  summary,
  active,
  onContinue,
  onStartNew,
}: {
  slot: SaveSlot;
  summary: SaveSlotSummary | undefined;
  active: boolean;
  onContinue(): void;
  onStartNew(): void;
}) {
  const team = summary?.exists && summary.playerTeam ? TINFO[summary.playerTeam] : null;
  return (
    <article
      className={`title-slot${team ? ' title-slot--used' : ''}`}
      style={team ? ({ '--title-slot-color': team.c } as CSSProperties) : undefined}
      aria-label={`スロット${slot}`}
    >
      <header className="title-slot__header">
        <span className="title-slot__number">SLOT {slot}</span>
        {active && <span className="title-slot__active">前回のプレイ</span>}
      </header>
      {summary?.exists ? (
        <>
          <div className="title-slot__team">{team?.n ?? 'チーム未選択'}</div>
          <div className="title-slot__meta">
            {summary.year ? `${summary.year}年シーズン` : ''}
            {summary.updatedAt ? ` ・ ${updatedText(summary.updatedAt)} 保存` : ''}
          </div>
          <div className="title-slot__actions">
            <Button
              onClick={onContinue}
              ariaLabel={`スロット${slot}のセーブを読み込んで続きから再開`}
            >
              続きから
            </Button>
            <Button
              onClick={onStartNew}
              color="var(--color-surface-muted)"
              ariaLabel={`スロット${slot}で新規ゲームを開始`}
            >
              新しく始める
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="title-slot__empty">空き</div>
          <div className="title-slot__meta">新しい球団の歴史を始められます</div>
          <div className="title-slot__actions">
            <Button onClick={onStartNew} ariaLabel={`スロット${slot}で新規ゲームを開始`}>
              新しく始める
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

/**
 * The game's front door: a night ballpark, the scoreboard logo, and the three save slots
 * as cards, each showing whose history it holds. JSON export and import sit behind a
 * disclosure, since they are maintenance rather than play.
 */
export function TitleScreen() {
  const game = useGameState();
  const { skipConfirmations } = useSettings();
  const confirm = useConfirm();
  const [summaries, setSummaries] = useState<SaveSlotSummary[]>([]);
  const [activeSlot, setActive] = useState<SaveSlot | null>(null);
  // Reachable via "タイトルへ戻る" mid-game: the previous game is still live in memory,
  // so offer to jump straight back to it instead of only offering to reload from disk.
  const canResume = Boolean(game.teams && game.playerTeam);

  useEffect(() => {
    let live = true;
    void Promise.all([listSaveSlots(), getActiveSaveSlot()]).then(([slots, slot]) => {
      if (!live) return;
      setSummaries(slots);
      setActive(slot);
    });
    return () => {
      live = false;
    };
  }, []);

  const handleContinue = async (slot: SaveSlot) => {
    await setActiveSaveSlot(slot);
    window.location.reload();
  };

  const handleStartNew = async (slot: SaveSlot) => {
    const exists = summaries.find((summary) => summary.slot === slot)?.exists;
    if (
      exists &&
      !skipConfirmations &&
      !(await confirm({
        title: `スロット${slot}で新しいゲームを始めますか？`,
        message: 'チームを選ぶと、このスロットの今のセーブは上書きされます。',
        confirmLabel: '新しいゲームへ',
        danger: true,
      }))
    )
      return;
    await setActiveSaveSlot(slot);
    game.startNewGame();
  };

  const handleResume = () => {
    const seasonOver =
      game.season.schedule.length > 0 &&
      game.season.schedule.every((scheduled) => scheduled.played);
    game.setScreen(seasonOver ? 'postseason' : 'season');
  };

  const resumeTeam = canResume && game.playerTeam ? TINFO[game.playerTeam] : null;

  return (
    <main className="title-screen" aria-label="スタート画面">
      <div className="stadium-backdrop" aria-hidden="true" />
      <div className="title-screen__inner">
        <header className="title-board">
          <p className="title-board__eyebrow">NPB PENNANT SIMULATOR</p>
          <h1 className="title-board__logo">
            <span>PENNANT</span>
            <span className="title-board__logo-accent">SIM</span>
          </h1>
          <p className="title-board__tagline">12球団の歴史を、10年、50年と見届ける。</p>
        </header>

        {game.loadError && (
          <p role="alert" className="title-screen__error">
            {game.loadError}
          </p>
        )}

        {resumeTeam && (
          <div className="title-resume">
            <Button
              onClick={handleResume}
              color={resumeTeam.c}
              ariaLabel="タイトルへ戻る前のゲームを再開"
            >
              {resumeTeam.ab}の{game.season.year}年シーズンに戻る
            </Button>
          </div>
        )}

        <section className="title-slots" aria-label="セーブ枠">
          {SAVE_SLOTS.map((slot) => (
            <SlotCard
              key={slot}
              slot={slot}
              summary={summaries.find((summary) => summary.slot === slot)}
              active={
                slot === activeSlot && Boolean(summaries.find((s) => s.slot === slot)?.exists)
              }
              onContinue={() => void handleContinue(slot)}
              onStartNew={() => void handleStartNew(slot)}
            />
          ))}
        </section>

        <details className="title-manage">
          <summary>セーブの管理（JSONで書き出す・読み込む）</summary>
          <p className="title-manage__note">
            セーブはこのブラウザに保存されます。別の端末へ移すときや控えを取るときは、JSONで書き出してください。
          </p>
          <SaveSlotControls deferLoad />
        </details>
      </div>
    </main>
  );
}
