import { useMemo } from 'react';

import { TINFO } from '../../../data';
import { bestLineup, deriveTeamForm } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Button, Card, LampFigure, SectionTitle } from '../../ui';
import { BoxScore } from '../../widgets/BoxScore';
import { NoticeCenter } from '../../widgets/NoticeCenter';

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      style={{
        minWidth: 76,
        padding: '6px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-surface-raised)',
        textAlign: 'center',
      }}
    >
      <div style={{ color: 'var(--color-text-faint)', fontSize: 10, fontWeight: 700 }}>{label}</div>
      <div
        style={{
          marginTop: 2,
          color: tone ?? 'var(--color-text)',
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );
}

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
  const record = game.standings[game.playerTeam];
  const form = deriveTeamForm(game.season.schedule, game.playerTeam);
  const pctText = record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '');
  const streakTone = form.streak.includes('連勝')
    ? 'var(--color-success)'
    : form.streak.includes('連敗')
      ? 'var(--color-danger)'
      : undefined;

  return (
    <>
      <Card ariaLabel="順位状況" style={{ marginBottom: 12 }}>
        <SectionTitle>Standings Snapshot</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <LampFigure
            label={TINFO[game.playerTeam].ab}
            value={record.rank ? `${record.rank}位` : '-'}
            elite={Boolean(record.rank && record.rank <= 3)}
            ariaLabel={`${playerTeam.n} 現在${record.rank ?? '-'}位`}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatChip label="勝敗分" value={`${record.w}-${record.l}-${record.d}`} />
            <StatChip label="勝率" value={pctText} />
            <StatChip label="差" value={record.gb ?? '-'} />
            <StatChip label="直近10" value={`${form.last10.w}-${form.last10.l}-${form.last10.d}`} />
            <StatChip label="連続" value={form.streak} tone={streakTone} />
          </div>
        </div>
      </Card>

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    padding: '5px 12px',
                    border: `1px solid ${TINFO[nextGame.awayKey].c}`,
                    borderRadius: 8,
                    color: TINFO[nextGame.awayKey].c,
                    background: `color-mix(in srgb, ${TINFO[nextGame.awayKey].c} 12%, transparent)`,
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 700,
                  }}
                >
                  {TINFO[nextGame.awayKey].ab}
                </span>
                <span
                  style={{
                    color: 'var(--color-text-faint)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  @
                </span>
                <span
                  style={{
                    padding: '5px 12px',
                    border: `1px solid ${TINFO[nextGame.homeKey].c}`,
                    borderRadius: 8,
                    color: TINFO[nextGame.homeKey].c,
                    background: `color-mix(in srgb, ${TINFO[nextGame.homeKey].c} 12%, transparent)`,
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 700,
                  }}
                >
                  {TINFO[nextGame.homeKey].ab}
                </span>
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 999,
                  padding: '3px 10px 3px 3px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    display: 'grid',
                    width: 18,
                    height: 18,
                    placeItems: 'center',
                    borderRadius: 999,
                    background: 'var(--color-accent)',
                    color: '#fff',
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {index + 1}
                </span>
                {player.name}
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
