import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from './ui';
import { useFocusTrap } from './widgets/useFocusTrap';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (delete, overwrite, discard). */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Pending extends ConfirmOptions {
  resolve(value: boolean): void;
}

/**
 * One in-app confirmation dialog for the whole app, in place of window.confirm: it
 * follows the theme, traps focus, and returns focus to where it was when it closes.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPending({ ...options, resolve });
      }),
    [],
  );

  const close = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
      const target = returnFocus.current;
      window.requestAnimationFrame(() => target?.focus());
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    // A destructive choice starts on キャンセル, so a stray Enter never deletes anything.
    const buttons = () => actionsRef.current?.querySelectorAll<HTMLButtonElement>('button');
    window.requestAnimationFrame(() => buttons()?.[pending.danger ? 0 : 1]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pending, close]);

  useFocusTrap(dialogRef, Boolean(pending));

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="player-modal-backdrop confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close(false);
          }}
        >
          <div
            className="confirm-dialog"
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <h2 id="confirm-dialog-title" className="confirm-dialog__title">
              {pending.title}
            </h2>
            <p id="confirm-dialog-message" className="confirm-dialog__message">
              {pending.message}
            </p>
            <div className="confirm-dialog__actions" ref={actionsRef}>
              <Button onClick={() => close(false)} color="var(--color-surface-muted)">
                {pending.cancelLabel ?? 'キャンセル'}
              </Button>
              <Button
                onClick={() => close(true)}
                color={pending.danger ? 'var(--color-danger)' : 'var(--color-accent)'}
              >
                {pending.confirmLabel ?? 'OK'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Asks the user to confirm; resolves true only when they choose the confirm button. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}
