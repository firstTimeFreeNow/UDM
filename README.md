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

## 機能検証

- `/UDM/session-storage/`: 保存・読出し・削除・再読み込み・新規タブの検証。自動チェックは独立した一時キーで API の動作を確認します。
- `/UDM/routing/`: App Router の遷移、履歴、クエリ、ドキュメント ID の比較。
- `/UDM/routing/alpha/`, `/UDM/routing/beta/`: `generateStaticParams` で生成した動的セグメント。直接アクセス・リロードと、別ページから同じ Session Storage を確認できます。
- 未生成の `/UDM/routing/not-generated/` は 404 です。

Session Storage は同一オリジン・同一タブのセッション内の保存です。通常のタブ終了で破棄されますが、タブの複製・復元ではコピーや復元が発生する場合があります。サーバーへの保存や長期保存ではありません。

## UI

shadcn/ui（Radix / Nova、neutral テーマ）を使用しています。
公式 CLI で生成したコンポーネントは `components/ui/`、設定は `components.json` にあります。
ボタン・カード・テキスト入力・ラベル・通知・バッジ・区切り線に利用しています。
