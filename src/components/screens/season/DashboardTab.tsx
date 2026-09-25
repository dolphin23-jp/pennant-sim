import { useMemo, type CSSProperties } from 'react';

import { TINFO } from '../../../data';
import { recommendedLineup, deriveTeamForm } from '../../../engine';
import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { useBusyAction } from '../../useBusyAction';
import { Button, Card, LampFigure, SectionTitle, StatChip, teamTextColor } from '../../ui';
import { Linescore } from '../../widgets/Linescore';
import { AutoAdvancePanel } from '../../widgets/AutoAdvancePanel';
import { NoticeCenter } from '../../widgets/NoticeCenter';
import { StandingsTable } from '../../widgets/StandingsTable';

/** The user's latest game, whether played one at a time or skipped, with a way into its
 * box score and play-by-play. */
function LatestGameCard() {
  const game = useGameState();
  const playerTeam = game.playerTeam;
  const latest = [...game.season.schedule]
    .filter(
      (scheduled) =>
        scheduled.played && (scheduled.homeKey === playerTeam || scheduled.awayKey === playerTeam),
    )
    .sort((first, second) => second.date.localeCompare(first.date))[0];
  const box = latest ? (game.gameBoxScores[latest.id] ?? game.gameSummaries[latest.id]) : null;
  if (!latest || !box) return null;
  const home = TINFO[box.homeKey];
  const away = TINFO[box.awayKey];
  const hasPlayLog = Boolean(game.recentPlayLogs[latest.id]);
  return (
    <Card ariaLabel="直近の試合" className="dashboard-card">
      <SectionTitle>直近の試合</SectionTitle>
      <div className="dashboard-latest__date">
        {box.date}
        {box.headline ? ` ・ ${box.headline}` : ''}
      </div>
      <Linescore
        homeAbbreviation={home.ab}
        awayAbbreviation={away.ab}
        innings={box.innings}
        homeScore={box.homeScore}
        awayScore={box.awayScore}
        homeHits={box.homeHits}
        awayHits={box.awayHits}
        homeErrors={box.homeErrors}
        awayErrors={box.awayErrors}
      />
      <div className="dashboard-latest__actions">
        <Button
          onClick={() => game.selectGame(latest.id)}
          color="var(--color-surface-muted)"
          ariaLabel="直近の試合の詳細を開く"
        >
          {hasPlayLog ? '試合詳細・プレイバイプレイ' : '試合詳細'}
        </Button>
      </div>
    </Card>
  );
}

export function DashboardTab({
  onSelectTeam,
  onOpenYearReview,
}: {
  onSelectTeam?(teamKey: TeamKey): void;
  onOpenYearReview?(): void;
}) {
  const game = useGameState();
  const { busy: actionBusy, run } = useBusyAction();
  // Manual progress is locked while whole years are being advanced automatically.
  const busy = actionBusy || game.advanceProgress !== null;
  const nextGame = useMemo(
    () =>
      game.season.schedule.find(
        (candidate) =>
          !candidate.played &&
          (candidate.homeKey === game.playerTeam || candidate.awayKey === game.playerTeam),
      ) ?? null,
    [game.season.schedule, game.playerTeam],
  );

  if (!game.teams || !game.playerTeam) return null;
  const playerTeam = game.teams[game.playerTeam];
  const lastReviewedYear = game.championHistory.some(
    (record) => record.year === game.season.year - 1,
  )
    ? game.season.year - 1
    : null;
  const record = game.standings[game.playerTeam];
  const form = deriveTeamForm(game.season.schedule, game.playerTeam);
  const pctText = record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '');
  const streakTone = form.streak.includes('連勝')
    ? 'var(--color-success)'
    : form.streak.includes('連敗')
      ? 'var(--color-danger)'
      : undefined;

  return (
    <>
      <Card ariaLabel="順位状況" className="dashboard-card">
        <SectionTitle>順位</SectionTitle>
        <div className="dashboard-standing">
          <LampFigure
            label={TINFO[game.playerTeam].ab}
            value={record.rank ? `${record.rank}位` : '-'}
            elite={Boolean(record.rank && record.rank <= 3)}
            ariaLabel={`${playerTeam.n} 現在${record.rank ?? '-'}位`}
          />
          <div className="dashboard-standing__chips">
            <StatChip label="勝敗分" value={`${record.w}-${record.l}-${record.d}`} />
            <StatChip label="勝率" value={pctText} />
            <StatChip label="差" value={record.gb ?? '-'} />
            <StatChip label="直近10" value={`${form.last10.w}-${form.last10.l}-${form.last10.d}`} />
            <StatChip label="連続" value={form.streak} tone={streakTone} />
          </div>
        </div>
      </Card>

      <div className="dashboard-standings-table">
        <StandingsTable
          standings={game.standings}
          schedule={game.season.schedule}
          onSelectTeam={onSelectTeam}
        />
      </div>

      <div className="dashboard-grid">
        <Card ariaLabel="次の試合">
          <SectionTitle>次の試合</SectionTitle>
          {nextGame ? (
            <>
              <div className="dashboard-matchup">
                <span
                  className="dashboard-matchup__team"
                  style={
                    {
                      '--dashboard-team-color': TINFO[nextGame.awayKey].c,
                      color: teamTextColor(TINFO[nextGame.awayKey].c),
                    } as CSSProperties
                  }
                >
                  {TINFO[nextGame.awayKey].ab}
                </span>
                <span className="dashboard-matchup__at">@</span>
                <span
                  className="dashboard-matchup__team"
                  style={
                    {
                      '--dashboard-team-color': TINFO[nextGame.homeKey].c,
                      color: teamTextColor(TINFO[nextGame.homeKey].c),
                    } as CSSProperties
                  }
                >
                  {TINFO[nextGame.homeKey].ab}
                </span>
              </div>
              <div className="dashboard-next__date">
                {nextGame.date}
                {nextGame.doubleHeaderGame
                  ? ` / ダブルヘッダー第${nextGame.doubleHeaderGame}試合`
                  : ''}
              </div>
              {nextGame.postponedFrom && (
                <div className="dashboard-next__postponed">
                  雨天順延（当初 {nextGame.postponedFrom}）
                </div>
              )}
              {!nextGame.postponedFrom && <div className="dashboard-next__spacer" />}
              <nav aria-label="試合進行" className="dashboard-controls">
                <Button
                  onClick={() => run(game.simulateNextGame)}
                  disabled={busy}
                  color={playerTeam.c}
                  ariaLabel="次の試合を実行"
                >
                  次戦を実行
                </Button>
                <Button
                  onClick={() => run(() => game.skip('week'))}
                  disabled={busy}
                  color="var(--color-surface-muted)"
                  ariaLabel="1週間分の試合をスキップ"
                >
                  1週スキップ
                </Button>
                <Button
                  onClick={() => run(() => game.skip('month'))}
                  disabled={busy}
                  color="var(--color-surface-muted)"
                  ariaLabel="1か月分の試合をスキップ"
                >
                  1ヶ月スキップ
                </Button>
                <Button
                  onClick={() => run(() => game.skip('season'))}
                  disabled={busy}
                  color="var(--color-growth)"
                  ariaLabel="レギュラーシーズンの残り全試合を実行"
                >
                  残り全試合
                </Button>
                {actionBusy && (
                  <span role="status" aria-live="polite" className="dashboard-controls__status">
                    処理中…
                  </span>
                )}
              </nav>
            </>
          ) : (
            <>
              <div className="dashboard-next__ended">レギュラーシーズン終了</div>
              <Button
                onClick={() => game.setScreen('postseason')}
                disabled={busy}
                color={playerTeam.c}
                ariaLabel="ポストシーズン画面へ移動"
              >
                ポストシーズンへ
              </Button>
            </>
          )}
        </Card>
        <Card ariaLabel="現在の先発オーダー">
          <SectionTitle>スタメン</SectionTitle>
          <div className="dashboard-lineup__count">現在の先発野手 {game.lineup.length}名</div>
          <div role="group" aria-label="先発オーダーの選手詳細ボタン" className="dashboard-lineup">
            {game.lineup.map((player, index) => (
              <button
                type="button"
                key={player.id}
                onClick={() => game.selectPlayer(player)}
                aria-label={`打順${index + 1}番 ${player.name}の詳細を表示`}
                className="dashboard-lineup__player"
              >
                <span className="dashboard-lineup__order">{index + 1}</span>
                {player.name}
              </button>
            ))}
          </div>
          <Button
            onClick={() => game.setLineup(recommendedLineup(playerTeam))}
            color="var(--color-surface-muted)"
            disabled={busy}
            ariaLabel="AIで最適なオーダーを自動編成"
          >
            AIで最適オーダー
          </Button>
        </Card>
      </div>

      <div className="dashboard-auto">
        <AutoAdvancePanel onFinished={onOpenYearReview} />
        {onOpenYearReview && lastReviewedYear !== null && (
          <div className="dashboard-review">
            <button type="button" onClick={onOpenYearReview} className="dashboard-review__link">
              {lastReviewedYear}年の総括を見る →
            </button>
          </div>
        )}
      </div>

      <LatestGameCard />

      <NoticeCenter
        notices={game.notices}
        teams={game.teams}
        onSelectPlayer={game.selectPlayer}
        onSelectGame={game.selectGame}
        onDismiss={game.dismissNotice}
        onClear={game.clearNotices}
      />
    </>
  );
}
