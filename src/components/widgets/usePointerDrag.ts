import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface DragSession {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
}

export interface PointerDragHandleProps {
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
  onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
}

function dropIdAtPoint(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest<HTMLElement>('[data-drop-id]')?.dataset.dropId ?? null;
}

export function usePointerDrag(
  onDrop: (activeId: string, overId: string) => void,
  activationDistance = 8,
) {
  const sessionRef = useRef<DragSession | null>(null);
  const previousUserSelectRef = useRef('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    setActiveId(null);
    setOverId(null);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = previousUserSelectRef.current;
    }
  }, []);

  useEffect(() => clearSession, [clearSession]);

  const start = useCallback((id: string, event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    sessionRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (!session.dragging && distance < activationDistance) return;
      if (!session.dragging) {
        session.dragging = true;
        previousUserSelectRef.current = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        setActiveId(session.id);
      }
      event.preventDefault();
      setOverId(dropIdAtPoint(event.clientX, event.clientY));
    },
    [activationDistance],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (session.dragging) {
        event.preventDefault();
        const destination = dropIdAtPoint(event.clientX, event.clientY) ?? overId;
        if (destination) onDrop(session.id, destination);
      }
      clearSession();
    },
    [clearSession, onDrop, overId],
  );

  const cancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      clearSession();
    },
    [clearSession],
  );

  const handleProps = useCallback(
    (id: string): PointerDragHandleProps => ({
      onPointerDown: (event) => start(id, event),
      onPointerMove: move,
      onPointerUp: finish,
      onPointerCancel: cancel,
    }),
    [cancel, finish, move, start],
  );

  return { activeId, overId, handleProps };
}
