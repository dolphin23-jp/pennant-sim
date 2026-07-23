function App() {
  return (
    <main className="shell">
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">PENNANT SIM</p>
        <h1 id="page-title">TypeScript移行の開発基盤</h1>
        <p className="description">
          現行ゲームは参照用のlegacy版として保持しています。機能移行が完了するまでは、
          以下のリンクから従来版を起動できます。
        </p>
        <a className="legacy-link" href="/legacy/index.html">
          legacy版を開く
        </a>
      </section>
    </main>
  );
}

export default App;
