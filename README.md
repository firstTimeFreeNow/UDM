# UDM

Next.js App Router / TypeScript を使った GitHub Pages 向けアプリです。

## 開発

Node.js 24 と pnpm 12.18.0 を使います。`packageManager` に指定した pnpm を用意してください。

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

開発画面: http://localhost:3000/UDM/

```sh
pnpm run typecheck
pnpm run build
```

`out/` に静的サイトを出力します。

## GitHub Pages

リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** に設定してください。
`main` への push・プルリクエストでは型チェックとビルドのみを実行します。
GitHub Releases の **Publish release**（`release.published`）で、そのリリースのタグが指すコミットをビルドして公開します。
下書き保存・タグの push だけでは公開しません。手動デプロイ（Run workflow）はありません。
公開されたプレリリースも `published` に含まれます。

### リリース手順

バージョンの正本はルートの `RELEASE` です（初期値 `0.1.0`）。`package.json` の private アプリの version は公開タグの判定に使いません。

1. Actions → **Create release PR** → **Run workflow** でブランチ `main` と `major` / `minor` / `patch` / `hotfix` を選びます。
2. Actions が `RELEASE` だけを更新する `release/v…` ブランチと PR を作ります。
3. PR の内容と CI を確認してマージします。自動作成 PR の CI に承認バナーが出た場合は **Approve workflows to run** を押します。
4. **Publish merged release PR** がマージコミットを検証し、ビルド・テスト成功後に GitHub Release を公開して GitHub Pages にデプロイします。

PR を閉じるだけではリリースしません。リリース PR は同時に1件までです。同じ種別で再実行した場合は既存の PR を表示し、別の種別で実行した場合は既存 PR のマージまたはクローズを求めます。

| 種別 | `1.2.3-hotfix.2` からの更新 |
| --- | --- |
| major | `2.0.0` |
| minor | `1.3.0` |
| patch | `1.2.4` |
| hotfix | `1.2.3-hotfix.3` |

通常バージョン `1.2.3` の初回 hotfix は `1.2.3-hotfix.1` です。major・minor・patch 更新時は下位番号と hotfix をリセットします。hotfix も本番公開する通常の GitHub Release として扱います。

追加の PAT や GitHub App シークレットは不要です。自動作成 Release のイベントは別のワークフローを起動しないため、マージ後のワークフローから再利用可能なデプロイワークフローを直接呼びます。
手動で GitHub Releases を公開した場合も、従来どおりタグのコードをデプロイできます。

リポジトリ設定では Actions による PR 作成を許可し、`github-pages` 環境で `v*` タグからのデプロイを許可します。
自動 PR のコミットは `firstTimeFreeNow` 名義、GitHub 上の作成者は `github-actions[bot]` です。自動マージや自動承認は行いません。

公開先: https://firstTimeFreeNow.github.io/UDM/

GitHub Pages は静的ホスティングのため、サーバー実行が必要な API Routes、Server Actions、SSR は使えません。
画像は静的出力に合わせて最適化を無効にしています。`public/` の画像を参照する場合は `/UDM/` を含めてください。

## コミット名義

このチェックアウトでコミットする場合は `firstTimeFreeNow` の名前と GitHub の noreply メールを使用します。
GitHub 連携からのコミットは `firstTimeFreeNow` アカウントで作成します。

## 装備プランナー

`/UDM/equipment-planner/` で、装備条件との差分、強化手順、費用、資金ロードマップを計算します。トップページは機能一覧です。

- 対象18コンテンツ、19キャラの戦闘タイプに対応します。
- 現在装備から一段上の系列への差し替え案を自動提案し、現在構成と強化費用・週数を比較できます。提案後の編集と比較元への復元に対応します。
- アバター5部位の実数値を入力できます。セット対象の5部位を装備すると、各能力値＋10のボーナスを自動加算します。
- 称号は名前で検索・選択でき、補正を装備合計へ加算します。能力値の手入力にも対応します。
- 装備の基礎値（MR反映）・合成回数・インクリ回数を入力し、各強化枠のエンチャントを選択します。エンチャントの入力枠は追加・削除できます。エンチャントは装備上限で切り捨て、アビリティ等の任意加算は上限とは別枠で加算します。装備候補は選択したキャラクターに合わせて絞り込みます。
- アクィルス・インファーナル装備に対応します。カフス2枠とルナリアレリック左右各1枠のアビリティを選択し、実際の補正値を設定できます。
- 完成時期は今日からの年月と予定日で表示します。部位別チャートを期間・部位で絞り込み、実施順と開始日を調整できます。変更後の収入・支出・完成日を再計算します。
- 資金表・強化手順表はページ切替と表示件数の指定に対応します。SEED・ELSOの支出は別の列に表示します。
- エフェクトはレベルにかかわらず、強化上限255以上を選択候補に含めます。
- ELSO優先の支払い、週間収入・予算・繰越、臨時収入、所持品、20%割引を反映します。
- コア入力は任意です。レリック・カフスの育成費用と素材収集期間は計算しません。
- 入力はlocalStorageへ保存します。保存先は同じブラウザーで、サーバーへ送信しません。
- 未登録の手数料は、装備の費用・上限の詳細から入力します。

設計・計算例は [設計資料](docs/README.md) を参照してください。

```sh
pnpm run test:planner
```

## UI

shadcn/ui（Radix / Nova、neutral テーマ）を使用しています。
公式 CLI で生成したコンポーネントは `components/ui/`、設定は `components.json` にあります。
ボタン・カード・テキスト入力・ラベル・通知・バッジ・区切り線に利用しています。
