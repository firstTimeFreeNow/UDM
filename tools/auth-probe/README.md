# ローカルの認証確認画面

UDMの公開ページへ追加せず、ローカルの専用HTTPサーバーでFirebase認証を確認する。
SDKは公式CDNの13.4.0（確認時の公式手順記載バージョン）を使用し、Analyticsを初期化しない。

```sh
node tools/auth-probe/server.mjs
```

.env.localの認証用4項目を読み、localhostだけで待ち受ける。起動時にURLを表示する。
指定した4つのルート以外は配信しない。.env.localやリポジトリのファイル一覧は配信しない。
config.jsonではFirebaseのブラウザー用設定4項目のみを返し、実値をソースへ固定しない。

共通メールアドレスとパスワードをブラウザー画面へ入力する。チャットやコマンド引数に送らない。
パスワードはFirebase SDKへ渡し、処理後に入力欄を空にする。
Firebaseのブラウザー永続化を使用し、アプリ独自のパスワード・トークン保存は行わない。
別名のFirebase Appを使い、将来の本番アプリと検証用の認証状態を分ける。
認証の成功は管理者権限の付与を意味しない。許可アカウントはバックエンドが別途検証する。

確認する項目:

1. 共通アカウントでログインできる。
2. 再読み込み後にログイン状態が戻る。
3. ログアウトでき、再読み込み後も未ログインになる。
4. Googleログインのポップアップで認証できる。

GoogleログインにはFirebase Authenticationの承認済みドメインにlocalhostの登録が必要。
シート通信の検証は、別途用意する匿名Apps Scriptのexec URLを画面へ入力して実行できる。
本番シートのURLは接続先として使わない。

Windowsの同梱ランタイム等で.env.localを直接参照できない場合は、--config-stdinで環境設定JSONを標準入力から渡せる。
実値をコマンド引数や起動ログへ出力しない。

## 自動確認

browser-check.mjsのrunAuthBrowserChecks(chromium, baseUrl, launchOptions)へ、
実行環境のPlaywrightと起動済みのローカルURLを渡す。
実SDKの初期化だけを実設定で行い、ログイン操作の試験は偽SDKと匿名アカウントで行う。
本番の共通パスワードや実Googleアカウントの操作は自動試験に使わない。

Googleポップアップの実SDK確認はgoogle-popup-check.mjsのrunGooglePopupCheckで行う。
アカウントを入力せず、Googleの初期画面まで到達することとCSP違反がないことだけを確認する。
サーバーのscript-srcにはwww.gstatic.comとapis.google.comを許可する。
起動URLを維持したい場合は--port=<番号>を指定できる。
