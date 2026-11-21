/** アフェティリアハード追加便 / bound Google Apps Script */
const AF = Object.freeze({
  spreadsheetId: PropertiesService.getScriptProperties().getProperty('AF_SPREADSHEET_ID'),
  main: '日程調整',
  members: '設定・メンバー',
  summary: '開催日程',
  responses: '回答データ',
  admin: '（管理者用）回答管理',
  history: '開催履歴',
  timezone: 'Asia/Tokyo',
  firstSlotRow: 7,
  lastSlotRow: 60,
  firstMemberRow: 14,
  memberCapacity: 12,
  minParticipants: 6,
  maxParticipants: 8,
  rolloverDelayMinutes: 120,
  cacheTtlSeconds: 90,
});

/** Opt-in device destinations; no member names, emails or UID associations. */
const AF_PUSH_PREFIX = 'AF_PUSH_DEVICE_';

const AF_PUSH_READY = 'AF_PUSH_READY';

const AF_PUSH_EVENT = 'AF_PUSH_EVENT';

const AF_PUSH_ERROR = 'AF_PUSH_LAST_ERROR';

const AF_PUSH_MAX_DEVICES = 100;

const AF_PUSH_MAX_AGE = 90 * 24 * 60 * 60 * 1000;
