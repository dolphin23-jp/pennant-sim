import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { TINFO } from '../../data';
import type { ScheduleGame, TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { useBusyAction } from '../useBusyAction';
import { Button } from '../ui';

type Outcome = 'win' | 'loss' | 'tie';

function outcomeOf(game: ScheduleGame, team: TeamKey): Outcome {
  const own = (game.homeKey === team ? game.hs : game.as) ?? 0;
  const other = (game.homeKey === team ? game.as : game.hs) ?? 0;
  return own > other ? 'win' : own < other ? 'loss' : 'tie';
}

interface Flash {
  key: number;
  tone: Outcome;
  headline: string;
  detail: string;
  gameId: string | null;
}

/** What just happened, from the user's games that became played since the last render. */
function describe(
  played: ScheduleGame[],
  team: TeamKey,
  rank: number | undefined,
): Omit<Flash, 'key'> {
  const rankText = rank ? `現在${rank}位` : '';
  if (played.length === 1) {
    const game = played[0]!;
    const tone = outcomeOf(game, team);
    const home = game.homeKey === team;
    const opponent = TINFO[home ? game.awayKey : game.homeKey];
    const own = home ? game.hs : game.as;
    const other = home ? game.as : game.hs;
    return {
      tone,
      headline: `${tone === 'win' ? '勝利' : tone === 'loss' ? '敗戦' : '引き分け'} ${own}-${other}`,
      detail: `${opponent.ab}戦 ・ ${rankText}`,
      gameId: game.id,
    };
  }
  const tally = { win: 0, loss: 0, tie: 0 };
  for (const game of played) tally[outcomeOf(game, team)] += 1;
  const tone: Outcome = tally.win > tally.loss ? 'win' : tally.win < tally.loss ? 'loss' : 'tie';
  return {
    tone,
    headline: `${played.length}試合 ${tally.win}勝${tally.loss}敗${tally.tie ? `${tally.tie}分` : ''}`,
    detail: `${played[0]!.date.slice(5).replace('-', '/')}〜${played.at(-1)!.date.slice(5).replace('-', '/')} ・ ${rankText}`,
    gameId: null,
  };
}

/**
 * Next game, week, month and the rest of the season, reachable from every tab: the bar
 * sticks to the bottom of the screen. After each advance a short result flash says how it
 * went, the way a scoreboard lights up after the last out.
 */
export function GameControlBar() {
  const game = useGameState();
  const { busy: actionBusy, run } = useBusyAction();
  const busy = actionBusy || game.advanceProgress !== null;
  const [flash, setFlash] = useState<Flash | null>(null);
  const seen = useRef<{ year: number; ids: Set<string> } | null>(null);
  const team = game.playerTeam;

  // Compare the user's played games with the last render to find what an advance just
  // played. A new season or a year-by-year auto advance resets the baseline silently.
  useEffect(() => {
    if (!team) return;
    const own = game.season.schedule.filter(
      (scheduled) => scheduled.played && (scheduled.homeKey === team || scheduled.awayKey === team),
    );
    const ids = new Set(own.map((scheduled) => scheduled.id));
    const previous = seen.current;
    seen.current = { year: game.season.year, ids };
    if (!previous || previous.year !== game.season.year || game.advanceProgress) return;
    const fresh = own
      .filter((scheduled) => !previous.ids.has(scheduled.id))
      .sort((first, second) => first.date.localeCompare(second.date));
    if (!fresh.length) return;
    setFlash({
      key: Date.now(),
      ...describe(fresh, team, game.standings[team]?.rank),
    });
  }, [game.season.schedule, game.season.year, game.advanceProgress, game.standings, team]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  if (!team || !game.teams) return null;
  const nextGame = game.season.schedule.find(
    (scheduled) => !scheduled.played && (scheduled.homeKey === team || scheduled.awayKey === team),
  );
  const teamColor = TINFO[team].c;

  return (
    <div className="game-bar" style={{ '--game-bar-color': teamColor } as CSSProperties}>
      {flash && (
        <div
          key={flash.key}
          className={`game-flash game-flash--${flash.tone}`}
          role="status"
          aria-live="polite"
        >
          <span className="game-flash__lamp" aria-hidden="true" />
          <span className="game-flash__headline">{flash.headline}</span>
          <span className="game-flash__detail">{flash.detail}</span>
          {flash.gameId && (
            <button
              type="button"
              className="game-flash__link"
              onClick={() => game.selectGame(flash.gameId)}
            >
              試合を見る
            </button>
          )}
          <button
            type="button"
            className="game-flash__close"
            aria-label="結果の表示を閉じる"
            onClick={() => setFlash(null)}
          >
            ×
          </button>
        </div>
      )}
      <nav className="game-bar__inner" aria-label="試合進行">
        {nextGame ? (
          <>
            <div className="game-bar__next">
              <span className="game-bar__label">次の試合</span>
              <span className="game-bar__matchup">
                {nextGame.date.slice(5).replace('-', '/')}{' '}
                {nextGame.homeKey === team
                  ? `vs ${TINFO[nextGame.awayKey].ab}`
                  : `@ ${TINFO[nextGame.homeKey].ab}`}
              </span>
            </div>
            <div className="game-bar__actions">
              <Button
                onClick={() => run(game.simulateNextGame)}
                disabled={busy}
                color={teamColor}
                ariaLabel="次の試合を実行"
                className="game-bar__primary"
              >
                次の試合
              </Button>
              <Button
                onClick={() => run(() => game.skip('week'))}
                disabled={busy}
                color="var(--color-surface-muted)"
                ariaLabel="1週間分の試合をスキップ"
              >
                1週
              </Button>
              <Button
                onClick={() => run(() => game.skip('month'))}
                disabled={busy}
                color="var(--color-surface-muted)"
                ariaLabel="1か月分の試合をスキップ"
              >
                1か月
              </Button>
              <Button
                onClick={() => run(() => game.skip('season'))}
                disabled={busy}
                color="var(--color-surface-muted)"
                ariaLabel="レギュラーシーズンの残り全試合を実行"
              >
                全試合
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="game-bar__next">
              <span className="game-bar__label">レギュラーシーズン終了</span>
            </div>
            <div className="game-bar__actions">
              <Button
                onClick={() => game.setScreen('postseason')}
                disabled={busy}
                color={teamColor}
                ariaLabel="ポストシーズン画面へ移動"
                className="game-bar__primary"
              >
                ポストシーズンへ
              </Button>
            </div>
          </>
        )}
        {busy && (
          <span className="game-bar__busy" role="status" aria-live="polite">
            {game.advanceProgress ? 'おまかせ進行中…' : '試合中…'}
          </span>
        )}
      </nav>
    </div>
  );
}
