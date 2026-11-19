import type { ReactNode } from "react";
import { ServiceProvider } from "@/components/afetiria/service-provider";
export default function Layout({children}: {children: ReactNode}) {
  return <ServiceProvider>{children}</ServiceProvider>;
}
