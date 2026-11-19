import { calculateReplacements } from "./replacements";
import { CHARACTERS, CONTENTS, EQUIPMENT } from "./data";
import type { PlannerInput } from "./types";
self.onmessage = (event: MessageEvent<{ id: number; input: PlannerInput }>) => {
  const { id, input } = event.data;
  try {
    const character = CHARACTERS.find((c) => c.name === input.character)!;
    const stats = character.styles[input.style].stats;
    const content = CONTENTS.find((c) => c.id === input.contentId)!;
    const result = calculateReplacements(
      input,
      content,
      stats,
      EQUIPMENT,
      (done, total) => self.postMessage({ id, progress: { done, total } }),
    );
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "差し替え案の計算に失敗しました。",
    });
  }
};
export {};
