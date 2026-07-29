import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Notice } from './storage';

export type Theme = 'dark' | 'light';
export type NoticeKind = NonNullable<Notice['kind']>;

const THEME_KEY = 'pennant-sim-theme';
const SKIP_CONFIRMATIONS_KEY = 'pennant-sim:skipConfirmations';
const HIDDEN_NOTICE_KINDS_KEY = 'pennant-sim:hiddenNoticeKinds';

export const NOTICE_KIND_ORDER: NoticeKind[] = ['achievement', 'awakening', 'growth', 'game', 'system'];
export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
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
  const [hiddenNoticeKinds, setHiddenNoticeKinds] = useState<Set<NoticeKind>>(initialHiddenNoticeKinds);

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
