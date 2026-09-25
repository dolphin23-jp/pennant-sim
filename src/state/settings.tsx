import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { sound } from '../audio/sound';
import type { Notice } from './storage';

export type Theme = 'dark' | 'light';
export type NoticeKind = NonNullable<Notice['kind']>;

const THEME_KEY = 'pennant-sim-theme';
const SKIP_CONFIRMATIONS_KEY = 'pennant-sim:skipConfirmations';
const HIDDEN_NOTICE_KINDS_KEY = 'pennant-sim:hiddenNoticeKinds';
const SOUND_ENABLED_KEY = 'pennant-sim:soundEnabled';
const VOLUME_KEY = 'pennant-sim:volume';
const REDUCE_EFFECTS_KEY = 'pennant-sim:reduceEffects';
const AUTO_LIVE_WATCH_KEY = 'pennant-sim:autoLiveWatch';

export const NOTICE_KIND_ORDER: NoticeKind[] = [
  'race',
  'achievement',
  'awakening',
  'growth',
  'game',
  'system',
];
export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
  race: 'ペナントレース',
  achievement: '記録・メモリアル',
  awakening: '覚醒',
  growth: '成長',
  game: '試合結果',
  system: 'チーム情報',
};

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initialSkipConfirmations(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SKIP_CONFIRMATIONS_KEY) === '1';
}

function initialFlag(key: string, fallback = false): boolean {
  if (typeof window === 'undefined') return fallback;
  const saved = window.localStorage.getItem(key);
  return saved === null ? fallback : saved === '1';
}

function initialVolume(): number {
  if (typeof window === 'undefined') return 0.6;
  const saved = Number(window.localStorage.getItem(VOLUME_KEY));
  return window.localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(saved)
    ? Math.max(0, Math.min(1, saved))
    : 0.6;
}

/** Fewer effects by default for people who asked their system for reduced motion. */
function initialReduceEffects(): boolean {
  const prefersReduced =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return initialFlag(REDUCE_EFFECTS_KEY, prefersReduced);
}

function initialHiddenNoticeKinds(): Set<NoticeKind> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_NOTICE_KINDS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((kind): kind is NoticeKind => NOTICE_KIND_ORDER.includes(kind as NoticeKind)),
    );
  } catch {
    return new Set();
  }
}

interface SettingsContextValue {
  theme: Theme;
  setTheme(theme: Theme): void;
  /** Skips the confirm() prompt before save-management actions (starting a new game,
   * switching/overwriting a save slot) - never applies to destructive, irreversible
   * actions like clearing a slot's data, which always confirm regardless. */
  skipConfirmations: boolean;
  setSkipConfirmations(value: boolean): void;
  hiddenNoticeKinds: Set<NoticeKind>;
  toggleNoticeKind(kind: NoticeKind): void;
  /** Ballpark sounds; off until the user turns them on. */
  soundEnabled: boolean;
  setSoundEnabled(value: boolean): void;
  volume: number;
  setVolume(value: number): void;
  /** No screen shake, confetti or animated transitions. */
  reduceEffects: boolean;
  setReduceEffects(value: boolean): void;
  /** Open the live viewer after each 次の試合. */
  autoLiveWatch: boolean;
  setAutoLiveWatch(value: boolean): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Always mounted at the app root (not just while a settings UI is open), since the
 * theme effect below must apply document.documentElement.dataset.theme on every load
 * regardless of whether the user ever opens the settings sheet.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [skipConfirmations, setSkipConfirmations] = useState<boolean>(initialSkipConfirmations);
  const [hiddenNoticeKinds, setHiddenNoticeKinds] =
    useState<Set<NoticeKind>>(initialHiddenNoticeKinds);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => initialFlag(SOUND_ENABLED_KEY));
  const [volume, setVolume] = useState<number>(initialVolume);
  const [reduceEffects, setReduceEffects] = useState<boolean>(initialReduceEffects);
  const [autoLiveWatch, setAutoLiveWatch] = useState<boolean>(() =>
    initialFlag(AUTO_LIVE_WATCH_KEY),
  );

  useEffect(() => {
    sound.configure(soundEnabled, volume);
    window.localStorage.setItem(SOUND_ENABLED_KEY, soundEnabled ? '1' : '0');
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [soundEnabled, volume]);

  useEffect(() => {
    window.localStorage.setItem(REDUCE_EFFECTS_KEY, reduceEffects ? '1' : '0');
  }, [reduceEffects]);

  useEffect(() => {
    window.localStorage.setItem(AUTO_LIVE_WATCH_KEY, autoLiveWatch ? '1' : '0');
  }, [autoLiveWatch]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SKIP_CONFIRMATIONS_KEY, skipConfirmations ? '1' : '0');
  }, [skipConfirmations]);

  useEffect(() => {
    window.localStorage.setItem(HIDDEN_NOTICE_KINDS_KEY, JSON.stringify([...hiddenNoticeKinds]));
  }, [hiddenNoticeKinds]);

  const toggleNoticeKind = (kind: NoticeKind) => {
    setHiddenNoticeKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <SettingsContext.Provider
      value={{
        theme,
        setTheme,
        skipConfirmations,
        setSkipConfirmations,
        hiddenNoticeKinds,
        toggleNoticeKind,
        soundEnabled,
        setSoundEnabled,
        volume,
        setVolume,
        reduceEffects,
        setReduceEffects,
        autoLiveWatch,
        setAutoLiveWatch,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
