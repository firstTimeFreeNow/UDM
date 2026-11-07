# UDM

Next.js App Router / TypeScript を使った GitHub Pages 向けアプリです。

## 開発

Node.js 24 を使います。

```sh
npm ci
npm run dev
```

開発画面: http://localhost:3000/UDM/

```sh
npm run typecheck
npm run build
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
