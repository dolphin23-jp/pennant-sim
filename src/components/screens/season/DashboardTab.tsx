import { useMemo, type CSSProperties } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../../data';
import { earnedRunAverage, probableStarter, recommendedLineup } from '../../../engine';
import type { Player, ScheduleGame, TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, SectionTitle, teamTextColor } from '../../ui';
import { AutoAdvancePanel } from '../../widgets/AutoAdvancePanel';
import { Linescore } from '../../widgets/Linescore';
import { NoticeCenter } from '../../widgets/NoticeCenter';
import { RaceCard } from '../../widgets/RaceCard';
import { LeagueTable } from '../../widgets/StandingsTable';

const shortDate = (date: string) => {
  const [, month, day] = date.split('-').map(Number);
  return `${month}月${day}日`;
};

/** One side of the matchup: the club, its record, and who is expected to start. */
function MatchupSide({
  teamKey,
  starter,
  side,
}: {
  teamKey: TeamKey;
  starter: Player | null;
  side: 'home' | 'away';
}) {
  const game = useGameState();
  const info = TINFO[teamKey];
  const record = game.standings[teamKey];
  const stats = starter ? game.leagueAccumulated[starter.id] : undefined;
  const pitching = stats?.type === 'pit' ? stats : null;
  const era = pitching ? earnedRunAverage(pitching) : null;
  return (
    <div
      className={`matchup-side matchup-side--${side}${teamKey === game.playerTeam ? ' matchup-side--own' : ''}`}
      style={{ '--matchup-color': info.c } as CSSProperties}
    >
      <div className="matchup-side__venue">{side === 'home' ? 'ホーム' : 'ビジター'}</div>
      <div className="matchup-side__team" style={{ color: teamTextColor(info.c) }}>
        {info.ab}
      </div>
      <div className="matchup-side__record">
        {record.rank ?? '-'}位 ・ {record.w}勝{record.l}敗{record.d ? `${record.d}分` : ''}
      </div>
      {starter && (
        <button
          type="button"
          className="matchup-side__starter"
          onClick={() => game.selectPlayer(starter)}
          aria-label={`予告先発 ${starter.name}の詳細を表示`}
        >
          <span className="matchup-side__starter-label">予告先発</span>
          <span className="matchup-side__starter-name">{starter.name}</span>
          <span className="matchup-side__starter-line">
            {pitching
              ? `${pitching.w}勝${pitching.l}敗 防${era === null ? '-.--' : era.toFixed(2)}`
              : '今季初登板'}
          </span>
        </button>
      )}
    </div>
  );
}

/** Tonight's game as the page's lead: who plays whom, where, and the probable starters. */
function MatchupHero({ nextGame }: { nextGame: ScheduleGame | null }) {
  const game = useGameState();
  const starters = useMemo(() => {
    if (!nextGame || !game.teams) return null;
    const plan =
      game.pitcherPlan.rotationOrder.length || game.pitcherPlan.closerPriority.length
        ? game.pitcherPlan
        : null;
    const pick = (teamKey: TeamKey) =>
      probableStarter(
        game.teams![teamKey],
        game.rotN[teamKey] || 0,
        teamKey === game.playerTeam ? plan : null,
        game.leagueAccumulated,
        nextGame.date,
      );
    return { home: pick(nextGame.homeKey), away: pick(nextGame.awayKey) };
  }, [nextGame, game.teams, game.pitcherPlan, game.rotN, game.leagueAccumulated, game.playerTeam]);

  if (!nextGame) {
    return (
      <Card ariaLabel="次の試合" className="matchup-hero matchup-hero--ended">
        <SectionTitle>次の試合</SectionTitle>
        <div className="matchup-hero__ended">レギュラーシーズン終了</div>
        <p className="matchup-hero__note">
          下のバーの「ポストシーズンへ」から、クライマックスシリーズと日本シリーズへ進めます。
        </p>
      </Card>
    );
  }
  return (
    <Card ariaLabel="次の試合" className="matchup-hero">
      <div className="matchup-hero__header">
        <SectionTitle>次の試合</SectionTitle>
        <span className="matchup-hero__date">
          {shortDate(nextGame.date)}
          {nextGame.isInterleague ? ' ・ 交流戦' : ''}
          {nextGame.doubleHeaderGame ? ` ・ ダブルヘッダー第${nextGame.doubleHeaderGame}試合` : ''}
        </span>
      </div>
      <div className="matchup-hero__body">
        <MatchupSide teamKey={nextGame.awayKey} starter={starters?.away ?? null} side="away" />
        <div className="matchup-hero__vs" aria-hidden="true">
          VS
        </div>
        <MatchupSide teamKey={nextGame.homeKey} starter={starters?.home ?? null} side="home" />
      </div>
      <div className="matchup-hero__park">
        {TINFO[nextGame.homeKey].n}の本拠地
        {nextGame.postponedFrom ? ` ・ 雨天順延（当初 ${shortDate(nextGame.postponedFrom)}）` : ''}
      </div>
    </Card>
  );
}

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
  if (!latest || !box || !playerTeam) {
    return (
      <Card ariaLabel="直近の試合" className="dashboard-card">
        <SectionTitle>直近の試合</SectionTitle>
        <p className="dashboard-latest__empty">
          まだ試合をしていません。下のバーの「次の試合」で開幕戦へ。
        </p>
      </Card>
    );
  }
  const home = TINFO[box.homeKey];
  const away = TINFO[box.awayKey];
  const own = latest.homeKey === playerTeam ? latest.hs : latest.as;
  const other = latest.homeKey === playerTeam ? latest.as : latest.hs;
  const outcome = (own ?? 0) > (other ?? 0) ? 'win' : (own ?? 0) < (other ?? 0) ? 'loss' : 'tie';
  const hasPlayLog = Boolean(game.recentPlayLogs[latest.id]);
  return (
    <Card ariaLabel="直近の試合" className="dashboard-card">
      <div className="dashboard-latest__header">
        <SectionTitle>直近の試合</SectionTitle>
        <span className={`dashboard-latest__result dashboard-latest__result--${outcome}`}>
          {outcome === 'win' ? '勝利' : outcome === 'loss' ? '敗戦' : '引分'}
        </span>
      </div>
      <div className="dashboard-latest__date">
        {shortDate(box.date)}
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
  const busy = game.advanceProgress !== null;
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
  const central = CENTRAL.includes(game.playerTeam);
  const lastReviewedYear = game.championHistory.some(
    (record) => record.year === game.season.year - 1,
  )
    ? game.season.year - 1
    : null;

  return (
    <div className="stack">
      <div className="dashboard-lead">
        <MatchupHero nextGame={nextGame} />
        <LatestGameCard />
      </div>

      <RaceCard schedule={game.season.schedule} standings={game.standings} team={game.playerTeam} />

      <div className="dashboard-grid">
        <LeagueTable
          title={central ? 'セ・リーグ' : 'パ・リーグ'}
          teams={central ? CENTRAL : PACIFIC}
          standings={game.standings}
          schedule={game.season.schedule}
          onSelectTeam={onSelectTeam}
          ownTeam={game.playerTeam}
        />
        <Card ariaLabel="現在の先発オーダー">
          <SectionTitle>スタメン</SectionTitle>
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
                <span className="dashboard-lineup__name">{player.name}</span>
                <span className="dashboard-lineup__pos">
                  {player._isDH ? 'DH' : (player._assignedPos ?? player.pos)}
                </span>
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

      <NoticeCenter
        notices={game.notices}
        teams={game.teams}
        onSelectPlayer={game.selectPlayer}
        onSelectGame={game.selectGame}
        onDismiss={game.dismissNotice}
        onClear={game.clearNotices}
      />

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
    </div>
  );
}
