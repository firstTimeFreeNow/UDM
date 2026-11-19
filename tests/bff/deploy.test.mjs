import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {deployBff,validateConfig} from '../../tools/deploy-bff.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture-private-token',UDM_BFF_SHARED_SECRET:'b'.repeat(64),AF_EXEC_URL:'https://script.google.com/macros/s/fixture_12345678901234567890/exec'};
test('BFF deploy rejects incomplete credentials and noncanonical upstream URLs before invoking Wrangler',async()=>{
 for(const invalid of [{...env,CLOUDFLARE_ACCOUNT_ID:''},{...env,UDM_BFF_SHARED_SECRET:'short'},{...env,AF_EXEC_URL:'https://other.invalid/exec'},{...env,AF_EXEC_URL:'https://user:password@script.google.com/macros/s/fixture/exec'}]) {
  let called=false;
  await assert.rejects(deployBff(invalid,{execute:async()=>{called=true;}}));
  assert.equal(called,false);
 }
 assert.doesNotThrow(()=>validateConfig(env));
});
test('BFF deploy resolves monorepo paths independently of cwd and only returns the public URL',async()=>{
 let secretPath;
 const result=await deployBff(env,{execute:async(binary,args,options)=>{
  assert.equal(binary,process.execPath);
  assert.ok(isAbsolute(args[0]));assert.ok(args[0].includes('/apps/bff/node_modules/'));
  assert.ok(isAbsolute(args[args.indexOf('--config')+1]));
  assert.ok(isAbsolute(options.cwd));
  assert.equal(options.env.UDM_BFF_SHARED_SECRET,undefined);
  assert.equal(args.includes(env.CLOUDFLARE_API_TOKEN),false);
  secretPath=args[args.indexOf('--secrets-file')+1];
  assert.equal((await stat(secretPath)).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(await readFile(secretPath,'utf8')),{UDM_BFF_SHARED_SECRET:env.UDM_BFF_SHARED_SECRET});
  return {stdout:'private output '+env.CLOUDFLARE_API_TOKEN+' https://udm-bff.fixture.workers.dev'};
 }});
 assert.deepEqual(result,{deployed:true,url:'https://udm-bff.fixture.workers.dev'});
 await assert.rejects(access(secretPath));
});
test('uncertain deployment does not retry, removes temporary secrets and suppresses raw CLI errors',async()=>{
 let calls=0,secretPath;
 await assert.rejects(deployBff(env,{execute:async(_binary,args)=>{calls++;secretPath=args[args.indexOf('--secrets-file')+1];throw Error(env.CLOUDFLARE_API_TOKEN);}}),e=>!e.message.includes(env.CLOUDFLARE_API_TOKEN)&&e.message.includes('確認できません'));
 assert.equal(calls,1);await assert.rejects(access(secretPath));
});
