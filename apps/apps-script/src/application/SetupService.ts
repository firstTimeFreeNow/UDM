/** Initialization uses the same application boundary as normal operations. */
function afCreateSetupService_(dependencies: {
  repository: AfSetupRepository;
  push: AfPushRepository;
  delivery: AfPushSetup;
  week: AfWeekStatus;
  ids: AfIds;
  cache: Pick<AfAnswerCache, 'invalidate'>;
}) {
  const { repository: repo, push, delivery, week, ids, cache } = dependencies;
  return {
    web() {
      afAssert_(!week.pending(), 'BUSY');
      const seen = new Set<string>();
      const values = repo.identities().map((row) => {
        if (row.id !== '')
          afAssert_(
            typeof row.id === 'string' && /^m_[a-f0-9-]{36}$/.test(row.id),
            'CONFIG_REQUIRED',
          );
        const id = row.name && !row.id ? 'm_' + ids.uuid() : (row.id as string);
        if (id) {
          afAssert_(!seen.has(id), 'CONFIG_REQUIRED');
          seen.add(id);
        }
        return id;
      });
      repo.saveIdentities(values);
      repo.initializeLinks();
      repo.flush();
      cache.invalidate();
    },
    notifications() {
      const result = delivery.validate();
      if (!result.accepted)
        throw new Error(
          'FCMの送信権限を確認できません（HTTP ' +
            result.httpStatus +
            '）。Firebase Cloud Messaging APIと、実行アカウントのFirebaseプロジェクト権限を確認してください。',
        );
      if (!push.ready()) {
        const current = push.current();
        push.saveEvent({ key: current.key, id: '', weekId: current.weekId, slot: current.slot });
      }
      delivery.activate();
      push.error(false);
      return { ready: true };
    },
  };
}
