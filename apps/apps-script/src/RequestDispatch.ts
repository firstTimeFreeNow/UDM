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

function afDispatchRequest_(request: AfRequest) {
  afAssert_(
    typeof request.action === 'string' &&
      Object.prototype.hasOwnProperty.call(AF_ACTION_ACCESS, request.action),
    'INVALID_REQUEST',
  );
  if (request.action === 'udm.links.resolve') {
    return afWithLock_(function () {
      return udmLinkResolve_(request.payload);
    });
  }
  // Browser opt-in needs no account; token possession permits only that destination's settings.
  if (
    request.action === 'af.push.status' ||
    request.action === 'af.push.subscribe' ||
    request.action === 'af.push.unsubscribe'
  ) {
    const data = afWithLock_(function () {
      if (request.action === 'af.push.status') return afPushStatus_(request.payload);
      if (request.action === 'af.push.subscribe') return afPushSubscribe_(request.payload);
      return afPushUnsubscribe_(request.payload);
    });
    return data;
  }
  const role = afIdentity_(request.idToken);
  if (AF_ACTION_ACCESS[request.action] === 'admin') {
    afAssert_(role === 'admin', 'FORBIDDEN');
  }
  const data =
    request.action === 'af.session'
      ? { role: role }
      : afWithLock_(function () {
          if (request.action === 'af.push.test')
            return afPushTest_(request.payload, request.requestId);
          if (request.action === 'udm.links.share') return udmLinkShare_(request.payload);
          if (request.action === 'udm.links.list') return udmLinkList_();
          if (request.action === 'udm.links.create') return udmLinkCreate_(request.payload);
          if (request.action === 'udm.links.update') return udmLinkUpdate_(request.payload);
          afAssert_(!rolloverProperties_().getProperty('pendingRolloverWeek'), 'BUSY');
          if (request.action === 'af.history') return afHistory_(request.payload);
          const state = afState_();
          if (request.action === 'af.read') return state;
          afAssert_(request.payload.weekId === state.weekId, 'WEEK_CHANGED');
          switch (request.action) {
            case 'af.answers.save':
              return afSave_(request.payload, state);
            case 'af.members.add':
              afAddMember_(request.payload);
              break;
            case 'af.members.required':
              afRequired_(request.payload, state);
              break;
            case 'af.candidates.add':
              afAddSlot_(request.payload, state);
              break;
            case 'af.candidates.remove':
              afRemoveSlot_(request.payload, state);
              break;
            case 'af.confirm':
              afConfirm_(request.payload, state);
              break;
          }
          SpreadsheetApp.flush();
          afRefreshSelectedOption_();
          invalidateAnswerCache_();
          return afState_();
        });
  return data;
}
