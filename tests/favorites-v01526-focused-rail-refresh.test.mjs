import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const modulePath = resolve(ROOT, 'src/108-favorites-v01526-focused-rail-refresh.js');

function editor(type = 'number') {
  const listeners = new Map();
  return {
    isConnected: true,
    disabled: false,
    readOnly: false,
    type,
    matches(selector) {
      return selector.includes(`input[type="${type}"]`) || (type === 'textarea' && selector.includes('textarea'));
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    fire(name) {
      listeners.get(name)?.({ target:this });
    },
  };
}

async function createContext({ active = null, contains = true } = {}) {
  const source = await readFile(modulePath, 'utf8');
  const timers = [];
  const calls = [];
  const rail = {
    isConnected: true,
    contains(node) { return contains && node === context.document.activeElement; },
  };
  const context = vm.createContext({
    console,
    document: { activeElement: active },
    favState: { rail },
    favRefreshRail(...args) {
      calls.push(args);
      return { rebuilt:true, args };
    },
    setTimeout(handler) {
      timers.push(handler);
      return timers.length;
    },
  });
  vm.runInContext(source, context);
  return { context, rail, calls, timers };
}

function flushNext(timers) {
  const next = timers.shift();
  assert.ok(next, 'expected deferred timer');
  next();
}

test('focused number editor defers destructive rail refresh', async () => {
  const active = editor('number');
  const { context, rail, calls } = await createContext({ active });
  assert.equal(context.favRefreshRail('metadata'), rail);
  assert.equal(calls.length, 0);
  assert.equal(context.favState.railRefreshDeferred01526, true);
  assert.equal(context.favState.railRefreshDeferredTarget01526, active);
});

test('multiple refresh requests coalesce and flush latest args after focusout', async () => {
  const active = editor('text');
  const { context, calls, timers } = await createContext({ active });
  context.favRefreshRail('first');
  context.favRefreshRail('latest', 2);
  assert.equal(calls.length, 0);

  active.fire('focusout');
  assert.equal(calls.length, 0, 'flush waits until the next task so change/blur handlers commit first');
  context.document.activeElement = null;
  flushNext(timers);

  assert.deepEqual(Array.from(calls[0]), ['latest', 2]);
  assert.equal(calls.length, 1);
  assert.equal(context.favState.railRefreshDeferred01526, false);
});

test('focus moving directly to another draft editor re-defers instead of rebuilding', async () => {
  const first = editor('number');
  const second = editor('search');
  const { context, calls, timers } = await createContext({ active:first });
  context.favRefreshRail('queued');
  first.fire('focusout');
  context.document.activeElement = second;
  flushNext(timers);
  assert.equal(calls.length, 0);
  assert.equal(context.favState.railRefreshDeferredTarget01526, second);

  second.fire('focusout');
  context.document.activeElement = null;
  flushNext(timers);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0]), ['queued']);
});

test('checkbox and other commit-immediate controls refresh without deferral', async () => {
  const active = editor('checkbox');
  const { context, calls, timers } = await createContext({ active });
  const result = context.favRefreshRail('checkbox');
  assert.equal(result.rebuilt, true);
  assert.equal(calls.length, 1);
  assert.equal(timers.length, 0);
  assert.equal(context.favState.railRefreshDeferred01526, false);
});

test('disabled or read-only text controls do not hold maintenance refreshes', async () => {
  for (const property of ['disabled', 'readOnly']) {
    const active = editor('text');
    active[property] = true;
    const { context, calls } = await createContext({ active });
    context.favRefreshRail(property);
    assert.equal(calls.length, 1, `${property} control should not defer`);
  }
});

test('an immediate refresh supersedes a previously deferred callback', async () => {
  const active = editor('number');
  const { context, calls, timers } = await createContext({ active });
  context.favRefreshRail('old');
  active.fire('focusout');
  context.document.activeElement = null;
  context.favRefreshRail('new');
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0]), ['new']);
  flushNext(timers);
  assert.equal(calls.length, 1, 'stale focusout callback becomes a no-op');
});

test('module is wired after native-heart guard and before final ownership chain at behavior-gate identity', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const heart = userscript.indexOf('/src/107-favorites-v01525-native-heart-confirmation.js?v=0.15.27');
  const focus = userscript.indexOf('/src/108-favorites-v01526-focused-rail-refresh.js?v=0.15.27');
  const ownership = userscript.indexOf('/src/102-favorites-v0155-stable-ownership-final.js?v=0.15.27');
  const metadata = userscript.indexOf('/src/106-favorites-v01524-metadata-context-generation.js?v=0.15.27');
  assert.ok(heart >= 0 && focus > heart && ownership > focus && metadata > ownership);
  assert.match(userscript, /@version\s+0\.15\.27/);
});
