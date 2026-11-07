import { Panel } from "@/components/panel";
import { notFound } from "next/navigation";
import SessionStorageDemo from "@/components/session-storage-demo";

export const dynamicParams = false;
export function generateStaticParams() { return [{ slug: "alpha" }, { slug: "beta" }]; }

export default async function RoutePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "alpha" && slug !== "beta") notFound();
  return <><Panel title={<>ページ {slug === "alpha" ? "A" : "B"}</>}><p>ルートパラメーター：<code data-testid="route-slug">{slug}</code></p><a className="text-link" href={`/UDM/routing/${slug}/`} target="_blank" rel="noopener noreferrer">新しいタブで直接アクセス</a></Panel>
    <SessionStorageDemo />
  </>;
}
