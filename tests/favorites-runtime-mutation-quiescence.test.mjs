import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');

function block(startText, endText = '') {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `missing ${startText}`);
  const end = endText ? source.indexOf(endText, start) : source.length;
  assert.ok(end > start, `missing ${endText}`);
  return source.slice(start, end);
}

function makeElement({ owned = false, critical = false, parent = null, criticalDescendant = false } = {}) {
  return {
    nodeType:1,
    parentElement:parent,
    matches:(selector) => (owned && selector.includes('[data-ebsf-owned]')) || (critical && selector.includes('[data-ebsf-local-grid]')),
    closest:(selector) => owned || Boolean(parent?.closest?.(selector)),
    querySelector:(selector) => criticalDescendant && selector.includes('[data-ebsf-local-grid]') ? {} : null,
  };
}

function loadMutationApi() {
  const code = block('var FAV_RUNTIME_OWNED_SURFACE0137', 'function favStartRuntime()');
  const scheduled = { sync:0, observe:0 };
  const context = vm.createContext({
    Array,
    scheduled,
    favState:{ rendering:false },
    favScheduleSync:() => { scheduled.sync += 1; },
    favScheduleCurrentPageObservation:() => { scheduled.observe += 1; },
  });
  vm.runInContext(`${code}\nglobalThis.testApi={needs:favRuntimeMutationNeedsLifecycle0137,handle:favRuntimeHandleMutations0137,scheduled,state:favState};`, context);
  return context.testApi;
}

function loadTimerApi() {
  const code = [
    block('function favScheduleSync', 'function favScheduleCurrentPageObservation'),
    block('function favScheduleCurrentPageObservation', 'var FAV_RUNTIME_OWNED_SURFACE0137'),
  ].join('\n');
  let nextId = 1;
  const timers = new Map();
  const cleared = [];
  const context = vm.createContext({
    Math, Number,
    favState:{ syncTimer:0, syncDelay0137:0, observeTimer:0, observeDelay0137:0, rendering:false },
    setTimeout:(callback, delay) => { const id = nextId++; timers.set(id, { callback, delay }); return id; },
    clearTimeout:(id) => { if (id) cleared.push(id); timers.delete(id); },
    isFavoritesPage:() => false,
    favRestoreNative:() => {},
    favCloseFilters:() => {},
    favHideSyncProgress:() => {},
    favMaybeCaptureSettledNativePage0137:() => false,
    favIndexObserveCurrentPage:() => Promise.resolve(),
    favEnhancementActive:() => false,
    favDatasetKey:() => '',
    requestAnimationFrame:() => {},
    Promise,
  });
  vm.runInContext(`${code}\nglobalThis.testApi={sync:favScheduleSync,observe:favScheduleCurrentPageObservation,state:favState};`, context);
  return { api:context.testApi, timers, cleared };
}

test('runtime body observer is filtered through one semantic mutation handler', () => {
  const start = block('function favStartRuntime()');
  assert.match(start, /new MutationObserver\(favRuntimeHandleMutations0137\)/);
  assert.match(start, /observe\(document\.body,\{childList:true,subtree:true\}\)/);
  assert.doesNotMatch(start, /new MutationObserver\(\(\)=>/);
});

test('owned presentation mutations do not schedule route or page lifecycle work', () => {
  const { needs, handle, scheduled } = loadMutationApi();
  const body = makeElement();
  const owned = makeElement({ owned:true });
  const child = makeElement({ parent:owned });

  assert.equal(needs({ type:'childList', target:owned, addedNodes:[child], removedNodes:[] }), false);
  assert.equal(needs({ type:'childList', target:body, addedNodes:[owned], removedNodes:[] }), false);
  assert.equal(handle([{ type:'childList', target:body, addedNodes:[owned], removedNodes:[] }]), false);
  assert.deepEqual({ ...scheduled }, { sync:0, observe:0 });
});

test('native mutations still schedule both lifecycle paths', () => {
  const { needs, handle, scheduled } = loadMutationApi();
  const native = makeElement();
  const card = makeElement();
  const record = { type:'childList', target:native, addedNodes:[card], removedNodes:[] };
  assert.equal(needs(record), true);
  assert.equal(handle([record]), true);
  assert.deepEqual({ ...scheduled }, { sync:1, observe:1 });
});

test('removing a critical BetterSearch ownership surface remains lifecycle-relevant', () => {
  const { needs } = loadMutationApi();
  const nativeHost = makeElement();
  const localGrid = makeElement({ owned:true, critical:true });
  assert.equal(needs({ type:'childList', target:nativeHost, addedNodes:[], removedNodes:[localGrid] }), true);
});

test('render transaction mutations are ignored while favState.rendering is true', () => {
  const { handle, scheduled, state } = loadMutationApi();
  const native = makeElement();
  const card = makeElement();
  state.rendering = true;
  assert.equal(handle([{ type:'childList', target:native, addedNodes:[card], removedNodes:[] }]), false);
  assert.deepEqual({ ...scheduled }, { sync:0, observe:0 });
});

test('urgent route sync cannot be postponed by generic mutation debounce', () => {
  const { api, timers, cleared } = loadTimerApi();
  const urgent = api.sync(0);
  assert.equal(timers.get(urgent).delay, 0);
  const afterGeneric = api.sync(250);
  assert.equal(afterGeneric, urgent);
  assert.equal(cleared.includes(urgent), false, 'generic sync must not clear urgent sync');
});

test('equal-priority generic route sync still debounces normally', () => {
  const { api, timers, cleared } = loadTimerApi();
  const first = api.sync(250);
  const second = api.sync(250);
  assert.notEqual(second, first);
  assert.equal(cleared.includes(first), true);
  assert.equal(timers.get(second).delay, 250);
});

test('urgent native-view observation cannot be displaced by generic 1000ms churn', () => {
  const { api, timers, cleared } = loadTimerApi();
  const urgent = api.observe(350);
  assert.equal(timers.get(urgent).delay, 350);
  const afterGeneric = api.observe(1000);
  assert.equal(afterGeneric, urgent);
  assert.equal(cleared.includes(urgent), false);
});

test('a more urgent observation may pre-empt a slower pending observation', () => {
  const { api, timers, cleared } = loadTimerApi();
  const slow = api.observe(1000);
  const fast = api.observe(350);
  assert.notEqual(fast, slow);
  assert.equal(cleared.includes(slow), true);
  assert.equal(timers.get(fast).delay, 350);
});

test('timer priority state is cleared before timer callbacks execute', () => {
  const { api, timers } = loadTimerApi();
  const sync = api.sync(80);
  timers.get(sync).callback();
  assert.equal(api.state.syncTimer, 0);
  assert.equal(api.state.syncDelay0137, 0);

  const observe = api.observe(350);
  timers.get(observe).callback();
  assert.equal(api.state.observeTimer, 0);
  assert.equal(api.state.observeDelay0137, 0);
});

test('native Search slot is deliberately not classified as wholly BetterSearch-owned', () => {
  const selectors = block('var FAV_RUNTIME_OWNED_SURFACE0137', 'var FAV_RUNTIME_CRITICAL_REMOVAL0137');
  assert.doesNotMatch(selectors, /native-search-slot/);
});

test('legacy result-count writer compares text before mutating', () => {
  const renderCount = block('function favRenderCount', 'function favRenderPagination');
  assert.match(renderCount, /if\(favState\.countNode\.textContent!==text\)favState\.countNode\.textContent=text/);
});
