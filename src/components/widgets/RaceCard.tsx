import { useMemo } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../data';
import {
  CLIMAX_SERIES_SPOTS,
  magicLit,
  pennantRace,
  raceTimeline,
  type ScheduleGame,
  type StandingRecord,
  type TeamKey,
} from '../../engine';
import { Card, SectionTitle } from '../ui';
import { RaceChart } from './RaceChart';

/** How many games left before a series against a close rival is called out. */
const KEY_SERIES_FROM_REMAINING = 45;
/** Games behind (either way) that make a rival "close". */
const CLOSE_RIVAL_GAMES = 3;

const gamesBehind = (leader: StandingRecord, team: StandingRecord) =>
  (leader.w - team.w + team.l - leader.l) / 2;

/** The next run of games against one league rival, if it starts within the next three. */
function nextSeries(schedule: ScheduleGame[], team: TeamKey, league: readonly TeamKey[]) {
  const upcoming = schedule
    .filter((game) => !game.played && (game.homeKey === team || game.awayKey === team))
    .sort((first, second) => first.date.localeCompare(second.date));
  for (let start = 0; start < Math.min(3, upcoming.length); start += 1) {
    const game = upcoming[start]!;
    const opponent = game.homeKey === team ? game.awayKey : game.homeKey;
    if (!league.includes(opponent)) continue;
    let length = 1;
    while (
      upcoming[start + length] &&
      [upcoming[start + length]!.homeKey, upcoming[start + length]!.awayKey].includes(opponent)
    )
      length += 1;
    return { opponent, length, date: game.date };
  }
  return null;
}

/**
 * The pennant race at a glance: the headline a sports page would lead with (magic number,
 * clinch, games behind), the Climax Series line, a series against a close rival coming
 * up, and the games-behind chart for the whole season.
 */
export function RaceCard({
  schedule,
  standings,
  team,
}: {
  schedule: ScheduleGame[];
  standings: Record<TeamKey, StandingRecord>;
  team: TeamKey;
}) {
  const league = CENTRAL.includes(team) ? CENTRAL : PACIFIC;
  const race = useMemo(() => pennantRace(schedule, league), [schedule, league]);
  const timeline = useMemo(() => raceTimeline(schedule, league), [schedule, league]);
  const status = race[team];
  const record = standings[team];
  const ordered = [...league].sort(
    (first, second) => (standings[first].rank ?? 9) - (standings[second].rank ?? 9),
  );
  const leaderKey = ordered[0]!;
  const secondKey = ordered[1]!;
  const rank = record.rank ?? 9;

  let headline: string;
  let tone: 'gold' | 'hot' | 'cold' | 'plain' = 'plain';
  if (status.clinchedPennant) {
    headline = 'リーグ優勝';
    tone = 'gold';
  } else if (magicLit(status)) {
    headline = `マジック ${status.magic}`;
    tone = 'hot';
  } else if (rank === 1) {
    const lead = gamesBehind(record, standings[secondKey]);
    headline = lead > 0 ? `首位 ${lead.toFixed(1)}差リード` : '首位タイ';
    tone = 'hot';
  } else if (status.eliminatedPennant) {
    headline = status.eliminatedClimax ? 'CS進出の可能性消滅' : '優勝の可能性消滅';
    tone = 'cold';
  } else {
    headline = `首位${TINFO[leaderKey].ab}と ${gamesBehind(standings[leaderKey], record).toFixed(1)}差`;
  }

  const climaxLine = (() => {
    if (status.clinchedPennant) return null;
    if (status.clinchedClimax) return 'CS進出決定';
    if (status.eliminatedClimax) return null;
    const third = standings[ordered[CLIMAX_SERIES_SPOTS - 1]!];
    const fourth = standings[ordered[CLIMAX_SERIES_SPOTS]!];
    return rank <= CLIMAX_SERIES_SPOTS
      ? `CS圏内（4位と${gamesBehind(record, fourth).toFixed(1)}差）`
      : `CS圏の3位と${gamesBehind(third, record).toFixed(1)}差`;
  })();

  const series = nextSeries(schedule, team, league);
  const keySeries =
    series &&
    status.remaining <= KEY_SERIES_FROM_REMAINING &&
    !status.clinchedPennant &&
    Math.abs(gamesBehind(standings[series.opponent], record)) <= CLOSE_RIVAL_GAMES
      ? {
          ...series,
          label: [team, series.opponent].every((key) => key === leaderKey || key === secondKey)
            ? '天王山'
            : '直接対決',
        }
      : null;

  return (
    <Card ariaLabel="ペナントレース" className="race-card">
      <div className="race-card__header">
        <SectionTitle>ペナントレース</SectionTitle>
        <span className="race-card__remaining">残り{status.remaining}試合</span>
      </div>
      <div className={`race-card__headline race-card__headline--${tone}`} role="status">
        {headline}
      </div>
      <div className="race-card__lines">
        {climaxLine && <span className="race-card__line">{climaxLine}</span>}
        {keySeries && (
          <span className="race-card__line race-card__line--key">
            {keySeries.label}：{Number(keySeries.date.slice(5, 7))}/
            {Number(keySeries.date.slice(8, 10))}から
            {TINFO[keySeries.opponent].ab}と{keySeries.length}連戦
          </span>
        )}
      </div>
      <RaceChart timeline={timeline} teams={league} ownTeam={team} />
    </Card>
  );
}
