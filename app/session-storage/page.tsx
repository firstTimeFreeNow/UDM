import SessionStorageDemo from "@/components/session-storage-demo";

export default function StoragePage() {
  return <><h1>Session Storage 検証</h1><p>同じタブでのページ移動・再読み込みをまたいでデータが残るか確認します。</p>
    <SessionStorageDemo />
    <section className="card"><h2>保持の確認手順</h2><ol>
      <li>テキストを入力して「保存」を押し、保存日時を確認します。</li>
      <li>「このページを再読み込み」を押します。同じ内容と保存日時が表示されれば保持できています。</li>
      <li>「別ページで保存内容を確認」で移動します。移動先でも同じデータを読み出せます。</li>
      <li>「独立した新しいタブで開く」を押します。新しいタブでは未保存になることを確認します。</li>
      <li>元のタブを閉じ、URL を新規タブに入力して開きます。通常は未保存になります。</li>
    </ol><p>タブの複製や「閉じたタブを復元」、ブラウザーのセッション復元では内容がコピー・復元されることがあります。新しいセッションの検証ではタブの複製・復元を使わないでください。</p>
    <p>長期保存や複数端末での共有には別の仕組みが必要です。ブラウザーの設定により保存が制限される場合はエラーを表示します。</p>
    <a href="https://developer.mozilla.org/ja/docs/Web/API/Window/sessionStorage">Session Storage の仕様（MDN）</a></section>
  </>;
}
