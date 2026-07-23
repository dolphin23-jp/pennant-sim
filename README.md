# pennant-sim

React 18 + Babel Standaloneで動作していた単一HTML版を保持しつつ、Vite + React + TypeScriptへ段階的に移行するための開発基盤です。

## 必要環境

- Node.js 22
- npm

## セットアップ

```bash
npm install
npm run dev
```

Vite版は開発サーバーのURLで起動します。従来版は `/legacy/index.html` から開けます。従来版のゲームロジックと `localStorage` のセーブデータ形式は変更していません。

## 品質チェック

```bash
npm run lint
npm run format:check
npm run build
```

GitHub Actionsでもpushおよびpull requestごとにlintとbuildを実行します。

## バランス基準値の再生成

`balance-baseline.mjs` は `legacy/index.html` のBabelスクリプトからUIより前のゲームロジックを切り出し、Node.jsの `vm` 上で直接実行します。`simAB`、`simHalf`、`simulateGame`、`generateSchedule`、`growPlayer`、`checkAwakening` などを別実装へコピーしないため、旧版を基準値として利用できます。

```bash
npm run baseline
```

既定ではseed `20260723` を使って100シーズンを実行し、以下のリーグ全体指標について平均と母標準偏差を `baseline/season-stats.json` に保存します。

- 打率: 安打 / 打数
- 防御率: 自責点 × 27 / 投球アウト数
- 本塁打数: 1シーズンのリーグ総数
- 盗塁成功率: 盗塁 / (盗塁 + 盗塁死)
- 四球率: 四球 / 打席

シーズン数、seed、出力先は変更できます。

```bash
node scripts/balance-baseline.mjs --seasons 10 --seed 12345 --output baseline/test.json
```

スクリプトはビルド不要で、Node.jsから直接実行します。旧版のロジック配置や `UI PARTS` 境界を変更した場合、抽出に失敗して明示的に終了します。
