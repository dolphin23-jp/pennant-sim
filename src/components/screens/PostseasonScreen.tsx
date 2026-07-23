import { useMemo, useState } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../data';
import { simulateGame } from '../../engine';
import type { TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { Button, Card, PageShell, SectionTitle } from '../ui';

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

function simulateSeries(
  first: TeamKey,
  second: TeamKey,
  bestOf: number,
  teams: NonNullable<ReturnType<typeof useGameState>['teams']>,
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
      {},
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

function SeriesCard({ title, series }: { title: string; series: SeriesResult }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ fontWeight: 900, marginBottom: 5 }}>
        {TINFO[series.first].ab} {series.firstWins} - {series.secondWins}{' '}
        {TINFO[series.second].ab}
      </div>
      <div style={{ color: '#7f9ab4', fontSize: 12, marginBottom: 9 }}>
        勝者: {TINFO[series.winner].n}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {series.games.map((game) => (
          <div
            key={game.game}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '5px 7px',
              background: '#0f2233',
              borderRadius: 5,
              fontSize: 11,
            }}
          >
            <span>G{game.game} {TINFO[game.home].ab} vs {TINFO[game.away].ab}</span>
            <span>{game.homeScore}-{game.awayScore}{game.winner ? '' : '（引分）'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PostseasonScreen() {
  const game = useGameState();
  const [results, setResults] = useState<PostseasonResults | null>(null);
  const centralRanking = useMemo(
    () => [...CENTRAL].sort((a, b) => (game.standings[a].rank ?? 99) - (game.standings[b].rank ?? 99)),
    [game.standings],
  );
  const pacificRanking = useMemo(
    () => [...PACIFIC].sort((a, b) => (game.standings[a].rank ?? 99) - (game.standings[b].rank ?? 99)),
    [game.standings],
  );
  if (!game.teams) return null;

  const runPostseason = () => {
    const centralFirst = simulateSeries(
      centralRanking[1],
      centralRanking[2],
      3,
      game.teams,
    );
    const pacificFirst = simulateSeries(
      pacificRanking[1],
      pacificRanking[2],
      3,
      game.teams,
    );
    const centralFinal = simulateSeries(
      centralRanking[0],
      centralFirst.winner,
      7,
      game.teams,
      1,
    );
    const pacificFinal = simulateSeries(
      pacificRanking[0],
      pacificFirst.winner,
      7,
      game.teams,
      1,
    );
    const japanSeries = simulateSeries(
      centralFinal.winner,
      pacificFinal.winner,
      7,
      game.teams,
    );
    setResults({ centralFirst, centralFinal, pacificFirst, pacificFinal, japanSeries });
  };

  return (
    <PageShell>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>ポストシーズン</h1>
          <div style={{ color: '#7f9ab4', fontSize: 12, marginTop: 5 }}>
            Phase Bの試合エンジンで各シリーズを実行します。
          </div>
        </div>
        {!results ? (
          <Button onClick={runPostseason}>全シリーズを実行</Button>
        ) : (
          <Button onClick={() => game.setScreen('offseason')}>オフシーズンへ</Button>
        )}
      </header>

      {!results ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
          <Card>
            <SectionTitle>Central League</SectionTitle>
            {centralRanking.slice(0, 3).map((teamKey, index) => (
              <div key={teamKey} style={{ padding: '6px 0' }}>{index + 1}. {TINFO[teamKey].n}</div>
            ))}
          </Card>
          <Card>
            <SectionTitle>Pacific League</SectionTitle>
            {pacificRanking.slice(0, 3).map((teamKey, index) => (
              <div key={teamKey} style={{ padding: '6px 0' }}>{index + 1}. {TINFO[teamKey].n}</div>
            ))}
          </Card>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
            <SeriesCard title="セ・リーグ CS 1st" series={results.centralFirst} />
            <SeriesCard title="パ・リーグ CS 1st" series={results.pacificFirst} />
            <SeriesCard title="セ・リーグ CS Final" series={results.centralFinal} />
            <SeriesCard title="パ・リーグ CS Final" series={results.pacificFinal} />
          </div>
          <SeriesCard title="日本シリーズ" series={results.japanSeries} />
        </div>
      )}
    </PageShell>
  );
}
