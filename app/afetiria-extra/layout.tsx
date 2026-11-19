import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ServiceProvider } from "@/components/afetiria/service-provider";
export const metadata: Metadata = { title: "アフェティリアハード追加便", manifest: "/UDM/afetiria-extra/manifest.webmanifest", appleWebApp: {capable:true,title:"追加便"}, icons: {apple:"/UDM/afetiria-extra/icon-192.png"}, robots: {index: false, follow: false} };
export default function Layout({children}: {children: ReactNode}) {
  return <ServiceProvider>{children}</ServiceProvider>;
}
