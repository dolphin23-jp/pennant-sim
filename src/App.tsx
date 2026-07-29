import { useState } from 'react';

import { OffseasonScreen } from './components/screens/OffseasonScreen';
import { PostseasonScreen } from './components/screens/PostseasonScreen';
import { SeasonScreen } from './components/screens/SeasonScreen';
import { TeamSelectScreen } from './components/screens/TeamSelectScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button, Card, PageShell, SettingsButton } from './components/ui';
import { GameDetailModal } from './components/widgets/GameDetailModal';
import { PlayerDetailModal } from './components/widgets/PlayerDetailModal';
import { SaveSlotControls } from './components/widgets/SaveSlotControls';
import { SettingsSheet } from './components/widgets/SettingsSheet';
import { GameProvider, useGameState } from './state/gameState';
import { SettingsProvider, useSettings } from './state/settings';
import { setActiveSaveSlot, type SaveSlot } from './state/storage';

function WelcomeScreen() {
  const game = useGameState();
  const { skipConfirmations } = useSettings();
  const [targetSlot, setTargetSlot] = useState<SaveSlot>(1);
  // Reachable via "タイトルへ戻る" mid-game: the previous game is still live in memory,
  // so offer to jump straight back to it instead of only offering to reload from disk.
  const canResume = Boolean(game.teams && game.playerTeam);

  const handleStartNew = async () => {
    if (
      !skipConfirmations &&
      !window.confirm(
        `スロット${targetSlot}で新しいゲームを始めますか？チームを選ぶと、そのスロットの既存のセーブは上書きされます。`,
      )
    )
      return;
    await setActiveSaveSlot(targetSlot);
    game.startNewGame();
  };

  const handleResume = () => {
    const seasonOver =
      game.season.schedule.length > 0 && game.season.schedule.every((scheduled) => scheduled.played);
    game.setScreen(seasonOver ? 'postseason' : 'season');
  };

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
            3つの独立したセーブ枠を利用できます。旧キーのセーブは削除せず、初回読込時にスロット1へ自動コピーします。スロットを選んだだけでは読み込まれません。「続きから読み込む」か「新規ゲーム」を押すまでこの画面のままです。
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
          {canResume && (
            <div style={{ marginBottom: 18 }}>
              <Button onClick={handleResume} ariaLabel="タイトルへ戻る前のゲームを再開">
                進行中のゲームを再開
              </Button>
            </div>
          )}
          <div style={{ marginBottom: 18 }}>
            <SaveSlotControls deferLoad onSlotChange={setTargetSlot} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              onClick={() => void handleStartNew()}
              ariaLabel="選択中のセーブ枠で新規ゲームを開始"
            >
              選択中の枠で新規ゲーム
            </Button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function GameRouter() {
  const game = useGameState();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      <SettingsButton onClick={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <SettingsSheet
          debugMode={game.debugMode}
          onToggleDebugMode={game.toggleDebugMode}
          hasActiveGame={Boolean(game.teams && game.playerTeam)}
          onSaveCurrent={game.saveCurrent}
          onActiveSlotCleared={() => {
            game.startNewGame();
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
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
        debugMode={game.debugMode}
        onUpdatePlayer={game.updatePlayer}
        isOwnTeam={isPlayerTeam}
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
    <ErrorBoundary>
      <SettingsProvider>
        <GameProvider>
          <GameRouter />
        </GameProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
