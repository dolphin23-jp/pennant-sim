import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button, Card, PageShell } from './ui';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Malformed or corrupted save data can reach deep render code (a missing team, a
// standings entry without the expected fields, etc.) in ways migrateSaveData's
// validation cannot fully anticipate. Without this boundary, that throws all the
// way up and unmounts the whole app to a blank white screen with only a console
// error, leaving the user with no way back in short of clearing storage by hand.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in game UI', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <PageShell ariaLabel="エラーが発生しました">
        <div style={{ minHeight: 'calc(100vh - 40px)', display: 'grid', placeItems: 'center' }}>
          <Card ariaLabel="エラー詳細" style={{ width: 'min(560px,100%)', padding: 34 }}>
            <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>予期しないエラーが発生しました</h1>
            <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.8, margin: '0 0 20px' }}>
              画面の表示中に問題が発生しました。セーブデータ自体は保存済みの内容のまま残っています。再読み込みすると復帰できる場合があります。
            </p>
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                wordBreak: 'break-word',
                margin: '0 0 20px',
              }}
            >
              {error.message}
            </p>
            <Button onClick={this.reload} ariaLabel="ページを再読み込み">
              再読み込み
            </Button>
          </Card>
        </div>
      </PageShell>
    );
  }
}
