import type { Metadata } from "next";
import { Planner } from "@/components/planner/planner";
export const metadata: Metadata = { title: "装備条件・強化計画" };
export default function EquipmentPlannerPage() {
  return <Planner />;
}
