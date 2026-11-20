import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {signingInput,signRequest} from '../helpers/signature.ts';
test('Apps Script/WebCrypto signature agrees with the fixture used by the Go server',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../../packages/contracts/fixtures/hmac.json',import.meta.url),'utf8'));
 assert.equal(signingInput(fixture.request),fixture.canonical);
 assert.equal(await signRequest(fixture.request,fixture.secret),fixture.signature);
});

import {bffEndpoint} from '../../packages/contracts/src/routes.ts';
test('only explicit development mode permits HTTP on loopback',()=>{
 assert.throws(()=>bffEndpoint('http://127.0.0.1:8080'));
 assert.equal(bffEndpoint('http://127.0.0.1:8080',true),'http://127.0.0.1:8080');
 for(const value of ['http://external.example','https://user:password@bff.example.com','https://bff.example.com/v1','https://bff.example.com?token=secret'])assert.throws(()=>bffEndpoint(value,true));
});
