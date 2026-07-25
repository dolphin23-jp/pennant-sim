import { useMemo, useState, type ReactNode } from 'react';

import { TINFO } from '../../../data';
import type { GameSummary, ScheduleGame } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, EmptyState, SectionTitle, teamTextColor } from '../../ui';
import { DecisionsRow } from '../../widgets/GameDetailView';

function StatusTag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        padding: '2px 7px',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 999,
        color: 'var(--color-text-muted)',
        fontSize: 10,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 14px',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          opacity: 0.55,
        }}
      >
        <span style={{ fontWeight: 800 }}>
          <span style={{ color: teamTextColor(away.c) }}>{away.ab}</span>
          {' @ '}
          <span style={{ color: teamTextColor(home.c) }}>{home.ab}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>試合前</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 14px',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
        }}
      >
        <span style={{ fontWeight: 800 }}>
          <span style={{ color: teamTextColor(away.c) }}>{away.ab}</span> {scheduleGame.as}-
          {scheduleGame.hs} <span style={{ color: teamTextColor(home.c) }}>{home.ab}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>詳細ログ対象外</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${scheduleGame.date} ${away.n}対${home.n} 試合詳細を表示`}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        border: isPlayerGame ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        borderRadius: 10,
        background: isPlayerGame
          ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-raised))'
          : 'var(--color-surface-raised)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}>
          <span style={{ color: teamTextColor(away.c) }}>{away.ab}</span>
          <span style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-display)' }}>
            {summary.awayScore} - {summary.homeScore}
          </span>
          <span style={{ color: teamTextColor(home.c) }}>{home.ab}</span>
        </span>
        <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {summary.tie && <StatusTag>引分</StatusTag>}
          {summary.extraInnings && <StatusTag>延長{summary.innings.length}回</StatusTag>}
          {summary.walkoff && <StatusTag>サヨナラ</StatusTag>}
          {summary.shutoutTeam && <StatusTag>{TINFO[summary.shutoutTeam].ab}完封</StatusTag>}
        </span>
      </div>
      {summary.headline && (
        <div style={{ marginTop: 4, color: 'var(--color-leader)', fontSize: 12, fontWeight: 700 }}>
          {summary.headline}
        </div>
      )}
      <div style={{ marginTop: 4 }}>
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
    const games = game.season.schedule.filter(
      (scheduleGame) => scheduleGame.date === selectedDate,
    );
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
    <div style={{ display: 'grid', gap: 12 }}>
      <Card ariaLabel="日付選択">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
            style={{
              padding: '8px 10px',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 8,
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: 13,
            }}
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
          <div role="list" aria-label="当日の試合一覧" style={{ display: 'grid', gap: 8 }}>
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
