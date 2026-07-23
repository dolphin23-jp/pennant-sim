import { useMemo, useState } from 'react';

import { TINFO } from '../../data';
import { bestLineup } from '../../engine';
import type { TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { Button, Card, PageShell, SectionTitle } from '../ui';
import { BoxScore } from '../widgets/BoxScore';
import { RosterTable } from '../widgets/RosterTable';
import { SaveSlotControls } from '../widgets/SaveSlotControls';
import { StandingsTable } from '../widgets/StandingsTable';

export function SeasonScreen() {
  const game = useGameState();
  const [saveStatus, setSaveStatus] = useState('');
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
  const viewedKey = game.viewTeam ?? game.playerTeam;
  const viewedTeam = game.teams[viewedKey];
  const record = game.standings[game.playerTeam];

  const handleSave = async () => {
    const success = await game.saveCurrent();
    setSaveStatus(success ? '✓ 保存完了' : '✗ 保存失敗');
    window.setTimeout(() => setSaveStatus(''), 1800);
  };

  return (
    <PageShell ariaLabel={`${game.season.year}年シーズン画面`}>
      <header
        aria-labelledby="season-screen-title"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ color: playerTeam.c, fontSize: 12, fontWeight: 900 }}>{playerTeam.ab}</div>
          <h1 id="season-screen-title" style={{ margin: '3px 0' }}>
            {game.season.year}年シーズン
          </h1>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            {record.rank ?? '-'}位 / {record.w}勝 {record.l}敗 {record.d}分
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SaveSlotControls beforeExport={game.saveCurrent} warnBeforeSwitch />
          <span className="inline-status" role="status" aria-live="polite">
            {saveStatus}
          </span>
          <Button onClick={() => void handleSave()} color="var(--color-surface-muted)" ariaLabel="現在のゲームを保存">
            保存
          </Button>
          <a className="legacy-link" href="/legacy/index.html" aria-label="従来版を開く">
            legacy版
          </a>
        </div>
      </header>

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
                <Button onClick={game.simulateNextGame} color={playerTeam.c}>
                  次戦を実行
                </Button>
                <Button onClick={() => game.skip('week')} color="var(--color-surface-muted)">
                  1週スキップ
                </Button>
                <Button onClick={() => game.skip('month')} color="var(--color-surface-muted)">
                  1ヶ月スキップ
                </Button>
                <Button onClick={() => game.skip('season')} color="var(--color-growth)">
                  残り全試合
                </Button>
              </nav>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
                レギュラーシーズン終了
              </div>
              <Button onClick={() => game.setScreen('postseason')} color={playerTeam.c}>
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
            role="list"
            aria-label="先発オーダー"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}
          >
            {game.lineup.map((player, index) => (
              <button
                type="button"
                role="listitem"
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
          <Button onClick={() => game.setLineup(bestLineup(playerTeam))} color="var(--color-surface-muted)">
            AIで最適オーダー
          </Button>
        </Card>
      </div>

      {game.lastGame && (
        <div style={{ marginBottom: 12 }}>
          <BoxScore game={game.lastGame} />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <StandingsTable standings={game.standings} />
      </div>

      <Card style={{ marginBottom: 12 }} ariaLabel="表示する球団を選択">
        <SectionTitle>Roster Browser</SectionTitle>
        <select
          aria-label="ロスターを表示する球団"
          value={viewedKey}
          onChange={(event) => game.setViewTeam(event.target.value as TeamKey)}
          style={{
            background: 'var(--color-bg-soft)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 7,
            padding: '8px 10px',
          }}
        >
          {(Object.keys(game.teams) as TeamKey[]).map((teamKey) => (
            <option key={teamKey} value={teamKey}>
              {TINFO[teamKey].n}
            </option>
          ))}
        </select>
      </Card>
      <RosterTable
        team={viewedTeam}
        accumulated={viewedKey === game.playerTeam ? game.accumulated : game.leagueAccumulated}
        onSelect={game.selectPlayer}
      />
    </PageShell>
  );
}
