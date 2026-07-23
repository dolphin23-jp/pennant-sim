# pennant-sim

React 18 + Babel Standaloneで動作していた単一HTML版を保持しつつ、Vite + React + TypeScriptへ段階的に移行するプロジェクトです。

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

GitHub Actionsではpushおよびpull requestごとにlint、build、旧エンジンとのbaseline比較を実行します。

## TypeScriptエンジン

Phase Bでは、UIを変更せず、旧版のデータ定義とゲームロジックを型付きモジュールへ移植しています。

- `src/data/`: 球団、選手名、OVR係数、育成係数、特殊能力、確率定数
- `src/engine/types.ts`: Player、Team、GameState、AtBatResult、成績などの型
- `src/engine/atBat.ts`: 打席結果と走者進塁
- `src/engine/game.ts`: 半イニングと試合進行
- `src/engine/season.ts`: 日程、順位、CPU試合スキップ
- `src/engine/growth.ts`: 成長と覚醒
- `src/engine/market.ts`: FA・外国人市場とCPU間トレード

旧版の `accumulatedGlobal` に相当する状態は新エンジンには存在しません。習熟度計算に必要な成績は、`simulateGame`、`simHalf`、`simCpuUntilNext`、`skipGames` へ明示的に渡します。

## バランス基準値

旧エンジンの基準値を再生成します。

```bash
npm run baseline
```

新TypeScriptエンジンの基準値を生成します。

```bash
npm run baseline:new
```

同じ100シーズン・seed `20260723`で両者を比較し、平均と母標準偏差の相対差が各2%以内であることを検証します。

```bash
npm run baseline:compare
```

現在の記録では、打率、防御率、本塁打数、盗塁成功率、四球率の平均・標準偏差が6桁または3桁への丸め後に完全一致します。
