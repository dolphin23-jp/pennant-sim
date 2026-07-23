import { CENTRAL, PACIFIC, TINFO } from '../../data';
import type { StandingRecord, TeamKey } from '../../engine';
import { Card, SectionTitle } from '../ui';

function LeagueTable({
  title,
  teams,
  standings,
}: {
  title: string;
  teams: readonly TeamKey[];
  standings: Record<TeamKey, StandingRecord>;
}) {
  const sorted = [...teams].sort(
    (first, second) => (standings[first].rank ?? 99) - (standings[second].rank ?? 99),
  );
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: '#6f8ca8' }}>
            <th style={{ padding: 6 }}>順</th>
            <th style={{ textAlign: 'left', padding: 6 }}>球団</th>
            <th style={{ padding: 6 }}>勝</th>
            <th style={{ padding: 6 }}>敗</th>
            <th style={{ padding: 6 }}>分</th>
            <th style={{ padding: 6 }}>勝率</th>
            <th style={{ padding: 6 }}>差</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((teamKey) => {
            const record = standings[teamKey];
            return (
              <tr key={teamKey} style={{ borderTop: '1px solid #17283a' }}>
                <td style={{ padding: 6, textAlign: 'center', fontWeight: 900 }}>{record.rank}</td>
                <td style={{ padding: 6, color: TINFO[teamKey].c, fontWeight: 800 }}>
                  {TINFO[teamKey].ab}
                </td>
                <td style={{ padding: 6, textAlign: 'center' }}>{record.w}</td>
                <td style={{ padding: 6, textAlign: 'center' }}>{record.l}</td>
                <td style={{ padding: 6, textAlign: 'center' }}>{record.d}</td>
                <td style={{ padding: 6, textAlign: 'center' }}>
                  {record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '')}
                </td>
                <td style={{ padding: 6, textAlign: 'center', color: '#90a9bf' }}>{record.gb}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function StandingsTable({ standings }: { standings: Record<TeamKey, StandingRecord> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}>
      <LeagueTable title="Central League" teams={CENTRAL} standings={standings} />
      <LeagueTable title="Pacific League" teams={PACIFIC} standings={standings} />
    </div>
  );
}
