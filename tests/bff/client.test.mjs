import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../../apps/web/lib/udm-api/client.ts',import.meta.url),'utf8');
const source=original.replace('"@udm/contracts/routes"',JSON.stringify(new URL('../../packages/contracts/src/routes.mjs',import.meta.url).href)).replace('"@/lib/sheets-transport/client.mjs"',JSON.stringify(new URL('../../apps/web/lib/sheets-transport/client.mjs',import.meta.url).href));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {callApi,callApiResult,remainingTtl}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
async function fixture(run){const oldFetch=globalThis.fetch,oldBff=process.env.NEXT_PUBLIC_UDM_API_URL,oldApi=process.env.NEXT_PUBLIC_AF_API_URL;
 process.env.NEXT_PUBLIC_UDM_API_URL='https://udm-bff.fixture.workers.dev';process.env.NEXT_PUBLIC_AF_API_URL='https://script.google.com/macros/s/legacy_12345678901234567890/exec';
 try{await run();}finally{globalThis.fetch=oldFetch;if(oldBff===undefined)delete process.env.NEXT_PUBLIC_UDM_API_URL;else process.env.NEXT_PUBLIC_UDM_API_URL=oldBff;if(oldApi===undefined)delete process.env.NEXT_PUBLIC_AF_API_URL;else process.env.NEXT_PUBLIC_AF_API_URL=oldApi;}
}
const valid=value=>!!value&&value.saved===true;
test('browser uses BFF REST route, bearer header and request ID, with no ID token in URL or JSON',()=>fixture(async()=>{
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://udm-bff.fixture.workers.dev/v1/afetiria-extra/answers');assert.equal(options.headers.Authorization,'Bearer private-token');assert.equal(options.method,'POST');assert.equal(options.body.includes('private-token'),false);const id=options.headers['X-Request-Id'];return Response.json({version:1,requestId:id,ok:true,data:{saved:true}});};
 assert.equal((await callApi('af.answers.save',{changes:[]},async()=>'private-token',valid)).saved,true);
}));
test('GETs have no body and retain a bounded remaining TTL; status failures are parsed rather than silently acknowledged',()=>fixture(async()=>{
 globalThis.fetch=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(url.includes('private-token'),false);return Response.json({version:1,requestId:options.headers['X-Request-Id'],ok:true,data:{saved:true},meta:{sourceFetchedAt:1,expiresAt:300001,remainingTtlMs:200000,revision:'fixture'}});};
 const result=await callApiResult('af.read',{view:'answer',memberId:'member'},async()=>'private-token',valid);assert.ok(remainingTtl(result)>190000&&remainingTtl(result)<=200000);
 globalThis.fetch=async(_url,options)=>Response.json({version:1,requestId:options.headers['X-Request-Id'],ok:false,error:{code:'CONFLICT'}},{status:409});
 await assert.rejects(callApi('af.answers.save',{},async()=>'private-token',valid),e=>e.code==='CONFLICT'&&!e.outcomeUnknown);
}));
test('network or upstream write failure is unknown, is never retried and never falls back to the exec URL',()=>fixture(async()=>{
 const urls=[];globalThis.fetch=async(url)=>{urls.push(url);throw Error('private-token');};
 await assert.rejects(callApi('af.answers.save',{},async()=>'private-token',valid),e=>e.outcomeUnknown&&!e.message.includes('private-token'));
 assert.equal(urls.length,1);assert.equal(urls[0].includes('script.google.com'),false);
 globalThis.fetch=async(_url,options)=>Response.json({version:1,requestId:options.headers['X-Request-Id'],ok:false,error:{code:'UPSTREAM_UNAVAILABLE',outcomeUnknown:true}},{status:502});
 await assert.rejects(callApi('af.answers.save',{},async()=>'private-token',valid),e=>e.outcomeUnknown);
}));
test('anonymous notification setup sends no Authorization header and rejects a mismatched acknowledgement',()=>fixture(async()=>{
 globalThis.fetch=async(_url,options)=>{assert.equal(options.headers.Authorization,undefined);return Response.json({version:1,requestId:'wrong_id',ok:true,data:{saved:true}});};
 await assert.rejects(callApi('af.push.subscribe',{token:'private-device'},async()=>'',valid),e=>e.code==='INVALID_RESPONSE'&&e.outcomeUnknown);
}));
