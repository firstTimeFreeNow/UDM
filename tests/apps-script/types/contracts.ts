// Compile-only regression checks: these errors must remain visible through the shared models.
type AfAssertFalse<T extends false> = T;
type AfIsAny<T> = 0 extends (1 & T) ? true : false;
type AfScheduleIsTyped = AfAssertFalse<AfIsAny<AfModels['Schedule']>>;
type AfActionsAreTyped = AfAssertFalse<AfIsAny<AfAction>>;

function afCheckContractTypesOnly_(schedule: AfModels['Schedule']) {
    // @ts-expect-error Answers are the shared enumeration, not arbitrary strings.
    const answer: AfModels['Answer'] = 'yes';
    // @ts-expect-error The saved member is identified by memberId.
    afSave_({weekId: '2026-11-16', member: 'Demo', changes: []}, schedule);
    // @ts-expect-error An update must carry the original required flag for conflict detection.
    afRequired_({weekId: '2026-11-16', memberId: 'fixture', required: true}, schedule);
    // @ts-expect-error Typed requests associate an action with its own payload.
    const request: AfRequest = {version: 1, requestId: 'fixture_id', action: 'af.members.add', payload: {token: 'device'}};
    return {answer, request};
}
