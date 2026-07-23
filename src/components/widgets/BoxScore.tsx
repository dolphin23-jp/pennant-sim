import type { GameState } from '../../engine';
import { Card, SectionTitle } from '../ui';

export function BoxScore({ game }: { game: GameState | null }) {
  if (!game) return null;
  const { home, away } = game.teams;
  return (
    <Card>
      <SectionTitle>Box Score</SectionTitle>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {away.ab} {game.score.away} - {game.score.home} {home.ab}
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 5 }}>Team</th>
              {game.innings.map((_, index) => (
                <th key={index} style={{ padding: 5 }}>{index + 1}</th>
              ))}
              <th style={{ padding: 5 }}>R</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: 5 }}>{away.ab}</td>
              {game.innings.map((inning, index) => (
                <td key={index} style={{ textAlign: 'center', padding: 5 }}>{inning.away}</td>
              ))}
              <td style={{ textAlign: 'center', fontWeight: 900 }}>{game.score.away}</td>
            </tr>
            <tr>
              <td style={{ padding: 5 }}>{home.ab}</td>
              {game.innings.map((inning, index) => (
                <td key={index} style={{ textAlign: 'center', padding: 5 }}>{inning.home}</td>
              ))}
              <td style={{ textAlign: 'center', fontWeight: 900 }}>{game.score.home}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <SectionTitle>Play Log</SectionTitle>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 5 }}>
        {game.atBatLog.slice(-50).map((entry, index) => (
          <div
            key={`${entry.inning}-${index}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '6px 8px',
              borderRadius: 6,
              background: '#0f2233',
              fontSize: 11,
            }}
          >
            <span>{entry.inning}回{entry.isBot ? '裏' : '表'} {entry.batter}</span>
            <span style={{ color: '#90caf9' }}>{entry.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
