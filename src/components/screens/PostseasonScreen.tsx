import { useMemo, useState } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../data';
import { selectSeasonTitles, simulateGame } from '../../engine';
import type {
  AccumulatedStats,
  AwardLeague,
  Player,
  SeasonTitleRecord,
  TeamKey,
  Teams,
} from '../../engine';
import { useGameState } from '../../state/gameState';
import { useBusyAction } from '../useBusyAction';
import { TitleIcon } from '../icons';
import { Button, Card, PageShell, SectionTitle, teamTextColor } from '../ui';

interface SeriesGame {
  game: number;
  home: TeamKey;
  away: TeamKey;
  homeScore: number;
  awayScore: number;
  winner: TeamKey | null;
}

interface SeriesResult {
  first: TeamKey;
  second: TeamKey;
  firstWins: number;
  secondWins: number;
  winner: TeamKey;
  games: SeriesGame[];
}

interface PostseasonResults {
  centralFirst: SeriesResult;
  centralFinal: SeriesResult;
  pacificFirst: SeriesResult;
  pacificFinal: SeriesResult;
  japanSeries: SeriesResult;
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
      <SectionTitle>Season Titles</SectionTitle>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 12,
        }}
      >
        {(['central', 'pacific'] as const).map((league) => (
          <Card key={league} ariaLabel={`${AWARD_LEAGUE_LABEL[league]}個人タイトル`}>
            <SectionTitle>{AWARD_LEAGUE_LABEL[league]}</SectionTitle>
            <div style={{ display: 'grid', gap: 6 }}>
              {titles
                .filter((record) => record.league === league)
                .map((record) => {
                  const player = players.get(record.playerId);
                  return (
                    <div
                      key={`${record.titleId}:${record.playerId}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(92px,auto) minmax(0,1fr) auto',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 8px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 7,
                        background: 'var(--color-surface-raised)',
                        fontSize: 12,
                      }}
                    >
                      <strong
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          color: 'var(--color-leader)',
                        }}
                      >
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
                        style={{
                          color: teamTextColor(TINFO[record.teamKey].c),
                          fontWeight: 900,
                          whiteSpace: 'nowrap',
                        }}
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

function simulateSeries(
  first: TeamKey,
  second: TeamKey,
  bestOf: number,
  teams: Teams,
  // Carrying the regular season's totals keeps in-season mastery continuous into the
  // playoffs; passing {} would reset every player to opening mastery mid-year.
  accumulated: AccumulatedStats,
  firstAdvantage = 0,
): SeriesResult {
  const target = Math.ceil(bestOf / 2);
  let firstWins = firstAdvantage;
  let secondWins = 0;
  let firstRotation = 0;
  let secondRotation = 0;
  let gameNumber = 1;
  const games: SeriesGame[] = [];

  while (firstWins < target && secondWins < target && gameNumber <= bestOf + 8) {
    const home = gameNumber % 2 === 1 ? first : second;
    const away = home === first ? second : first;
    const result = simulateGame(
      home,
      away,
      teams,
      null,
      null,
      home === first ? firstRotation : secondRotation,
      away === first ? firstRotation : secondRotation,
      accumulated,
    );
    firstRotation += 1;
    secondRotation += 1;
    const winner =
      result.score.home === result.score.away
        ? null
        : result.score.home > result.score.away
          ? home
          : away;
    if (winner === first) firstWins += 1;
    if (winner === second) secondWins += 1;
    games.push({
      game: gameNumber,
      home,
      away,
      homeScore: result.score.home,
      awayScore: result.score.away,
      winner,
    });
    gameNumber += 1;
  }

  return {
    first,
    second,
    firstWins,
    secondWins,
    winner: firstWins >= secondWins ? first : second,
    games,
  };
}

function TeamPill({ teamKey, won, wins }: { teamKey: TeamKey; won: boolean; wins: number }) {
  const info = TINFO[teamKey];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 10px',
        border: `1px solid ${won ? info.c : 'var(--color-border)'}`,
        borderRadius: 8,
        background: won
          ? `color-mix(in srgb, ${info.c} 16%, var(--color-surface-raised))`
          : 'var(--color-surface-raised)',
        boxShadow: won ? `0 0 8px color-mix(in srgb, ${info.c} 45%, transparent)` : undefined,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 2, background: info.c, flex: 'none' }}
        />
        {info.ab}
      </span>
      <strong
        style={{
          fontFamily: 'var(--font-display)',
          color: won ? teamTextColor(info.c) : 'var(--color-text-muted)',
        }}
      >
        {wins}
      </strong>
    </div>
  );
}

function PendingPill({ teamKey }: { teamKey: TeamKey }) {
  const info = TINFO[teamKey];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-surface-raised)',
        color: 'var(--color-text-muted)',
        fontWeight: 800,
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: 2, background: info.c, flex: 'none' }}
      />
      {info.ab}
    </div>
  );
}

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
  return (
    <Card ariaLabel={title}>
      <SectionTitle>{title}</SectionTitle>
      {note && (
        <div style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 8 }}>
          {note}
        </div>
      )}
      {!series ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <PendingPill teamKey={first} />
          <PendingPill teamKey={second} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
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
          <div style={{ display: 'grid', gap: 4 }}>
            {series.games.map((game) => (
              <div
                key={game.game}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '5px 7px',
                  background: 'var(--color-surface-muted)',
                  borderRadius: 5,
                  color: 'var(--color-text-muted)',
                  fontSize: 11,
                }}
              >
                <span>
                  G{game.game} {TINFO[game.home].ab} vs {TINFO[game.away].ab}
                </span>
                <span style={{ fontFamily: 'var(--font-display)' }}>
                  {game.homeScore}-{game.awayScore}
                  {game.winner ? '' : '（引分）'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function BracketArrow() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-border-strong)',
        fontSize: 22,
      }}
    >
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(200px,1fr) 30px minmax(200px,1fr)',
        gap: 8,
        alignItems: 'center',
      }}
    >
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        border: `1px solid ${info.c}`,
        borderRadius: 10,
        background: `color-mix(in srgb, ${info.c} 12%, var(--color-surface-raised))`,
        boxShadow: `0 0 20px color-mix(in srgb, ${info.c} 35%, transparent)`,
      }}
    >
      <svg width="46" height="52" viewBox="0 0 46 52" role="img" aria-label={`${info.n}が日本一`}>
        <path d="M6 2 L6 50 L40 26 Z" fill={info.c} stroke="var(--color-bg)" strokeWidth="1.5" />
        <line x1="6" y1="2" x2="6" y2="50" stroke="var(--color-text-faint)" strokeWidth="2" />
      </svg>
      <div>
        <div style={{ color: 'var(--color-text-faint)', fontSize: 11, fontWeight: 700 }}>
          日本一 CHAMPION
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: teamTextColor(info.c) }}>{info.n}</div>
      </div>
    </div>
  );
}

export function PostseasonScreen() {
  const game = useGameState();
  const [results, setResults] = useState<PostseasonResults | null>(null);
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
    const league = game.leagueAccumulated;
    const centralFirst = simulateSeries(centralRanking[1], centralRanking[2], 3, teams, league);
    const pacificFirst = simulateSeries(pacificRanking[1], pacificRanking[2], 3, teams, league);
    const centralFinal = simulateSeries(
      centralRanking[0],
      centralFirst.winner,
      7,
      teams,
      league,
      1,
    );
    const pacificFinal = simulateSeries(
      pacificRanking[0],
      pacificFirst.winner,
      7,
      teams,
      league,
      1,
    );
    const japanSeries = simulateSeries(centralFinal.winner, pacificFinal.winner, 7, teams, league);
    setResults({ centralFirst, centralFinal, pacificFirst, pacificFinal, japanSeries });
  };

  return (
    <PageShell>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>ポストシーズン</h1>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 5 }}>
            クライマックスシリーズと日本シリーズをまとめて実行します。
          </div>
        </div>
        {!results ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button onClick={() => run(runPostseason)} disabled={busy}>
              全シリーズを実行
            </Button>
            {busy && (
              <span
                role="status"
                aria-live="polite"
                style={{ color: 'var(--color-text-muted)', fontSize: 12 }}
              >
                処理中…
              </span>
            )}
          </div>
        ) : (
          <Button onClick={() => game.setScreen('offseason')}>オフシーズンへ</Button>
        )}
      </header>

      <div style={{ display: 'grid', gap: 14 }}>
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 30px minmax(200px,320px)',
            gap: 8,
            alignItems: 'center',
          }}
        >
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
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <ChampionPennant teamKey={results.japanSeries.winner} />
          </div>
        )}
      </div>
    </PageShell>
  );
}
