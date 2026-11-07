import Link from "next/link";

export default function Home() {
  return <><h1>GitHub Pages 機能検証</h1><p>ブラウザー上の保存と、Next.js App Router の動作を確認できます。</p>
    <div className="grid"><section className="card"><h2>Session Storage</h2><p>保存・読出し・削除、再読み込みやページ移動後の保持を確認します。</p><Link className="button" href="/session-storage/">保存を検証する</Link></section>
    <section className="card"><h2>ルーティング</h2><p>ページ間の移動、戻る・進む、直接アクセス、再読み込みを確認します。</p><Link className="button" href="/routing/">ルーティングを検証する</Link></section></div>
    <section className="card"><h2>保存と公開の範囲</h2><p>Session Storage はブラウザーのタブ単位の保存です。GitHub のサーバーにデータは保存しません。</p><p>このサイトのルートはビルド時に HTML を生成して公開しています。任意の未生成 URL に対応するサーバー処理はありません。</p></section>
  </>;
}
