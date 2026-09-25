import { useCallback, useState } from 'react';

import { OffseasonScreen } from './components/screens/OffseasonScreen';
import { PostseasonScreen } from './components/screens/PostseasonScreen';
import { SeasonScreen } from './components/screens/SeasonScreen';
import { TeamSelectScreen } from './components/screens/TeamSelectScreen';
import { TitleScreen } from './components/screens/TitleScreen';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveGameViewer } from './components/live/LiveGameViewer';
import { OpenLiveViewerContext } from './components/live/liveViewerContext';
import { OpenSettingsContext } from './components/settingsSheetContext';
import { PageShell, SettingsButton } from './components/ui';
import { GameDetailModal } from './components/widgets/GameDetailModal';
import { PlayerDetailModal } from './components/widgets/PlayerDetailModal';
import { SettingsSheet } from './components/widgets/SettingsSheet';
import { GameProvider, useGameState } from './state/gameState';
import { SettingsProvider } from './state/settings';

function GameRouter() {
  const game = useGameState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const [liveGameId, setLiveGameId] = useState<string | null>(null);
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

  let screen = <TitleScreen />;
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

  const liveLog = liveGameId ? game.recentPlayLogs[liveGameId] : null;

  return (
    <OpenSettingsContext.Provider value={openSettings}>
      <OpenLiveViewerContext.Provider value={setLiveGameId}>
        {game.screen !== 'season' && <SettingsButton onClick={() => setSettingsOpen(true)} />}
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
          honorHistory={game.honorHistory}
          roster={modalRoster}
          onSelect={game.selectPlayer}
          onClose={() => game.selectPlayer(null)}
          debugMode={game.debugMode}
          onUpdatePlayer={game.updatePlayer}
          isOwnTeam={isPlayerTeam}
          isFavorite={Boolean(
            game.selectedPlayer && game.favorites.includes(game.selectedPlayer.id),
          )}
          onToggleFavorite={game.toggleFavorite}
        />
        <GameDetailModal
          box={selectedGameBox}
          playLog={game.selectedGameId ? game.recentPlayLogs[game.selectedGameId] : null}
          onSelectPlayer={selectBoxScorePlayer}
          onClose={() => game.selectGame(null)}
          onWatchLive={
            game.selectedGameId && game.recentPlayLogs[game.selectedGameId]
              ? () => {
                  setLiveGameId(game.selectedGameId);
                  game.selectGame(null);
                }
              : undefined
          }
        />
        {liveLog && (
          <LiveGameViewer
            key={liveLog.gameId}
            log={liveLog}
            ownTeam={game.playerTeam}
            onClose={() => setLiveGameId(null)}
          />
        )}
      </OpenLiveViewerContext.Provider>
    </OpenSettingsContext.Provider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ConfirmProvider>
          <GameProvider>
            <GameRouter />
          </GameProvider>
        </ConfirmProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
