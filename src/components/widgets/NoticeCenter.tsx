import type { Player, Teams } from '../../engine';
import { IconBaseball, IconBolt, IconMegaphone, IconSparkle } from '../icons';
import type { Notice } from '../../state/storage';
import { Button, Card, EmptyState, SectionTitle } from '../ui';

const KIND_ICONS: Record<NonNullable<Notice['kind']>, typeof IconSparkle> = {
  system: IconMegaphone,
  awakening: IconBolt,
  growth: IconSparkle,
  game: IconBaseball,
};

function noticePlayer(notice: Notice, teams: Teams): Player | null {
  if (!notice.playerId) return null;
  const team = notice.teamKey ? teams[notice.teamKey] : null;
  const scoped = team ? [...team.pitchers, ...team.fielders] : [];
  const scopedMatch = scoped.find((player) => player.id === notice.playerId);
  if (scopedMatch) return scopedMatch;
  for (const candidateTeam of Object.values(teams)) {
    const player = [...candidateTeam.pitchers, ...candidateTeam.fielders].find(
      (candidate) => candidate.id === notice.playerId,
    );
    if (player) return player;
  }
  return null;
}

function toneColor(notice: Notice): string {
  if (notice.tone === 'good') return 'var(--color-success)';
  if (notice.tone === 'warn') return 'var(--color-warning)';
  return 'var(--color-accent)';
}

function kindLabel(notice: Notice): string {
  if (notice.kind === 'awakening') return '覚醒';
  if (notice.kind === 'growth') return '成長';
  if (notice.kind === 'game') return '試合結果';
  return 'チーム情報';
}

export function NoticeCenter({
  notices,
  teams,
  onSelectPlayer,
  onSelectGame,
  onDismiss,
  onClear,
}: {
  notices: Notice[];
  teams: Teams;
  onSelectPlayer(player: Player): void;
  onSelectGame?(gameId: string): void;
  onDismiss(noticeId: string): void;
  onClear(): void;
}) {
  return (
    <Card ariaLabel="チーム通知センター">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <SectionTitle>Team News</SectionTitle>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            覚醒やオフシーズンの大きな能力変動を記録します。
          </div>
        </div>
        {notices.length > 0 && (
          <Button
            onClick={onClear}
            color="var(--color-surface-muted)"
            ariaLabel="すべての通知を削除"
          >
            すべて削除
          </Button>
        )}
      </div>

      {!notices.length ? (
        <EmptyState>新しいチーム情報はありません。</EmptyState>
      ) : (
        <div
          role="log"
          aria-live="polite"
          aria-label="新着チーム情報"
          style={{ display: 'grid', gap: 8 }}
        >
          {notices.slice(0, 20).map((notice) => {
            const player = noticePlayer(notice, teams);
            const color = toneColor(notice);
            const KindIcon = KIND_ICONS[notice.kind ?? 'system'];
            return (
              <article
                key={notice.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) auto',
                  gap: 10,
                  padding: '10px 11px',
                  border: '1px solid var(--color-border)',
                  borderLeft: `4px solid ${color}`,
                  borderRadius: 10,
                  background: `color-mix(in srgb, ${color} 7%, var(--color-surface-raised))`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 999,
                        color,
                        background: `color-mix(in srgb, ${color} 14%, transparent)`,
                        fontSize: 9,
                        fontWeight: 900,
                      }}
                    >
                      <KindIcon size={10} />
                      {kindLabel(notice)}
                    </span>
                    {player ? (
                      <button
                        type="button"
                        className="roster-player-button"
                        aria-label={`${notice.title}。${player.name}の詳細を表示`}
                        onClick={() => onSelectPlayer(player)}
                      >
                        {notice.title}
                      </button>
                    ) : (
                      <strong>{notice.title}</strong>
                    )}
                    {notice.date && (
                      <span style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>
                        {notice.date}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      color: 'var(--color-text-muted)',
                      fontSize: 11,
                      lineHeight: 1.6,
                    }}
                  >
                    {notice.body}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 6,
                  }}
                >
                  {notice.gameId && onSelectGame && (
                    <button
                      type="button"
                      className="roster-player-button"
                      aria-label={`${notice.title}の試合詳細を表示`}
                      onClick={() => onSelectGame(notice.gameId!)}
                      style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                    >
                      試合を見る
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`${notice.title}の通知を削除`}
                    onClick={() => onDismiss(notice.id)}
                    style={{
                      alignSelf: 'flex-end',
                      minWidth: 32,
                      minHeight: 32,
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      color: 'var(--color-text-faint)',
                      background: 'var(--color-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
