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
    <Card ariaLabel={`${title}順位表`}>
      <SectionTitle>{title}</SectionTitle>
      <div className="table-scroll">
        <table className="data-table" aria-label={`${title}順位表`}>
          <thead>
            <tr>
              <th scope="col">順</th>
              <th scope="col" style={{ textAlign: 'left' }}>球団</th>
              <th scope="col">勝</th>
              <th scope="col">敗</th>
              <th scope="col">分</th>
              <th scope="col">勝率</th>
              <th scope="col">差</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((teamKey) => {
              const record = standings[teamKey];
              return (
                <tr key={teamKey}>
                  <td style={{ textAlign: 'center', fontWeight: 900 }}>{record.rank}</td>
                  <th scope="row" style={{ textAlign: 'left', color: TINFO[teamKey].c, fontWeight: 800 }}>
                    {TINFO[teamKey].ab}
                  </th>
                  <td style={{ textAlign: 'center' }}>{record.w}</td>
                  <td style={{ textAlign: 'center' }}>{record.l}</td>
                  <td style={{ textAlign: 'center' }}>{record.d}</td>
                  <td style={{ textAlign: 'center' }}>
                    {record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '')}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{record.gb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StandingsTable({ standings }: { standings: Record<TeamKey, StandingRecord> }) {
  return (
    <section
      aria-label="両リーグ順位表"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
        gap: 12,
      }}
    >
      <LeagueTable title="Central League" teams={CENTRAL} standings={standings} />
      <LeagueTable title="Pacific League" teams={PACIFIC} standings={standings} />
    </section>
  );
}
