import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../diagnostics-extension/bootstrap-guard.js', import.meta.url), 'utf8');

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    dump(key) { return data.get(String(key)) ?? null; }
  };
}

function run(initialArm) {
  const sessionStorage = makeStorage(initialArm ? { 'ebsf-diagnostics:armed:v1': JSON.stringify(initialArm) } : {});
  const context = { sessionStorage, JSON, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, sessionStorage };
}

test('every document-start arm is consumed synchronously before content.js can read it', () => {
  for (const arm of [
    { sessionId: 'legacy-no-time' },
    { sessionId: 'fresh', startedAt: 999_990 },
    { sessionId: 'old', armedAt: 900_000 },
    { sessionId: 'future', armedAt: 1_000_100 }
  ]) {
    const result = run(arm);
    assert.equal(result.sessionStorage.dump('ebsf-diagnostics:armed:v1'), null);
    assert.equal(result.context.__EBSF_DIAG_CONSUMED_ARM__.sessionId, arm.sessionId);
    assert.equal(result.context.__EBSF_DIAG_BACKGROUND_CONFIRMATION_REQUIRED__, true);
  }
});

test('passive bootstrap does not monkeypatch Storage or schedule delayed arm cleanup', () => {
  assert.doesNotMatch(source, /Storage\.prototype\.setItem/);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.match(source, /sessionStorage\.removeItem\(ARM_KEY\)/);
  assert.match(source, /BACKGROUND_CONFIRMATION_REQUIRED/);
});

test('missing arm remains passive and still requires background confirmation', () => {
  const result = run(null);
  assert.equal(result.sessionStorage.dump('ebsf-diagnostics:armed:v1'), null);
  assert.equal(result.context.__EBSF_DIAG_CONSUMED_ARM__, undefined);
  assert.equal(result.context.__EBSF_DIAG_BACKGROUND_CONFIRMATION_REQUIRED__, true);
});
