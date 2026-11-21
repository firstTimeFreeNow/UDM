import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readdir, readFile } from 'node:fs/promises';
const directory = new URL('../../apps/apps-script/dist/', import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith('.gs')).sort();
const scripts = await Promise.all(files.map(async name => ({name, source:await readFile(new URL(name,directory),'utf8')})));
const publicNames = ['onOpen','onEdit','preloadAnswerData','showAnswerDialog','showCandidateDialog','getAnswerData','setAnswer','setAnswersBatch','getCandidateData','addCandidate','removeCandidate','installRolloverTrigger','checkScheduleRollover','benchmarkAnswerData','benchmarkPreload','doPost','initializeWebApp','diagnosePushNotifications','initializePushNotifications','showLoginInfoDialog','getLoginInfoQuestion','getLoginInfoWithAnswer'].sort();
for (const reverse of [false, true]) test(`split scripts retain the public entry points regardless of file order (${reverse ? 'reverse' : 'forward'})`, () => {
    const context = vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});
    const ordered = reverse ? scripts.slice().reverse() : scripts;
    for (const {name, source} of ordered) vm.runInContext(source, context, {filename:name});
    const exposed = Object.keys(context).filter(name => typeof context[name] === 'function' && !name.endsWith('_')).sort();
    assert.deepEqual(exposed, publicNames);
});
