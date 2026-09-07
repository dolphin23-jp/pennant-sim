import { useEffect, useMemo, useState } from 'react';

import type { Player } from '../../engine';
import { loadNarrativeConnection } from '../../narrative/connection';
import { buildDraftNarrativeProfile } from '../../narrative/draftProfile';
import type { ArticleSnapshot, Quality } from '../../narrative/protocol';
import { narrativeArticleService } from '../../narrative/service';
import type { NarrativeArticle } from '../../narrative/types';
import { useGameState } from '../../state/gameState';
import { Button, EmptyState, SectionTitle } from '../ui';

export function DraftNarrativeProfile({
  player,
  prospects,
  year,
}: {
  player: Player;
  prospects: readonly Player[];
  year: number;
}) {
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

  const profile = useMemo(
    () =>
      buildDraftNarrativeProfile({
        player,
        prospects,
        year,
        asOfDate: `${year}-11-01`,
      }),
    [player, prospects, year],
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
    if (!profile || !connection.enabled) return;
    let active = true;
    setBusy(true);
    const renderConnection = request.force ? connection : { ...connection, token: '' };
    void narrativeArticleService
      .render(
        profile.article,
        profile.packet,
        game.worldId,
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
              ? 'AI候補名鑑'
              : '保存済みAI候補名鑑'
            : result.status === 'unavailable'
              ? '標準候補名鑑を表示中'
              : connection.token
                ? 'AI候補名鑑を作成できます'
                : 'AI利用トークン未設定',
        );
        if (result.snapshot) {
          game.recordNarrativeArticle(game.worldId, result.snapshot);
          if (request.force) setRequest((current) => ({ ...current, force: false }));
        }
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [profile, connection, game, stored, request]);

  if (!profile || !rendered) {
    return <EmptyState>この候補のNarrative Profileは現在作成できません。</EmptyState>;
  }

  function regenerate(quality: Quality) {
    const revisions = stored
      .filter((snapshot: ArticleSnapshot) => snapshot.articleId === profile.article.id)
      .map((snapshot) => snapshot.revision);
    setRequest({
      quality,
      revision: revisions.length ? Math.max(...revisions) + 1 : 0,
      force: true,
    });
  }

  return (
    <div
      role="region"
      aria-label="ドラフト候補Narrative Profile"
      style={{
        borderTop: '1px solid var(--color-border)',
        marginTop: 12,
        paddingTop: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <SectionTitle>候補Narrative Profile</SectionTitle>
      <div style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
        {rendered.publishedAt} / as of {rendered.asOfDate}
      </div>
      <h3 style={{ margin: 0, fontSize: 16 }}>{rendered.headline}</h3>
      {rendered.dek && (
        <div style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>{rendered.dek}</div>
      )}
      <div style={{ display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.75 }}>
        {rendered.segments.map((segment, index) => (
          <p
            key={`${rendered.id}:${index}`}
            style={{
              margin: 0,
              color:
                segment.class === 'FACTUAL' ? 'var(--color-text)' : 'var(--color-text-muted)',
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
        canonical pre-pro facts → draft-pool analysis → narrative
      </div>
      {connection.enabled && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span role="status" style={{ fontSize: 11 }}>
            {busy ? '候補名鑑を準備中…' : status}
          </span>
          <Button
            onClick={() => regenerate('standard')}
            disabled={busy || !connection.token}
            color="var(--color-surface-muted)"
            ariaLabel="AI候補名鑑を標準品質で書く"
          >
            {status.includes('AI候補名鑑') && !status.includes('作成')
              ? 'AIで書き直す'
              : 'AI候補名鑑を作る'}
          </Button>
          <Button
            onClick={() => regenerate('premium')}
            disabled={busy || !connection.token}
            color="var(--color-surface-muted)"
            ariaLabel="AI候補名鑑を高品質で書く"
          >
            高品質で書く
          </Button>
        </div>
      )}
      {!connection.enabled && (
        <div style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
          AI記事が無効のため、canonical factsから作った標準候補名鑑を表示しています。
        </div>
      )}
    </div>
  );
}
