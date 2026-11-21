/** Application-owned ports. No Google service objects cross these boundaries. */
interface AfScheduleRepository {
  read(): AfModels['Schedule'];
  answerContext(): AfAnswerContext;
  answerSettings(): { weekId: string | null; members: AfSheetMember[] };
  slots(): AfSheetSlot[];
  currentWeek(): string;
  candidateWindow(): { weekId: string; end: string };
  candidateAnswers(row: number): unknown[];
  unusedCandidate(slots?: AfSheetSlot[]): number | null;
  writeAnswers(
    memberIndex: number,
    slots: AfSheetSlot[],
    updates: Map<string, AfModels['Answer']>,
  ): number;
  memberRows(): (AfMemberRecord & { hasAnswers: boolean })[];
  insertMember(index: number, member: AfMemberRecord): void;
  setRequired(memberId: string, required: boolean): void;
  insertCandidate(row: number, date: string, time: string): void;
  removeCandidate(row: number): void;
  confirm(slot: AfModels['Slot']): void;
  refreshSelection(): void;
  flush(): void;
}
interface AfWeekStatus {
  pending(): boolean;
}
interface AfAnswerCache {
  get(): AfAnswerData | null;
  put(data: AfAnswerData): void;
  invalidate(): void;
}
interface AfClock {
  now(): number;
  iso(): string;
}
interface AfIds {
  uuid(): string;
}
interface AfScheduleEffects {
  confirmed(): void;
}
interface AfExecution {
  web<T>(operation: () => T): T;
}
interface AfIdentity {
  role(idToken?: string): 'admin' | 'participant';
}
interface AfLinkRepository {
  all(): AfLinkRecord[];
  insert(link: AfModels['SharedLink'], index: number): void;
  update(row: number, link: AfModels['SharedLink']): void;
}
interface AfLoginInfoRepository {
  checkBoundSheet(): void;
  value(key: string): string;
}
interface AfPushRepository {
  ready(): boolean;
  issue(): boolean;
  event(): AfPushEvent | null;
  saveEvent(event: AfPushEvent): void;
  memo(): AfPushMemo | null;
  saveMemo(memo: AfPushMemo): void;
  device(token: string): AfStoredDevice | null;
  saveDevice(key: string, device: AfStoredDevice): void;
  removeDevice(key: string): void;
  devices(): AfPushDevice[];
  deviceKey(token: string): string;
  fingerprint(title: string, body: string): string;
  current(): AfPushCurrent;
  error(failed: boolean): void;
}
interface AfPushDelivery {
  validate(token: string): boolean;
  send(messages: AfFcmMessage[]): { accepted: boolean; expired: boolean }[];
}
interface AfRolloverRepository {
  state(): AfRolloverState;
  archive(archiveWeek: string): AfWeekArchive | null;
  snapshot(state: AfRolloverState): AfRolloverSnapshot;
  mark(week: string): void;
  append(state: AfRolloverState, snapshot: AfRolloverSnapshot): AfWeekArchive;
  advance(candidates: AfSheetSlot[], nextWeek: string): void;
  finish(): void;
}
interface AfRolloverExecution {
  run(operation: () => void): void;
}
interface AfSetupRepository {
  identities(): { name: unknown; id: unknown }[];
  saveIdentities(ids: string[]): void;
  initializeLinks(): void;
  flush(): void;
}
interface AfPushSetup {
  validate(): { accepted: boolean; httpStatus: number };
  activate(): void;
}
interface AfHistoryRepository {
  page(offset: number, limit: number): { items: AfModels['History']['items']; total: number };
}
