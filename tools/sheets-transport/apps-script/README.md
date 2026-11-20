# 認証付きシート通信の検証用（未デプロイ）

本番用の完成APIではなく、通信方式を確認するための独立した検証コード。
既存のスクリプト・本番シート・トリガーへ追加しない。
このフォルダーには実在のID、認証情報、メンバー名を含めない。

## 何を検証するか

Next.jsから利用できる標準fetchクライアントを用意した。
IDトークンはPOST本文に入れ、Content-Typeはtext/plainを使う。
ブラウザーが応答を読めて、同じrequestIdのJSON応答を検証できた場合だけ成功扱いにする。
ContentServiceのリダイレクトを含む実際のGoogle環境でのCORS動作は未確認。
ローカルのモック試験だけで実接続できるとは判断しない。

## Google側の独立した試験環境

1. 匿名データ専用の新しいスプレッドシートと、独立したApps Scriptプロジェクトを用意する。
2. テストシートのタブ名をtransport_probeにし、以下だけを入力する。

| セル | 値 |
| --- | --- |
| A1 | UDM_TRANSPORT_PROBE_V1 |
| B1 | 数値の0 |
| C1 | 空欄 |
| A2 | demo-slot |
| B2 | no |
| C2 | 空欄 |

3. pnpm run compileで生成した、このフォルダーのdist/Code.gs・dist/appsscript.jsonを試験プロジェクトへ配置する。
4. Script Propertiesに次を設定する。実値をソースへ埋め込まない。

| キー | 値 |
| --- | --- |
| PROBE_SPREADSHEET_ID | 新規の匿名テストシートのID |
| PROBE_FIREBASE_WEB_API_KEY | 試験に使うFirebaseプロジェクトのWeb APIキー |
| PROBE_ALLOWED_UIDS_JSON | 許可する試験アカウントのUIDをキー、participant/adminを値にしたJSON |

実UIDはGoogle側の保護された設定だけに置く。パスワードやサービスアカウント鍵は不要。
Firebaseの参加者共通ログイン用アカウントと管理者Googleログインを試験に使う。
APIキーとIDトークンのプロジェクトが一致し、失効・期限切れ・無許可アカウントを拒否することも実測する。

5. Webアプリとして所有者の権限で実行し、Googleログインなしで到達できる設定にして試験する。
エンドポイント自体は到達可能になるが、すべてのデータ操作はFirebaseトークンと許可設定で保護する。
本番のスプレッドシートIDを設定しない。専用マーカーのないシートは処理を拒否する。

## クライアント

apps/web/lib/sheets-transport/client.tsのcreateProbeClientへ、試験用exec URLとgetIdToken関数を渡す。
getIdTokenはFirebase SDK等で取得した有効なトークンを返す。URL・ログ・アプリ独自ストレージへ保存しない。
read()、write({expectedRevision, value})、checkAdmin()だけを提供する。
リビジョンはread()の結果を使い、保存する値はyes/maybe/no/空文字のいずれか。

write()の通信失敗ではoutcomeUnknownがtrueとなる。保存が実行されていないとは断定しない。
自動再送はしない。再取得で確認し、再送する場合は同じrequestIdと本文を使う。
直近の保存リクエストだけをテストシートのC1に記録し、重複保存を防ぐ。
古いリクエストの再送はリビジョンで拒否する。これは本番の冪等性設計を確定する実装ではない。

## ローカル確認

Node.js 24で、リポジトリのルートから実行する。

```sh
pnpm run compile
node --test .build/tests/sheets-transport/transport.test.js
```

テストはApps ScriptのGoogleサービスを偽物に置き換え、ネットワークや本番シートへ接続しない。
ブラウザー試験はtools/sheets-transport/browser-check.tsのrunBrowserChecks(chromium, launchOptions)を使用する。既存EdgeならlaunchOptionsに{ channel: "msedge" }を渡せる。
Playwrightは実行環境から渡す方式とし、この検証のためにUDMの依存関係を変更しない。

## 実接続の合格条件

- UDMと同じオリジン条件で認証付きPOSTと応答読取ができる。
- Authorizationヘッダーや認証情報をURLに含める方式に変えずに動作する。
- 読み取り→保存→再読み取りでシートの値とリビジョンが一致する。
- HTMLログイン画面、CORS拒否、時間切れ、古いリビジョンを成功と扱わない。
- 参加者はprobe.adminを実行できず、許可された管理者だけ実行できる。
- 無許可・期限切れ・無効・別プロジェクトのトークンは拒否される。

ブラウザーからGoogleの応答を読めなければ、この直接fetch案は不採用とする。
no-corsによる確認不能な保存や、認証情報をURLへ入れる回避策は使わない。
