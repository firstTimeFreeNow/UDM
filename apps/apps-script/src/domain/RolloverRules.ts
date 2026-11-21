function afRolloverDue_(state: AfRolloverState, now: number, delayMinutes: number): boolean {
  if (state.pending) return true;
  if (state.selection === 'empty') return now >= state.deadline;
  if (state.selection !== 'confirmed' || !state.validCandidate || state.selectedAt === null)
    return false;
  return now >= state.selectedAt + delayMinutes * 60 * 1000;
}
