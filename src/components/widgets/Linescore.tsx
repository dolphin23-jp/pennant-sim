export interface LinescoreProps {
  homeAbbreviation: string;
  awayAbbreviation: string;
  innings: { home: number | null; away: number | null }[];
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors?: number;
  awayErrors?: number;
}

export function Linescore({
  homeAbbreviation,
  awayAbbreviation,
  innings,
  homeScore,
  awayScore,
  homeHits,
  awayHits,
  homeErrors,
  awayErrors,
}: LinescoreProps) {
  const showErrors = homeErrors !== undefined && awayErrors !== undefined;
  return (
    <div
      className="linescore"
      aria-live="polite"
      aria-label={`${awayAbbreviation} ${awayScore}安打${awayHits}、${homeAbbreviation} ${homeScore}安打${homeHits}`}
    >
      <div className="table-scroll">
        <table className="linescore__table" aria-label="イニング別得点">
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left' }}>
                Team
              </th>
              {innings.map((_, index) => (
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
              {showErrors && (
                <th scope="col" className="linescore__totals-head">
                  E
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" style={{ textAlign: 'left' }}>
                {awayAbbreviation}
              </th>
              {innings.map((inning, index) => (
                <td key={index}>{inning.away ?? 'X'}</td>
              ))}
              <td className="linescore__totals">{awayScore}</td>
              <td className="linescore__totals linescore__totals--hits">{awayHits}</td>
              {showErrors && <td className="linescore__totals">{awayErrors}</td>}
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: 'left' }}>
                {homeAbbreviation}
              </th>
              {innings.map((inning, index) => (
                <td key={index}>{inning.home ?? 'X'}</td>
              ))}
              <td className="linescore__totals">{homeScore}</td>
              <td className="linescore__totals linescore__totals--hits">{homeHits}</td>
              {showErrors && <td className="linescore__totals">{homeErrors}</td>}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
