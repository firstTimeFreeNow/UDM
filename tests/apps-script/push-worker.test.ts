import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../apps/web/public/afetiria-extra/push-sw.js',import.meta.url),'utf8');
function fixture() {
  const handlers=new Map(), notifications=[], opened=[];
  const self={addEventListener:(name,handler)=>handlers.set(name,handler),skipWaiting:async()=>{},
    location:{origin:'https://example.invalid'},registration:{showNotification:async(...args)=>notifications.push(args)},
    clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
  vm.runInNewContext(source,{self,URL});
  return {handlers,notifications,opened};
}
test('worker displays one device notification and uses the event ID for deduplication', async () => {
  const f=fixture();let pending;
  f.handlers.get('push')({data:{json:()=>({data:{type:'afetiria-confirmed',body:'開催日時',eventId:'event-1'}})},waitUntil:p=>pending=p});
  await pending;assert.equal(f.notifications.length,1);assert.equal(f.notifications[0][1].tag,'afetiria-confirmed-event-1');
});
test('worker ignores unrelated or malformed pushes and never navigates to a supplied external URL', async () => {
  const f=fixture();
  for(const data of [null,{json:()=>({data:{type:'other'}})},{json:()=>{throw Error('invalid')}}]) {
    f.handlers.get('push')({data,waitUntil:()=>assert.fail('unexpected notification')});
  }
  let pending;
  f.handlers.get('notificationclick')({notification:{close(){},data:{path:'https://external.invalid/'}},waitUntil:p=>pending=p});
  await pending;assert.deepEqual(f.opened,['https://example.invalid/UDM/afetiria-extra/']);
});

test('test notifications display the custom title and body as plain text', async () => {
  const f=fixture();let pending;
  f.handlers.get('push')({data:{json:()=>({data:{type:'afetiria-confirmed',test:'true',title:'任意のタイトル',body:'<b>本文</b>',eventId:'test-1'}})},waitUntil:p=>pending=p});
  await pending;assert.equal(f.notifications[0][0],'任意のタイトル');assert.equal(f.notifications[0][1].body,'<b>本文</b>');
});
