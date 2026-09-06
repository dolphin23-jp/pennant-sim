import { useEffect, useMemo, useState } from 'react';

import { TINFO } from '../../data';
import type { Player, TeamKey } from '../../engine';
import { loadNarrativeConnection } from '../../narrative/connection';
import { buildPlayerNarrativeProfile } from '../../narrative/playerProfile';
import { narrativeArticleService } from '../../narrative/service';
import type { ArticleSnapshot, Quality } from '../../narrative/protocol';
import type { NarrativeArticle } from '../../narrative/types';
import { useGameState } from '../../state/gameState';
import { Button, Card, EmptyState, SectionTitle } from '../ui';

function profileAsOfDate(
  year: number,
  schedule: Array<{ date: string; played: boolean }>,
): string {
  const valid = schedule
    .map((game) => game.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const played = schedule
    .filter((game) => game.played && /^\d{4}-\d{2}-\d{2}$/.test(game.date))
    .map((game) => game.date)
    .sort();
  return played.at(-1) ?? valid[0] ?? `${year}-01-01`;
}

function activeTeamKey(player: Player): TeamKey | null {
  const key = String(player.tk);
  return Object.prototype.hasOwnProperty.call(TINFO, key) ? (key as TeamKey) : null;
}

export function PlayerNarrativeProfile({ player }: { player: Player }) {
  const game = useGameState();
  const [connection] = useState(loadNarrativeConnection);
  const [request, setRequest] = useState<{ quality: Quality; revision: number; force: boolean }>({
    quality: 'standard',
    revision: 0,
    force: false,
  });
  const [rendered, setRendered] = useState<NarrativeArticle | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const worldId = game.worldId;
  const recordNarrativeArticle = game.recordNarrativeArticle;
  const teamKey = activeTeamKey(player);
  const asOfDate = profileAsOfDate(game.season.year, game.season.schedule);

  const profile = useMemo(
    () =>
      teamKey
        ? buildPlayerNarrativeProfile({
            player,
            teamKey,
            seasonYear: game.season.year,
            asOfDate,
            yearlyStats: game.yearlyStats,
            championHistory: game.championHistory,
          })
        : null,
    [player, teamKey, game.season.year, asOfDate, game.yearlyStats, game.championHistory],
  );

  const stored = useMemo(
    () => (profile ? game.narrativeArticles[String(profile.article.year)] ?? [] : []),
    [profile, game.narrativeArticles],
  );

  useEffect(() => {
    setRendered(profile?.article ?? null);
    setStatus('');
    setBusy(false);
    setRequest({ quality: 'standard', revision: 0, force: false });
  }, [profile]);

  useEffect(() => {
    if (!profile || !connection.enabled || profile.packet.story.depth === 'brief') return;
    let active = true;
    setBusy(true);
    const renderConnection = request.force ? connection : { ...connection, token: '' };
    void narrativeArticleService
      .render(
        profile.article,
        profile.packet,
        worldId,
        stored,
        renderConnection,
        request.quality,
        request.revision,
        request.force,
      )
      .then((result) => {
        if (!active) return;
        setRendered(result.article);
        setStatus(
          result.snapshot
            ? result.status === 'generated'
              ? 'AI選手名鑑'
              : '保存済みAI選手名鑑'
            : result.status === 'unavailable'
              ? '標準名鑑を表示中'
              : connection.token
                ? 'AI選手名鑑を作成できます'
                : 'AI利用トークン未設定',
        );
        if (result.snapshot) recordNarrativeArticle(worldId, result.snapshot);
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [profile, connection, worldId, stored, request, recordNarrativeArticle]);

  if (!profile || !rendered) {
    return <EmptyState>この選手の名鑑プロフィールは現在作成できません。</EmptyState>;
  }

  function regenerate(quality: Quality) {
    const revisions = stored
      .filter((snapshot: ArticleSnapshot) => snapshot.articleId === profile.article.id)
      .map((snapshot) => snapshot.revision);
    const revision = revisions.length ? Math.max(...revisions) + 1 : 0;
    setRequest({ quality, revision, force: true });
  }

  return (
    <Card className="detail-card detail-card--wide" ariaLabel="選手Narrative Profile">
      <SectionTitle>Narrative Profile</SectionTitle>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
          {rendered.publishedAt} / as of {rendered.asOfDate}
        </div>
        <h2 style={{ margin: 0, fontSize: 18 }}>{rendered.headline}</h2>
        {rendered.dek && (
          <div style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>{rendered.dek}</div>
        )}
        <div style={{ display: 'grid', gap: 7, fontSize: 13, lineHeight: 1.8 }}>
          {rendered.segments.map((segment, index) => (
            <p
              key={`${rendered.id}:${index}`}
              style={{
                margin: 0,
                color:
                  segment.class === 'FACTUAL'
                    ? 'var(--color-text)'
                    : 'var(--color-text-muted)',
                borderLeft:
                  segment.class === 'ANALYTICAL' ? '2px solid var(--color-border)' : undefined,
                paddingLeft: segment.class === 'ANALYTICAL' ? 9 : undefined,
                fontStyle: segment.class === 'COLOR' ? 'italic' : undefined,
              }}
            >
              {segment.text}
            </p>
          ))}
        </div>
        <div style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>
          {profile.archetype} / canonical facts → editorial projection → narrative
        </div>
        {connection.enabled && profile.packet.story.depth !== 'brief' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span role="status" style={{ fontSize: 11 }}>
              {busy ? '名鑑を準備中…' : status}
            </span>
            <Button
              onClick={() => regenerate('standard')}
              disabled={busy || !connection.token}
              color="var(--color-surface-muted)"
              ariaLabel="AI選手名鑑を標準品質で書き直す"
            >
              AIで書き直す
            </Button>
            <Button
              onClick={() => regenerate('premium')}
              disabled={busy || !connection.token}
              color="var(--color-surface-muted)"
              ariaLabel="AI選手名鑑を高品質で書く"
            >
              高品質で書く
            </Button>
          </div>
        )}
        {!connection.enabled && (
          <div style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
            AI記事が無効のため、canonical factsから作った標準名鑑を表示しています。
          </div>
        )}
      </div>
    </Card>
  );
}
