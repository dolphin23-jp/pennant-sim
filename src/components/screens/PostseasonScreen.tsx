import { createContext, useContext, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../data';
import {
  postseasonBoxScores,
  postseasonNarrativeEvents,
  postseasonRunnerUp,
  runPostseason as runPostseasonSeries,
  selectSeasonTitles,
} from '../../engine';
import type {
  AwardLeague,
  GameBoxScore,
  PostseasonResults,
  SeriesResult,
  Player,
  SeasonTitleRecord,
  TeamKey,
} from '../../engine';
import { useGameState } from '../../state/gameState';
import { useBusyAction } from '../useBusyAction';
import { AutoAdvancePanel } from '../widgets/AutoAdvancePanel';
import { GameDetailModal } from '../widgets/GameDetailModal';
import { TitleIcon } from '../icons';
import {
  BackToTitleButton,
  Button,
  Card,
  NewGameButton,
  PageShell,
  SectionTitle,
  teamTextColor,
} from '../ui';

function formatShortDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

const AWARD_LEAGUE_LABEL: Record<AwardLeague, string> = {
  central: 'セ・リーグ',
  pacific: 'パ・リーグ',
};

function SeasonTitlesPanel({
  titles,
  players,
  onSelect,
}: {
  titles: SeasonTitleRecord[];
  players: Map<string, Player>;
  onSelect(player: Player): void;
}) {
  return (
    <section aria-label="レギュラーシーズン個人タイトル">
      <SectionTitle>今季のタイトル</SectionTitle>
      <div className="postseason-titles__grid">
        {(['central', 'pacific'] as const).map((league) => (
          <Card key={league} ariaLabel={`${AWARD_LEAGUE_LABEL[league]}個人タイトル`}>
            <SectionTitle>{AWARD_LEAGUE_LABEL[league]}</SectionTitle>
            <div className="postseason-titles__list">
              {titles
                .filter((record) => record.league === league)
                .map((record) => {
                  const player = players.get(record.playerId);
                  return (
                    <div
                      key={`${record.titleId}:${record.playerId}`}
                      className="postseason-titles__row"
                    >
                      <strong className="postseason-titles__label">
                        <TitleIcon titleId={record.titleId} size={14} />
                        {record.titleLabel}
                      </strong>
                      {player ? (
                        <button
                          type="button"
                          className="roster-player-button"
                          aria-label={`${record.titleLabel} ${record.playerName}の詳細を表示`}
                          onClick={() => onSelect(player)}
                        >
                          {record.playerName}
                        </button>
                      ) : (
                        <span>{record.playerName}</span>
                      )}
                      <span
                        className="postseason-titles__team"
                        style={{ color: teamTextColor(TINFO[record.teamKey].c) }}
                      >
                        {TINFO[record.teamKey].ab} {record.displayValue}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function TeamPill({ teamKey, won, wins }: { teamKey: TeamKey; won: boolean; wins: number }) {
  const info = TINFO[teamKey];
  return (
    <div
      className={
        won
          ? 'postseason-pill postseason-pill--team postseason-pill--won'
          : 'postseason-pill postseason-pill--team'
      }
      style={won ? ({ '--team-color': info.c } as CSSProperties) : undefined}
    >
      <span className="postseason-pill__name">
        <span
          aria-hidden="true"
          className="postseason-pill__swatch"
          style={{ background: info.c }}
        />
        {info.ab}
      </span>
      <strong
        className="postseason-pill__wins"
        style={won ? { color: teamTextColor(info.c) } : undefined}
      >
        {wins}
      </strong>
    </div>
  );
}

function PendingPill({ teamKey }: { teamKey: TeamKey }) {
  const info = TINFO[teamKey];
  return (
    <div className="postseason-pill postseason-pill--pending">
      <span aria-hidden="true" className="postseason-pill__swatch" style={{ background: info.c }} />
      {info.ab}
    </div>
  );
}

/** Opens a postseason game's box score from any series card. */
const OpenGameContext = createContext<(box: GameBoxScore) => void>(() => undefined);

function SeriesCard({
  title,
  series,
  first,
  second,
  note,
}: {
  title: string;
  series: SeriesResult | null;
  first: TeamKey;
  second: TeamKey;
  note?: string;
}) {
  const openGame = useContext(OpenGameContext);
  return (
    <Card ariaLabel={title}>
      <SectionTitle>{title}</SectionTitle>
      {note && <div className="postseason-series__note">{note}</div>}
      {!series ? (
        <div className="postseason-series__teams">
          <PendingPill teamKey={first} />
          <PendingPill teamKey={second} />
        </div>
      ) : (
        <>
          <div className="postseason-series__teams postseason-series__teams--spaced">
            <TeamPill
              teamKey={series.first}
              won={series.winner === series.first}
              wins={series.firstWins}
            />
            <TeamPill
              teamKey={series.second}
              won={series.winner === series.second}
              wins={series.secondWins}
            />
          </div>
          <div className="postseason-series__games">
            {series.games.map((game) => (
              <button
                type="button"
                key={game.game}
                onClick={() => openGame(game.box)}
                aria-label={`第${game.game}戦の試合詳細を開く`}
                className="postseason-series__game"
              >
                <span>
                  {formatShortDate(game.date)} G{game.game} {TINFO[game.home].ab} vs{' '}
                  {TINFO[game.away].ab}
                </span>
                <span className="postseason-series__game-score">
                  {game.homeScore}-{game.awayScore}
                  {game.winner ? '' : '（引分）'}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function BracketArrow() {
  return (
    <div aria-hidden="true" className="postseason-bracket__arrow">
      →
    </div>
  );
}

function LeagueBracketRow({
  leagueLabel,
  first,
  second,
  third,
  firstSeries,
  finalSeries,
}: {
  leagueLabel: string;
  first: TeamKey;
  second: TeamKey;
  third: TeamKey;
  firstSeries: SeriesResult | null;
  finalSeries: SeriesResult | null;
}) {
  return (
    <div className="postseason-bracket__row">
      <SeriesCard
        title={`${leagueLabel} CS 1st`}
        series={firstSeries}
        first={second}
        second={third}
        note={`2位 ${TINFO[second].ab} vs 3位 ${TINFO[third].ab}`}
      />
      <BracketArrow />
      <SeriesCard
        title={`${leagueLabel} CS Final`}
        series={finalSeries}
        first={first}
        second={firstSeries?.winner ?? second}
        note={`1位 ${TINFO[first].ab} に1勝のアドバンテージ`}
      />
    </div>
  );
}

function ChampionPennant({ teamKey }: { teamKey: TeamKey }) {
  const info = TINFO[teamKey];
  return (
    <div className="postseason-champion" style={{ '--team-color': info.c } as CSSProperties}>
      <svg width="46" height="52" viewBox="0 0 46 52" role="img" aria-label={`${info.n}が日本一`}>
        <path d="M6 2 L6 50 L40 26 Z" fill={info.c} stroke="var(--color-bg)" strokeWidth="1.5" />
        <line x1="6" y1="2" x2="6" y2="50" stroke="var(--color-text-faint)" strokeWidth="2" />
      </svg>
      <div>
        <div className="postseason-champion__label">日本一 CHAMPION</div>
        <div className="postseason-champion__name" style={{ color: teamTextColor(info.c) }}>
          {info.n}
        </div>
      </div>
    </div>
  );
}

export function PostseasonScreen() {
  const game = useGameState();
  const [results, setResults] = useState<PostseasonResults | null>(null);
  const [openedBox, setOpenedBox] = useState<GameBoxScore | null>(null);
  const { busy, run } = useBusyAction();
  const centralRanking = useMemo(
    () =>
      [...CENTRAL].sort((a, b) => (game.standings[a].rank ?? 99) - (game.standings[b].rank ?? 99)),
    [game.standings],
  );
  const pacificRanking = useMemo(
    () =>
      [...PACIFIC].sort((a, b) => (game.standings[a].rank ?? 99) - (game.standings[b].rank ?? 99)),
    [game.standings],
  );
  const teams = game.teams;
  if (!teams) return null;
  const titles = selectSeasonTitles(
    game.season.year,
    teams,
    game.leagueAccumulated,
    Object.fromEntries(
      Object.entries(game.standings).map(([teamKey, standing]) => [teamKey, standing.g]),
    ),
  );
  const players = new Map<string, Player>(
    Object.values(teams)
      .flatMap((team) => [...team.fielders, ...team.pitchers])
      .map((player) => [player.id, player] as const),
  );

  const runPostseason = () => {
    // simulateGame writes post-game rosters (fatigue, injuries) back into the map it is
    // given. Run the series on a copy and commit it explicitly instead of mutating state.
    const seriesTeams = { ...teams };
    const postseason = runPostseasonSeries({
      teams: seriesTeams,
      standings: game.standings,
      schedule: game.season.schedule,
      year: game.season.year,
      leagueAccumulated: game.leagueAccumulated,
    });
    game.replaceTeams(seriesTeams);
    setResults(postseason);
  };

  return (
    <OpenGameContext.Provider value={setOpenedBox}>
      <PageShell>
        <header className="postseason-header">
          <div>
            <h1 className="postseason-header__title">ポストシーズン</h1>
            <div className="postseason-header__lead">
              クライマックスシリーズと日本シリーズをまとめて実行します。
            </div>
          </div>
          <div className="postseason-header__actions">
            {!results ? (
              <>
                <Button
                  onClick={() => run(runPostseason)}
                  disabled={busy || game.advanceProgress !== null}
                >
                  全シリーズを実行
                </Button>
                {busy && (
                  <span role="status" aria-live="polite" className="postseason-header__status">
                    処理中…
                  </span>
                )}
              </>
            ) : (
              <Button
                onClick={() => {
                  game.recordChampionship(
                    results.japanSeries.winner,
                    postseasonRunnerUp(results),
                    postseasonNarrativeEvents(results),
                    postseasonBoxScores(results),
                  );
                  game.setScreen('offseason');
                }}
              >
                オフシーズンへ
              </Button>
            )}
            <NewGameButton onStartNewGame={game.startNewGame} />
            <BackToTitleButton onGoToTitle={() => game.setScreen('welcome')} />
          </div>
        </header>

        <div className="postseason-body">
          {!results && <AutoAdvancePanel />}
          <SeasonTitlesPanel titles={titles} players={players} onSelect={game.selectPlayer} />
          <LeagueBracketRow
            leagueLabel="セ・リーグ"
            first={centralRanking[0]}
            second={centralRanking[1]}
            third={centralRanking[2]}
            firstSeries={results?.centralFirst ?? null}
            finalSeries={results?.centralFinal ?? null}
          />
          <LeagueBracketRow
            leagueLabel="パ・リーグ"
            first={pacificRanking[0]}
            second={pacificRanking[1]}
            third={pacificRanking[2]}
            firstSeries={results?.pacificFirst ?? null}
            finalSeries={results?.pacificFinal ?? null}
          />

          <div className="postseason-bracket__final">
            <div />
            <BracketArrow />
            <SeriesCard
              title="日本シリーズ"
              series={results?.japanSeries ?? null}
              first={results?.centralFinal.winner ?? centralRanking[0]}
              second={results?.pacificFinal.winner ?? pacificRanking[0]}
            />
          </div>

          {results && (
            <div className="postseason-champion-wrap">
              <ChampionPennant teamKey={results.japanSeries.winner} />
            </div>
          )}
        </div>
      </PageShell>
      <GameDetailModal box={openedBox} onClose={() => setOpenedBox(null)} />
    </OpenGameContext.Provider>
  );
}
