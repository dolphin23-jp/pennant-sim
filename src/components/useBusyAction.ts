import { useCallback, useState } from 'react';

/**
 * simulateNextGame/skip/etc. run entirely synchronously and can take a
 * noticeable moment for a full season skip. Setting `busy` and yielding to the
 * browser with setTimeout before running the action lets React paint the
 * disabled/"処理中" state first, instead of the click just freezing the tab
 * with no feedback until the blocking call returns.
 */
export function useBusyAction(): { busy: boolean; run(action: () => void): void } {
  const [busy, setBusy] = useState(false);
  const run = useCallback((action: () => void) => {
    setBusy(true);
    window.setTimeout(() => {
      try {
        action();
      } finally {
        setBusy(false);
      }
    }, 0);
  }, []);
  return { busy, run };
}
