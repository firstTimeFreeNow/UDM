function afCreateLinkService_(dependencies: {
  repository: AfLinkRepository;
  clock: AfClock;
  ids: AfIds;
}) {
  const { repository: repo, clock, ids } = dependencies;
  function list(): AfModels['LinkList'] {
    return {
      links: repo
        .all()
        .map(({ code, path, active, updatedAt }) => ({ code, path, active, updatedAt })),
    };
  }
  function create(payload: AfModels['CreateLinkRequest']): AfModels['LinkList'] {
    afAssert_(udmPath_(payload.path), 'INVALID_REQUEST');
    const links = repo.all();
    const code = payload.code || ids.uuid().replace(/-/g, '').slice(0, 8);
    afLinkCode_(code);
    afAssert_(links.length < 200, 'CAPACITY');
    afAssert_(!links.some((link) => link.code === code), 'DUPLICATE');
    repo.insert({ code, path: payload.path, active: true, updatedAt: clock.iso() }, links.length);
    return list();
  }
  return {
    list,
    create,
    resolve(payload: AfModels['ResolveLinkRequest']) {
      afLinkCode_(payload.code);
      const link = repo.all().find((item) => item.code === payload.code && item.active);
      afAssert_(link, 'NOT_FOUND');
      return { path: link.path };
    },
    update(payload: AfModels['UpdateLinkRequest']) {
      afAssert_(
        typeof payload.code === 'string' &&
          udmPath_(payload.path) &&
          typeof payload.active === 'boolean',
        'INVALID_REQUEST',
      );
      const link = repo.all().find((item) => item.code === payload.code);
      afAssert_(link, 'NOT_FOUND');
      afAssert_(
        link.path === payload.beforePath && link.active === payload.beforeActive,
        'CONFLICT',
      );
      repo.update(link.row, {
        code: link.code,
        path: payload.path,
        active: payload.active,
        updatedAt: clock.iso(),
      });
      return list();
    },
    share(payload: AfModels['ShareLinkRequest']) {
      afAssert_(udmPath_(payload.path), 'INVALID_REQUEST');
      const link =
        repo.all().find((item) => item.active && item.path === payload.path) ||
        create({ path: payload.path }).links.find(
          (item) => item.active && item.path === payload.path,
        )!;
      return { code: link.code, path: link.path };
    },
  };
}
