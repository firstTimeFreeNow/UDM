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
`main` への push でビルド・公開します。プルリクエストでは型チェックとビルドを実行します。

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
