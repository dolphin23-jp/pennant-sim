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

Vite版は開発サーバーのURLで起動します。従来版は `/legacy/index.html` から開けます。

## 品質チェック

```bash
npm run lint
npm test
npm run build
```

`npm test` はNode標準テストによるengine・保存移行テストと、100シーズンのPhase A/B baseline比較を実行します。GitHub Actionsではpushおよびpull requestごとに `lint → test → build` を必須実行します。

## TypeScriptエンジン

Phase Bでは、旧版のデータ定義とゲームロジックを型付きモジュールへ移植しています。

- `src/data/`: 球団、選手名、OVR係数、育成係数、特殊能力、確率定数
- `src/engine/types.ts`: Player、Team、GameState、AtBatResult、成績などの型
- `src/engine/atBat.ts`: 打席結果と走者進塁
- `src/engine/game.ts`: 半イニングと試合進行
- `src/engine/season.ts`: 日程、順位、CPU試合スキップ
- `src/engine/growth.ts`: 成長と覚醒
- `src/engine/market.ts`: FA・外国人市場とCPU間トレード

旧版の `accumulatedGlobal` に相当する状態は新エンジンには存在しません。習熟度計算に必要な成績は、`simulateGame`、`simHalf`、`simCpuUntilNext`、`skipGames` へ明示的に渡します。

## React UI

Phase Cでは、旧 `NPBSimulator` が一括して持っていた画面遷移と状態を次の構成へ分割しています。

- `src/components/screens/`: 球団選択、シーズン、ポストシーズン、オフシーズン、FA・外国人市場、トレード、ドラフト
- `src/components/widgets/`: 選手詳細、ロスター、順位表、ボックススコア
- `src/state/gameState.tsx`: Contextによる全体状態とengine呼び出し
- `src/state/storage.ts`: 保存、読込、旧セーブのマイグレーション
- `src/state/offseason.ts`: オフシーズン画面固有の進行補助

デザイン刷新は行わず、インラインstyleを維持しています。ゲーム計算は `src/engine` を直接利用し、UI側に打席・試合・成長確率の別実装は持ちません。

## セーブ互換性

保存キーは旧版と同じ `npb_sim_v3_restored` です。読込時に以下を補います。

- `specials` だけを持つ旧選手データから `specialLevels` を生成
- 不足している成績マップ、通知、年度別成績、引退選手履歴を空値で補完
- `viewTeam` がない旧セーブでは `playerTeam` を利用
- 日程から順位表を再構築可能な既定値を設定

新UIが保存するJSONは旧フィールドを保持し、追加するのは `uiVersion` と従来から存在する `ts` だけです。旧版は未知フィールドを無視して読み込めます。

## バランス基準値

旧エンジンの基準値を再生成します。

```bash
npm run baseline
```

新TypeScriptエンジンの基準値を生成します。

```bash
npm run baseline:new
```

同じ100シーズン・seed `20260723`で両者を比較し、打率、防御率、本塁打、盗塁成功率、四球率の平均と母標準偏差の相対差が各2%以内であることを検証します。

```bash
npm run baseline:compare
```
