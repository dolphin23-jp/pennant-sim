import { useMemo } from 'react';

import { TINFO } from '../../../data';
import { bestLineup } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, SectionTitle } from '../../ui';
import { BoxScore } from '../../widgets/BoxScore';
import { NoticeCenter } from '../../widgets/NoticeCenter';

export function DashboardTab() {
  const game = useGameState();
  const nextGame = useMemo(
    () =>
      game.season.schedule.find(
        (candidate) =>
          !candidate.played &&
          (candidate.homeKey === game.playerTeam || candidate.awayKey === game.playerTeam),
      ) ?? null,
    [game.season.schedule, game.playerTeam],
  );

  if (!game.teams || !game.playerTeam) return null;
  const playerTeam = game.teams[game.playerTeam];

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Card ariaLabel="次の試合">
          <SectionTitle>Next Game</SectionTitle>
          {nextGame ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 5 }}>
                {TINFO[nextGame.awayKey].ab} @ {TINFO[nextGame.homeKey].ab}
              </div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 4 }}>
                {nextGame.date}
                {nextGame.doubleHeaderGame
                  ? ` / ダブルヘッダー第${nextGame.doubleHeaderGame}試合`
                  : ''}
              </div>
              {nextGame.postponedFrom && (
                <div style={{ color: 'var(--color-warning)', fontSize: 12, marginBottom: 12 }}>
                  雨天順延（当初 {nextGame.postponedFrom}）
                </div>
              )}
              {!nextGame.postponedFrom && <div style={{ marginBottom: 12 }} />}
              <nav aria-label="試合進行" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  onClick={game.simulateNextGame}
                  color={playerTeam.c}
                  ariaLabel="次の試合を実行"
                >
                  次戦を実行
                </Button>
                <Button
                  onClick={() => game.skip('week')}
                  color="var(--color-surface-muted)"
                  ariaLabel="1週間分の試合をスキップ"
                >
                  1週スキップ
                </Button>
                <Button
                  onClick={() => game.skip('month')}
                  color="var(--color-surface-muted)"
                  ariaLabel="1か月分の試合をスキップ"
                >
                  1ヶ月スキップ
                </Button>
                <Button
                  onClick={() => game.skip('season')}
                  color="var(--color-growth)"
                  ariaLabel="レギュラーシーズンの残り全試合を実行"
                >
                  残り全試合
                </Button>
              </nav>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
                レギュラーシーズン終了
              </div>
              <Button
                onClick={() => game.setScreen('postseason')}
                color={playerTeam.c}
                ariaLabel="ポストシーズン画面へ移動"
              >
                ポストシーズンへ
              </Button>
            </>
          )}
        </Card>
        <Card ariaLabel="現在の先発オーダー">
          <SectionTitle>Lineup</SectionTitle>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 8 }}>
            現在の先発野手 {game.lineup.length}名
          </div>
          <div
            role="group"
            aria-label="先発オーダーの選手詳細ボタン"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}
          >
            {game.lineup.map((player, index) => (
              <button
                type="button"
                key={player.id}
                onClick={() => game.selectPlayer(player)}
                aria-label={`打順${index + 1}番 ${player.name}の詳細を表示`}
                style={{
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 999,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 10,
                }}
              >
                {index + 1}. {player.name}
              </button>
            ))}
          </div>
          <Button
            onClick={() => game.setLineup(bestLineup(playerTeam))}
            color="var(--color-surface-muted)"
            ariaLabel="AIで最適なオーダーを自動編成"
          >
            AIで最適オーダー
          </Button>
        </Card>
      </div>

      {game.lastGame && (
        <div style={{ marginBottom: 12 }}>
          <BoxScore game={game.lastGame} />
        </div>
      )}

      <NoticeCenter
        notices={game.notices}
        teams={game.teams}
        onSelectPlayer={game.selectPlayer}
        onDismiss={game.dismissNotice}
        onClear={game.clearNotices}
      />
    </>
  );
}
