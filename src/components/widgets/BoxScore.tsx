import type { GameState } from '../../engine';
import { Card, SectionTitle } from '../ui';

export function BoxScore({ game }: { game: GameState | null }) {
  if (!game) return null;
  const { home, away } = game.teams;
  return (
    <Card ariaLabel={`${away.n}対${home.n}の試合結果`}>
      <SectionTitle>Box Score</SectionTitle>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }} aria-live="polite">
        {away.ab} {game.score.away} - {game.score.home} {home.ab}
      </div>
      <div className="table-scroll" style={{ marginBottom: 12 }}>
        <table className="data-table" aria-label="イニング別得点">
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left' }}>Team</th>
              {game.innings.map((_, index) => (
                <th scope="col" key={index}>{index + 1}</th>
              ))}
              <th scope="col">R</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" style={{ textAlign: 'left' }}>{away.ab}</th>
              {game.innings.map((inning, index) => (
                <td key={index} style={{ textAlign: 'center' }}>{inning.away}</td>
              ))}
              <td style={{ textAlign: 'center', fontWeight: 900 }}>{game.score.away}</td>
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: 'left' }}>{home.ab}</th>
              {game.innings.map((inning, index) => (
                <td key={index} style={{ textAlign: 'center' }}>{inning.home}</td>
              ))}
              <td style={{ textAlign: 'center', fontWeight: 900 }}>{game.score.home}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <SectionTitle>Play Log</SectionTitle>
      <div
        role="log"
        aria-label="直近のプレー記録"
        aria-live="polite"
        style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 5 }}
      >
        {game.atBatLog.slice(-50).map((entry, index) => (
          <div
            key={`${entry.inning}-${index}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '6px 8px',
              borderRadius: 6,
              background: 'var(--color-surface-raised)',
              fontSize: 11,
            }}
          >
            <span>{entry.inning}回{entry.isBot ? '裏' : '表'} {entry.batter}</span>
            <span style={{ color: 'var(--color-accent)' }}>{entry.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
