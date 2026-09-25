import { CENTRAL, PACIFIC, TINFO } from '../../data';
import { deriveTeamForm } from '../../engine';
import type { ScheduleGame, StandingRecord, TeamKey } from '../../engine';
import { Card, SectionTitle, TermTooltip, teamTextColor } from '../ui';

function recordText(record: { w: number; l: number; d: number }): string {
  return `${record.w}-${record.l}-${record.d}`;
}

const CLIMAX_SERIES_SPOTS = 3;

function LeagueTable({
  title,
  teams,
  standings,
  schedule,
  onSelectTeam,
  variant = 'league',
}: {
  title: string;
  teams: readonly TeamKey[];
  standings: Record<TeamKey, StandingRecord>;
  schedule: ScheduleGame[];
  onSelectTeam?(teamKey: TeamKey): void;
  /** "interleague" drops the climax-series cutoff and recent-form columns, which are
   * pennant-race concepts that don't apply to a 交流戦-only standings snapshot. */
  variant?: 'league' | 'interleague';
}) {
  const sorted = [...teams].sort(
    (first, second) => (standings[first].rank ?? 99) - (standings[second].rank ?? 99),
  );
  const showForm = variant === 'league';
  return (
    <Card ariaLabel={`${title}順位表`}>
      <SectionTitle>{title}</SectionTitle>
      <div className="standings-table__note">
        {showForm
          ? `上位${CLIMAX_SERIES_SPOTS}球団がクライマックスシリーズ進出圏`
          : 'セ・パ12球団を通算成績で順位付け（個人成績・MVPは対象外）'}
      </div>
      <div className="table-scroll">
        <table className="data-table standings-table" aria-label={`${title}順位表`}>
          <thead>
            <tr>
              <th scope="col">順</th>
              <th scope="col" className="standings-table__team-heading">
                球団
              </th>
              <th scope="col">勝</th>
              <th scope="col">敗</th>
              <th scope="col">分</th>
              <th scope="col">勝率</th>
              <th scope="col">差</th>
              {showForm && (
                <>
                  <th scope="col" className="standings-table__optional">
                    直近10
                  </th>
                  <th scope="col">連続</th>
                  <th scope="col" className="standings-table__optional">
                    内訳
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((teamKey, index) => {
              const record = standings[teamKey];
              const form = showForm ? deriveTeamForm(schedule, teamKey) : null;
              const isLeader = record.rank === 1;
              const inClimaxSpots = (record.rank ?? 99) <= CLIMAX_SERIES_SPOTS;
              return (
                <tr
                  key={teamKey}
                  className={[
                    isLeader && 'standings-table__row--leader',
                    showForm && index === CLIMAX_SERIES_SPOTS - 1 && 'standings-table__row--cutoff',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className={`standings-table__rank${isLeader ? ' rank-leader-value' : ''}`}>
                    {record.rank}
                  </td>
                  <th scope="row" className="standings-table__team">
                    {onSelectTeam ? (
                      <button
                        type="button"
                        className="roster-player-button standings-table__team-name"
                        aria-label={`${TINFO[teamKey].n}のロースターを表示`}
                        onClick={() => onSelectTeam(teamKey)}
                        style={{ color: teamTextColor(TINFO[teamKey].c) }}
                      >
                        <span
                          aria-hidden="true"
                          className="standings-table__swatch"
                          style={{ background: TINFO[teamKey].c }}
                        />
                        {TINFO[teamKey].ab}
                      </button>
                    ) : (
                      <span
                        className="standings-table__team-name"
                        style={{ color: teamTextColor(TINFO[teamKey].c) }}
                      >
                        <span
                          aria-hidden="true"
                          className="standings-table__swatch"
                          style={{ background: TINFO[teamKey].c }}
                        />
                        {TINFO[teamKey].ab}
                      </span>
                    )}
                    {showForm && !inClimaxSpots && (
                      <span className="standings-table__out">圏外</span>
                    )}
                  </th>
                  <td>{record.w}</td>
                  <td>{record.l}</td>
                  <td>{record.d}</td>
                  <td>
                    {record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '')}
                  </td>
                  <td className="standings-table__muted">{record.gb}</td>
                  {form && (
                    <>
                      <td className="standings-table__optional">{recordText(form.last10)}</td>
                      <td
                        className={`standings-table__streak${
                          form.streak.includes('連勝')
                            ? ' standings-table__streak--win'
                            : form.streak.includes('連敗')
                              ? ' standings-table__streak--loss'
                              : ''
                        }`}
                      >
                        {form.streak}
                      </td>
                      <td className="standings-table__optional">
                        <TermTooltip
                          term="H/A"
                          description={`ホーム ${recordText(form.home)}、アウェイ ${recordText(form.away)}`}
                        />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StandingsTable({
  standings,
  interleagueStandings,
  schedule = [],
  onSelectTeam,
}: {
  standings: Record<TeamKey, StandingRecord>;
  /** Omit to hide the 交流戦 table entirely (e.g. contexts with no schedule to derive it from). */
  interleagueStandings?: Record<TeamKey, StandingRecord>;
  schedule?: ScheduleGame[];
  onSelectTeam?(teamKey: TeamKey): void;
}) {
  return (
    <div className="stack">
      <section aria-label="両リーグ順位表" className="card-grid">
        <LeagueTable
          title="セ・リーグ"
          teams={CENTRAL}
          standings={standings}
          schedule={schedule}
          onSelectTeam={onSelectTeam}
        />
        <LeagueTable
          title="パ・リーグ"
          teams={PACIFIC}
          standings={standings}
          schedule={schedule}
          onSelectTeam={onSelectTeam}
        />
      </section>
      {interleagueStandings && (
        <LeagueTable
          title="交流戦"
          teams={[...CENTRAL, ...PACIFIC]}
          standings={interleagueStandings}
          schedule={schedule}
          onSelectTeam={onSelectTeam}
          variant="interleague"
        />
      )}
    </div>
  );
}
