import { calculate } from "./engine";
import { EQUIPMENT } from "./data";
import type { Content, PlannerInput, Stat } from "./types";
self.onmessage = (
  event: MessageEvent<{
    id: number;
    input: PlannerInput;
    content: Content;
    stats: Stat[];
  }>,
) => {
  const { id, input, content, stats } = event.data;
  try {
    self.postMessage({
      id,
      result: calculate(input, content, stats, EQUIPMENT),
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "計算に失敗しました",
    });
  }
};
export {};
