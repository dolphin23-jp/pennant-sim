import { useState, type CSSProperties } from 'react';

import { TINFO } from '../../data';
import { deriveTeamForm } from '../../engine';
import { useGameState } from '../../state/gameState';
import { useOpenSettings } from '../settingsSheetContext';
import { BackToTitleButton, Button, NewGameButton } from '../ui';

/**
 * The season screen's header as a ballpark scoreboard: the club and season on the left,
 * the numbers that matter today lit up on the right, and the save and exit actions tucked
 * into a menu so they no longer compete with the game itself.
 */
export function SeasonScoreboard() {
  const game = useGameState();
  const [saveStatus, setSaveStatus] = useState('');
  const openSettings = useOpenSettings();
  if (!game.teams || !game.playerTeam) return null;
  const team = TINFO[game.playerTeam];
  const record = game.standings[game.playerTeam];
  const form = deriveTeamForm(game.season.schedule, game.playerTeam);
  const remaining = game.season.schedule.filter(
    (scheduled) =>
      !scheduled.played &&
      (scheduled.homeKey === game.playerTeam || scheduled.awayKey === game.playerTeam),
  ).length;
  const pct = record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '');
  const streakTone = form.streak.includes('連勝')
    ? 'season-board__value--hot'
    : form.streak.includes('連敗')
      ? 'season-board__value--cold'
      : '';

  const handleSave = async () => {
    const success = await game.saveCurrent();
    setSaveStatus(success ? '保存しました' : '保存に失敗しました');
    window.setTimeout(() => setSaveStatus(''), 1800);
  };

  const cells: Array<{ label: string; value: string; className?: string }> = [
    {
      label: '順位',
      value: record.rank ? `${record.rank}位` : '-',
      className: 'season-board__value--rank',
    },
    { label: '勝敗', value: `${record.w}-${record.l}-${record.d}` },
    { label: '勝率', value: pct },
    { label: '差', value: record.gb && record.gb !== '-' ? record.gb : '首位' },
    { label: '連続', value: form.streak, className: streakTone },
    { label: '残り', value: `${remaining}` },
  ];

  return (
    <header
      className="season-board"
      aria-labelledby="season-screen-title"
      style={{ '--season-board-color': team.c } as CSSProperties}
    >
      <div className="season-board__identity">
        <span className="season-board__swatch" aria-hidden="true" />
        <div>
          <div className="season-board__team">{team.n}</div>
          <h1 id="season-screen-title" className="season-board__title">
            {game.season.year}年シーズン
          </h1>
        </div>
      </div>
      <dl className="season-board__stats" aria-label="現在の成績">
        {cells.map((cell) => (
          <div key={cell.label} className="season-board__cell">
            <dt>{cell.label}</dt>
            <dd className={`season-board__value ${cell.className ?? ''}`.trim()}>{cell.value}</dd>
          </div>
        ))}
      </dl>
      <div className="season-board__actions">
        <span className="season-board__status" role="status" aria-live="polite">
          {saveStatus}
        </span>
        <Button
          onClick={() => void handleSave()}
          color="var(--color-surface-muted)"
          ariaLabel="現在のゲームを保存"
        >
          保存
        </Button>
        <details className="season-menu">
          <summary aria-label="その他のメニュー">メニュー</summary>
          <div className="season-menu__panel">
            <Button
              onClick={openSettings}
              color="var(--color-surface-muted)"
              ariaLabel="設定を開く"
            >
              設定
            </Button>
            <NewGameButton onStartNewGame={game.startNewGame} />
            <BackToTitleButton onGoToTitle={() => game.setScreen('welcome')} />
          </div>
        </details>
      </div>
    </header>
  );
}
