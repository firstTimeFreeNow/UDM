# UDM

Next.js のWebアプリ、Go のBFF、Google Apps Scriptを管理するpnpm workspaceです。

## 構成

| ディレクトリ | 内容 |
| --- | --- |
| `apps/web` | Next.js。GitHub Pages向けの静的サイト |
| `apps/bff` | Go HTTPサーバー（Cloud Run） |
| `apps/apps-script` | スプレッドシート連携のApps Script |
| `packages/contracts` | アプリ間で共有する型・検証・通信定義 |
| `tools` | デプロイ・開発用スクリプト |
| `tests` | 計算処理・API・デプロイ処理のテスト |

## 開発

Node.js 24、pnpm 12.18.0、Go 1.27.4を使用します。

```sh
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Web: http://localhost:3000/UDM/

```sh
pnpm dev:bff
pnpm typecheck
pnpm test
pnpm build
pnpm build:bff
pnpm check:apps-script
```

Webの静的出力先は `apps/web/out/`、BFFのバイナリ出力先は `apps/bff/dist/` です。
環境設定は各アプリ内に置きます。設定値・認証情報はGitに含めません。

## デプロイ

| 対象 | GitHub Actions | 実行条件 |
| --- | --- | --- |
| Web | `deploy.yml` | 公開リリース、またはリリース用ワークフローから呼び出し |
| BFF | `bff.yml` | 対象ファイルのmainへのpush、または手動実行 |
| Apps Script | `apps-script.yml` | 対象ファイルのmainへのpush、または手動実行 |

BFFとApps Scriptの自動デプロイには、対応するRepository variablesの有効化設定が必要です。
ローカルからのデプロイは `pnpm deploy:bff`、`pnpm deploy:apps-script` を使用します。
バージョンはルートの `RELEASE` で管理します。
