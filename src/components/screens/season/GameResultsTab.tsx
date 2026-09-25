import { useMemo, useState, type ReactNode } from 'react';

import { TINFO } from '../../../data';
import type { GameSummary, ScheduleGame } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, EmptyState, SectionTitle, teamTextColor } from '../../ui';
import { DecisionsRow } from '../../widgets/GameDetailView';

function StatusTag({ children }: { children: ReactNode }) {
  return <span className="game-results-tag">{children}</span>;
}

function GameResultRow({
  scheduleGame,
  summary,
  isPlayerGame,
  onOpen,
}: {
  scheduleGame: ScheduleGame;
  summary: GameSummary | undefined;
  isPlayerGame: boolean;
  onOpen(): void;
}) {
  const home = TINFO[scheduleGame.homeKey];
  const away = TINFO[scheduleGame.awayKey];

  if (!scheduleGame.played) {
    return (
      <div className="game-results-row game-results-row--pending">
        <span className="game-results-row__teams">
          <span style={{ color: teamTextColor(away.c) }}>{away.ab}</span>
          {' @ '}
          <span style={{ color: teamTextColor(home.c) }}>{home.ab}</span>
        </span>
        <span className="game-results-row__note">試合前</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="game-results-row">
        <span className="game-results-row__teams">
          <span style={{ color: teamTextColor(away.c) }}>{away.ab}</span> {scheduleGame.as}-
          {scheduleGame.hs} <span style={{ color: teamTextColor(home.c) }}>{home.ab}</span>
        </span>
        <span className="game-results-row__note">詳細ログ対象外</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${scheduleGame.date} ${away.n}対${home.n} 試合詳細を表示`}
      className={`game-results-card${isPlayerGame ? ' game-results-card--mine' : ''}`}
    >
      <div className="game-results-card__header">
        <span className="game-results-card__score">
          <span style={{ color: teamTextColor(away.c) }}>{away.ab}</span>
          <span className="game-results-card__score-value">
            {summary.awayScore} - {summary.homeScore}
          </span>
          <span style={{ color: teamTextColor(home.c) }}>{home.ab}</span>
        </span>
        <span className="game-results-card__tags">
          {summary.tie && <StatusTag>引分</StatusTag>}
          {summary.extraInnings && <StatusTag>延長{summary.innings.length}回</StatusTag>}
          {summary.walkoff && <StatusTag>サヨナラ</StatusTag>}
          {summary.shutoutTeam && <StatusTag>{TINFO[summary.shutoutTeam].ab}完封</StatusTag>}
        </span>
      </div>
      {summary.headline && <div className="game-results-card__headline">{summary.headline}</div>}
      <div className="game-results-card__decisions">
        <DecisionsRow decisions={summary.decisions} />
      </div>
    </button>
  );
}

export function GameResultsTab() {
  const game = useGameState();
  const [manualDate, setManualDate] = useState<string | null>(null);

  const playedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const scheduleGame of game.season.schedule) {
      if (scheduleGame.played) dates.add(scheduleGame.date);
    }
    return [...dates].sort();
  }, [game.season.schedule]);

  const latestPlayedDate = playedDates[playedDates.length - 1] ?? null;
  const selectedDate =
    manualDate && playedDates.includes(manualDate) ? manualDate : latestPlayedDate;
  const dateIndex = selectedDate ? playedDates.indexOf(selectedDate) : -1;
  const canGoPrev = dateIndex > 0;
  const canGoNext = dateIndex >= 0 && dateIndex < playedDates.length - 1;

  const gamesForDate = useMemo(() => {
    if (!selectedDate) return [];
    const games = game.season.schedule.filter((scheduleGame) => scheduleGame.date === selectedDate);
    return [...games].sort((first, second) => {
      const firstMine = first.homeKey === game.playerTeam || first.awayKey === game.playerTeam;
      const secondMine = second.homeKey === game.playerTeam || second.awayKey === game.playerTeam;
      return firstMine === secondMine ? 0 : firstMine ? -1 : 1;
    });
  }, [game.season.schedule, selectedDate, game.playerTeam]);

  if (!playedDates.length) {
    return (
      <Card ariaLabel="試合結果">
        <SectionTitle>試合結果</SectionTitle>
        <EmptyState>
          まだ試合が行われていません。「次戦を実行」やスキップで試合を進めてください。
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="game-results">
      <Card ariaLabel="日付選択">
        <div className="game-results__date-nav">
          <Button
            onClick={() => setManualDate(playedDates[dateIndex - 1] ?? null)}
            disabled={!canGoPrev}
            color="var(--color-surface-muted)"
            ariaLabel="前日の試合結果を表示"
          >
            ← 前日
          </Button>
          <input
            type="date"
            value={selectedDate ?? ''}
            min={playedDates[0]}
            max={latestPlayedDate ?? undefined}
            onChange={(event) => setManualDate(event.target.value || null)}
            aria-label="表示する日付"
            className="game-results__date-input"
          />
          <Button
            onClick={() => setManualDate(playedDates[dateIndex + 1] ?? null)}
            disabled={!canGoNext}
            color="var(--color-surface-muted)"
            ariaLabel="翌日の試合結果を表示"
          >
            翌日 →
          </Button>
          {latestPlayedDate && selectedDate !== latestPlayedDate && (
            <Button
              onClick={() => setManualDate(latestPlayedDate)}
              color="var(--color-accent)"
              ariaLabel="最新の試合結果を表示"
            >
              最新へ
            </Button>
          )}
        </div>
      </Card>

      <Card ariaLabel={`${selectedDate ?? ''}の試合結果`}>
        <SectionTitle>{selectedDate}の試合結果</SectionTitle>
        {!gamesForDate.length ? (
          <EmptyState>この日の試合はありません。</EmptyState>
        ) : (
          <div role="list" aria-label="当日の試合一覧" className="game-results__list">
            {gamesForDate.map((scheduleGame) => (
              <div role="listitem" key={scheduleGame.id}>
                <GameResultRow
                  scheduleGame={scheduleGame}
                  summary={game.gameSummaries[scheduleGame.id]}
                  isPlayerGame={
                    scheduleGame.homeKey === game.playerTeam ||
                    scheduleGame.awayKey === game.playerTeam
                  }
                  onOpen={() => game.selectGame(scheduleGame.id)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
