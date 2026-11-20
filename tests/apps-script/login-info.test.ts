import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../apps/apps-script/dist/LoginInfo.gs', import.meta.url), 'utf8');
const html = await readFile(new URL('../../apps/apps-script/dist/LoginInfoDialog.html', import.meta.url), 'utf8');
const initial = {
  AF_LOGIN_INFO_QUESTION: '確認用の質問 <img src=x>',
  AF_LOGIN_INFO_ANSWER: 'Test answer',
  AF_LOGIN_INFO_EMAIL: 'fixture@example.invalid',
  AF_LOGIN_INFO_PASSWORD: '<script>fixture-only</script>&"',
};

function server({ values = initial, active = 'fixture-sheet' } = {}) {
  const reads = [];
  const dialog = {};
  const output = {
    setWidth(width) { dialog.width = width; return output; },
    setHeight(height) { dialog.height = height; return output; },
  };
  const context = vm.createContext({
    AF: { spreadsheetId: 'fixture-sheet' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty(key) { reads.push(key); return values[key] ?? null; },
    }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => active === null ? null : { getId: () => active },
      getUi: () => ({ showModalDialog(value, title) { assert.equal(value, output); dialog.title = title; } }),
    },
    HtmlService: { createHtmlOutputFromFile(file) { dialog.file = file; return output; } },
    console: { log() { throw Error('Must not log login details'); }, warn() { throw Error('Must not log login details'); } },
  });
  vm.runInContext(source, context);
  return { context, reads, dialog };
}

test('opening the dialog and reading its question never read the answer or credentials', () => {
  const { context, reads, dialog } = server();
  context.showLoginInfoDialog();
  assert.equal(dialog.file, 'LoginInfoDialog');
  assert.equal(dialog.title, 'ログイン情報の確認');
  assert.deepEqual(reads, []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getLoginInfoQuestion())), { question: initial.AF_LOGIN_INFO_QUESTION });
  assert.deepEqual(reads, ['AF_LOGIN_INFO_QUESTION']);
});

test('wrong or malformed answers never read or return email and password', () => {
  for (const answer of [undefined, null, {}, [], '', 'test answer', 'Test answer ']) {
    const { context, reads } = server();
    assert.throws(() => context.getLoginInfoWithAnswer(answer), /答えが違います/);
    assert.deepEqual(reads, ['AF_LOGIN_INFO_ANSWER']);
  }
});

test('the exact answer returns the configured credentials without changing their characters', () => {
  const { context } = server();
  assert.deepEqual(JSON.parse(JSON.stringify(context.getLoginInfoWithAnswer(initial.AF_LOGIN_INFO_ANSWER))), {
    email: initial.AF_LOGIN_INFO_EMAIL, password: initial.AF_LOGIN_INFO_PASSWORD,
  });
});

test('missing configuration fails closed without exposing configuration values', () => {
  for (const key of Object.keys(initial)) {
    const values = { ...initial, [key]: '' };
    const { context } = server({ values });
    const operation = key === 'AF_LOGIN_INFO_QUESTION' ? () => context.getLoginInfoQuestion() : () => context.getLoginInfoWithAnswer(initial.AF_LOGIN_INFO_ANSWER);
    assert.throws(operation, error => /未設定/.test(error.message) && !error.message.includes(initial.AF_LOGIN_INFO_PASSWORD));
  }
});

test('web execution or a copied spreadsheet cannot retrieve login details', () => {
  for (const active of [null, 'different-sheet']) {
    const { context, reads } = server({ active });
    for (const operation of [() => context.showLoginInfoDialog(), () => context.getLoginInfoQuestion(), () => context.getLoginInfoWithAnswer(initial.AF_LOGIN_INFO_ANSWER)]) {
      assert.throws(operation, /元のスプレッドシート/);
    }
    assert.deepEqual(reads, []);
  }
});

function browser() {
  const elements = new Map();
  const pending = [];
  let closed = false;
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(id, {
      value: '', textContent: '', hidden: ['question-form', 'credentials'].includes(id),
      disabled: false, handlers: {}, focus() {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      set innerHTML(_) { throw Error('Never interpret question or credentials as HTML'); },
    });
  }
  function runner() {
    const callbacks = {};
    return {
      withSuccessHandler(fn) { callbacks.success = fn; return this; },
      withFailureHandler(fn) { callbacks.failure = fn; return this; },
      getLoginInfoQuestion() { pending.push({ ...callbacks, method: 'question' }); },
      getLoginInfoWithAnswer(answer) { pending.push({ ...callbacks, method: 'answer', answer }); },
    };
  }
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) },
    google: { script: { get run() { return runner(); }, host: { close() { closed = true; } } } },
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const submit = () => elements.get('question-form').handlers.submit({ preventDefault() {} });
  return { elements, pending, submit, closed: () => closed };
}

test('dialog keeps credentials hidden on load, while checking, and after a failed answer', () => {
  const { elements, pending, submit } = browser();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].method, 'question');
  assert.equal(elements.get('credentials').hidden, true);
  pending.shift().success({ question: initial.AF_LOGIN_INFO_QUESTION });
  assert.equal(elements.get('question').textContent, initial.AF_LOGIN_INFO_QUESTION);
  elements.get('answer').value = 'incorrect';
  submit(); submit();
  assert.equal(pending.length, 1, 'duplicate submissions are suppressed');
  assert.equal(elements.get('credentials').hidden, true);
  assert.equal(elements.get('email').value, '');
  assert.equal(elements.get('password').value, '');
  pending.shift().failure({ message: initial.AF_LOGIN_INFO_PASSWORD });
  assert.equal(elements.get('credentials').hidden, true);
  assert.equal(elements.get('submit').disabled, false);
  assert.equal(elements.get('notice').textContent.includes(initial.AF_LOGIN_INFO_PASSWORD), false);
});

test('dialog displays credentials as literal text only after successful server verification', () => {
  const { elements, pending, submit, closed } = browser();
  pending.shift().success({ question: initial.AF_LOGIN_INFO_QUESTION });
  elements.get('answer').value = initial.AF_LOGIN_INFO_ANSWER;
  submit();
  const request = pending.shift();
  assert.equal(request.answer, initial.AF_LOGIN_INFO_ANSWER);
  request.success({ email: initial.AF_LOGIN_INFO_EMAIL, password: initial.AF_LOGIN_INFO_PASSWORD });
  assert.equal(elements.get('email').value, initial.AF_LOGIN_INFO_EMAIL);
  assert.equal(elements.get('password').value, initial.AF_LOGIN_INFO_PASSWORD);
  assert.equal(elements.get('answer').value, '');
  assert.equal(elements.get('question-form').hidden, true);
  assert.equal(elements.get('credentials').hidden, false);
  elements.get('close').handlers.click();
  assert.equal(closed(), true);
});
