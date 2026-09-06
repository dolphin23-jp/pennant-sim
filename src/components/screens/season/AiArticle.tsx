import { useEffect, useRef, useState } from 'react';
import type { NarrativeArticle } from '../../../narrative/types';
import type { NarrativeSource } from '../../../narrative/generate';
import { buildFactPacket } from '../../../narrative/packet';
import type { NarrativeMemoryIndex } from '../../../narrative/memory';
import { planNarrativeStory } from '../../../narrative/story';
import type { ArticleSnapshot, Quality } from '../../../narrative/protocol';
import { narrativeArticleService, type NarrativeConnection } from '../../../narrative/service';
import { useGameState } from '../../../state/gameState';

/**
 * Only consequential non-game stories auto-enqueue when they enter the viewport. Game recaps and
 * routine notices stay deterministic; AI is reserved for feature journalism with historical context.
 */
export function AiArticle({
  template,
  source,
  memory,
  connection,
  children,
}: {
  template: NarrativeArticle;
  source: NarrativeSource;
  memory: NarrativeMemoryIndex;
  connection: NarrativeConnection;
  children(article: NarrativeArticle): React.ReactNode;
}) {
  const game = useGameState();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(template);
  const [status, setStatus] = useState('');
  const [request, setRequest] = useState<{ quality: Quality; revision: number; force: boolean }>({
    quality: 'standard',
    revision: 0,
    force: false,
  });
  const [busy, setBusy] = useState(false);
  const stored = game.narrativeArticles[String(template.year)] ?? [];
  const input = useRef({ source, memory, stored, record: game.recordNarrativeArticle });
  input.current = { source, memory, stored, record: game.recordNarrativeArticle };

  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const storyPlan = planNarrativeStory(template, source, memory);
  const aiEligible = template.kind !== 'gameRecap';

  useEffect(() => {
    if (!aiEligible || !visible || !connection.enabled) {
      setRendered(template);
      setStatus('');
      setBusy(false);
      return;
    }

    const currentPlan = planNarrativeStory(template, input.current.source, input.current.memory);
    if (!currentPlan.autoGenerate && !request.force) {
      setRendered(template);
      setStatus('速報・AI未使用');
      setBusy(false);
      return;
    }

    let active = true;
    const packet = buildFactPacket(
      template,
      input.current.source,
      request.force && currentPlan.depth === 'brief' ? 'feature' : undefined,
      input.current.memory,
    );
    if (!packet) return;
    setBusy(true);
    void narrativeArticleService
      .render(
        template,
        packet,
        game.worldId,
        input.current.stored,
        connection,
        request.quality,
        request.revision,
        request.force,
      )
      .then((result) => {
        if (!active) return;
        setRendered(result.article);
        setStatus(
          result.snapshot
            ? packet.story.depth === 'cover'
              ? 'AIカバーストーリー'
              : 'AI特集'
            : result.status === 'unavailable'
              ? '標準記事を表示中'
              : '',
        );
        if (result.snapshot) input.current.record(game.worldId, result.snapshot);
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [aiEligible, visible, connection, template, memory, game.worldId, request]);

  function regenerate(quality: Quality) {
    const max = Math.max(
      request.revision,
      ...stored.filter((s: ArticleSnapshot) => s.articleId === template.id).map((s) => s.revision),
      0,
    );
    setRequest({ quality, revision: max + 1, force: true });
  }

  return (
    <div ref={ref}>
      {children(connection.enabled && aiEligible ? rendered : template)}
      {connection.enabled && aiEligible && (
        <div style={{ display: 'flex', gap: 10, fontSize: 11, marginTop: 5, flexWrap: 'wrap' }}>
          <span role="status">{busy ? '記事を準備中…' : status}</span>
          <button disabled={busy || !connection.token} onClick={() => regenerate('standard')}>
            {storyPlan.autoGenerate ? '特集を書き直す' : 'AI特集を作る'}
          </button>
          <button disabled={busy || !connection.token} onClick={() => regenerate('premium')}>
            高品質で書く
          </button>
        </div>
      )}
    </div>
  );
}
