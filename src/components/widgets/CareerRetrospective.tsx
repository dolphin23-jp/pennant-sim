import { useEffect, useMemo, useState } from 'react';

import type { Player } from '../../engine';
import { buildCareerRetrospective } from '../../narrative/careerRetrospective';
import { loadNarrativeConnection } from '../../narrative/connection';
import type { ArticleSnapshot, Quality } from '../../narrative/protocol';
import { narrativeArticleService } from '../../narrative/service';
import type { NarrativeArticle } from '../../narrative/types';
import { useGameState } from '../../state/gameState';
import { Button, Card, SectionTitle } from '../ui';

function retrospectiveAsOfDate(
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

export function CareerRetrospective({ player }: { player: Player }) {
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
  const asOfDate = retrospectiveAsOfDate(game.season.year, game.season.schedule);
  const retrospective = useMemo(
    () =>
      buildCareerRetrospective({
        player,
        seasonYear: game.season.year,
        asOfDate,
        yearlyStats: game.yearlyStats,
        awardHistory: game.awardHistory,
        achievementHistory: game.achievementHistory,
        narrativeEvents: game.narrativeEvents,
      }),
    [
      player,
      game.season.year,
      asOfDate,
      game.yearlyStats,
      game.awardHistory,
      game.achievementHistory,
      game.narrativeEvents,
    ],
  );
  const stored = useMemo(
    () =>
      retrospective ? game.narrativeArticles[String(retrospective.article.year)] ?? [] : [],
    [retrospective, game.narrativeArticles],
  );

  useEffect(() => {
    setRendered(retrospective?.article ?? null);
    setStatus('');
    setBusy(false);
    setRequest({ quality: 'standard', revision: 0, force: false });
  }, [retrospective]);

  useEffect(() => {
    if (!retrospective || !connection.enabled) return;
    let active = true;
    setBusy(true);
    const renderConnection = request.force ? connection : { ...connection, token: '' };
    void narrativeArticleService
      .render(
        retrospective.article,
        retrospective.packet,
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
              ? 'AIキャリア回顧'
              : '保存済みAIキャリア回顧'
            : result.status === 'unavailable'
              ? '標準キャリア回顧を表示中'
              : connection.token
                ? 'AIキャリア回顧を作成できます'
                : 'AI利用トークン未設定',
        );
        if (result.snapshot) {
          recordNarrativeArticle(worldId, result.snapshot);
          if (request.force) setRequest((current) => ({ ...current, force: false }));
        }
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    retrospective,
    connection,
    worldId,
    stored,
    request,
    recordNarrativeArticle,
  ]);

  if (!retrospective || !rendered) return null;

  function regenerate(quality: Quality) {
    if (!retrospective) return;
    const revisions = stored
      .filter((snapshot: ArticleSnapshot) => snapshot.articleId === retrospective.article.id)
      .map((snapshot) => snapshot.revision);
    setRequest({
      quality,
      revision: revisions.length ? Math.max(...revisions) + 1 : 0,
      force: true,
    });
  }

  return (
    <Card className="detail-card detail-card--wide" ariaLabel="キャリア回顧">
      <SectionTitle>{retrospective.retired ? 'Career Retrospective' : 'Career Story So Far'}</SectionTitle>
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
          pre-pro history → frozen draft evaluation → career facts → retrospective analysis
        </div>
        {connection.enabled && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span role="status" style={{ fontSize: 11 }}>
              {busy ? 'キャリア回顧を準備中…' : status}
            </span>
            <Button
              onClick={() => regenerate('standard')}
              disabled={busy || !connection.token}
              color="var(--color-surface-muted)"
              ariaLabel="AIキャリア回顧を標準品質で書く"
            >
              {status.includes('AIキャリア回顧') && !status.includes('作成')
                ? 'AIで書き直す'
                : 'AIキャリア回顧を作る'}
            </Button>
            <Button
              onClick={() => regenerate('premium')}
              disabled={busy || !connection.token}
              color="var(--color-surface-muted)"
              ariaLabel="AIキャリア回顧を高品質で書く"
            >
              高品質で書く
            </Button>
          </div>
        )}
        {!connection.enabled && (
          <div style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
            AI記事が無効のため、保存された事実から作った標準キャリア回顧を表示しています。
          </div>
        )}
      </div>
    </Card>
  );
}
