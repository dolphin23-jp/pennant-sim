import { GRADE_LABEL, trustLabel, type ManagerRecord, type ManagerSeason } from '../../engine';
import { Card, SectionTitle } from '../ui';

const REACH_LABEL: Record<ManagerSeason['postseason'], string> = {
  champion: '日本一',
  japanSeries: '日本シリーズ進出',
  climax: 'CS進出',
  none: 'ポストシーズン逃す',
};

function TrustMeter({ trust, label }: { trust: number; label?: string }) {
  return (
    <div className="manager-trust">
      <div className="manager-trust__row">
        <span>{label ?? 'オーナーの信頼'}</span>
        <strong>
          {trust}・{trustLabel(trust)}
        </strong>
      </div>
      <div
        className="manager-trust__bar"
        role="meter"
        aria-label={`オーナーの信頼度 ${trust}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={trust}
      >
        <div
          className={`manager-trust__fill${trust < 40 ? ' manager-trust__fill--low' : ''}`}
          style={{ width: `${trust}%` }}
        />
      </div>
    </div>
  );
}

/** One season's evaluation: the grade on a scoreboard lamp, goal against result, and the
 * owner's words. */
export function ManagerSeasonCard({ season }: { season: ManagerSeason }) {
  const delta = season.trustAfter - season.trustBefore;
  return (
    <Card ariaLabel={`${season.year}年の監督評価`} className="manager-card">
      <SectionTitle>監督評価</SectionTitle>
      <div className="manager-card__body">
        <div
          className={`manager-card__grade manager-card__grade--${season.grade}`}
          role="img"
          aria-label={`評価 ${season.grade}（${GRADE_LABEL[season.grade]}）`}
        >
          <span aria-hidden="true">{season.grade}</span>
          <small aria-hidden="true">{GRADE_LABEL[season.grade]}</small>
        </div>
        <div className="manager-card__detail">
          <div className="manager-card__line">
            目標「{season.targetLabel}」→ 結果 <strong>{season.finalRank}位</strong>・
            {REACH_LABEL[season.postseason]}
          </div>
          <blockquote className="manager-card__comment">オーナー「{season.comment}」</blockquote>
          <div className="manager-card__line">
            信頼度 {season.trustBefore} → <strong>{season.trustAfter}</strong>（
            {delta >= 0 ? `+${delta}` : delta}）
            {season.budgetChange !== 0 &&
              ` ・ 来季予算 ${season.budgetChange > 0 ? '+' : ''}${Math.round(season.budgetChange * 100)}%`}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** The manager's whole tenure: current trust, and every season's goal, result and grade. */
export function ManagerHistoryCard({ record }: { record: ManagerRecord }) {
  return (
    <Card ariaLabel="監督の歩み" className="manager-card">
      <SectionTitle>監督の歩み</SectionTitle>
      <TrustMeter trust={record.trust} />
      {record.expectation && (
        <p className="manager-card__goal">
          {record.expectation.year}年の目標：<strong>{record.expectation.label}</strong>
          （戦力はリーグ{record.expectation.strengthRank}番手）
        </p>
      )}
      {record.history.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table manager-history">
            <thead>
              <tr>
                <th scope="col">年</th>
                <th scope="col">目標</th>
                <th scope="col">順位</th>
                <th scope="col">ポストシーズン</th>
                <th scope="col">評価</th>
                <th scope="col">信頼度</th>
              </tr>
            </thead>
            <tbody>
              {[...record.history].reverse().map((season) => (
                <tr key={season.year}>
                  <th scope="row">{season.year}</th>
                  <td>{season.targetLabel}</td>
                  <td>{season.finalRank}位</td>
                  <td>{REACH_LABEL[season.postseason]}</td>
                  <td>
                    <span className={`manager-history__grade manager-card__grade--${season.grade}`}>
                      {season.grade}
                    </span>
                  </td>
                  <td>{season.trustAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="manager-card__empty">
          シーズンを終えると、オーナーの評価がここに積み重なります。
        </p>
      )}
    </Card>
  );
}
