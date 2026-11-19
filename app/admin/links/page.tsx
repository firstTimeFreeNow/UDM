import type { Metadata } from "next";
import { ServiceProvider } from "@/components/afetiria/service-provider";
import { LinksManager } from "@/components/shared-links/links-manager";
export const metadata: Metadata = {title: "共有URLの管理", robots: {index:false,follow:false}};
export default function Page() {return <ServiceProvider service="links"><LinksManager/></ServiceProvider>;}
