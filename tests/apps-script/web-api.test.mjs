import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import {signRequest} from '../../packages/contracts/src/signature.mjs';
import { isSchedule, isHistory } from '../../packages/contracts/src/afetiria.ts';
import { isInternalPath } from '../../packages/contracts/src/shared-links.ts';

process.env.TZ = 'Asia/Tokyo';
const code = await readFile(new URL('../../apps/apps-script/src/main.gs', import.meta.url), 'utf8');
const api = await readFile(new URL('../../apps/apps-script/src/WebApi.gs', import.meta.url), 'utf8');
const push = await readFile(new URL('../../apps/apps-script/src/PushNotifications.gs', import.meta.url), 'utf8');
const links = await readFile(new URL('../../apps/apps-script/src/SharedLinks.gs', import.meta.url), 'utf8');
const id = n => `m_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const names = ['設定・メンバー', '日程調整', '開催日程', '（管理者用）回答管理', '開催履歴', 'UDM共有リンク'];
function fixture({ count = 8, required = false, sheetId = 'fixture-sheet' } = {}) {
  const writes = [];
  const sheets = new Map();
  let reads = 0;
  for (const name of names) {
    const grid = Array.from({length: 100}, () => Array(26).fill(''));
    const formulas = new Map();
    const sheet = { grid, formulas, getRange(...args) {
      reads++;
      let [row, col, height = 1, width = 1] = args;
      if (typeof row === 'string') {
        const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(row);
        const column = text => [...text].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
        col = column(match[1]); row = Number(match[2]);
        if (match[3]) {height = Number(match[4]) - row + 1; width = column(match[3]) - col + 1;}
      }
      const range = {
        getValues: () => grid.slice(row-1, row-1+height).map(values => values.slice(col-1, col-1+width)),
        getValue: () => grid[row-1][col-1],
        setValues(values) { assert.equal(values.length, height); values.forEach((values, index) => {
          assert.equal(values.length, width); values.forEach((value, column) => {grid[row-1+index][col-1+column] = value;});
        }); writes.push({name, row, col, height, width}); return range; },
        setValue(value) { return range.setValues([[value]]); },
        clearContent() {return range.setValues(Array.from({length: height}, () => Array(width).fill('')));},
        isBlank: () => range.getValues().every(values => values.every(value => value === '')),
        getFormulas: () => Array.from({length: height}, (_, i) => Array.from({length: width}, (_, j) => formulas.get(`${row+i}:${col+j}`) || '')),
        setNumberFormat: () => range,
      };
      return range;
    }, getLastRow() { let last = grid.length; while (last > 0 && grid[last-1].every(value => value === '')) last--; return last; },
    appendRow(values) { sheet.getRange(sheet.getLastRow()+1, 1, 1, values.length).setValues([values]); } };
    sheets.set(name, sheet);
  }
  const set = (sheet, cell, value) => sheets.get(sheet).getRange(cell).setValue(value);
  for (let row=0; row<3; row++) sheets.get('開催履歴').grid[row][0]='header';
  sheets.get('UDM共有リンク').grid[0].splice(0,4,'code','path','active','updatedAt');
  set('設定・メンバー', 'B3', new Date('2026-11-16T00:00:00+09:00'));
  set('設定・メンバー', 'B4', new Date('2026-11-22T00:00:00+09:00'));
  set('設定・メンバー', 'B5', 6);
  for (let i=0; i<count; i++) {
    sheets.get('設定・メンバー').grid[13+i].splice(0,4,`Demo ${i+1}`, required && i===0, true, id(i+1));
    sheets.get('（管理者用）回答管理').grid[4][2+i]='○';
  }
  set('日程調整', 'A7', new Date('2026-11-16T00:00:00+09:00'));
  set('日程調整', 'B7', new Date('1899-12-30T21:30:00+09:00'));
  const values = new Map([['AF_SPREADSHEET_ID',sheetId], ['UDM_FIREBASE_WEB_API_KEY','fixture-key'],
    ['UDM_FIREBASE_PROJECT_ID','fixture-project'],
    ['UDM_ALLOWED_UIDS_JSON', JSON.stringify({participant: 'participant', admin: 'admin'})]]);
  const properties = { getProperty: key => values.get(key) ?? null, setProperty: (key, value) => values.set(key,value), deleteProperty: key => values.delete(key), getProperties: () => Object.fromEntries(values) };
  let locked = false;
  const sent=[]; const sendResults=[]; const registrationChecks=[]; const registrationResults=[];
  const fcmResponse = code => ({getResponseCode: () => code, getContentText: () => JSON.stringify(code===200 ? {name:'projects/fixture-project/messages/message_123'} : code===404 ? {error:{details:[{errorCode:'UNREGISTERED'}]}} : {})});
  const context = vm.createContext({ Date, Set, Map, Number, JSON, Object, console: {log(){}, warn(){}},
    ScriptApp: {getOAuthToken: () => 'private-owner-access-token'},
    PropertiesService: {getScriptProperties: () => properties, getDocumentProperties: () => ({getProperty: () => null})},
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getId: () => 'fixture-sheet', getSheetByName: name => sheets.get(name)}), flush(){}},
    LockService: {getScriptLock: () => ({tryLock() {assert.equal(locked,false, 'nested script lock'); locked=true; return true;}, releaseLock(){locked=false;}})},
    CacheService: {getScriptCache: () => ({get: () => null, put(){}, remove(){}})},
    Utilities: {getUuid: randomUUID, DigestAlgorithm:{SHA_256:'sha256'}, Charset:{UTF_8:'utf8'}, computeHmacSha256Signature:(value,secret)=>[...createHmac('sha256',secret).update(value).digest()], computeDigest: (_algorithm,value) => [...createHash('sha256').update(value).digest()], base64DecodeWebSafe: value => Buffer.from(value,'base64url'), newBlob: value => ({getDataAsString: () => value.toString('utf8')}), formatDate(date, _zone, pattern) {
      const parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
      if (pattern === 'yyyy-MM-dd') return parts.slice(0,10);
      if (pattern === 'HH:mm') return parts.slice(11,16);
      return parts.slice(0,16);
    }},
    UrlFetchApp: {fetchAll(requests) {sent.push(...requests.map(request => JSON.parse(request.payload)));return requests.map(() => fcmResponse(sendResults.shift() || 200));}, fetch(_url, options) {if (_url.startsWith('https://fcm.googleapis.com/')) {const message=JSON.parse(options.payload);if (message.validate_only && message.message.data?.type==='registration-check') {registrationChecks.push({url:_url,...message});return fcmResponse(registrationResults.shift() || 200);} sent.push(message);return fcmResponse(sendResults.shift() || 200);} const token=JSON.parse(options.payload).idToken;
      const uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub; return {
      getResponseCode: () => ['participant','admin','outsider'].includes(uid) ? 200 : 400,
      getContentText: () => JSON.stringify({users:[{localId:uid}]}),
    };}},
    ContentService: {MimeType:{JSON:'json'}, createTextOutput: value => ({setMimeType: () => JSON.parse(value)})},
  });
  vm.runInContext(code+'\n'+api+'\n'+links+'\n'+push, context);
  writes.length=0; reads=0;
  const jwt = (uid, claims = {}) => `fixture.${Buffer.from(JSON.stringify({aud:'fixture-project',iss:'https://securetoken.google.com/fixture-project',sub:uid,iat:Date.now()/1000,exp:Date.now()/1000+3600,...claims})).toString('base64url')}.signature`;
  const call = (action, payload = {}, token = 'participant', extra = {}) => context.doPost({postData:{contents:JSON.stringify({version:1, requestId:'request_12345678', action, payload,
    idToken:['participant','admin','outsider'].includes(token) ? jwt(token) : token,...extra})}});
  return {context, sheets, values, writes, call, set, jwt, sent, sendResults, registrationChecks, registrationResults, reads: () => reads};
}
const date = '2026-11-16 21:30';
test('session verifies role without loading character names', () => {
  const f=fixture(); assert.equal(f.call('af.session').data.role,'participant'); assert.equal(f.reads(),0);
});
test('initial setup explains missing or URL-valued spreadsheet ID before any sheet write', () => {
  for (const sheetId of [null, '', '   ']) {
    const f=fixture({sheetId});
    assert.throws(()=>f.context.initializeWebApp(), /AF_SPREADSHEET_ID.*未設定/);
    assert.equal(f.writes.length,0);
  }
  const f=fixture({sheetId:'https://docs.google.com/spreadsheets/d/example/edit'});
  assert.throws(()=>f.context.initializeWebApp(), /IDだけ/);
  assert.equal(f.writes.length,0);
});
test('invalid and unlisted identities are rejected before sheet reads', () => {
  const f=fixture();
  assert.equal(f.call('af.read',{},'bad').error.code,'AUTH_REQUIRED');
  assert.equal(f.call('af.read',{},'outsider').error.code,'FORBIDDEN'); assert.equal(f.reads(),0);
});
test('wrong-project and expired claims are rejected even if lookup would accept the UID', () => {
  const f=fixture();
  assert.equal(f.call('af.read',{},f.jwt('admin',{aud:'other-project'})).error.code,'AUTH_REQUIRED');
  assert.equal(f.call('af.read',{},f.jwt('admin',{exp:Date.now()/1000-1})).error.code,'AUTH_REQUIRED');
  assert.equal(f.reads(),0);
});
test('all admin actions reject participant role, including spoofed role', () => {
  const f=fixture();
  for (const action of ['af.members.add','af.members.required','af.candidates.add','af.candidates.remove','af.confirm']) {
    assert.equal(f.call(action,{},'participant',{role:'admin'}).error.code,'FORBIDDEN');
  }
  assert.equal(f.reads(),0); assert.equal(f.writes.length,0);
});
test('read exposes stable member IDs, actual answers and minimum from settings', () => {
  const f=fixture(); f.set('設定・メンバー','B5',7);
  const result=f.call('af.read'); assert.equal(result.ok,true);
  assert.equal(isSchedule(result.data),true); assert.equal(result.data.minParticipants,7);
  assert.equal(result.data.answers[id(1)][date],'○'); assert.equal(result.data.slots[0].judgment,'開催可能');
});
test('nine yes answers are excluded and maybe cannot satisfy a required member', () => {
  const f=fixture({count:9}); assert.equal(f.call('af.read').data.slots[0].judgment,'人数調整');
  const g=fixture({required:true}); g.sheets.get('（管理者用）回答管理').grid[4][2]='△';
  assert.equal(g.call('af.read').data.slots[0].judgment,'必須未達');
});
test('only changed answers save and repeated identical saves are harmless', () => {
  const f=fixture(); const payload={weekId:'2026-11-16',memberId:id(1),changes:[{slot:date,before:'○',answer:'△'}]};
  assert.equal(f.call('af.answers.save',payload).data.saved,true);
  assert.equal(f.sheets.get('（管理者用）回答管理').grid[4][2],'△');
  assert.equal(f.sheets.get('（管理者用）回答管理').grid[4][3],'○');
  const count=f.writes.length;
  assert.equal(f.call('af.answers.save',payload).data.savedCount,0); assert.equal(f.writes.length,count);
});
test('conflict, changed week and invalid batch fail before any write', () => {
  const f=fixture();
  const payload={weekId:'2026-11-16',memberId:id(1),changes:[{slot:date,before:'×',answer:'△'}]};
  assert.equal(f.call('af.answers.save',payload).error.code,'CONFLICT');
  assert.equal(f.call('af.answers.save',{...payload,weekId:'2026-11-09'}).error.code,'WEEK_CHANGED');
  assert.equal(f.call('af.answers.save',{...payload,changes:[{slot:date,before:'○',answer:'evil'}]}).error.code,'INVALID_REQUEST');
  assert.equal(f.writes.length,0);
});
test('confirmed event still accepts answer changes and keeps confirmation', () => {
  const f=fixture(); f.set('開催日程','B3',new Date('2026-11-16T21:30:00+09:00'));
  const result=f.call('af.answers.save',{weekId:'2026-11-16',memberId:id(1),changes:[{slot:date,before:'○',answer:'×'}]});
  assert.equal(result.ok,true); assert.equal(result.data.state.confirmed,date);
});
test('admin adds a member with an opaque ID and updates required flag', () => {
  const f=fixture();
  const result=f.call('af.members.add',{weekId:'2026-11-16',name:'Demo new',required:true},'admin');
  assert.equal(result.ok,true); assert.equal(result.data.members.length,9);
  const member=result.data.members.at(-1); assert.match(member.id,/^m_[a-f0-9-]{36}$/);
  assert.equal(f.call('af.members.required',{weekId:'2026-11-16',memberId:member.id,before:true,required:false},'admin').ok,true);
});
test('name duplication, spreadsheet formula input and occupied member capacity are rejected', () => {
  const f=fixture({count:12});
  assert.equal(f.call('af.members.add',{weekId:'2026-11-16',name:'=IMPORTDATA("bad")',required:false},'admin').error.code,'INVALID_REQUEST');
  assert.equal(f.call('af.members.add',{weekId:'2026-11-16',name:'Demo 1',required:false},'admin').error.code,'DUPLICATE');
  assert.equal(f.call('af.members.add',{weekId:'2026-11-16',name:'Demo new',required:false},'admin').error.code,'CAPACITY');
  assert.equal(f.writes.length,0);
});
test('answered candidate cannot be removed; confirmed candidate must be eligible', () => {
  const f=fixture();
  assert.equal(f.call('af.candidates.remove',{weekId:'2026-11-16',slot:date},'admin').error.code,'HAS_ANSWERS');
  f.sheets.get('（管理者用）回答管理').grid[4][2]='×';
  assert.equal(f.call('af.confirm',{weekId:'2026-11-16',slot:date,before:null},'admin').ok,true);
  assert.equal(f.call('af.confirm',{weekId:'2026-11-16',slot:date,before:null},'admin').error.code,'CONFLICT');
});
test('pending rollover prevents reads and writes', () => {
  const f=fixture(); f.values.set('pendingRolloverWeek','2026-11-16');
  assert.equal(f.call('af.read').error.code,'BUSY'); assert.equal(f.writes.length,0);
});
test('unconfirmed expired week is archived as not held and manual slots advance seven days', () => {
  const f=fixture(); const original=Date.now;
  Date.now=()=>new Date('2026-11-23T00:01:00+09:00').getTime();
  try {f.context.checkScheduleRollover();} finally {Date.now=original;}
  assert.equal(f.sheets.get('開催履歴').grid[3][4],'未開催');
  assert.equal(f.sheets.get('日程調整').grid[6][0].getTime(),new Date('2026-11-23T00:00:00+09:00').getTime());
  assert.equal(f.sheets.get('設定・メンバー').grid[2][1].getTime(),new Date('2026-11-23T00:00:00+09:00').getTime());
  assert.equal(f.sheets.get('（管理者用）回答管理').grid[4][2],'');
  assert.equal(f.values.has('pendingRolloverWeek'),false);
});
test('week stays active before deadline and confirmed week waits two hours', () => {
  const f=fixture(); const original=Date.now;
  Date.now=()=>new Date('2026-11-22T23:59:00+09:00').getTime();
  try {f.context.checkScheduleRollover(); assert.equal(f.writes.length,0);} finally {Date.now=original;}
  f.set('開催日程','B3',new Date('2026-11-16T21:30:00+09:00')); f.writes.length=0;
  Date.now=()=>new Date('2026-11-16T23:29:00+09:00').getTime();
  try {f.context.checkScheduleRollover(); assert.equal(f.writes.length,0);} finally {Date.now=original;}
});
test('validators reject malformed snapshots and unbounded history', () => {
  assert.equal(isSchedule({}),false); assert.equal(isHistory({items:Array(13).fill({}),nextOffset:null}),false);
  assert.equal(isHistory({items:[],nextOffset:null}),true);
});
test('interrupted archive resumes without a duplicate history or second week advance', () => {
  const f=fixture(); const original=Date.now;
  Date.now=()=>new Date('2026-11-23T00:01:00+09:00').getTime();
  let fail=true;
  f.context.SpreadsheetApp.flush=()=>{if(fail){fail=false;throw Error('simulated failure');}};
  try {
    assert.throws(()=>f.context.checkScheduleRollover());
    assert.equal(f.values.get('pendingRolloverWeek'),'2026-11-16');
    assert.equal(f.call('af.read').error.code,'BUSY');
    f.context.checkScheduleRollover(); f.context.checkScheduleRollover();
    assert.equal(f.sheets.get('開催履歴').getLastRow(),4);
    assert.equal(f.sheets.get('設定・メンバー').grid[2][1].getTime(),new Date('2026-11-23T00:00:00+09:00').getTime());
    assert.equal(f.values.has('pendingRolloverWeek'),false);
  } finally {Date.now=original;}
});
test('formula dates are preserved while manual candidate dates advance', () => {
  const f=fixture(); const formula="='設定・メンバー'!B3";
  f.sheets.get('日程調整').formulas.set('7:1',formula);
  f.set('日程調整','A8',new Date('2026-11-17T00:00:00+09:00'));
  f.set('日程調整','B8',new Date('1899-12-30T22:00:00+09:00'));
  const original=Date.now; Date.now=()=>new Date('2026-11-23T00:01:00+09:00').getTime();
  try {f.context.checkScheduleRollover();} finally {Date.now=original;}
  assert.equal(f.sheets.get('日程調整').grid[6][0],formula);
  assert.equal(f.sheets.get('日程調整').grid[7][0].getTime(),new Date('2026-11-24T00:00:00+09:00').getTime());
});
test('member initialization creates stable IDs once without changing names or answers', () => {
  const f=fixture(); const settings=f.sheets.get('設定・メンバー');
  settings.grid[13][3]='';
  f.context.initializeWebApp(); const firstId=settings.grid[13][3];
  f.context.initializeWebApp(); assert.equal(settings.grid[13][3],firstId);
  assert.match(firstId,/^m_[a-f0-9-]{36}$/);
  assert.equal(settings.grid[13][0],'Demo 1');
  assert.equal(f.sheets.get('（管理者用）回答管理').grid[4][2],'○');
});
test('alias management is admin-only; unauthenticated users can resolve', () => {
  const f=fixture(); const payload={code:'answer01',path:'/UDM/afetiria-extra/answer/'};
  assert.equal(f.call('udm.links.create',payload).error.code,'FORBIDDEN');
  assert.equal(f.call('udm.links.list',{}).error.code,'FORBIDDEN');
  assert.equal(f.call('udm.links.create',payload,'admin').data.links.length,1);
  assert.equal(f.call('udm.links.resolve',{code:'answer01'},'').data.path,payload.path);
  assert.equal(f.call('udm.links.list',{},'').error.code,'AUTH_REQUIRED');
});
test('disabled alias is not resolved and stale alias changes conflict', () => {
  const f=fixture(); const path='/UDM/equipment-planner/';
  f.call('udm.links.create',{code:'planner1',path},'admin');
  const payload={code:'planner1',path,active:false,beforePath:path,beforeActive:true};
  assert.equal(f.call('udm.links.update',payload,'admin').ok,true);
  assert.equal(f.call('udm.links.resolve',{code:'planner1'},'').error.code,'NOT_FOUND');
  assert.equal(f.call('udm.links.update',payload,'admin').error.code,'CONFLICT');
});
test('aliases reject external URLs, encoded paths, query credentials and alias loops on both sides', () => {
  const f=fixture();
  for(const path of ['https://example.invalid/','//example.invalid/','/UDM/%2e%2e/','/UDM/s/','/UDM/a/?token=secret','/UDM/../','/UDM/\\evil/']) {
    assert.equal(isInternalPath(path),false);
    assert.equal(f.call('udm.links.create',{code:'badpath1',path},'admin').error.code,'INVALID_REQUEST');
  }
  assert.equal(f.writes.length,0);
});

test('participant shares the current screen and repeated requests reuse the same code', () => {
  const f=fixture(); const path='/UDM/afetiria-extra/answer/';
  const first=f.call('udm.links.share',{path});
  assert.equal(first.ok,true); assert.equal(first.data.path,path);
  const writes=f.writes.length;
  assert.deepEqual(f.call('udm.links.share',{path}).data,first.data);
  assert.equal(f.writes.length,writes);
  assert.equal(f.call('udm.links.share',{path},'').error.code,'AUTH_REQUIRED');
  assert.equal(f.call('udm.links.share',{path:'https://example.invalid/'}).error.code,'INVALID_REQUEST');
});

const deviceToken='fixture-device-token-000000000001';
function futureConfirmation(f, slot='2099-11-16 21:30') {
  f.set('設定・メンバー','B3',new Date('2099-11-16T00:00:00+09:00'));
  f.set('日程調整','A7',new Date(slot.slice(0,10)+'T00:00:00+09:00'));
  f.set('日程調整','B7',new Date('1899-12-30T'+slot.slice(11)+':00+09:00'));
  f.set('開催日程','B3',new Date(slot.replace(' ','T')+':00+09:00'));
}
test('push settings permit browser opt-in without login and store only device destination metadata', () => {
  const f=fixture();
  assert.equal(f.call('af.push.status').data.ready,false);
  assert.equal(f.call('af.push.subscribe',{token:deviceToken}).error.code,'CONFIG_REQUIRED');
  assert.equal(f.call('af.push.status',{},'').data.ready,false);
  f.values.set('AF_PUSH_READY','true');
  assert.equal(f.call('af.push.subscribe',{token:deviceToken}).data.enabled,true);
  const keys=[...f.values.keys()].filter(key=>key.startsWith('AF_PUSH_DEVICE_'));
  assert.equal(keys.length,1);
  const record=JSON.parse(f.values.get(keys[0]));
  assert.deepEqual(Object.keys(record).sort(),['attemptEvent','attempts','lastEvent','token','updatedAt']);
  assert.equal(record.token,deviceToken); assert.equal(f.sent.length,0);
  assert.equal(f.call('af.push.unsubscribe',{token:deviceToken}).data.enabled,false);
  assert.equal(f.values.has(keys[0]),false);
});
test('notification setup validates sending without delivering or replaying existing confirmations', () => {
  const f=fixture();futureConfirmation(f);
  f.context.initializePushNotifications();
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].validate_only,true);
  f.call('af.push.subscribe',{token:deviceToken});
  f.context.afCheckPush_(); assert.equal(f.sent.length,1);
});
test('new confirmations notify once, retries reuse event and sheet changes are detected', () => {
  const f=fixture();f.context.initializePushNotifications(); f.call('af.push.subscribe',{token:deviceToken});
  futureConfirmation(f);f.context.afCheckPush_();
  assert.equal(f.sent.length,2); assert.equal(f.sent[1].message.token,deviceToken);
  assert.equal(f.sent[1].message.data.type,'afetiria-confirmed');
  assert.equal(f.sent[1].message.data.title,'アフェティリアハード追加便');
  assert.equal(f.sent[1].message.data.body,'2099-11-16 21:30 の開催が決まりました。');
  assert.equal(f.sent[1].message.notification,undefined);
  assert.equal(f.sent[1].message.webpush.headers.TTL,'3600');
  f.context.afCheckPush_(); assert.equal(f.sent.length,2);
  futureConfirmation(f,'2099-11-16 22:00');f.sendResults.push(503);
  f.context.afCheckPush_(); assert.equal(f.sent.length,3);
  assert.equal(f.sent[2].message.data.title,'アフェティリアハード追加便');
  assert.equal(f.sent[2].message.data.body,'2099-11-16 22:00 の開催が変更されました');
  const event=f.sent[2].message.data.eventId;
  f.context.afCheckPush_(); assert.equal(f.sent.length,4);assert.equal(f.sent[3].message.data.eventId,event);
  f.context.afCheckPush_(); assert.equal(f.sent.length,4);
});
test('expired destinations are removed and failed push never undoes confirmation', () => {
  const f=fixture();f.context.initializePushNotifications(); f.call('af.push.subscribe',{token:deviceToken});
  futureConfirmation(f);f.sendResults.push(404);f.context.afCheckPush_();
  assert.equal([...f.values.keys()].filter(key=>key.startsWith('AF_PUSH_DEVICE_')).length,0);
  f.call('af.push.subscribe',{token:deviceToken});
  futureConfirmation(f,'2099-11-16 22:00'); f.sendResults.push(503);
  f.context.afCheckPushSafe_();
  assert.equal(f.values.get('AF_PUSH_LAST_ERROR'),'DELIVERY_FAILED');
  assert.equal(f.sheets.get('開催日程').grid[2][1].getTime(),new Date('2099-11-16T22:00:00+09:00').getTime());
});
test('registration rotates tokens, ages out destinations and caps active devices', () => {
  const f=fixture();f.values.set('AF_PUSH_READY','true');
  f.call('af.push.subscribe',{token:deviceToken});
  assert.equal(f.call('af.push.subscribe',{token:deviceToken+'-new',previousToken:deviceToken}).ok,true);
  assert.equal(f.call('af.push.status',{token:deviceToken}).data.enabled,false);
  const key=[...f.values.keys()].find(key=>key.startsWith('AF_PUSH_DEVICE_'));
  const old=JSON.parse(f.values.get(key));old.updatedAt=0;f.values.set(key,JSON.stringify(old));
  f.context.afPushDevices_();assert.equal(f.values.has(key),false);
  for(let i=0;i<100;i++) assert.equal(f.call('af.push.subscribe',{token:deviceToken+'-'+i}).ok,true);
  assert.equal(f.call('af.push.subscribe',{token:deviceToken+'-overflow'}).error.code,'CAPACITY');
});

test('Web confirmation succeeds even if push delivery fails and later changes get a fresh retry budget', () => {
  const f=fixture(); f.context.initializePushNotifications();f.call('af.push.subscribe',{token:deviceToken});
  futureConfirmation(f);f.set('開催日程','B3','');f.sendResults.push(503);
  const result=f.call('af.confirm',{weekId:'2099-11-16',slot:'2099-11-16 21:30',before:null},'admin');
  assert.equal(result.ok,true);assert.equal(result.data.confirmed,'2099-11-16 21:30');
  for(let i=0;i<4;i++){f.sendResults.push(503);f.context.afCheckPush_();}
  const sent=f.sent.length;f.context.afCheckPush_();assert.equal(f.sent.length,sent);
  futureConfirmation(f,'2099-11-16 22:00');f.context.afCheckPush_();assert.equal(f.sent.length,sent+1);
});

test('only admins can broadcast custom test notifications; all active destinations receive the text without changing schedule', () => {
  const f=fixture();f.context.initializePushNotifications();
  f.call('af.push.subscribe',{token:deviceToken});f.call('af.push.subscribe',{token:deviceToken+'-second'});
  const payload={title:'自由なタイトル',body:'本文1行目\n本文2行目'};
  const beforeWrites=f.writes.length;const beforeEvent=f.values.get('AF_PUSH_EVENT');
  assert.equal(f.call('af.push.test',payload).error.code,'FORBIDDEN');
  assert.equal(f.call('af.push.test',payload,'').error.code,'AUTH_REQUIRED');
  f.sendResults.push(200,404);
  const result=f.call('af.push.test',payload,'admin');
  assert.deepEqual(result.data,{total:2,accepted:1,failed:0,removed:1});
  assert.equal(f.sent.length,3);
  for(const message of f.sent.slice(1)) {
    assert.equal(message.message.data.title,payload.title);assert.equal(message.message.data.body,payload.body);
    assert.equal(message.message.webpush.headers.TTL,'300');
  }
  assert.equal(f.writes.length,beforeWrites);assert.equal(f.values.get('AF_PUSH_EVENT'),beforeEvent);
  assert.deepEqual(f.call('af.push.test',payload,'admin').data,result.data);
  assert.equal(f.sent.length,3);
});
test('test broadcasts reject empty or oversized text and return zero for no subscribers', () => {
  const f=fixture();f.context.initializePushNotifications();
  for(const payload of [{title:' ',body:'x'},{title:'x',body:''},{title:'x'.repeat(81),body:'x'},{title:'x',body:'x'.repeat(501)},{title:'x\ny',body:'x'}]) {
    assert.equal(f.call('af.push.test',payload,'admin').error.code,'INVALID_REQUEST');
  }
  assert.equal(f.sent.length,1);
  assert.deepEqual(f.call('af.push.test',{title:'テスト',body:'本文'},'admin').data,{total:0,accepted:0,failed:0,removed:0});
});
test('failed test sends report failure and interrupted sends cannot be replayed automatically', () => {
  const f=fixture();f.context.initializePushNotifications();f.call('af.push.subscribe',{token:deviceToken});
  f.sendResults.push(503);
  assert.equal(f.call('af.push.test',{title:'テスト',body:'本文'},'admin').data.failed,1);
  const g=fixture();g.context.initializePushNotifications();g.call('af.push.subscribe',{token:deviceToken});
  g.context.UrlFetchApp.fetchAll=()=>{throw Error('private-device-token')};
  assert.equal(g.call('af.push.test',{title:'テスト',body:'本文'},'admin').error.code,'INTERNAL_ERROR');
  assert.equal(g.call('af.push.test',{title:'テスト',body:'本文'},'admin').error.code,'CONFLICT');
});


test('FCM acceptance requires a message ID from the requested project; diagnostic output excludes device tokens and free text', () => {
  for (const responseBody of [{}, {name:'projects/other/messages/id'}, {name:'projects/fixture-project/messages/'}, null]) {
    const f=fixture();f.context.initializePushNotifications();f.call('af.push.subscribe',{token:deviceToken});
    f.context.UrlFetchApp.fetchAll=()=>[{getResponseCode:()=>200,getContentText:()=>JSON.stringify(responseBody)}];
    const result=f.call('af.push.test',{title:'private-title',body:'private-body'},'admin');
    assert.equal(result.data.accepted,0);assert.equal(result.data.failed,1);
    const diagnostic=f.context.diagnosePushNotifications();
    assert.equal(diagnostic.lastAttempt.httpStatus,200);assert.equal(diagnostic.lastAttempt.messageId,null);
    assert.equal(diagnostic.lastAttempt.validateOnly,false);
    for (const secret of [deviceToken,'private-title','private-body','private-owner-access-token']) assert.equal(JSON.stringify(diagnostic).includes(secret),false);
  }
  const f=fixture();f.context.initializePushNotifications();f.call('af.push.subscribe',{token:deviceToken});
  assert.equal(f.call('af.push.test',{title:'test',body:'body'},'admin').data.accepted,1);
  const attempt=f.context.diagnosePushNotifications().lastAttempt;
  assert.equal(attempt.project,'fixture-project');assert.equal(attempt.messageId,'projects/fixture-project/messages/message_123');
  assert.equal(attempt.accepted,true);assert.equal(attempt.validateOnly,false);
});


test('anonymous notification setup cannot read schedules or names, send notifications, or manage links', () => {
  const f=fixture();f.values.set('AF_PUSH_READY','true');
  assert.equal(f.call('af.push.subscribe',{token:deviceToken},'').data.enabled,true);
  assert.equal(f.call('af.push.status',{token:deviceToken},'').data.enabled,true);
  assert.equal(f.call('af.push.status',{token:deviceToken+'-other'},'').data.enabled,false);
  for(const action of ['af.read','af.session','af.history','af.answers.save','af.confirm','af.push.test','udm.links.list','udm.links.share']) {
    assert.equal(f.call(action,{},'').error.code,'AUTH_REQUIRED');
  }
  assert.equal(f.reads(),0);assert.equal(f.sent.length,0);
  assert.equal(f.call('af.push.unsubscribe',{token:deviceToken},'').data.enabled,false);
});


test('anonymous opt-in validates new FCM destinations for our project without sending a notification', () => {
  const f=fixture();f.values.set('AF_PUSH_READY','true');
  f.registrationResults.push(400);
  assert.equal(f.call('af.push.subscribe',{token:deviceToken},'').error.code,'INVALID_REQUEST');
  assert.equal([...f.values.keys()].some(key=>key.startsWith('AF_PUSH_DEVICE_')),false);
  assert.equal(f.call('af.push.subscribe',{token:deviceToken},'').data.enabled,true);
  assert.equal(f.registrationChecks.length,2);
  for(const check of f.registrationChecks) {
    assert.equal(check.url,'https://fcm.googleapis.com/v1/projects/fixture-project/messages:send');
    assert.equal(check.validate_only,true);assert.equal(check.message.token,deviceToken);
  }
  f.call('af.push.subscribe',{token:deviceToken},'');assert.equal(f.registrationChecks.length,2);
  assert.equal(f.sent.length,0);
});


test('BFF signature matches the Worker, enforces cutover, prevents replay and detects modified payloads', async () => {
  const f=fixture();const secret='fixture-shared-secret-32-characters-long';
  f.values.set('UDM_BFF_SHARED_SECRET',secret);f.values.set('UDM_BFF_REQUIRED','true');
  assert.equal(f.call('af.session',{},'admin').error.code,'AUTH_REQUIRED');
  const token=f.jwt('admin');
  async function envelope(payload={},time=Date.now()) {
    const request={version:1,requestId:'request_12345678',action:'af.session',payload,idToken:token,bff:{issuedAt:time,nonce:randomUUID()}};
    request.bff.signature=await signRequest(request,secret);return request.bff;
  }
  const bff=await envelope();
  assert.equal(f.call('af.session',{},token,{bff}).data.role,'admin');
  assert.equal(f.call('af.session',{},token,{bff}).error.code,'AUTH_REQUIRED');
  assert.equal(f.call('af.session',{different:true},token,{bff:await envelope()}).error.code,'AUTH_REQUIRED');
  assert.equal(f.call('af.session',{},token,{bff:await envelope({},Date.now()-61000)}).error.code,'AUTH_REQUIRED');
  f.values.set('UDM_BFF_REQUIRED','false');
  assert.equal(f.call('af.session',{},token).data.role,'admin');
  const invalid=await envelope();invalid.signature='0'.repeat(64);
  assert.equal(f.call('af.session',{},token,{bff:invalid}).error.code,'AUTH_REQUIRED');
});
