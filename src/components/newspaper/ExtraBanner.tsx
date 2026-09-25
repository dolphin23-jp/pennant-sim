import { useMemo, useState } from 'react';

import { buildNarrativeFeed } from '../../narrative/generate';
import { useGameState } from '../../state/gameState';
import { useOpenNewspaper } from './newspaperContext';

const SEEN_KEY = 'pennant-sim:seenExtras';

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function markSeen(seen: Set<string>, id: string): Set<string> {
  const next = new Set(seen).add(id);
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-60)));
  } catch {
    // Storage can be unavailable (private windows); the banner then shows again next load.
  }
  return next;
}

/** 号外 for the user's club this year: a pennant or a Japan Series title, until opened
 * or dismissed. */
export function ExtraBanner() {
  const game = useGameState();
  const openNewspaper = useOpenNewspaper();
  const [seen, setSeen] = useState(readSeen);
  const article = useMemo(() => {
    if (!game.playerTeam) return null;
    const feed = buildNarrativeFeed(
      {
        gameBoxScores: {},
        achievementHistory: [],
        championHistory: game.championHistory,
        awardHistory: [],
        narrativeEvents: game.narrativeEvents,
      },
      {
        kinds: ['championship', 'pennantClinch'],
        teamKey: game.playerTeam,
        year: game.season.year,
        limit: 1,
      },
    );
    return feed.articles[0] ?? null;
  }, [game.championHistory, game.narrativeEvents, game.playerTeam, game.season.year]);

  if (!article || seen.has(`${game.worldId}:${article.id}`)) return null;
  const key = `${game.worldId}:${article.id}`;
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        type="button"
        className="extra-banner"
        onClick={() => {
          setSeen((current) => markSeen(current, key));
          openNewspaper(article);
        }}
      >
        <span className="extra-banner__stamp">号外</span>
        <span className="extra-banner__headline">{article.headline}</span>
        <span aria-hidden="true">紙面を開く ›</span>
      </button>
      <button
        type="button"
        className="extra-banner__close"
        aria-label="号外の案内を閉じる"
        onClick={() => setSeen((current) => markSeen(current, key))}
      >
        ×
      </button>
    </div>
  );
}
