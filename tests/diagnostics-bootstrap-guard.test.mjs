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

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.attributes = new Map();
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class FakeNativeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.records = [];
    this.options = null;
    this.target = null;
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
  disconnect() {}
  takeRecords() {
    const records = this.records;
    this.records = [];
    return records;
  }
  emit(records) {
    this.callback(records, this);
  }
}

function run(initialArm, { mutationObserver = false } = {}) {
  const sessionStorage = makeStorage(initialArm ? { 'ebsf-diagnostics:armed:v1': JSON.stringify(initialArm) } : {});
  const context = {
    sessionStorage,
    JSON,
    TypeError,
    Element: FakeElement,
    globalThis: null,
    ...(mutationObserver ? { MutationObserver: FakeNativeMutationObserver } : {})
  };
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

test('panel observer guard suppresses same-value attribute feedback but delivers real state changes', () => {
  const { context } = run(null, { mutationObserver: true });
  assert.equal(context.__EBSF_DIAG_PANEL_OBSERVER_GUARD__, true);

  const panel = new FakeElement('__etsy_bettersearch_diagnostics__');
  panel.setAttribute('data-recording', '0');
  const delivered = [];
  const observer = new context.MutationObserver((records) => delivered.push(...records));
  observer.observe(panel, { attributes: true, attributeFilter: ['data-recording', 'disabled'] });

  assert.equal(observer.inner.options.attributeOldValue, true);

  observer.inner.emit([{
    type: 'attributes',
    target: panel,
    attributeName: 'data-recording',
    oldValue: '0'
  }]);
  assert.equal(delivered.length, 0, 'same-value write must not schedule another controls sync');

  panel.setAttribute('data-recording', '1');
  observer.inner.emit([{
    type: 'attributes',
    target: panel,
    attributeName: 'data-recording',
    oldValue: '0'
  }]);
  assert.equal(delivered.length, 1, 'real recording state transition must still reach controls');
});

test('non-panel observers retain native mutation delivery semantics', () => {
  const { context } = run(null, { mutationObserver: true });
  const root = new FakeElement('etsy-root');
  root.setAttribute('class', 'same');
  const delivered = [];
  const observer = new context.MutationObserver((records) => delivered.push(...records));
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  observer.inner.emit([{ type: 'attributes', target: root, attributeName: 'class', oldValue: 'same' }]);
  assert.equal(delivered.length, 1);
  assert.equal(observer.inner.options.attributeOldValue, undefined);
});
