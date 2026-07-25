import type { GameState } from '../../engine';
import { Card, SectionTitle } from '../ui';
import { Linescore } from './Linescore';

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
      <Linescore
        homeAbbreviation={home.ab}
        awayAbbreviation={away.ab}
        innings={game.innings}
        homeScore={game.score.home}
        awayScore={game.score.away}
        homeHits={homeHits}
        awayHits={awayHits}
      />
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
