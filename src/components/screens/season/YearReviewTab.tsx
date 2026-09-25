import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

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

const listStyle: CSSProperties = { display: 'grid', gap: 6, margin: 0, padding: 0 };
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 13,
  alignItems: 'baseline',
};
const mutedStyle: CSSProperties = { color: 'var(--color-text-muted)', fontSize: 12 };

function TeamName({ teamKey, short = false }: { teamKey: TeamKey | null; short?: boolean }) {
  if (!teamKey) return null;
  const info = TINFO[teamKey];
  return (
    <span style={{ color: teamTextColor(info.c), fontWeight: 700 }}>
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
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'var(--color-text)',
        cursor: 'pointer',
        font: 'inherit',
        textDecoration: 'underline',
        textDecorationColor: 'var(--color-border-strong)',
        textUnderlineOffset: 3,
      }}
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
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        {YEAR_REVIEW_LEAGUES.map((league) => (
          <div key={league.id}>
            <div style={{ ...mutedStyle, fontWeight: 700, marginBottom: 4 }}>{league.label}</div>
            <ol style={listStyle}>
              {review.standings[league.id].map((row) => (
                <li
                  key={row.teamKey}
                  style={{
                    ...rowStyle,
                    fontWeight: row.teamKey === playerTeam ? 800 : 400,
                    background:
                      row.teamKey === playerTeam ? 'var(--color-accent-soft)' : 'transparent',
                    borderRadius: 6,
                    padding: '2px 6px',
                  }}
                >
                  <span>
                    {row.rank}. <TeamName teamKey={row.teamKey} />
                    {row.champion ? '（日本一）' : ''}
                  </span>
                  <span style={mutedStyle}>
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
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{year}年の総括</h2>
        <label style={{ ...mutedStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <div style={{ ...mutedStyle, fontWeight: 700 }}>日本一</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            <TeamName teamKey={review.champion.champion} />
          </div>
          <div style={mutedStyle}>
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
            <div style={{ ...mutedStyle, marginTop: 4 }}>
              主力：
              {[...(review.champion.keyBatters ?? []), ...(review.champion.keyPitchers ?? [])]
                .filter(Boolean)
                .join('・')}
            </div>
          ) : null}
        </Card>
      )}

      <StandingsSection review={review} playerTeam={playerTeam} />

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        }}
      >
        {(review.titles.central.length > 0 || review.titles.pacific.length > 0) && (
          <Section title="タイトル">
            {YEAR_REVIEW_LEAGUES.map((league) =>
              review.titles[league.id].length ? (
                <div key={league.id} style={{ marginBottom: 8 }}>
                  <div style={{ ...mutedStyle, fontWeight: 700 }}>{league.label}</div>
                  <ul style={listStyle}>
                    {review.titles[league.id].map((title) => (
                      <li key={`${title.titleId}:${title.playerId}`} style={rowStyle}>
                        <span>
                          {title.titleLabel}{' '}
                          <PlayerLink
                            playerId={title.playerId}
                            name={title.playerName}
                            onSelect={selectPlayer}
                          />{' '}
                          <TeamName teamKey={title.teamKey} short />
                        </span>
                        <span style={mutedStyle}>{title.displayValue}</span>
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
                <div key={league.id} style={{ marginBottom: 8 }}>
                  <div style={{ ...mutedStyle, fontWeight: 700 }}>{league.label}</div>
                  <ul style={listStyle}>
                    {honors.map((honor) => (
                      <li
                        key={`${honor.honorId}:${honor.position ?? ''}:${honor.playerId}`}
                        style={rowStyle}
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
                        <span style={mutedStyle}>{honor.summary}</span>
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
              <div key={section.label} style={{ marginBottom: 8 }}>
                <div style={{ ...mutedStyle, fontWeight: 700 }}>{section.label}</div>
                <ol style={listStyle}>
                  {section.entries.map((entry) => (
                    <li key={entry.playerId} style={rowStyle}>
                      <span>
                        <PlayerLink
                          playerId={entry.playerId}
                          name={entry.playerName}
                          onSelect={selectPlayer}
                        />{' '}
                        <TeamName teamKey={entry.teamKey} short />
                      </span>
                      <span style={mutedStyle}>{entry.value}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </Section>
        )}

        {review.achievements.length > 0 && (
          <Section title="記録・節目">
            <ul style={listStyle}>
              {review.achievements.map((event) => (
                <li key={event.id} style={rowStyle}>
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
            <ul style={listStyle}>
              {review.breakouts.map((event) => (
                <li key={event.id} style={rowStyle}>
                  <span>
                    <PlayerLink
                      playerId={event.playerId}
                      name={event.playerName}
                      onSelect={selectPlayer}
                    />{' '}
                    <TeamName teamKey={event.teamKey} short />
                  </span>
                  <span style={mutedStyle}>
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
            <ul style={listStyle}>
              {review.moves.highlights.map((event) => (
                <li key={event.id} style={{ ...rowStyle, justifyContent: 'flex-start' }}>
                  <span style={{ ...mutedStyle, minWidth: 56 }}>{moveLabel(event)}</span>
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
            <ul style={listStyle}>
              {review.retirements.map((row) => (
                <li key={row.playerId} style={rowStyle}>
                  <span>
                    <PlayerLink
                      playerId={row.playerId}
                      name={row.playerName}
                      onSelect={selectPlayer}
                    />{' '}
                    <TeamName teamKey={row.teamKey} short />
                  </span>
                  <span style={mutedStyle}>{row.career ?? ''}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.firstRoundPicks.length > 0 && (
          <Section title="ドラフト1位">
            <ul style={listStyle}>
              {review.firstRoundPicks.map((event) => (
                <li key={event.id} style={rowStyle}>
                  <span>
                    <TeamName teamKey={event.teamKey} short />{' '}
                    <PlayerLink
                      playerId={event.playerId}
                      name={event.playerName}
                      onSelect={selectPlayer}
                    />
                  </span>
                  <span style={mutedStyle}>{event.origin ?? ''}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
