# アフェティリアのApps Script

`src/` を既存のスプレッドシートに紐付くApps ScriptのGit管理元とする。
初回取り込みは提供されたCode、AnswerDialog、CandidateDialog、マニフェスト。
Codeの実シートIDを`AF_SPREADSHEET_ID`プロパティ参照へ変更し、サンプル名を架空名にした。
CandidateDialogは提供内容と同じ処理を保ち、空白と改行を整理した。
Web APIの追加に合わせて、ScriptLockとScriptCacheを共用するよう変更した。
回答保存は既存ダイアログとWebで同じ保存本体を利用する。
最低人数は設定シートのB5を読み、未確定のまま終わった週は未開催で自動更新する。
週更新の履歴作成中断に備え、旧Document Propertiesの未完了マーカーも引き継ぐ。
Web版はNext.jsのReactコンポーネントとして実装する。これらのHTMLは既存シートのダイアログ用。

## 本番プロパティ

Apps Scriptのプロジェクト設定に保存する。GitやGitHub Actionsから上書きしない。

- `AF_SPREADSHEET_ID`: 本番のスプレッドシートID。
- `UDM_FIREBASE_WEB_API_KEY`: Firebase Web APIキー。
- `UDM_FIREBASE_PROJECT_ID`: Firebase設定のprojectId。トークンのaud/issを照合する。
- `UDM_ALLOWED_UIDS_JSON`: UIDとparticipant/adminの対応。

`PROBE_*`の設定と検証用コードは本番へ追加しない。
スクリプトID（コードを配置するプロジェクト）、スプレッドシートID（データ）、
デプロイID（公開する版とURL）は別の識別子。

## Web版の初回設定

コードの配置後、所有者がエディターから`initializeWebApp`を1回実行する。
「設定・メンバー」のD13をUDMメンバーIDという見出しにし、D14:D25へランダムなIDを設定する。
UDM共通の短縮URL対応表として「UDM共有リンク」タブも作成する。
名前の重複保存や参加者の個人アカウント追加は行わない。
既存のD列の使用は事前に確認済みだが、実行時にも見出し・ID形式・重複を検証する。
既存の値が入っていれば上書きせず停止する。再実行しても既存IDは維持する。
メンバーの並べ替えはID列を含む行全体で行い、通常の追加・必須設定はWebの管理画面を使う。

未完了の週更新がある場合は初期設定を停止する。
既存のcheckScheduleRolloverトリガーで処理が完了してから初期設定を再実行する。
トリガーの関数名は維持しており、追加で同じトリガーを作成しない。

初回Webアプリは「自分として実行」「全員がアクセス可能」で作成し、必要なGoogle権限を承認する。
すべてのデータ取得・更新はFirebaseトークンと許可UIDを照合する。
発行された本番のexec URLをNext.jsの`NEXT_PUBLIC_AF_API_URL`に設定する。
FirebaseのWeb設定4項目と同じく、GitHub Pagesのビルドでは同名のRepository Variablesを使う。
APIは`af.session`、`af.read`、`af.answers.save`、`af.history`と、管理者用の
メンバー追加・必須変更・候補追加削除・開催確定を提供する。
共通短縮URLは`udm.links.resolve/list/create/update`で処理する。
未認証で使えるのは短縮コードの解決だけで、転送先パス以外は返さない。
転送先はUDM内の正規パスに限定し、クエリー・外部URL・短縮ルートへの再転送は拒否する。
任意のシートIDや範囲の指定、クライアントが指定したroleでの権限取得は受け付けない。

## 初回のGoogle認可

1. https://script.google.com/home/usersettings でGoogle Apps Script APIを有効にする。
2. このリポジトリで`pnpm install --frozen-lockfile`を実行。
3. `pnpm exec clasp --auth .clasprc.json login`を実行し、所有者のGoogleアカウントで認可する。
4. `.clasprc.json`は秘密情報。チャット・Git・Actionsログには貼らない。

`.clasp.json`はGit除外。ローカルでは次の形式で作成する。

```json
{
  "scriptId": "本番Apps ScriptのスクリプトID",
  "rootDir": "integrations/apps-script/afetiria/src",
  "scriptExtensions": ["gs"]
}
```

Apps Script側で後から追加・変更したファイルは、初回反映前に取り込んで差分を確認する。
clasp pushはリモートのコード一式を置き換えるため、リポジトリにないファイルがあれば
自動化スクリプトは反映前に停止する。リモート側とローカル側のファイル名も揃える。

## GitHub Actions

リポジトリのSettings → Secrets and variables → Actionsで設定する。

| 種別 | 名前 | 値 |
| --- | --- | --- |
| Secret | `AF_CLASPRC_JSON` | clasp loginで作成された.clasprc.jsonの内容 |
| Variable | `AF_SCRIPT_ID` | 本番Apps ScriptのスクリプトID |
| Variable | `AF_DEPLOYMENT_ID` | 本番Webアプリの既存デプロイID。deployモードで必須 |
| Variable | `AF_APPS_SCRIPT_MODE` | `push`または`deploy`。省略時deploy |
| Variable | `AF_APPS_SCRIPT_ENABLED` | 準備完了後に`true` |

`Validate and deploy Apps Script`で、関連ファイルをmainへ反映すると自動実行する。
手動実行ではpush/deployを選べる。main以外から公開・反映は実行しない。
PRでは構文検証と自動テストだけを実行し、Googleの認証情報を渡さない。

- **push**: コードだけ反映。時間トリガーやシート内ダイアログは反映後のコードを使う。
- **deploy**: コードを反映し、新バージョンを作成して既存デプロイIDを更新。共有URLを維持する。

初回のWebアプリ作成・アクセス設定・新しい権限の承認はGoogle側で行う。
まだ本番Webアプリがなければ、最初はpushモードで設定し、Web API完成後に初回デプロイを行う。
コード反映と公開更新は別操作であり、公開更新だけ失敗した場合は「コード反映済み」と報告する。
Script Properties、共有設定、既存トリガーの作成・削除は自動化しない。
Googleの認可が失効した場合は再ログインしSecretを更新する。

## ローカル検証

```sh
node tools/apps-script/deploy.mjs validate
node --test tests/apps-script/*.test.mjs
```

ローカル反映でも同じスクリプトを使える。AF_SCRIPT_ID、CLASPRC_JSON、必要なら
AF_DEPLOYMENT_IDを環境変数で渡す。認証情報をシェルのコマンド引数に書かない。
実行は`node tools/apps-script/deploy.mjs push`または`deploy`。
一時ファイルに書いた認証情報は処理終了時に削除する。リモート取得内容も外部公開しない。

## 元に戻す

Web公開版だけなら、Googleの「デプロイを管理」で同じデプロイIDの版を以前の番号へ戻す。
時間トリガーやシートのダイアログも戻す場合は、Gitの修正をrevertしコードを再反映する。
公開版の変更だけでは、時間トリガーが使う最新コードは戻らない。

参考: [Google公式のclaspガイド](https://developers.google.com/apps-script/guides/clasp)、
[clasp 3.xのコマンド](https://github.com/google/clasp)、
[デプロイとバージョン](https://developers.google.com/apps-script/concepts/deployments)。

### 自動デプロイ時の公開設定

`src/appsscript.json` の `webapp.access` は `ANYONE_ANONYMOUS`、
`webapp.executeAs` は `USER_DEPLOYING` に固定する。
Webアプリ設定を省略したソースで版を作ると公開入口が失われるため、
デプロイ前検査でこの2項目の不足・不一致を拒否する。
Firebaseによる認証と参加者・管理者の権限判定はAPI内で継続する。
