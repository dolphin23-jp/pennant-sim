import type { GameState } from '../../engine';
import { Card, SectionTitle } from '../ui';

const HIT_RESULTS = new Set(['1B', '2B', '3B', 'HR']);

function countHits(game: GameState, side: 'home' | 'away'): number {
  const teamKey = game.teams[side].key;
  return game.atBatLog.filter((entry) => entry.bSide === teamKey && HIT_RESULTS.has(entry.result)).length;
}

export function BoxScore({ game }: { game: GameState | null }) {
  if (!game) return null;
  const { home, away } = game.teams;
  const awayHits = countHits(game, 'away');
  const homeHits = countHits(game, 'home');
  return (
    <Card ariaLabel={`${away.n}対${home.n}の試合結果`}>
      <SectionTitle>Box Score</SectionTitle>
      <div
        className="linescore"
        aria-live="polite"
        aria-label={`${away.ab} ${game.score.away}安打${awayHits}、${home.ab} ${game.score.home}安打${homeHits}`}
      >
        <div className="table-scroll">
          <table className="linescore__table" aria-label="イニング別得点">
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>
                  Team
                </th>
                {game.innings.map((_, index) => (
                  <th scope="col" key={index}>
                    {index + 1}
                  </th>
                ))}
                <th scope="col" className="linescore__totals-head">
                  R
                </th>
                <th scope="col" className="linescore__totals-head">
                  H
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {away.ab}
                </th>
                {game.innings.map((inning, index) => (
                  <td key={index}>{inning.away}</td>
                ))}
                <td className="linescore__totals">{game.score.away}</td>
                <td className="linescore__totals linescore__totals--hits">{awayHits}</td>
              </tr>
              <tr>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {home.ab}
                </th>
                {game.innings.map((inning, index) => (
                  <td key={index}>{inning.home}</td>
                ))}
                <td className="linescore__totals">{game.score.home}</td>
                <td className="linescore__totals linescore__totals--hits">{homeHits}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <SectionTitle>Play Log</SectionTitle>
      <div
        role="log"
        aria-label="直近のプレー記録"
        aria-live="polite"
        style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 5 }}
      >
        {game.atBatLog.slice(-50).map((entry, index) => {
          const isHomeRun = entry.result === 'HR';
          const isScoringPlay = entry.rbi > 0;
          return (
            <div
              key={`${entry.inning}-${index}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '6px 8px',
                border: isHomeRun ? '1px solid var(--color-warning)' : '1px solid transparent',
                borderRadius: 6,
                background: isHomeRun
                  ? 'color-mix(in srgb, var(--color-warning) 14%, var(--color-surface-raised))'
                  : 'var(--color-surface-raised)',
                fontSize: 11,
              }}
            >
              <span>
                {entry.inning}回{entry.isBot ? '裏' : '表'} {entry.batter}
              </span>
              <span
                style={{
                  color: isHomeRun
                    ? 'var(--color-warning)'
                    : isScoringPlay
                      ? 'var(--color-success)'
                      : 'var(--color-accent)',
                  fontWeight: isHomeRun || isScoringPlay ? 900 : 400,
                }}
              >
                {isHomeRun ? '⚾ ' : ''}
                {entry.desc}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
