import { createContext, useContext } from 'react';

/** Opens the settings sheet. Screens whose header has its own menu (the season
 * scoreboard) offer 設定 there instead of the floating gear button. */
export const OpenSettingsContext = createContext<() => void>(() => {});

export const useOpenSettings = () => useContext(OpenSettingsContext);
