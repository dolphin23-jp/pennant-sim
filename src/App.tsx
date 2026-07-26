import { OffseasonScreen } from './components/screens/OffseasonScreen';
import { PostseasonScreen } from './components/screens/PostseasonScreen';
import { SeasonScreen } from './components/screens/SeasonScreen';
import { TeamSelectScreen } from './components/screens/TeamSelectScreen';
import { Button, Card, PageShell, ThemeToggle } from './components/ui';
import { GameDetailModal } from './components/widgets/GameDetailModal';
import { PlayerDetailModal } from './components/widgets/PlayerDetailModal';
import { SaveSlotControls } from './components/widgets/SaveSlotControls';
import { GameProvider, useGameState } from './state/gameState';

function WelcomeScreen() {
  const game = useGameState();
  return (
    <PageShell ariaLabel="スタート画面">
      <div style={{ minHeight: 'calc(100vh - 40px)', display: 'grid', placeItems: 'center' }}>
        <Card
          ariaLabel="ゲーム開始とセーブスロット"
          style={{ width: 'min(680px,100%)', padding: 34 }}
        >
          <div
            style={{
              color: 'var(--color-accent)',
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: 3,
            }}
          >
            PENNANT SIM
          </div>
          <h1 style={{ fontSize: 'clamp(32px,7vw,56px)', margin: '10px 0' }}>
            NPB ペナントシミュレーター
          </h1>
          <p
            style={{
              color: 'var(--color-text-muted)',
              lineHeight: 1.8,
              margin: '18px 0 20px',
            }}
          >
            3つの独立したセーブ枠を利用できます。旧キーのセーブは削除せず、初回読込時にスロット1へ自動コピーします。
          </p>
          {game.loadError && (
            <p
              role="alert"
              style={{
                color: 'var(--color-danger)',
                lineHeight: 1.8,
                margin: '0 0 20px',
              }}
            >
              {game.loadError}
            </p>
          )}
          <div style={{ marginBottom: 18 }}>
            <SaveSlotControls />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={game.startNewGame} ariaLabel="選択中のセーブ枠で新規ゲームを開始">
              選択中の枠で新規ゲーム
            </Button>
            <a className="legacy-link" href="/legacy/index.html" aria-label="従来版を開く">
              legacy版を開く
            </a>
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
      <PageShell ariaLabel="セーブデータ読込中">
        <div
          role="status"
          aria-live="polite"
          style={{
            minHeight: '80vh',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
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

  const selectedTeam =
    game.selectedPlayer && game.teams
      ? Object.values(game.teams).find((team) =>
          [...team.fielders, ...team.pitchers].some(
            (candidate) => candidate.id === game.selectedPlayer?.id,
          ),
        )
      : null;
  const modalRoster = selectedTeam ? [...selectedTeam.fielders, ...selectedTeam.pitchers] : [];
  const isPlayerTeam = selectedTeam?.key === game.playerTeam;
  const selectedGameBox = game.selectedGameId
    ? (game.gameBoxScores[game.selectedGameId] ?? game.gameSummaries[game.selectedGameId] ?? null)
    : null;
  const selectBoxScorePlayer = (playerId: string) => {
    const activePlayer = game.teams
      ? Object.values(game.teams)
          .flatMap((team) => [...team.fielders, ...team.pitchers])
          .find((player) => player.id === playerId)
      : null;
    const player =
      activePlayer ?? game.retiredPlayers.find((candidate) => candidate.id === playerId) ?? null;
    if (player) game.selectPlayer(player);
  };

  return (
    <>
      <ThemeToggle />
      {screen}
      <PlayerDetailModal
        player={game.selectedPlayer}
        accumulated={isPlayerTeam ? game.accumulated : game.leagueAccumulated}
        careerAccumulated={isPlayerTeam ? game.careerAccumulated : game.leagueCareerAccumulated}
        yearlyStats={game.yearlyStats}
        awardHistory={game.awardHistory}
        roster={modalRoster}
        onSelect={game.selectPlayer}
        onClose={() => game.selectPlayer(null)}
      />
      <GameDetailModal
        box={selectedGameBox}
        onSelectPlayer={selectBoxScorePlayer}
        onClose={() => game.selectGame(null)}
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
