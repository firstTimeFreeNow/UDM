import type { Metadata } from "next";
import { ResolveLink } from "@/components/shared-links/resolve-link";
export const metadata: Metadata = {title: "共有URL", robots: {index:false,follow:false}};
export default function Page() {return <ResolveLink/>;}
