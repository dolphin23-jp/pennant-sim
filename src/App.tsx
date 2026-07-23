import { OffseasonScreen } from './components/screens/OffseasonScreen';
import { PostseasonScreen } from './components/screens/PostseasonScreen';
import { SeasonScreen } from './components/screens/SeasonScreen';
import { TeamSelectScreen } from './components/screens/TeamSelectScreen';
import { Button, Card, PageShell } from './components/ui';
import { PlayerDetailModal } from './components/widgets/PlayerDetailModal';
import { GameProvider, useGameState } from './state/gameState';

function WelcomeScreen() {
  const game = useGameState();
  return (
    <PageShell>
      <div style={{ minHeight: 'calc(100vh - 40px)', display: 'grid', placeItems: 'center' }}>
        <Card style={{ width: 'min(680px,100%)', padding: 34 }}>
          <div style={{ color: '#4db6ff', fontSize: 11, fontWeight: 900, letterSpacing: 3 }}>
            PENNANT SIM
          </div>
          <h1 style={{ fontSize: 'clamp(32px,7vw,56px)', margin: '10px 0' }}>
            NPB ペナントシミュレーター
          </h1>
          <p style={{ color: '#a9bfd3', lineHeight: 1.8, margin: '18px 0 26px' }}>
            Phase Bで型付き移植したゲームエンジンを使用するReact版です。旧セーブデータは同じ保存キーから読み込み、必要な特殊能力スキーマを自動移行します。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={game.startNewGame}>新規ゲーム開始</Button>
            <a className="legacy-link" href="/legacy/index.html">legacy版を開く</a>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function GameRouter() {
  const game = useGameState();
  if (game.loading) {
    return (
      <PageShell>
        <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center', color: '#7f9ab4' }}>
          セーブデータを読み込んでいます…
        </div>
      </PageShell>
    );
  }

  let screen = <WelcomeScreen />;
  if (game.screen === 'teamSelect') screen = <TeamSelectScreen />;
  if (game.screen === 'season') screen = <SeasonScreen />;
  if (game.screen === 'postseason') screen = <PostseasonScreen />;
  if (game.screen === 'offseason') screen = <OffseasonScreen />;

  return (
    <>
      {screen}
      <PlayerDetailModal
        player={game.selectedPlayer}
        accumulated={game.accumulated}
        careerAccumulated={game.careerAccumulated}
        onClose={() => game.selectPlayer(null)}
      />
    </>
  );
}

function App() {
  return (
    <GameProvider>
      <GameRouter />
    </GameProvider>
  );
}

export default App;
