import { Panel } from "@/components/panel";
export default function RoutingPage() {
  return <Panel title={<>ルーティングの確認手順</>}><ol>
    <li>上のリンクからページ A・ページ B に移動し、パスと見出しが変わることを確認します。</li>
    <li>「戻る」「進む」でページ履歴を移動します。直前の履歴がない場合は移動しません。</li>
    <li>「クエリ付きページ B」でクエリ表示を確認します。</li>
    <li>ページ A・B で再読み込みし、同じページが表示されることを確認します。</li>
    <li>移動先の「新しいタブで直接アクセス」を開き、直接 URL からもページが表示されることを確認します。</li>
  </ol><h3>GitHub Pages での範囲</h3><p>ページ A・B は App Router の動的セグメント <code>[slug]</code> と <code>generateStaticParams</code> でビルド時に生成しています。公開後に任意の slug を追加してもページは存在しません。</p><p>未生成パス <a className="text-link" href="/UDM/routing/not-generated/" target="_blank" rel="noopener noreferrer">/routing/not-generated/</a> は 404 になります。新しいルートはビルド・デプロイが必要です。</p><a className="text-link" href="https://nextjs.org/docs/app/guides/static-exports">Next.js の静的出力の仕様</a></Panel>;
}
