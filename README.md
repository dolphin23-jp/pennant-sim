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

`npm test` はNode標準テストによるengine・保存移行テストと、100シーズンのbalance baseline比較を実行します。GitHub Actionsではpushおよびpull requestごとに `lint → test → build` を必須実行します。

## GitHub Pages

`main` ブランチへのpush時に、`.github/workflows/deploy-pages.yml` がViteアプリをビルドし、`dist/` をGitHub Pagesへデプロイします。Viteの公開パスはリポジトリ名に合わせて `/pennant-sim/` に設定しています。

初回利用時は、リポジトリ画面で次の手動設定が必要です。

1. `Settings` を開く
2. `Pages` を開く
3. `Build and deployment` の `Source` を **GitHub Actions** に変更する

この設定はリポジトリ設定側の操作であり、コードやPull Requestからは変更できません。

品質確認用の `.github/workflows/ci.yml` とPages公開用workflowは分離しており、前者はlint・test・build、後者はmainのビルド成果物の公開だけを担当します。

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

日程生成では雨天順延を当初日と順延元の両方で記録し、同一カードの将来日へ組み込める場合はダブルヘッダー第1・第2試合として表現します。試合数は変わりません。baseline生成では雨天率を0に固定し、日程イベントと打席バランスの乱数列を分離しています。

## React UI

Phase Cでは、旧 `NPBSimulator` が一括して持っていた画面遷移と状態を次の構成へ分割しています。

- `src/components/screens/`: 球団選択、シーズン、ポストシーズン、オフシーズン、FA・外国人市場、トレード、ドラフト
- `src/components/widgets/`: 選手詳細、ロスター、順位表、ボックススコア、セーブ枠管理
- `src/state/gameState.tsx`: Contextによる全体状態とengine呼び出し
- `src/state/storage.ts`: 保存、読込、複数スロット、JSON入出力、旧セーブのマイグレーション
- `src/state/offseason.ts`: オフシーズン画面固有の進行補助

デザイン刷新は行わず、インラインstyleを維持しています。ゲーム計算は `src/engine` を直接利用し、UI側に打席・試合・成長確率の別実装は持ちません。

## セーブ互換性

新しい保存キーは `npb_sim_v3_slot_1` から `npb_sim_v3_slot_3` までの3枠です。旧キー `npb_sim_v3_restored` が存在し、スロット1が空の場合は、初回読込時に旧データをスロット1へコピーします。旧キーは削除しないため、移行中も元データが失われません。

読込時には以下も補完します。

- `specials` だけを持つ旧選手データから `specialLevels` を生成
- `park` を持たない旧球団データへ現在の球場係数を追加
- 旧日程へ当初日、順延元、ダブルヘッダー情報の既定値を追加
- 不足している成績マップ、通知、年度別成績、引退選手履歴を空値で補完
- `viewTeam` がない旧セーブでは `playerTeam` を利用
- 日程から順位表を再構築可能な既定値を設定

各スロットはJSONファイルとしてダウンロードでき、同じUIから任意のスロットへアップロードできます。アップロード時も通常のマイグレーションを通すため、旧形式のJSONを読み込めます。

## バランス基準値

現在のTypeScriptエンジンを100シーズン・seed `20260723`で実行し、承認済みの基準値を `baseline/season-stats.json` へ記録します。バランスを意図的に変更した回では、このコマンドで新しい数値を基準として採用します。

```bash
npm run baseline
```

比較用の現在値は `baseline/new-season-stats.json` へ生成します。

```bash
npm run baseline:new
```

`npm run baseline:compare` は、打率、防御率、本塁打、盗塁成功率、四球率の平均と母標準偏差について、記録済み基準から2%を超える予期しない変動を検出します。

```bash
npm run baseline:compare
```

現在の100シーズン平均は、打率 `.222067`、防御率 `4.236324`、リーグ年間本塁打 `3126.4` 本です。
