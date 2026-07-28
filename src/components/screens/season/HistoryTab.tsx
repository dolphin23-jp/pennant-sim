import { useState } from 'react';

import { TINFO } from '../../../data';
import type { AchievementEvent } from '../../../engine';
import { useGameState } from '../../../state/gameState';
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
    <Card ariaLabel={`${record.year}年 優勝 ${champion.n}`} style={{ borderLeft: `4px solid ${champion.c}` }}>
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
            <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 3, fontSize: 12 }}>
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

export function HistoryTab() {
  const game = useGameState();
  const champions = [...game.championHistory].sort((first, second) => second.year - first.year);
  const achievements = [...game.achievementHistory].reverse().slice(0, 200);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section aria-label="優勝球団の歴史">
        <SectionTitle>優勝球団の歴史</SectionTitle>
        {champions.length === 0 ? (
          <EmptyState>まだ優勝球団の記録がありません。日本シリーズを制覇すると記録されます。</EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {champions.map((record) => (
              <ChampionCard key={record.year} record={record} />
            ))}
          </div>
        )}
      </section>
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
    </div>
  );
}
