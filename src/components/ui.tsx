import type { CSSProperties, ReactNode } from 'react';

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#04090f',
        color: '#f3f7ff',
        fontFamily: "'Noto Sans JP', system-ui, sans-serif",
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
    </main>
  );
}

export function Card({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        background: '#0b1622',
        border: '1px solid #1e3044',
        borderRadius: 12,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: '#4db6ff',
        fontWeight: 800,
        letterSpacing: 2,
        marginBottom: 10,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled = false,
  color = '#1565c0',
}: {
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 8,
        minHeight: 40,
        padding: '8px 14px',
        background: disabled ? '#162030' : color,
        color: disabled ? '#5a7898' : 'white',
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div style={{ color: '#6f8ca8', fontSize: 12, padding: '18px 0' }}>{children}</div>;
}
