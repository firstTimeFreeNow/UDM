import { notFound } from "next/navigation";
import SessionStorageDemo from "@/components/session-storage-demo";

export const dynamicParams = false;
export function generateStaticParams() { return [{ slug: "alpha" }, { slug: "beta" }]; }

export default async function RoutePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "alpha" && slug !== "beta") notFound();
  return <><section className="card"><h2>ページ {slug === "alpha" ? "A" : "B"}</h2><p>ルートパラメーター：<code data-testid="route-slug">{slug}</code></p><a href={`/UDM/routing/${slug}/`} target="_blank" rel="noopener noreferrer">新しいタブで直接アクセス</a></section>
    <SessionStorageDemo />
  </>;
}
