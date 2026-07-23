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
    <PageShell>
      <header
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
          <h1 style={{ margin: '3px 0' }}>{game.season.year}年シーズン</h1>
          <div style={{ color: '#7f9ab4', fontSize: 12 }}>
            {record.rank ?? '-'}位 / {record.w}勝 {record.l}敗 {record.d}分
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SaveSlotControls beforeExport={game.saveCurrent} warnBeforeSwitch />
          <span style={{ color: '#64d69a', fontSize: 12 }}>{saveStatus}</span>
          <Button onClick={() => void handleSave()} color="#1a2535">保存</Button>
          <a
            href="/legacy/index.html"
            style={{ color: '#90caf9', fontSize: 12, padding: 10 }}
          >
            legacy版
          </a>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginBottom: 12 }}>
        <Card>
          <SectionTitle>Next Game</SectionTitle>
          {nextGame ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 5 }}>
                {TINFO[nextGame.awayKey].ab} @ {TINFO[nextGame.homeKey].ab}
              </div>
              <div style={{ color: '#7f9ab4', fontSize: 12, marginBottom: 4 }}>
                {nextGame.date}
                {nextGame.doubleHeaderGame ? ` / ダブルヘッダー第${nextGame.doubleHeaderGame}試合` : ''}
              </div>
              {nextGame.postponedFrom && (
                <div style={{ color: '#ffca72', fontSize: 12, marginBottom: 12 }}>
                  雨天順延（当初 {nextGame.postponedFrom}）
                </div>
              )}
              {!nextGame.postponedFrom && <div style={{ marginBottom: 12 }} />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={game.simulateNextGame} color={playerTeam.c}>次戦を実行</Button>
                <Button onClick={() => game.skip('week')} color="#1a2535">1週スキップ</Button>
                <Button onClick={() => game.skip('month')} color="#1a2535">1ヶ月スキップ</Button>
                <Button onClick={() => game.skip('season')} color="#4c315f">残り全試合</Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#7f9ab4', fontSize: 12, marginBottom: 10 }}>レギュラーシーズン終了</div>
              <Button onClick={() => game.setScreen('postseason')} color={playerTeam.c}>ポストシーズンへ</Button>
            </>
          )}
        </Card>
        <Card>
          <SectionTitle>Lineup</SectionTitle>
          <div style={{ color: '#7f9ab4', fontSize: 12, marginBottom: 8 }}>
            現在の先発野手 {game.lineup.length}名
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {game.lineup.map((player, index) => (
              <button
                type="button"
                key={player.id}
                onClick={() => game.selectPlayer(player)}
                style={{
                  background: '#10273b',
                  color: '#c8def0',
                  border: '1px solid #244d71',
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
          <Button onClick={() => game.setLineup(bestLineup(playerTeam))} color="#1a2535">
            AIで最適オーダー
          </Button>
        </Card>
      </div>

      {game.lastGame && <div style={{ marginBottom: 12 }}><BoxScore game={game.lastGame} /></div>}

      <div style={{ marginBottom: 12 }}>
        <StandingsTable standings={game.standings} />
      </div>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>Roster Browser</SectionTitle>
        <select
          value={viewedKey}
          onChange={(event) => game.setViewTeam(event.target.value as TeamKey)}
          style={{
            background: '#0a1218',
            color: '#f3f7ff',
            border: '1px solid #1a2535',
            borderRadius: 7,
            padding: '8px 10px',
          }}
        >
          {(Object.keys(game.teams) as TeamKey[]).map((teamKey) => (
            <option key={teamKey} value={teamKey}>{TINFO[teamKey].n}</option>
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
