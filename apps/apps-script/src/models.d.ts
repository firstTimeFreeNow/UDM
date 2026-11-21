type AfModels = import('../../../packages/contracts/generated/api.ts').components['schemas'];

type AfOperation =
  (typeof import('../../../packages/contracts/generated/operations.ts').operations)[number];
type AfAction = Exclude<AfOperation['action'], null>;
type AfErrorCode = AfModels['ErrorCode'];
type AfPayloads = {
  'af.session': Record<string, unknown>;
  'af.read': { view?: string; memberId?: string; fresh?: boolean };
  'af.history': { offset?: number };
  'af.answers.save': AfModels['SaveAnswersRequest'];
  'af.members.add': AfModels['AddMemberRequest'];
  'af.members.required': AfModels['RequiredMemberRequest'];
  'af.candidates.add': AfModels['AddCandidateRequest'];
  'af.candidates.remove': AfModels['RemoveCandidateRequest'];
  'af.confirm': AfModels['ConfirmRequest'];
  'af.push.status': { token?: string };
  'af.push.subscribe': AfModels['PushTokenRequest'] & { previousToken?: string };
  'af.push.unsubscribe': AfModels['PushTokenRequest'];
  'af.push.test': AfModels['PushTestRequest'];
  'udm.links.share': AfModels['ShareLinkRequest'];
  'udm.links.resolve': AfModels['ResolveLinkRequest'];
  'udm.links.list': Record<string, unknown>;
  'udm.links.create': AfModels['CreateLinkRequest'];
  'udm.links.update': AfModels['UpdateLinkRequest'];
};
type AfRequest = {
  [Action in AfAction]: {
    version: 1;
    requestId: string;
    action: Action;
    payload: AfPayloads[Action];
    idToken?: string;
    bff?: { issuedAt: number; nonce: string; signature: string };
  };
}[AfAction];
type AfSheetMember = { name: string; required: boolean; active: boolean; index: number };
type AfSheetSlot = { row: number; date: string; time: string; key: string };
type AfAnswerContext = {
  weekId: string;
  members: AfSheetMember[];
  slots: AfSheetSlot[];
  grid: any[][];
  minParticipants: number;
};
type AfAnswerData = {
  weekId: string;
  members: Pick<AfSheetMember, 'name' | 'required'>[];
  slots: (AfSheetSlot & Pick<AfModels['Slot'], 'count' | 'judgment'>)[];
  answers: Record<string, Record<string, AfModels['Answer']>>;
  metrics: { serverMs: number };
};
type AfSheetSaveRequest = {
  weekId: string;
  member: string;
  changes: Pick<AfModels['Change'], 'slot' | 'answer'>[];
};
type AfSheetSaveResult = { success: boolean; savedCount: number; serverMs: number };
type AfStoredDevice = {
  token: string;
  updatedAt: number;
  lastEvent?: string;
  attempts?: number;
  attemptEvent?: string;
};
type AfPushDevice = Required<AfStoredDevice> & { key: string };
type AfPushEvent = { key: string; id: string; weekId: string; slot: string; changed?: boolean };
type AfPushMemo = { requestId: string; fingerprint: string; result?: AfModels['PushTestResult'] };
type AfFcmMessage = {
  token?: string;
  topic?: string;
  data: Record<string, string>;
  webpush?: { headers: Record<string, string> };
};
type AfFcmRequest = GoogleAppsScript.URL_Fetch.URLFetchRequest & { url: string; payload: string };
type AfPushAttempt = {
  at: string;
  project: string;
  httpStatus: number;
  validateOnly: boolean;
  messageId: string | null;
  accepted: boolean;
  errorCode: string | null;
};

type AfRolloverSnapshot = {
  weekId: string;
  candidates: AfSheetSlot[];
  members: any[][];
  responses: any[][];
  confirmedDateTime: string | null;
};
