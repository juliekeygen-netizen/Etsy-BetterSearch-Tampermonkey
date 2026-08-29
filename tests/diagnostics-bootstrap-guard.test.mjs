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

function run(initialArm, now = 1_000_000) {
  class Storage {}
  Storage.prototype.setItem = function setItem(key, value) { this._store.setItem(key, value); };
  const sessionBacking = makeStorage(initialArm ? { 'ebsf-diagnostics:armed:v1': JSON.stringify(initialArm) } : {});
  const sessionStorage = Object.assign(new Storage(), {
    _store: sessionBacking,
    getItem: sessionBacking.getItem.bind(sessionBacking),
    removeItem: sessionBacking.removeItem.bind(sessionBacking)
  });
  const timers = [];
  const context = {
    Storage,
    sessionStorage,
    Date: class extends Date { static now() { return now; } },
    JSON,
    globalThis: null,
    setTimeout(fn) { timers.push(fn); return timers.length; }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, sessionBacking, timers };
}

test('stale or legacy arm is removed before the recorder can consume it', () => {
  for (const arm of [
    { sessionId: 'legacy-no-time' },
    { sessionId: 'old', armedAt: 900_000 },
    { sessionId: 'future', armedAt: 1_000_100 }
  ]) {
    const result = run(arm);
    assert.equal(result.sessionBacking.dump('ebsf-diagnostics:armed:v1'), null);
  }
});

test('fresh arm survives synchronously for content.js then is removed one-shot', () => {
  const result = run({ sessionId: 'fresh', armedAt: 999_990 });
  assert.ok(result.sessionBacking.dump('ebsf-diagnostics:armed:v1'));
  assert.equal(result.context.__EBSF_DIAG_FRESH_ARM__.sessionId, 'fresh');
  assert.equal(result.timers.length, 1);
  result.timers[0]();
  assert.equal(result.sessionBacking.dump('ebsf-diagnostics:armed:v1'), null);
});

test('future arm writes are freshness-stamped at the storage boundary', () => {
  const result = run(null, 2_000_000);
  result.context.sessionStorage.setItem('ebsf-diagnostics:armed:v1', JSON.stringify({ sessionId: 'new' }));
  const stored = JSON.parse(result.sessionBacking.dump('ebsf-diagnostics:armed:v1'));
  assert.equal(stored.sessionId, 'new');
  assert.equal(stored.armedAt, 2_000_000);
  assert.equal(stored.armVersion, 2);
});
