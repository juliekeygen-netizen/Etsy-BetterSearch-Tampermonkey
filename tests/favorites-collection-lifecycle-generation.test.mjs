import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/94a-favorites-collection-lifecycle-generation.js', import.meta.url), 'utf8');

function collection(id, name = `Collection ${id}`) {
  return {
    __type:'collection',
    id:String(id),
    slug:`collection-${id}`,
    name,
    url:`https://www.etsy.com/people/alice/favorites/collection-${id}`,
    privacyLevel:'private',
  };
}

function propsScript(owner, collections) {
  return { textContent:JSON.stringify({ profileOwnerUserId:owner, collectionsTabs:collections }) };
}

function makeDialog({ id = '', label = '', hinted = false } = {}) {
  return {
    id,
    hidden:false,
    isConnected:true,
    matches:(selector) => selector === '[role="dialog"]',
    getAttribute:(name) => name === 'aria-hidden' ? 'false' : name === 'aria-label' ? label : null,
    querySelector:() => hinted ? {} : null,
  };
}

function loadFixture() {
  let current = {
    owner:'owner-a', login:'alice', route:'route-a', dataset:'dataset-a',
    href:'https://www.etsy.com/people/alice?tab=items',
  };
  let liveScripts = [propsScript('owner-a', [collection('a1')])];
  let dialogs = [];
  let controlledId = 'create-collection-dialog';
  let timeoutSequence = 0;
  const observers = [];
  const fetchQueue = [];
  const calls = { installs:0, fetches:[], refreshes:[] };
  const sidebar = {};
  const contentNode = {};

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe() {}
    disconnect() { this.disconnected = true; }
    trigger() { if (!this.disconnected) this.callback([]); }
  }

  class FakeDOMParser {
    parseFromString(text) {
      const payloads = JSON.parse(text);
      const scripts = payloads.map((payload) => propsScript(payload.owner, payload.collections));
      return {
        querySelectorAll:(selector) => selector === 'script[type="text/props"]' ? scripts : [],
      };
    }
  }

  const context = vm.createContext({
    console,
    Promise,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Math,
    JSON,
    globalThis:null,
    favState:{ collectionModel0120:null },
    location:{
      get href() { return current.href; },
      get pathname() { return new URL(current.href).pathname; },
      get search() { return new URL(current.href).search; },
    },
    document:{
      body:{},
      querySelectorAll:(selector) => {
        if (selector === 'script[type="text/props"]') return liveScripts;
        if (selector === '[role="dialog"]') return dialogs;
        return [];
      },
      querySelector:(selector) => selector === '[data-testid="sidebar"]' ? sidebar : null,
    },
    favScope:() => ({ owner:current.owner, login:current.login, type:'items', id:'' }),
    favProfileLogin:() => current.login,
    favRouteIdentity0126:() => current.route,
    favDatasetKey:() => current.dataset,
    favFavoritesContentColumn0120:() => contentNode,
    favInstallCollectionStrip0120:() => { calls.installs += 1; },
    favNativeCreateButton0120:() => ({
      getAttribute:(name) => name === 'aria-controls' ? controlledId : null,
    }),
    favCollections0120:() => [],
    favRefreshCollectionModel0120:async () => false,
    favWatchCollectionCreation0120:() => null,
    MutationObserver:FakeMutationObserver,
    DOMParser:FakeDOMParser,
    setTimeout:() => ++timeoutSequence,
    clearTimeout:() => {},
    fetch:async (url) => {
      calls.fetches.push(String(url));
      const next = fetchQueue.shift();
      if (!next) throw new Error('Unexpected fetch');
      return next;
    },
  });
  context.globalThis = context;

  vm.runInContext(`${source}\nglobalThis.testApi={
    collections:()=>favCollections0120(),
    refresh:(value)=>favRefreshCollectionModel0120(value),
    watch:()=>favWatchCollectionCreation0120(),
    capture:()=>favCollectionContext01526(),
    operationCurrent:(operation)=>favCollectionCreateOperationCurrent01526(operation),
    chooseDialog:(operation)=>favChooseCollectionDialog01526(operation),
    state:favState,
    setRefresh:(fn)=>{favRefreshCollectionModel0120=fn;},
  };`, context);

  const api = context.testApi;
  api.calls = calls;
  api.observers = observers;
  api.setCurrent = (patch) => { current = { ...current, ...patch }; };
  api.setLive = (owner, collections) => { liveScripts = collections == null ? [] : [propsScript(owner, collections)]; };
  api.setLiveScripts = (scripts) => { liveScripts = scripts; };
  api.setDialogs = (value) => { dialogs = value; };
  api.setControlledId = (value) => { controlledId = String(value || ''); };
  api.queueResponse = (owner, collections, options = {}) => {
    const payload = JSON.stringify([{ owner, collections }]);
    fetchQueue.push({
      ok:options.ok !== false,
      text:options.text || (async () => payload),
    });
  };
  api.queueDeferredResponse = (owner, collections) => {
    let resolveText;
    const payload = JSON.stringify([{ owner, collections }]);
    const textPromise = new Promise((resolve) => { resolveText = () => resolve(payload); });
    fetchQueue.push({ ok:true, text:() => textPromise });
    return resolveText;
  };
  return api;
}

test('owner-keyed fallback never reuses profile A collections on profile B', () => {
  const api = loadFixture();
  assert.deepEqual(Array.from(api.collections(), (entry) => entry.id), ['a1']);

  api.setCurrent({
    owner:'owner-b', login:'bob', route:'route-b', dataset:'dataset-b',
    href:'https://www.etsy.com/people/bob?tab=items',
  });
  /* Simulate A props remaining mounted during the soft transition. */
  assert.deepEqual(Array.from(api.collections()), []);
});

test('same-owner temporary props gap may reuse its own cached collection model', () => {
  const api = loadFixture();
  assert.deepEqual(Array.from(api.collections(), (entry) => entry.id), ['a1']);
  api.setLive('owner-a', null);
  assert.deepEqual(Array.from(api.collections(), (entry) => entry.id), ['a1']);
});

test('verified network refresh stays newer than stale same-document SSR props', async () => {
  const api = loadFixture();
  assert.deepEqual(Array.from(api.collections(), (entry) => entry.id), ['a1']);
  api.queueResponse('owner-a', [collection('a1'), collection('a2')]);

  const changed = await api.refresh(api.capture());
  assert.equal(changed, true);
  assert.equal(api.calls.installs, 1);
  assert.deepEqual(Array.from(api.collections(), (entry) => entry.id), ['a1', 'a2']);
  assert.equal(api.state.collectionModelVerified01526, true);
});

test('refresh rejects a response carrying a different profile owner', async () => {
  const api = loadFixture();
  api.collections();
  api.queueResponse('owner-b', [collection('b1')]);
  assert.equal(await api.refresh(api.capture()), false);
  assert.deepEqual(Array.from(api.collections(), (entry) => entry.id), ['a1']);
  assert.equal(api.calls.installs, 0);
});

test('route change while refresh is awaiting response fails closed', async () => {
  const api = loadFixture();
  api.collections();
  const resolve = api.queueDeferredResponse('owner-a', [collection('a1'), collection('a2')]);
  const refresh = api.refresh(api.capture());
  api.setCurrent({ route:'route-a-next', dataset:'dataset-a-next' });
  resolve();
  assert.equal(await refresh, false);
  assert.deepEqual(Array.from(api.state.collectionModel0120, (entry) => entry.id), ['a1']);
  assert.equal(api.calls.installs, 0);
});

test('superseding create generation invalidates an older same-route network refresh', async () => {
  const api = loadFixture();
  api.collections();
  const context = api.capture();
  api.state.collectionCreateGeneration01526 = 1;
  context.createGeneration = 1;
  const resolve = api.queueDeferredResponse('owner-a', [collection('a1'), collection('a2')]);
  const refresh = api.refresh(context);
  api.state.collectionCreateGeneration01526 = 2;
  resolve();
  assert.equal(await refresh, false);
  assert.deepEqual(Array.from(api.state.collectionModel0120, (entry) => entry.id), ['a1']);
});

test('create watcher ignores pre-existing dialogs and tracks the exact controlled dialog', async () => {
  const api = loadFixture();
  const baseline = makeDialog({ id:'unrelated-existing' });
  api.setDialogs([baseline]);
  const refreshes = [];
  api.setRefresh(async (context) => { refreshes.push({ ...context }); return true; });

  const operation = api.watch();
  assert.ok(operation);
  const observer = api.observers.at(-1);
  const createDialog = makeDialog({ id:'create-collection-dialog' });
  api.setDialogs([baseline, createDialog]);
  observer.trigger();
  assert.equal(operation.dialog, createDialog);

  createDialog.isConnected = false;
  api.setDialogs([baseline]);
  observer.trigger();
  await Promise.resolve();
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].owner, 'owner-a');
  assert.equal(refreshes[0].createGeneration, operation.generation);
});

test('multiple ambiguous new dialogs fail closed instead of guessing a create completion', async () => {
  const api = loadFixture();
  api.setControlledId('');
  api.setDialogs([]);
  let refreshes = 0;
  api.setRefresh(async () => { refreshes += 1; return true; });

  const operation = api.watch();
  const observer = api.observers.at(-1);
  api.setDialogs([makeDialog({ id:'one' }), makeDialog({ id:'two' })]);
  observer.trigger();
  assert.equal(operation.dialog, null);
  await Promise.resolve();
  assert.equal(refreshes, 0);
});

test('owner or route change cancels the tracked create operation without refresh', async () => {
  const api = loadFixture();
  api.setDialogs([]);
  let refreshes = 0;
  api.setRefresh(async () => { refreshes += 1; return true; });

  const operation = api.watch();
  const observer = api.observers.at(-1);
  const createDialog = makeDialog({ id:'create-collection-dialog' });
  api.setDialogs([createDialog]);
  observer.trigger();
  assert.equal(operation.dialog, createDialog);

  api.setCurrent({ route:'route-other', dataset:'dataset-other' });
  createDialog.isConnected = false;
  api.setDialogs([]);
  observer.trigger();
  await Promise.resolve();
  assert.equal(refreshes, 0);
  assert.equal(operation.observer, null);
});
