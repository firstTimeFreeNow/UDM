import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import styles from "@/components/afetiria/afetiria.module.css";

const notoSans = localFont({
  src: "./fonts/NotoSansJP-Variable.woff2",
  variable: "--af-font",
  weight: "100 900",
  display: "swap",
  preload: false,
});
export const metadata: Metadata = {
  title: "アフェティリアハード追加便",
  manifest: "/UDM/afetiria-extra/manifest.webmanifest",
  appleWebApp: { capable: true, title: "追加便" },
  icons: { apple: "/UDM/afetiria-extra/icon-192.png" },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${notoSans.variable} ${styles.page}`}>{children}</div>
  );
}
