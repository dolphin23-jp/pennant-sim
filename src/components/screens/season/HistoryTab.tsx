import { useMemo, useState } from 'react';

import { TINFO } from '../../../data';
import type { AchievementEvent, TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import {
  buildFranchiseHistory,
  buildHallOfFame,
  buildRecordWatch,
  type HistorySource,
} from '../../../state/history';
import type { ChampionRecord } from '../../../state/storage';
import { Button, Card, EmptyState, SectionTitle, teamTextColor } from '../../ui';

const ACHIEVEMENT_KIND_LABEL: Record<AchievementEvent['kind'], string> = {
  milestone: 'メモリアル',
  seasonRecord: '今季新記録',
  careerRecord: '球団史新記録',
};

const ACHIEVEMENT_KIND_CLASS: Record<AchievementEvent['kind'], string> = {
  milestone: 'history-achievement__kind--milestone',
  seasonRecord: 'history-achievement__kind--season-record',
  careerRecord: 'history-achievement__kind--career-record',
};

function ChampionCard({ record }: { record: ChampionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const champion = TINFO[record.champion];
  return (
    <Card
      ariaLabel={`${record.year}年 優勝 ${champion.n}`}
      style={{ borderLeft: `4px solid ${champion.c}` }}
    >
      <div className="history-champion__header">
        <div>
          <div className="history-champion__year">{record.year}年 日本一</div>
          <div className="history-champion__name" style={{ color: teamTextColor(champion.c) }}>
            {champion.n}
          </div>
        </div>
        {record.record && (
          <div className="history-champion__record">
            {record.record.w}勝{record.record.l}敗{record.record.d}分
          </div>
        )}
      </div>
      {record.runnerUp && (
        <div className="history-champion__runner-up">
          日本シリーズ相手：{TINFO[record.runnerUp].n}
        </div>
      )}
      {record.teamStats && (
        <div className="history-champion__stats">
          <span>打率 {record.teamStats.avg.toFixed(3).replace(/^0/, '')}</span>
          <span>本塁打 {record.teamStats.hr}</span>
          <span>盗塁 {record.teamStats.sb}</span>
          <span>防御率 {record.teamStats.era.toFixed(2)}</span>
          <span>奪三振 {record.teamStats.k}</span>
        </div>
      )}
      {((record.keyBatters?.length ?? 0) > 0 || (record.keyPitchers?.length ?? 0) > 0) && (
        <div className="history-champion__key-players">
          主力：{[...(record.keyBatters ?? []), ...(record.keyPitchers ?? [])].join('、')}
        </div>
      )}
      {record.lineup && record.lineup.length > 0 && (
        <div className="history-champion__lineup">
          <Button
            onClick={() => setExpanded((current) => !current)}
            color="var(--color-surface-muted)"
            ariaLabel={`${record.year}年優勝時のスタメンを${expanded ? '隠す' : '表示'}`}
          >
            {expanded ? 'スタメンを隠す' : '優勝時のスタメンを表示'}
          </Button>
          {expanded && (
            <ol className="history-champion__lineup-list">
              {record.lineup.map((entry) => (
                <li key={entry.playerId}>
                  {entry.playerName}（{entry.pos}）
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

function AchievementRow({ event }: { event: AchievementEvent }) {
  const info = TINFO[event.teamKey];
  return (
    <div className="history-achievement">
      <strong className={`history-achievement__kind ${ACHIEVEMENT_KIND_CLASS[event.kind]}`}>
        {ACHIEVEMENT_KIND_LABEL[event.kind]}
      </strong>
      <span>
        <span className="history-achievement__team" style={{ color: teamTextColor(info.c) }}>
          {info.ab}
        </span>{' '}
        {event.playerName} ― {event.metricLabel} {event.value}
        {event.previousHolderName && event.previousValue != null && (
          <span className="history-achievement__previous">
            {' '}
            （前記録：{event.previousHolderName} {event.previousValue}）
          </span>
        )}
      </span>
      <span className="history-achievement__date">{event.date}</span>
    </div>
  );
}

type HistoryView = 'franchise' | 'hall' | 'watch' | 'champions' | 'achievements';

const HISTORY_VIEWS: Array<{ id: HistoryView; label: string }> = [
  { id: 'franchise', label: '球団史' },
  { id: 'hall', label: '殿堂' },
  { id: 'watch', label: '記録ウォッチ' },
  { id: 'champions', label: '日本一の歴史' },
  { id: 'achievements', label: 'メモリアル・新記録' },
];

function PlayerName({ playerId, name }: { playerId: string; name: string }) {
  const game = useGameState();
  const player =
    Object.values(game.teams ?? {})
      .flatMap((team) => [...team.pitchers, ...team.fielders])
      .find((candidate) => candidate.id === playerId) ??
    game.retiredPlayers.find((candidate) => candidate.id === playerId) ??
    null;
  if (!player) return <strong>{name}</strong>;
  return (
    <button
      type="button"
      className="roster-player-button"
      onClick={() => game.selectPlayer(player)}
    >
      {name}
    </button>
  );
}

function FranchiseView({ source }: { source: HistorySource }) {
  const game = useGameState();
  const [teamKey, setTeamKey] = useState<TeamKey>(game.playerTeam ?? 'giants');
  const history = useMemo(() => buildFranchiseHistory(source, teamKey), [source, teamKey]);
  const info = TINFO[teamKey];
  return (
    <div className="history-franchise">
      <label className="history-franchise__team-select">
        球団
        <select
          aria-label="球団史を表示する球団"
          value={teamKey}
          onChange={(event) => setTeamKey(event.target.value as TeamKey)}
        >
          {(Object.keys(TINFO) as TeamKey[]).map((key) => (
            <option key={key} value={key}>
              {TINFO[key].n}
            </option>
          ))}
        </select>
      </label>
      <Card ariaLabel={`${info.n}の球団史`} style={{ borderLeft: `4px solid ${info.c}` }}>
        <div className="history-franchise__team-name" style={{ color: teamTextColor(info.c) }}>
          {info.n}
        </div>
        <div className="history-franchise__summary">
          <span>リーグ優勝 {history.pennants}回</span>
          <span>日本一 {history.championships}回</span>
          <span>記録のある年 {history.seasons.length}年</span>
        </div>
      </Card>
      <div className="history-franchise__grid">
        <Card ariaLabel="年度別成績">
          <SectionTitle>年度別成績</SectionTitle>
          {history.seasons.length ? (
            <div className="history-franchise__scroll">
              {history.seasons.map((season) => (
                <div key={season.year} className="history-row">
                  <span>
                    {season.year}年 {season.rank ? `${season.rank}位` : ''}
                    {season.champion ? ' 日本一' : season.runnerUp ? ' 日本シリーズ進出' : ''}
                  </span>
                  <span className="history-row__muted">
                    {season.wins != null
                      ? `${season.wins}勝${season.losses}敗${season.draws}分`
                      : '―'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>まだ記録がありません。</EmptyState>
          )}
        </Card>
        <Card ariaLabel="球団通算記録">
          <SectionTitle>球団通算記録（在籍中の成績）</SectionTitle>
          {history.leaders.length ? (
            history.leaders.map((leader) => (
              <div key={leader.label} className="history-franchise__leader">
                <div className="history-franchise__leader-label">{leader.label}</div>
                {leader.entries.map((entry, index) => (
                  <div key={entry.playerId} className="history-row">
                    <span>
                      {index + 1}. <PlayerName playerId={entry.playerId} name={entry.playerName} />
                    </span>
                    <span>{entry.value}</span>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <EmptyState>まだ年度別成績がありません。</EmptyState>
          )}
        </Card>
        <Card ariaLabel="球団のMVPとタイトル">
          <SectionTitle>MVP・タイトル</SectionTitle>
          {history.honors.length || history.titles.length ? (
            <div className="history-franchise__scroll">
              {history.honors.map((honor) => (
                <div key={`mvp:${honor.year}:${honor.playerId}`} className="history-row">
                  <span>
                    {honor.year} MVP{' '}
                    <PlayerName playerId={honor.playerId} name={honor.playerName} />
                  </span>
                  <span className="history-row__muted">{honor.summary}</span>
                </div>
              ))}
              {history.titles.map((title) => (
                <div
                  key={`${title.year}:${title.titleId}:${title.playerId}`}
                  className="history-row"
                >
                  <span>
                    {title.year} {title.titleLabel}{' '}
                    <PlayerName playerId={title.playerId} name={title.playerName} />
                  </span>
                  <span className="history-row__muted">{title.displayValue}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>まだ受賞者はいません。</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}

function HallView({ source }: { source: HistorySource }) {
  const entries = useMemo(() => buildHallOfFame(source), [source]);
  return (
    <section aria-label="殿堂">
      <SectionTitle>殿堂</SectionTitle>
      <p className="history-note">
        引退した選手のうち、名球会の基準（2000安打・200勝・250セーブ）や400本塁打・2500奪三振に達した選手、MVPを2回以上受賞した選手、タイトルとベストナインを重ねた選手です。
      </p>
      {entries.length ? (
        <div className="history-hall__list">
          {entries.map((entry) => (
            <Card key={entry.playerId} ariaLabel={`殿堂 ${entry.playerName}`}>
              <div className="history-hall__header">
                <span className="history-hall__name">
                  <PlayerName playerId={entry.playerId} name={entry.playerName} />{' '}
                  {entry.teamKey && (
                    <span
                      className="history-hall__team"
                      style={{ color: teamTextColor(TINFO[entry.teamKey].c) }}
                    >
                      {TINFO[entry.teamKey].ab}
                    </span>
                  )}
                </span>
                <span className="history-hall__retired">
                  {entry.retiredYear ? `${entry.retiredYear}年引退` : ''}
                </span>
              </div>
              <div className="history-hall__career">{entry.careerLine}</div>
              <div className="history-hall__reasons">{entry.reasons.join('・')}</div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>まだ殿堂入りした選手はいません。</EmptyState>
      )}
    </section>
  );
}

function WatchView({ source }: { source: HistorySource }) {
  const entries = useMemo(() => buildRecordWatch(source), [source]);
  return (
    <section aria-label="記録ウォッチ">
      <SectionTitle>記録ウォッチ</SectionTitle>
      <p className="history-note">現役選手のうち、通算記録の節目が近い選手です（リーグ通算）。</p>
      {entries.length ? (
        <Card ariaLabel="節目の近い選手">
          {entries.map((entry) => (
            <div key={`${entry.playerId}:${entry.label}`} className="history-row">
              <span>
                <PlayerName playerId={entry.playerId} name={entry.playerName} />{' '}
                <span
                  className="history-watch__team"
                  style={{ color: teamTextColor(TINFO[entry.teamKey].c) }}
                >
                  {TINFO[entry.teamKey].ab}
                </span>{' '}
                {entry.label}
                {entry.target}まで
              </span>
              <strong>あと{entry.remaining}</strong>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState>節目が近い選手はいません。</EmptyState>
      )}
    </section>
  );
}

export function HistoryTab() {
  const game = useGameState();
  const [view, setView] = useState<HistoryView>('franchise');
  const champions = [...game.championHistory].sort((first, second) => second.year - first.year);
  const achievements = [...game.achievementHistory].reverse().slice(0, 200);
  const source: HistorySource = useMemo(
    () => ({
      teams: game.teams,
      retiredPlayers: game.retiredPlayers,
      overseasPlayers: game.overseasPlayers,
      leagueCareerAccumulated: game.leagueCareerAccumulated,
      yearlyStats: game.yearlyStats,
      championHistory: game.championHistory,
      awardHistory: game.awardHistory,
      honorHistory: game.honorHistory,
      narrativeEvents: game.narrativeEvents,
    }),
    [
      game.teams,
      game.retiredPlayers,
      game.overseasPlayers,
      game.leagueCareerAccumulated,
      game.yearlyStats,
      game.championHistory,
      game.awardHistory,
      game.honorHistory,
      game.narrativeEvents,
    ],
  );

  return (
    <div className="history-tab">
      <nav aria-label="記録の表示切り替え" className="history-tab__nav">
        {HISTORY_VIEWS.map((entry) => (
          <Button
            key={entry.id}
            onClick={() => setView(entry.id)}
            color={view === entry.id ? 'var(--color-accent)' : 'var(--color-surface-muted)'}
            ariaLabel={`${entry.label}を表示`}
          >
            {entry.label}
          </Button>
        ))}
      </nav>
      {view === 'franchise' && <FranchiseView source={source} />}
      {view === 'hall' && <HallView source={source} />}
      {view === 'watch' && <WatchView source={source} />}
      {view === 'champions' && (
        <section aria-label="優勝球団の歴史">
          <SectionTitle>優勝球団の歴史</SectionTitle>
          {champions.length === 0 ? (
            <EmptyState>
              まだ優勝球団の記録がありません。日本シリーズを制覇すると記録されます。
            </EmptyState>
          ) : (
            <div className="history-tab__champions">
              {champions.map((record) => (
                <ChampionCard key={record.year} record={record} />
              ))}
            </div>
          )}
        </section>
      )}
      {view === 'achievements' && (
        <section aria-label="メモリアル・新記録の歴史">
          <SectionTitle>メモリアル・新記録</SectionTitle>
          {achievements.length === 0 ? (
            <EmptyState>まだ達成された記録はありません。</EmptyState>
          ) : (
            <div className="history-tab__achievements">
              {achievements.map((event) => (
                <AchievementRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
