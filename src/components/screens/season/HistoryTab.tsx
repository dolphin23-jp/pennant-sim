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

const ACHIEVEMENT_KIND_TONE: Record<AchievementEvent['kind'], string> = {
  milestone: 'var(--color-accent)',
  seasonRecord: 'var(--color-leader)',
  careerRecord: 'var(--color-leader)',
};

function ChampionCard({ record }: { record: ChampionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const champion = TINFO[record.champion];
  return (
    <Card
      ariaLabel={`${record.year}年 優勝 ${champion.n}`}
      style={{ borderLeft: `4px solid ${champion.c}` }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', fontWeight: 700 }}>
            {record.year}年 日本一
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: teamTextColor(champion.c) }}>
            {champion.n}
          </div>
        </div>
        {record.record && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {record.record.w}勝{record.record.l}敗{record.record.d}分
          </div>
        )}
      </div>
      {record.runnerUp && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
          日本シリーズ相手：{TINFO[record.runnerUp].n}
        </div>
      )}
      {record.teamStats && (
        <div style={{ display: 'flex', gap: 14, fontSize: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <span>打率 {record.teamStats.avg.toFixed(3).replace(/^0/, '')}</span>
          <span>本塁打 {record.teamStats.hr}</span>
          <span>盗塁 {record.teamStats.sb}</span>
          <span>防御率 {record.teamStats.era.toFixed(2)}</span>
          <span>奪三振 {record.teamStats.k}</span>
        </div>
      )}
      {((record.keyBatters?.length ?? 0) > 0 || (record.keyPitchers?.length ?? 0) > 0) && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
          主力：{[...(record.keyBatters ?? []), ...(record.keyPitchers ?? [])].join('、')}
        </div>
      )}
      {record.lineup && record.lineup.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Button
            onClick={() => setExpanded((current) => !current)}
            color="var(--color-surface-muted)"
            ariaLabel={`${record.year}年優勝時のスタメンを${expanded ? '隠す' : '表示'}`}
          >
            {expanded ? 'スタメンを隠す' : '優勝時のスタメンを表示'}
          </Button>
          {expanded && (
            <ol
              style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 3, fontSize: 12 }}
            >
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(78px,auto) minmax(0,1fr) auto',
        gap: 8,
        alignItems: 'center',
        padding: '7px 8px',
        border: '1px solid var(--color-border)',
        borderRadius: 7,
        background: 'var(--color-surface-raised)',
        fontSize: 12,
      }}
    >
      <strong style={{ color: ACHIEVEMENT_KIND_TONE[event.kind] }}>
        {ACHIEVEMENT_KIND_LABEL[event.kind]}
      </strong>
      <span>
        <span style={{ color: teamTextColor(info.c), fontWeight: 800 }}>{info.ab}</span>{' '}
        {event.playerName} ― {event.metricLabel} {event.value}
        {event.previousHolderName && event.previousValue != null && (
          <span style={{ color: 'var(--color-text-faint)' }}>
            {' '}
            （前記録：{event.previousHolderName} {event.previousValue}）
          </span>
        )}
      </span>
      <span style={{ color: 'var(--color-text-faint)', whiteSpace: 'nowrap' }}>{event.date}</span>
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

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 8px',
  borderTop: '1px solid var(--color-border)',
  fontSize: 12,
  flexWrap: 'wrap',
} as const;

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
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
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
        <div style={{ fontSize: 18, fontWeight: 900, color: teamTextColor(info.c) }}>{info.n}</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, marginTop: 6, flexWrap: 'wrap' }}>
          <span>リーグ優勝 {history.pennants}回</span>
          <span>日本一 {history.championships}回</span>
          <span>記録のある年 {history.seasons.length}年</span>
        </div>
      </Card>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        }}
      >
        <Card ariaLabel="年度別成績">
          <SectionTitle>年度別成績</SectionTitle>
          {history.seasons.length ? (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {history.seasons.map((season) => (
                <div key={season.year} style={rowStyle}>
                  <span>
                    {season.year}年 {season.rank ? `${season.rank}位` : ''}
                    {season.champion ? ' 日本一' : season.runnerUp ? ' 日本シリーズ進出' : ''}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
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
              <div key={leader.label} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-faint)' }}>
                  {leader.label}
                </div>
                {leader.entries.map((entry, index) => (
                  <div key={entry.playerId} style={rowStyle}>
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
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {history.honors.map((honor) => (
                <div key={`mvp:${honor.year}:${honor.playerId}`} style={rowStyle}>
                  <span>
                    {honor.year} MVP{' '}
                    <PlayerName playerId={honor.playerId} name={honor.playerName} />
                  </span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{honor.summary}</span>
                </div>
              ))}
              {history.titles.map((title) => (
                <div key={`${title.year}:${title.titleId}:${title.playerId}`} style={rowStyle}>
                  <span>
                    {title.year} {title.titleLabel}{' '}
                    <PlayerName playerId={title.playerId} name={title.playerName} />
                  </span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{title.displayValue}</span>
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
      <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 0 }}>
        引退した選手のうち、名球会の基準（2000安打・200勝・250セーブ）や400本塁打・2500奪三振に達した選手、MVPを2回以上受賞した選手、タイトルとベストナインを重ねた選手です。
      </p>
      {entries.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {entries.map((entry) => (
            <Card key={entry.playerId} ariaLabel={`殿堂 ${entry.playerName}`}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 800 }}>
                  <PlayerName playerId={entry.playerId} name={entry.playerName} />{' '}
                  {entry.teamKey && (
                    <span style={{ color: teamTextColor(TINFO[entry.teamKey].c), fontSize: 12 }}>
                      {TINFO[entry.teamKey].ab}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
                  {entry.retiredYear ? `${entry.retiredYear}年引退` : ''}
                </span>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{entry.careerLine}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--color-leader)' }}>
                {entry.reasons.join('・')}
              </div>
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
      <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 0 }}>
        現役選手のうち、通算記録の節目が近い選手です（リーグ通算）。
      </p>
      {entries.length ? (
        <Card ariaLabel="節目の近い選手">
          {entries.map((entry) => (
            <div key={`${entry.playerId}:${entry.label}`} style={rowStyle}>
              <span>
                <PlayerName playerId={entry.playerId} name={entry.playerName} />{' '}
                <span style={{ color: teamTextColor(TINFO[entry.teamKey].c), fontSize: 11 }}>
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
    <div style={{ display: 'grid', gap: 18 }}>
      <nav aria-label="記録の表示切り替え" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            <div style={{ display: 'grid', gap: 10 }}>
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
            <div style={{ display: 'grid', gap: 6 }}>
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
