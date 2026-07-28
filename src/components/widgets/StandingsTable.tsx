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
      <div style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 6 }}>
        {showForm
          ? `上位${CLIMAX_SERIES_SPOTS}球団がクライマックスシリーズ進出圏`
          : 'セ・パ12球団を通算成績で順位付け（個人成績・MVPは対象外）'}
      </div>
      <div className="table-scroll">
        <table className="data-table" aria-label={`${title}順位表`}>
          <thead>
            <tr>
              <th scope="col">順</th>
              <th scope="col" style={{ textAlign: 'left' }}>
                球団
              </th>
              <th scope="col">勝</th>
              <th scope="col">敗</th>
              <th scope="col">分</th>
              <th scope="col">勝率</th>
              <th scope="col">差</th>
              {showForm && (
                <>
                  <th scope="col">直近10</th>
                  <th scope="col">連続</th>
                  <th scope="col">内訳</th>
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
                  style={{
                    background: isLeader
                      ? 'color-mix(in srgb, var(--color-leader) 10%, transparent)'
                      : undefined,
                    borderBottom:
                      showForm && index === CLIMAX_SERIES_SPOTS - 1
                        ? '2px dashed var(--color-border-strong)'
                        : undefined,
                  }}
                >
                  <td
                    className={isLeader ? 'rank-leader-value' : undefined}
                    style={{ textAlign: 'center', fontWeight: 900 }}
                  >
                    {record.rank}
                  </td>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 800 }}>
                    {onSelectTeam ? (
                      <button
                        type="button"
                        className="roster-player-button"
                        aria-label={`${TINFO[teamKey].n}のロースターを表示`}
                        onClick={() => onSelectTeam(teamKey)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          color: teamTextColor(TINFO[teamKey].c),
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: TINFO[teamKey].c,
                          }}
                        />
                        {TINFO[teamKey].ab}
                      </button>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          color: teamTextColor(TINFO[teamKey].c),
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: TINFO[teamKey].c,
                          }}
                        />
                        {TINFO[teamKey].ab}
                      </span>
                    )}
                    {showForm && !inClimaxSpots && (
                      <span
                        style={{ marginLeft: 4, color: 'var(--color-text-faint)', fontSize: 10 }}
                      >
                        圏外
                      </span>
                    )}
                  </th>
                  <td style={{ textAlign: 'center' }}>{record.w}</td>
                  <td style={{ textAlign: 'center' }}>{record.l}</td>
                  <td style={{ textAlign: 'center' }}>{record.d}</td>
                  <td style={{ textAlign: 'center' }}>
                    {record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '')}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {record.gb}
                  </td>
                  {form && (
                    <>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {recordText(form.last10)}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          color: form.streak.includes('連勝')
                            ? 'var(--color-success)'
                            : form.streak.includes('連敗')
                              ? 'var(--color-danger)'
                              : 'var(--color-text-muted)',
                          fontWeight: 800,
                        }}
                      >
                        {form.streak}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
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
    <div style={{ display: 'grid', gap: 12 }}>
      <section
        aria-label="両リーグ順位表"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
          gap: 12,
        }}
      >
        <LeagueTable
          title="Central League"
          teams={CENTRAL}
          standings={standings}
          schedule={schedule}
          onSelectTeam={onSelectTeam}
        />
        <LeagueTable
          title="Pacific League"
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
