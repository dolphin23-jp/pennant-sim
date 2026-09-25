import { createContext, useContext } from 'react';

/** Opens the live viewer on one of the user's recent games (null closes it). Games whose
 * play-by-play is no longer kept cannot be watched. */
export const OpenLiveViewerContext = createContext<(gameId: string | null) => void>(() => {});

export const useOpenLiveViewer = () => useContext(OpenLiveViewerContext);
