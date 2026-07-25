import { useMemo, useState } from 'react';

import { TINFO } from '../../../data';
import {
  BATTER_HISTORICAL_METRICS,
  PITCHER_HISTORICAL_METRICS,
  buildHistoricalRanking,
  formatHistoricalRankingValue,
} from '../../../engine';
import type {
  HistoricalRankingKind,
  HistoricalRankingMetric,
  HistoricalRankingScope,
  Player,
  TeamKey,
} from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, EmptyState, SectionTitle, SegmentedControl, teamTextColor } from '../../ui';

const TEAM_KEYS = Object.keys(TINFO) as TeamKey[];

export function HistoricalRankings() {
  const game = useGameState();
  const [scope, setScope] = useState<HistoricalRankingScope>('season');
  const [kind, setKind] = useState<HistoricalRankingKind>('bat');
  const [batterMetric, setBatterMetric] = useState<HistoricalRankingMetric>('homeRuns');
  const [pitcherMetric, setPitcherMetric] = useState<HistoricalRankingMetric>('wins');
  const [teamFilter, setTeamFilter] = useState<TeamKey | 'all'>('all');

  const metric = kind === 'bat' ? batterMetric : pitcherMetric;
  const metrics = kind === 'bat' ? BATTER_HISTORICAL_METRICS : PITCHER_HISTORICAL_METRICS;
  const playerById = useMemo(() => {
    const players = new Map<string, Player>();
    if (game.teams) {
      for (const team of Object.values(game.teams)) {
        for (const player of [...team.fielders, ...team.pitchers]) players.set(player.id, player);
      }
    }
    for (const player of game.retiredPlayers) if (!players.has(player.id)) players.set(player.id, player);
    return players;
  }, [game.teams, game.retiredPlayers]);
  const activePlayerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!game.teams) return ids;
    for (const team of Object.values(game.teams)) {
      for (const player of [...team.fielders, ...team.pitchers]) ids.add(player.id);
    }
    return ids;
  }, [game.teams]);
  const entries = useMemo(
    () => buildHistoricalRanking(game.yearlyStats, {
      scope,
      metric,
      teamKey: teamFilter === 'all' ? null : teamFilter,
      activePlayerIds,
      limit: 20,
    }),
    [activePlayerIds, game.yearlyStats, metric, scope, teamFilter],
  );

  return (
    <section aria-label="歴代ランキング">
      <SectionTitle>Historical Records</SectionTitle>
      <Card ariaLabel="歴代ランキング条件">
        <div style={{ display: 'grid', gap: 12 }}>
          <SegmentedControl<HistoricalRankingScope>
            ariaLabel="歴代ランキングの集計単位"
            value={scope}
            onChange={setScope}
            options={[
              { id: 'season', label: 'シーズン記録', ariaLabel: 'シーズン記録を表示' },
              { id: 'career', label: '通算記録', ariaLabel: '通算記録を表示' },
            ]}
          />
          <SegmentedControl<HistoricalRankingKind>
            ariaLabel="歴代ランキングの選手区分"
            value={kind}
            onChange={setKind}
            options={[
              { id: 'bat', label: '打者', ariaLabel: '打者の歴代記録を表示' },
              { id: 'pit', label: '投手', ariaLabel: '投手の歴代記録を表示' },
            ]}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 5, color: 'var(--color-text-muted)', fontSize: 12 }}>
              記録項目
              <select
                value={metric}
                onChange={(event) => {
                  const value = event.target.value as HistoricalRankingMetric;
                  if (kind === 'bat') setBatterMetric(value);
                  else setPitcherMetric(value);
                }}
              >
                {metrics.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: 'var(--color-text-muted)', fontSize: 12 }}>
              球団別
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value as TeamKey | 'all')}
              >
                <option value="all">全球団</option>
                {TEAM_KEYS.map((teamKey) => (
                  <option key={teamKey} value={teamKey}>{TINFO[teamKey].n}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>
            完了済みシーズンの年度台帳を集計しています。球団別の通算記録は、その球団在籍中の成績だけを合算します。
          </div>
        </div>
      </Card>

      <Card ariaLabel={`${scope === 'season' ? 'シーズン' : '通算'}歴代ランキング`}>
        {!entries.length ? (
          <EmptyState>年度別成績がまだありません。最初のシーズン終了後に記録されます。</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table" aria-label="歴代記録上位20選手">
              <thead>
                <tr>
                  <th scope="col">順</th>
                  <th scope="col" style={{ textAlign: 'left' }}>選手</th>
                  <th scope="col">記録</th>
                  <th scope="col">達成年</th>
                  <th scope="col">年齢</th>
                  <th scope="col">所属</th>
                  <th scope="col">状態</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const player = playerById.get(entry.playerId);
                  return (
                    <tr key={`${scope}:${metric}:${entry.playerId}:${entry.year}`}>
                      <td style={{ textAlign: 'center', fontWeight: 900 }}>{index + 1}</td>
                      <th scope="row" style={{ textAlign: 'left' }}>
                        {player ? (
                          <button
                            className="roster-player-button"
                            type="button"
                            onClick={() => game.selectPlayer(player)}
                            aria-label={`${entry.playerName}の詳細を表示`}
                          >
                            {entry.playerName}
                          </button>
                        ) : entry.playerName}
                        {scope === 'career' && (
                          <span style={{ marginLeft: 6, color: 'var(--color-text-faint)', fontSize: 11 }}>
                            {entry.seasons}季
                          </span>
                        )}
                      </th>
                      <td
                        className={index === 0 ? 'rank-leader-value' : undefined}
                        style={{ textAlign: 'center', fontWeight: 900 }}
                      >
                        {formatHistoricalRankingValue(metric, entry.value)}
                      </td>
                      <td style={{ textAlign: 'center' }}>{entry.year}</td>
                      <td style={{ textAlign: 'center' }}>{entry.age}歳</td>
                      <td style={{ textAlign: 'center', color: teamTextColor(TINFO[entry.teamKey].c) }}>
                        {entry.teamAbbreviation}
                      </td>
                      <td style={{ textAlign: 'center' }}>{entry.isActive ? '現役' : '引退'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
