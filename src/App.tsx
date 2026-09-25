import { useCallback, useEffect, useMemo, useState } from 'react';

import { OffseasonScreen } from './components/screens/OffseasonScreen';
import { PostseasonScreen } from './components/screens/PostseasonScreen';
import { SeasonScreen } from './components/screens/SeasonScreen';
import { TeamSelectScreen } from './components/screens/TeamSelectScreen';
import { TitleScreen } from './components/screens/TitleScreen';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveGameViewer } from './components/live/LiveGameViewer';
import { OpenLiveViewerContext } from './components/live/liveViewerContext';
import { NewspaperFrontModal } from './components/newspaper/NewspaperFront';
import { OpenNewspaperContext } from './components/newspaper/newspaperContext';
import { OpenSettingsContext } from './components/settingsSheetContext';
import { PageShell, SettingsButton } from './components/ui';
import { GameDetailModal } from './components/widgets/GameDetailModal';
import { PlayerDetailModal } from './components/widgets/PlayerDetailModal';
import { SettingsSheet } from './components/widgets/SettingsSheet';
import type { NarrativeArticle } from './narrative/types';
import { GameProvider, useGameState } from './state/gameState';
import { SettingsProvider } from './state/settings';

/** The picture behind the season screens: spring through May, night games after, and the
 * scoreboard once the regular season is over. */
function sceneFor(
  screen: string,
  schedule: Array<{ date: string; played: boolean }>,
): 'spring' | 'night' | 'winter' | null {
  if (screen === 'postseason' || screen === 'offseason') return 'winter';
  if (screen !== 'season') return null;
  const next = schedule.find((game) => !game.played);
  if (!next) return 'winter';
  return Number(next.date.slice(5, 7)) <= 5 ? 'spring' : 'night';
}

function GameRouter() {
  const game = useGameState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const [liveGameId, setLiveGameId] = useState<string | null>(null);
  const [frontPage, setFrontPage] = useState<NarrativeArticle | null>(null);
  const closeFrontPage = useCallback(() => setFrontPage(null), []);
  const scene = sceneFor(game.screen, game.season.schedule);
  useEffect(() => {
    if (scene) document.documentElement.dataset.scene = scene;
    else delete document.documentElement.dataset.scene;
  }, [scene]);
  const liveLog = liveGameId ? game.recentPlayLogs[liveGameId] : null;
  const livePlayers = useMemo(() => {
    if (!liveLog) return undefined;
    const everyone = [
      ...Object.values(game.teams ?? {}).flatMap((team) => [...team.fielders, ...team.pitchers]),
      ...game.retiredPlayers,
      ...game.overseasPlayers,
    ];
    return new Map(everyone.map((player) => [player.id, player]));
  }, [liveLog, game.teams, game.retiredPlayers, game.overseasPlayers]);
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

  return (
    <OpenSettingsContext.Provider value={openSettings}>
      <OpenLiveViewerContext.Provider value={setLiveGameId}>
        <OpenNewspaperContext.Provider value={setFrontPage}>
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
              players={livePlayers}
              onClose={() => setLiveGameId(null)}
            />
          )}
          {frontPage && <NewspaperFrontModal article={frontPage} onClose={closeFrontPage} />}
        </OpenNewspaperContext.Provider>
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
