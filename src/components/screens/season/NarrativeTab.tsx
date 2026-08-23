import { useMemo, useState } from 'react';

import { TINFO } from '../../../data';
import {
  buildNarrativeFeed,
  type NarrativeArticle,
  type NarrativeArticleKind,
} from '../../../narrative';
import { useGameState } from '../../../state/gameState';
import { Button, Card, EmptyState, SectionTitle, teamTextColor } from '../../ui';

const KIND_LABEL: Record<NarrativeArticleKind, string> = {
  gameRecap: '試合',
  achievement: '記録',
  championship: '日本一',
  seasonAwards: '表彰',
  seasonReview: '総括',
  transaction: '移籍',
  draft: 'ドラフト',
  career: 'キャリア',
  injury: '故障',
  development: '成長',
};

type FeedCategory = 'all' | 'games' | 'records' | 'history';

const CATEGORY_KINDS: Record<Exclude<FeedCategory, 'all'>, NarrativeArticleKind[]> = {
  games: ['gameRecap'],
  records: ['achievement', 'seasonAwards'],
  history: ['championship', 'seasonReview', 'transaction', 'draft', 'career', 'injury', 'development'],
};

function ArticleCard({ article }: { article: NarrativeArticle }) {
  const primaryTeam = article.teamKeys[0] ? TINFO[article.teamKeys[0]] : null;
  return (
    <Card
      ariaLabel={`${article.publishedAt} ${article.headline}`}
      style={{
        borderLeft: primaryTeam ? `4px solid ${primaryTeam.c}` : undefined,
        display: 'grid',
        gap: 7,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '.04em',
              color: 'var(--color-accent)',
              background: 'var(--color-accent-soft)',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              padding: '2px 7px',
            }}
          >
            {KIND_LABEL[article.kind]}
          </span>
          {article.teamKeys.slice(0, 2).map((teamKey) => (
            <span key={teamKey} style={{ color: teamTextColor(TINFO[teamKey].c), fontSize: 11, fontWeight: 800 }}>
              {TINFO[teamKey].ab}
            </span>
          ))}
        </div>
        <time style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>{article.publishedAt}</time>
      </div>

      <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>{article.headline}</h3>
      {article.dek && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 700 }}>
          {article.dek}
        </div>
      )}
      <div style={{ display: 'grid', gap: 5, fontSize: 13, lineHeight: 1.7 }}>
        {article.segments.map((segment, index) => (
          <p
            key={`${article.id}:${index}`}
            style={{
              margin: 0,
              color:
                segment.class === 'COLOR' ? 'var(--color-text-muted)' : 'var(--color-text)',
              fontStyle: segment.class === 'COLOR' ? 'italic' : undefined,
            }}
          >
            {segment.text}
          </p>
        ))}
      </div>
      <div style={{ color: 'var(--color-text-faint)', fontSize: 10 }}>
        archive v{article.generatorVersion} / as of {article.asOfDate}
      </div>
    </Card>
  );
}

export function NarrativeTab() {
  const game = useGameState();
  const [category, setCategory] = useState<FeedCategory>('all');
  const [myTeamOnly, setMyTeamOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);

  const filterKinds = category === 'all' ? undefined : CATEGORY_KINDS[category];
  const feed = useMemo(
    () =>
      buildNarrativeFeed(
        {
          gameBoxScores: game.gameBoxScores,
          achievementHistory: game.achievementHistory,
          championHistory: game.championHistory,
          awardHistory: game.awardHistory,
        },
        {
          kinds: filterKinds,
          teamKey: myTeamOnly ? (game.playerTeam ?? undefined) : undefined,
          limit: visibleCount,
        },
      ),
    [
      filterKinds,
      game.achievementHistory,
      game.awardHistory,
      game.championHistory,
      game.gameBoxScores,
      game.playerTeam,
      myTeamOnly,
      visibleCount,
    ],
  );

  const setCategoryAndReset = (next: FeedCategory) => {
    setCategory(next);
    setVisibleCount(40);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <SectionTitle>ニュース / アーカイブ</SectionTitle>
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.6 }}>
          試合・記録・優勝・表彰の確定データから生成された記事です。同じ出来事は同じ記事IDで参照され、過去の記事はその時点の事実だけを使います。
        </div>
      </div>

      <div
        aria-label="ニュース絞り込み"
        style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}
      >
        {(
          [
            ['all', 'すべて'],
            ['games', '試合'],
            ['records', '記録・表彰'],
            ['history', '球界史'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            onClick={() => setCategoryAndReset(id)}
            color={category === id ? 'var(--color-accent-soft)' : 'var(--color-surface-muted)'}
            ariaLabel={`${label}の記事を表示`}
          >
            {label}
          </Button>
        ))}
        <Button
          onClick={() => {
            setMyTeamOnly((current) => !current);
            setVisibleCount(40);
          }}
          color={myTeamOnly ? 'var(--color-accent-soft)' : 'var(--color-surface-muted)'}
          ariaLabel={myTeamOnly ? '全球団の記事を表示' : '自球団の記事だけを表示'}
        >
          {myTeamOnly ? '自球団のみ ✓' : '自球団のみ'}
        </Button>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
          {feed.total}件
        </span>
      </div>

      {feed.articles.length === 0 ? (
        <EmptyState>条件に一致する記事はまだありません。シーズンを進めると記事が蓄積されます。</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {feed.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {feed.articles.length < feed.total && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            onClick={() => setVisibleCount((current) => current + 40)}
            color="var(--color-surface-muted)"
            ariaLabel="さらに40件の記事を表示"
          >
            さらに読む
          </Button>
        </div>
      )}
    </div>
  );
}
