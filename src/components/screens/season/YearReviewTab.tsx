import { useMemo, useState, type ReactNode } from 'react';

import { TINFO } from '../../../data';
import { SEASON_HONOR_LABEL, type TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import {
  availableReviewYears,
  buildYearReview,
  moveLabel,
  YEAR_REVIEW_LEAGUES,
  type YearReview,
} from '../../../state/yearReview';
import { Card, EmptyState, SectionTitle, teamTextColor } from '../../ui';

// Same wording as the history tab's achievement list.
const ACHIEVEMENT_KIND_LABEL: Record<'milestone' | 'seasonRecord' | 'careerRecord', string> = {
  milestone: 'メモリアル',
  seasonRecord: '今季新記録',
  careerRecord: '球団史新記録',
};

function TeamName({ teamKey, short = false }: { teamKey: TeamKey | null; short?: boolean }) {
  if (!teamKey) return null;
  const info = TINFO[teamKey];
  return (
    <span className="year-review-team-name" style={{ color: teamTextColor(info.c) }}>
      {short ? info.ab : info.n}
    </span>
  );
}

function PlayerLink({
  playerId,
  name,
  onSelect,
}: {
  playerId: string;
  name: string;
  onSelect(playerId: string): void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(playerId)}
      aria-label={`${name}の詳細を表示`}
      className="year-review-player-link"
    >
      {name}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card ariaLabel={title}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </Card>
  );
}

function StandingsSection({ review, playerTeam }: { review: YearReview; playerTeam: TeamKey }) {
  if (!review.standings.central.length && !review.standings.pacific.length) return null;
  return (
    <Section title="最終順位">
      <div className="year-review-standings">
        {YEAR_REVIEW_LEAGUES.map((league) => (
          <div key={league.id}>
            <div className="year-review-label year-review-label--spaced">{league.label}</div>
            <ol className="year-review-list">
              {review.standings[league.id].map((row) => (
                <li
                  key={row.teamKey}
                  className={`year-review-row year-review-row--standing${
                    row.teamKey === playerTeam ? ' year-review-row--player' : ''
                  }`}
                >
                  <span>
                    {row.rank}. <TeamName teamKey={row.teamKey} />
                    {row.champion ? '（日本一）' : ''}
                  </span>
                  <span className="year-review-muted">
                    {row.wins}勝{row.losses}敗{row.draws}分
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function YearReviewTab({ initialYear }: { initialYear?: number }) {
  const game = useGameState();
  const seasonOver =
    game.season.schedule.length > 0 && game.season.schedule.every((scheduled) => scheduled.played);
  const throughYear = seasonOver ? game.season.year : game.season.year - 1;
  const years = useMemo(
    () =>
      availableReviewYears(
        {
          championHistory: game.championHistory,
          awardHistory: game.awardHistory,
          honorHistory: game.honorHistory,
          achievementHistory: game.achievementHistory,
          narrativeEvents: game.narrativeEvents,
          yearlyStats: game.yearlyStats,
          leagueCareerAccumulated: game.leagueCareerAccumulated,
        },
        throughYear,
      ),
    [
      game.championHistory,
      game.awardHistory,
      game.honorHistory,
      game.achievementHistory,
      game.narrativeEvents,
      game.yearlyStats,
      game.leagueCareerAccumulated,
      throughYear,
    ],
  );
  const [chosenYear, setChosenYear] = useState<number | null>(initialYear ?? null);
  const year = chosenYear !== null && years.includes(chosenYear) ? chosenYear : years[0];
  const review = useMemo(
    () =>
      year === undefined
        ? null
        : buildYearReview(
            {
              championHistory: game.championHistory,
              awardHistory: game.awardHistory,
              honorHistory: game.honorHistory,
              achievementHistory: game.achievementHistory,
              narrativeEvents: game.narrativeEvents,
              yearlyStats: game.yearlyStats,
              leagueCareerAccumulated: game.leagueCareerAccumulated,
            },
            year,
          ),
    [
      year,
      game.championHistory,
      game.awardHistory,
      game.honorHistory,
      game.achievementHistory,
      game.narrativeEvents,
      game.yearlyStats,
      game.leagueCareerAccumulated,
    ],
  );

  if (!game.playerTeam) return null;
  const playerTeam = game.playerTeam;
  const selectPlayer = (playerId: string) => {
    const active = game.teams
      ? Object.values(game.teams)
          .flatMap((team) => [...team.fielders, ...team.pitchers])
          .find((player) => player.id === playerId)
      : undefined;
    const player = active ?? game.retiredPlayers.find((candidate) => candidate.id === playerId);
    if (player) game.selectPlayer(player);
  };

  if (!review || year === undefined)
    return (
      <EmptyState>
        まだ総括できるシーズンがありません。シーズンを終えると、その年の出来事がここにまとまります。
      </EmptyState>
    );

  return (
    <div className="year-review">
      <div className="year-review__header">
        <h2 className="year-review__title">{year}年の総括</h2>
        <label className="year-review__year-picker">
          年度
          <select
            value={year}
            onChange={(event) => setChosenYear(Number(event.target.value))}
            aria-label="総括する年度"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}年
              </option>
            ))}
          </select>
        </label>
      </div>

      {review.champion && (
        <Card
          ariaLabel={`${year}年 日本一`}
          style={{ borderLeft: `4px solid ${TINFO[review.champion.champion].c}` }}
        >
          <div className="year-review-label">日本一</div>
          <div className="year-review-champion__name">
            <TeamName teamKey={review.champion.champion} />
          </div>
          <div className="year-review-muted">
            {review.champion.runnerUp && (
              <>
                日本シリーズ相手：
                <TeamName teamKey={review.champion.runnerUp} />
              </>
            )}
            {review.champion.record &&
              ` / ${review.champion.record.w}勝${review.champion.record.l}敗${review.champion.record.d}分`}
          </div>
          {review.champion.keyBatters?.length || review.champion.keyPitchers?.length ? (
            <div className="year-review-muted year-review-champion__players">
              主力：
              {[...(review.champion.keyBatters ?? []), ...(review.champion.keyPitchers ?? [])]
                .filter(Boolean)
                .join('・')}
            </div>
          ) : null}
        </Card>
      )}

      <StandingsSection review={review} playerTeam={playerTeam} />

      <div className="year-review-sections">
        {(review.titles.central.length > 0 || review.titles.pacific.length > 0) && (
          <Section title="タイトル">
            {YEAR_REVIEW_LEAGUES.map((league) =>
              review.titles[league.id].length ? (
                <div key={league.id} className="year-review-group">
                  <div className="year-review-label">{league.label}</div>
                  <ul className="year-review-list">
                    {review.titles[league.id].map((title) => (
                      <li key={`${title.titleId}:${title.playerId}`} className="year-review-row">
                        <span>
                          {title.titleLabel}{' '}
                          <PlayerLink
                            playerId={title.playerId}
                            name={title.playerName}
                            onSelect={selectPlayer}
                          />{' '}
                          <TeamName teamKey={title.teamKey} short />
                        </span>
                        <span className="year-review-muted">{title.displayValue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </Section>
        )}

        {review.honors.length > 0 && (
          <Section title="表彰">
            {YEAR_REVIEW_LEAGUES.map((league) => {
              const honors = review.honors.filter((honor) => honor.league === league.id);
              return honors.length ? (
                <div key={league.id} className="year-review-group">
                  <div className="year-review-label">{league.label}</div>
                  <ul className="year-review-list">
                    {honors.map((honor) => (
                      <li
                        key={`${honor.honorId}:${honor.position ?? ''}:${honor.playerId}`}
                        className="year-review-row"
                      >
                        <span>
                          {honor.honorId === 'bestNine' || honor.honorId === 'goldenGlove'
                            ? `${honor.honorId === 'bestNine' ? 'B9' : 'GG'}・${honor.position}`
                            : SEASON_HONOR_LABEL[honor.honorId]}{' '}
                          <PlayerLink
                            playerId={honor.playerId}
                            name={honor.playerName}
                            onSelect={selectPlayer}
                          />{' '}
                          <TeamName teamKey={honor.teamKey} short />
                        </span>
                        <span className="year-review-muted">{honor.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })}
          </Section>
        )}

        {review.leaders.length > 0 && (
          <Section title="個人成績の上位">
            {review.leaders.map((section) => (
              <div key={section.label} className="year-review-group">
                <div className="year-review-label">{section.label}</div>
                <ol className="year-review-list">
                  {section.entries.map((entry) => (
                    <li key={entry.playerId} className="year-review-row">
                      <span>
                        <PlayerLink
                          playerId={entry.playerId}
                          name={entry.playerName}
                          onSelect={selectPlayer}
                        />{' '}
                        <TeamName teamKey={entry.teamKey} short />
                      </span>
                      <span className="year-review-muted">{entry.value}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </Section>
        )}

        {review.achievements.length > 0 && (
          <Section title="記録・節目">
            <ul className="year-review-list">
              {review.achievements.map((event) => (
                <li key={event.id} className="year-review-row">
                  <span>
                    <PlayerLink
                      playerId={event.playerId}
                      name={event.playerName}
                      onSelect={selectPlayer}
                    />{' '}
                    {event.metricLabel} {event.value}（{ACHIEVEMENT_KIND_LABEL[event.kind]}）
                  </span>
                  <TeamName teamKey={event.teamKey} short />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.breakouts.length > 0 && (
          <Section title="ブレイク">
            <ul className="year-review-list">
              {review.breakouts.map((event) => (
                <li key={event.id} className="year-review-row">
                  <span>
                    <PlayerLink
                      playerId={event.playerId}
                      name={event.playerName}
                      onSelect={selectPlayer}
                    />{' '}
                    <TeamName teamKey={event.teamKey} short />
                  </span>
                  <span className="year-review-muted">
                    {event.developmentKind === 'awakening'
                      ? event.isBreakthrough
                        ? '限界突破'
                        : '覚醒'
                      : `OVR ${event.ovrBefore} → ${event.ovrAfter}`}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.moves.total > 0 && (
          <Section title={`主な移籍（${review.moves.total}件）`}>
            <ul className="year-review-list">
              {review.moves.highlights.map((event) => (
                <li key={event.id} className="year-review-row year-review-row--start">
                  <span className="year-review-muted year-review-move-label">
                    {moveLabel(event)}
                  </span>
                  <span>
                    {event.movements?.length ? (
                      event.movements.map((movement, index) => (
                        <span key={movement.playerId}>
                          {index > 0 ? '、' : ''}
                          <PlayerLink
                            playerId={movement.playerId}
                            name={movement.playerName}
                            onSelect={selectPlayer}
                          />
                          （<TeamName teamKey={movement.fromTeamKey} short />→
                          <TeamName teamKey={movement.toTeamKey} short />）
                        </span>
                      ))
                    ) : (
                      <>
                        <PlayerLink
                          playerId={event.playerId}
                          name={event.playerName}
                          onSelect={selectPlayer}
                        />{' '}
                        {event.fromTeamKey && event.fromTeamKey !== event.toTeamKey ? (
                          <>
                            （<TeamName teamKey={event.fromTeamKey} short />→
                            {event.toTeamKey ? <TeamName teamKey={event.toTeamKey} short /> : 'MLB'}
                            ）
                          </>
                        ) : (
                          <TeamName teamKey={event.toTeamKey ?? event.fromTeamKey ?? null} short />
                        )}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.retirements.length > 0 && (
          <Section title="引退">
            <ul className="year-review-list">
              {review.retirements.map((row) => (
                <li key={row.playerId} className="year-review-row">
                  <span>
                    <PlayerLink
                      playerId={row.playerId}
                      name={row.playerName}
                      onSelect={selectPlayer}
                    />{' '}
                    <TeamName teamKey={row.teamKey} short />
                  </span>
                  <span className="year-review-muted">{row.career ?? ''}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.firstRoundPicks.length > 0 && (
          <Section title="ドラフト1位">
            <ul className="year-review-list">
              {review.firstRoundPicks.map((event) => (
                <li key={event.id} className="year-review-row">
                  <span>
                    <TeamName teamKey={event.teamKey} short />{' '}
                    <PlayerLink
                      playerId={event.playerId}
                      name={event.playerName}
                      onSelect={selectPlayer}
                    />
                  </span>
                  <span className="year-review-muted">{event.origin ?? ''}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
