/** Authorization and lock boundary shared by Web commands. No persistence details live here. */
const AF_ACTION_ACCESS: Record<AfAction, 'public' | 'participant' | 'admin'> = {
  'af.session': 'participant',
  'af.read': 'participant',
  'af.answers.save': 'participant',
  'af.history': 'participant',
  'af.members.add': 'admin',
  'af.members.required': 'admin',
  'af.candidates.add': 'admin',
  'af.candidates.remove': 'admin',
  'af.confirm': 'admin',
  'af.push.status': 'public',
  'af.push.subscribe': 'public',
  'af.push.unsubscribe': 'public',
  'af.push.test': 'admin',
  'udm.links.share': 'participant',
  'udm.links.resolve': 'public',
  'udm.links.list': 'admin',
  'udm.links.create': 'admin',
  'udm.links.update': 'admin',
};
function afCreateRequestHandler_(dependencies: {
  identity: AfIdentity;
  execution: AfExecution;
  schedule: ReturnType<typeof afCreateScheduleService_>;
  links: ReturnType<typeof afCreateLinkService_>;
  push: ReturnType<typeof afCreatePushService_>;
  history: (payload: AfPayloads['af.history']) => AfModels['History'];
}) {
  const { identity, execution, schedule, links, push, history } = dependencies;
  function execute(request: AfRequest): unknown {
    switch (request.action) {
      case 'udm.links.resolve':
        return links.resolve(request.payload);
      case 'udm.links.share':
        return links.share(request.payload);
      case 'udm.links.list':
        return links.list();
      case 'udm.links.create':
        return links.create(request.payload);
      case 'udm.links.update':
        return links.update(request.payload);
      case 'af.push.status':
        return push.status(request.payload);
      case 'af.push.subscribe':
        return push.subscribe(request.payload);
      case 'af.push.unsubscribe':
        return push.unsubscribe(request.payload);
      case 'af.push.test':
        return push.test(request.payload, request.requestId);
    }
    afAssert_(!schedule.pending(), 'BUSY');
    if (request.action === 'af.history') return history(request.payload);
    const state = schedule.read();
    if (request.action === 'af.read') return state;
    // Session is handled before entering this lock; keeping it explicit makes narrowing exhaustive.
    if (request.action === 'af.session') throw afError_('INVALID_REQUEST');
    afAssert_(request.payload.weekId === state.weekId, 'WEEK_CHANGED');
    switch (request.action) {
      case 'af.answers.save':
        return schedule.save(request.payload, state);
      case 'af.members.add':
        return schedule.addMember(request.payload);
      case 'af.members.required':
        return schedule.required(request.payload, state);
      case 'af.candidates.add':
        return schedule.addCandidate(request.payload, state);
      case 'af.candidates.remove':
        return schedule.removeCandidate(request.payload, state);
      case 'af.confirm':
        return schedule.confirm(request.payload, state);
    }
  }
  return {
    handle(request: AfRequest): unknown {
      afAssert_(
        typeof request.action === 'string' &&
          Object.prototype.hasOwnProperty.call(AF_ACTION_ACCESS, request.action),
        'INVALID_REQUEST',
      );
      const access = AF_ACTION_ACCESS[request.action];
      if (access === 'public') return execution.web(() => execute(request));
      const role = identity.role(request.idToken);
      if (access === 'admin') afAssert_(role === 'admin', 'FORBIDDEN');
      if (request.action === 'af.session') return { role };
      return execution.web(() => execute(request));
    },
  };
}
