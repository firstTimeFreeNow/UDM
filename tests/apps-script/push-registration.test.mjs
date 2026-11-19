import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPushWorker,PushSetupError,pushFailureCode,pushSetupMessage} from '../../lib/afetiria/push-registration.ts';
function fixture(state='installing') {
  const worker=Object.assign(new EventTarget(),{state});
  const registration=Object.assign(new EventTarget(),{installing:worker,waiting:null,active:null});
  return {worker,registration};
}
test('custom push registration waits for activation instead of subscribing during installation', async () => {
  const {worker,registration}=fixture();let completed=false;
  const ready=waitForPushWorker(registration,1000).then(()=>{completed=true;});
  await Promise.resolve(); assert.equal(completed,false);
  worker.state='installed';worker.dispatchEvent(new Event('statechange'));
  await Promise.resolve();assert.equal(completed,false);
  worker.state='activated';registration.active=worker;worker.dispatchEvent(new Event('statechange'));
  await ready;assert.equal(completed,true);
});
test('existing active workers are immediately available; failed workers time out or reject', async () => {
  const active=fixture('activated');active.registration.active=active.worker;
  await waitForPushWorker(active.registration,1000);
  const failed=fixture();const pending=waitForPushWorker(failed.registration,1000);
  failed.worker.state='redundant';failed.worker.dispatchEvent(new Event('statechange'));
  await assert.rejects(pending,error=>error instanceof PushSetupError && error.code==='REDUNDANT');
  await assert.rejects(waitForPushWorker(fixture().registration,5),error=>error.code==='TIMEOUT');
});
test('setup errors identify the failed step without displaying raw private error contents', () => {
  assert.equal(pushFailureCode({code:'messaging/token-subscribe-failed',message:'private-token'}),'messaging/token-subscribe-failed');
  assert.equal(pushFailureCode({code:'https://example.invalid/?token=private-token'}),'UNKNOWN');
  assert.match(pushSetupMessage(new PushSetupError('WORKER','TIMEOUT')),/WORKER\/TIMEOUT/);
  assert.match(pushSetupMessage(new PushSetupError('REGISTRATION','messaging/token-subscribe-failed')),/messaging\/token-subscribe-failed/);
  assert.doesNotMatch(pushSetupMessage(new Error('private-token')),/private-token/);
});
