import { CENTRAL, PACIFIC, TINFO } from '../../data';
import { aggregateTeamStats, buildHeadToHeadMatrix } from '../../engine';
import type {
  AccumulatedStats,
  ScheduleGame,
  StandingRecord,
  TeamKey,
  Teams,
} from '../../engine';
import { Card, SectionTitle, teamTextColor } from '../ui';

function sortByRank(
  teamKeys: readonly TeamKey[],
  standings: Record<TeamKey, StandingRecord>,
): TeamKey[] {
  return [...teamKeys].sort(
    (first, second) => (standings[first].rank ?? 99) - (standings[second].rank ?? 99),
  );
}

function TeamAbbreviation({ teamKey }: { teamKey: TeamKey }) {
  const info = TINFO[teamKey];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: teamTextColor(info.c) }}>
      <span
        aria-hidden="true"
        style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: info.c }}
      />
      {info.ab}
    </span>
  );
}

function TeamStatsLeagueTable({
  title,
  teamKeys,
  teams,
  statsSource,
  standings,
}: {
  title: string;
  teamKeys: readonly TeamKey[];
  teams: Teams;
  statsSource: AccumulatedStats;
  standings: Record<TeamKey, StandingRecord>;
}) {
  const sorted = sortByRank(teamKeys, standings);
  return (
    <Card ariaLabel={`${title}チーム成績`}>
      <SectionTitle>{title} Team Stats</SectionTitle>
      <div className="table-scroll">
        <table className="data-table" aria-label={`${title}のチーム打撃・投手成績`}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left' }}>
                球団
              </th>
              <th scope="col">打率</th>
              <th scope="col">本塁打</th>
              <th scope="col">盗塁</th>
              <th scope="col">防御率</th>
              <th scope="col">奪三振</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((teamKey) => {
              const line = aggregateTeamStats(teams[teamKey], statsSource);
              return (
                <tr key={teamKey}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 800 }}>
                    <TeamAbbreviation teamKey={teamKey} />
                  </th>
                  <td style={{ textAlign: 'center' }}>{line.avg.toFixed(3).replace(/^0/, '')}</td>
                  <td style={{ textAlign: 'center' }}>{line.hr}</td>
                  <td style={{ textAlign: 'center' }}>{line.sb}</td>
                  <td style={{ textAlign: 'center' }}>{line.era.toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>{line.k}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function TeamStatsComparison({
  teams,
  standings,
  statsSource,
}: {
  teams: Teams;
  standings: Record<TeamKey, StandingRecord>;
  statsSource: AccumulatedStats;
}) {
  return (
    <section
      aria-label="チーム打撃・投手成績"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}
    >
      <TeamStatsLeagueTable
        title="Central League"
        teamKeys={CENTRAL}
        teams={teams}
        statsSource={statsSource}
        standings={standings}
      />
      <TeamStatsLeagueTable
        title="Pacific League"
        teamKeys={PACIFIC}
        teams={teams}
        statsSource={statsSource}
        standings={standings}
      />
    </section>
  );
}

function HeadToHeadLeagueTable({
  title,
  teamKeys,
  schedule,
  standings,
}: {
  title: string;
  teamKeys: readonly TeamKey[];
  schedule: ScheduleGame[];
  standings: Record<TeamKey, StandingRecord>;
}) {
  const sorted = sortByRank(teamKeys, standings);
  const matrix = buildHeadToHeadMatrix(schedule, teamKeys);
  return (
    <Card ariaLabel={`${title}星取表`}>
      <SectionTitle>{title} 星取表</SectionTitle>
      <div style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 6 }}>
        対戦相手ごとの勝-敗-分
      </div>
      <div className="table-scroll">
        <table className="data-table" aria-label={`${title}の対戦成績`}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left' }}>
                球団
              </th>
              {sorted.map((opponent) => (
                <th scope="col" key={opponent}>
                  {TINFO[opponent].ab}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((teamKey) => (
              <tr key={teamKey}>
                <th scope="row" style={{ textAlign: 'left', fontWeight: 800 }}>
                  <TeamAbbreviation teamKey={teamKey} />
                </th>
                {sorted.map((opponent) => {
                  if (opponent === teamKey) {
                    return (
                      <td
                        key={opponent}
                        style={{ textAlign: 'center', color: 'var(--color-text-faint)' }}
                      >
                        ―
                      </td>
                    );
                  }
                  const record = matrix[teamKey]?.[opponent] ?? { w: 0, l: 0, d: 0 };
                  return (
                    <td key={opponent} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {record.w}-{record.l}
                      {record.d > 0 ? `-${record.d}` : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function HeadToHeadComparison({
  schedule,
  standings,
}: {
  schedule: ScheduleGame[];
  standings: Record<TeamKey, StandingRecord>;
}) {
  return (
    <section
      aria-label="対戦成績（星取表）"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}
    >
      <HeadToHeadLeagueTable title="Central League" teamKeys={CENTRAL} schedule={schedule} standings={standings} />
      <HeadToHeadLeagueTable title="Pacific League" teamKeys={PACIFIC} schedule={schedule} standings={standings} />
    </section>
  );
}
