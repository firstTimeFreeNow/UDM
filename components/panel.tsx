import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Panel({ title, children, "aria-label": label }: { title: ReactNode; children: ReactNode; "aria-label"?: string }) {
  return <Card className="min-w-0" role={label ? "region" : undefined} aria-label={label}>
    <CardHeader><CardTitle><h2>{title}</h2></CardTitle></CardHeader>
    <CardContent>{children}</CardContent>
  </Card>;
}
