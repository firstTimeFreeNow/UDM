/** Application Service: preserves archive-before-clear order and crash recovery markers. */
function afCreateRolloverService_(dependencies: {
  repository: AfRolloverRepository;
  execution: AfRolloverExecution;
  clock: AfClock;
  notifications: { checkSafe(): void };
  selection: { refresh(): void };
  cache: Pick<AfAnswerCache, 'invalidate'>;
  delayMinutes: number;
}) {
  const {
    repository: repo,
    execution,
    clock,
    notifications,
    selection,
    cache,
    delayMinutes,
  } = dependencies;
  return {
    check() {
      execution.run(() => {
        notifications.checkSafe();
        selection.refresh();
        const state = repo.state();
        if (!afRolloverDue_(state, clock.now(), delayMinutes)) return;
        const archiveWeek = state.pending || state.week;
        let archive = repo.archive(archiveWeek);
        if (!archive) {
          if (state.pending && state.week !== archiveWeek)
            throw new Error('未完了処理の履歴が見つかりません');
          const snapshot = repo.snapshot(state);
          repo.mark(archiveWeek);
          archive = repo.append(state, snapshot);
        }
        repo.mark(archiveWeek);
        const nextWeek = afAddDays_(archiveWeek, 7);
        // A previous execution may have completed writes but crashed before clearing the marker.
        if (state.week === nextWeek && state.selection === 'empty') {
          repo.finish();
          return;
        }
        repo.advance(archive.snapshot().candidates, nextWeek);
        repo.finish();
        cache.invalidate();
      });
    },
  };
}
