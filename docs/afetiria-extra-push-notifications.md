# 開催確定のプッシュ通知

## 仕様

開催状況に端末ごとの通知設定と受信条件を表示する。
通知は明示的なボタン操作とブラウザーの許可で有効にする。閲覧だけで許可を要求しない。
Webの開催確定では保存後に配信し、シート直接編集は既存のcheckScheduleRollover（5分間隔）で検出する。
確定日時の変更も新しい通知イベントになる。初期設定以前の確定日時を遡って配信しない。
同じ確定イベントを配信済みの端末に繰り返し送信しない。未配信端末は次回チェックで再試行する。
FCMの受け付けは端末到達の保証ではない。サーバー処理中断が送信成功と記録の間に起きた場合の
厳密なexactly-onceは保証しないが、同じ通知イベントのtagを使い端末での重複表示を抑える。
失敗はイベント・端末ごとに最大5回。失効したFCM登録は削除し、新しい確定イベントでは再試行枠を戻す。
開催開始後の通知送信は行わず、配信TTLも開始まで・上限1時間とする。
配信失敗を理由に開催日時の保存を取り消さない。失敗時は通知設定欄に配信障害を表示する。
1回に最大20端末を配信し、残りは既存トリガーで処理する。

## 保存先とAPI

通知先はScript PropertiesのAF_PUSH_DEVICE_<SHA256>に保存する。
保存項目はFCMトークン、最終登録日時、配信済みイベント、試行回数と対象イベント。
名前・メールアドレス・Firebase UID・IPアドレスは紐付けない。
100端末を上限とし、最終登録から90日経過した通知先はチェック時に削除する。
FCMトークンは通知先識別子なので公開コードやログに出さない。
AF_PUSH_READY、AF_PUSH_EVENT、AF_PUSH_LAST_ERRORも内部状態として自動管理し、手動設定しない。
既存のシート構成や既存の設定キーは変更しない。新たな管理シートも作成しない。

参加者と管理者がaf.push.status / subscribe / unsubscribeを利用できる。
全操作に既存Firebase認証と許可UID確認を適用し、一覧APIは設けない。
ブラウザーのFCMトークンはlocalStorageに保存し、再訪時に更新・再登録する。
ブラウザーの登録は共通アカウントの個人識別には使わない。
ログアウト時には自動解除しない。停止は開催状況の「通知を停止」かサイトデータ削除で行う。
サイトデータ削除後の古い通知先はFCM失効の検出または90日の保持期限で削除する。

## 配信・受信

既存のFirebaseプロジェクトのFCM HTTP v1とApps Scriptを使う。Cloud Functionsや課金DBは追加しない。
所有者のScriptApp.getOAuthTokenで送信するため、サービスアカウント秘密鍵を保管しない。
FCM通知はdataペイロードだけで送り、専用Service Workerが画面の表示状態によらず通知を表示する。
Service Workerはfetchの横取り・ページキャッシュを行わず、スコープを/UDM/afetiria-extra/に限定する。
通知を押すと同じホストの開催状況を開く。ペイロードから外部URLを開くことはない。
本番HTTPSが受信の前提。localhostでの設定は本番ホストの設定と共有しない。
iOS/iPadOS 16.4以降はホーム画面に追加したWebアプリから許可する。
OSの集中モード・通知設定・省電力やブラウザーの停止状態によって配信が遅延・抑止される場合がある。

## 追加する設定（既存キーの改名なし）

GitHub → Settings → Secrets and variables → Actions → Variables → Repository variables:

- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: FirebaseConfig.messagingSenderId。
- NEXT_PUBLIC_FIREBASE_VAPID_KEY: Firebase Console → プロジェクトの設定 → Cloud Messaging → ウェブ構成 → ウェブプッシュ証明書で生成する公開鍵。

両方とも公開設定でありRepository secretsには置かない。秘密鍵の貼り付けは不要。
ローカルの.env.localには同じ公開値を設定する。

appsscript.jsonに既存機能の4スコープと通知用の1スコープを明記する:

- https://www.googleapis.com/auth/spreadsheets
- https://www.googleapis.com/auth/script.container.ui
- https://www.googleapis.com/auth/script.scriptapp
- https://www.googleapis.com/auth/script.external_request
- https://www.googleapis.com/auth/firebase.messaging（今回追加する送信権限）

追加承認前に本番の公開版へ切り替えない。
所有者のGoogleアカウントでApps ScriptエディターのPushNotifications.gsを開き、
関数initializePushNotificationsを選んで実行し、通知送信の追加権限を承認する。
関数はFCMにvalidate_onlyで問い合わせ、実際の通知は送らない。
FCM APIが無効の場合はFirebaseプロジェクトのFirebase Cloud Messaging APIを有効化する。
実行者には対象FirebaseプロジェクトのFCM送信権限が必要（現在の所有者アカウントで実行）。
成功後に既存デプロイIDを更新して本番APIへ反映する。URL変更は不要。
AF_CLASPRC_JSONの差し替えや既存のFirebase認証キーの変更は不要。

## 検証

ローカル試験は匿名のFCM応答と端末識別子を使う。
実端末での初回登録と、画面を閉じた状態での通知受信は所有者の設定・承認後に検証する。
本番の開催日時を試験のために変更したり、参加者へテスト通知を一斉配信したりしない。

## 公式資料

- https://firebase.google.com/pricing
- https://firebase.google.com/docs/cloud-messaging/web/get-started
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
- https://firebase.blog/posts/2023/08/fcm-for-safari/
- https://developers.google.com/apps-script/reference/script/script-app#getOAuthToken()

## 初回登録エラーの修正

Chrome/Edgeでcustom Service Workerのregister()直後にactive=null、installing=installingとなることを実測した。
Firebase SDKは独自に渡したServiceWorkerRegistrationの起動完了を待たないため、
アプリ側でactivatedになるまで待ってからgetTokenへ進むよう修正した。
認証用Firebaseアプリが設定変更前から存在する場合も送信者IDが欠けないよう、
通知用Firebaseアプリは現在の公開設定から別名で初期化する。
失敗時は起動待ち・端末登録・許可を区別し、既知のエラーコードだけを表示する。
生の例外文・トークン・FCM応答は画面に出さない。
保存項目・保持期限・ポーリング間隔の説明はユーザー要望により製品画面から削除し、設計書に残す。
実ブラウザーでのFCM登録成功・受信の確認は継続中。

## 管理者の即時テスト送信

管理画面にタイトル（80文字まで）と本文（500文字まで、改行可）の入力欄を追加。
通知登録済みの全端末へaf.push.testで即時送信する。APIでも管理者権限を検証する。
開催日時・回答・自動通知のイベント状態は変更しない。
送信結果はFCMの受付・失敗・失効の件数として返し、端末への到着確認とは区別する。
結果不明時の自動再送は行わない。同じリクエストIDの直近結果を再利用し、
送信中断後の同一リクエストの再実行を拒否する。
任意のタイトル・本文そのものはScript Propertiesに保存しない。
既存設定・追加承認の変更は不要。実参加者へのテスト送信は利用者が管理画面で実施する。

通常の自動通知のタイトルは「アフェティリアハード追加便」のまま。
初回確定の本文は「YYYY-MM-DD HH:MM の開催が決まりました。」、
同一週内で確定日時が変わった場合は「YYYY-MM-DD HH:MM の開催が変更されました」とする。
