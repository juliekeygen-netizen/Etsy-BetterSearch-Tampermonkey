import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/104-favorites-v0157-filter-state-sync.js', import.meta.url), 'utf8');
const marker = '/* ------------------------------------------------------------------------- *\n * v0.15.11 count authority';
const start = source.indexOf(marker);
assert.ok(start >= 0, 'v0.15.11 count authority block must exist');
const countSource = source.slice(start);

function propsScript(value) {
  return { textContent:JSON.stringify(value) };
}

function loadFixture({
  scope = { owner:'owner-1', type:'items', id:'', query:'', datasetKey:'owner-1|items||q:' },
  scripts = [propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:108 })],
  cachedTotal = 107,
} = {}) {
  let currentScope = { ...scope };
  let committedQuery = String(scope.query || '');
  let nextCommittedQuery = null;
  let scriptList = scripts.slice();
  const calls = { writes:[] };
  const catalogStates = new Map();

  const context = vm.createContext({
    console, Promise, Map, Set, WeakMap, Array, Object, String, Number, Math, JSON,
    globalThis:null,
    favState:{
      nativeQueryGeneration01511:0,
      loadComplete:true,
      loadKey:scope.datasetKey,
      loadSource0137:'cache',
      total:cachedTotal,
      records:Array.from({ length:cachedTotal }, (_, index) => ({ id:String(index + 1) })),
      filtered:[],
    },
    document:{
      querySelectorAll:(selector) => selector === 'script[type="text/props"]' ? scriptList : [],
    },
    normalize:(value) => String(value || '').trim().toLowerCase(),
    favCatalogCurrentDescriptor0141:() => ({ ...currentScope }),
    favCatalogIsCurrent0141:(candidate) => String(candidate?.datasetKey || '') === String(currentScope.datasetKey || ''),
    favDatasetKey:() => String(currentScope.datasetKey || ''),
    favEnhancementActive:() => false,
    favCatalogKey0141:(candidate) => String(candidate?.datasetKey || ''),
    favCatalogStates0141:catalogStates,
    favCatalogState0141:(candidate) => catalogStates.get(String(candidate?.datasetKey || '')) || {
      status:'idle', expectedTotal:0, expectedTotalKnown:false,
    },
    favCatalogPublish0141:(candidate, patch = {}) => {
      const key = String(candidate?.datasetKey || '');
      const next = { ...(catalogStates.get(key) || {}), ...structuredClone(patch) };
      catalogStates.set(key, next);
      return next;
    },
    favIndexCurrentScope:() => ({ ...currentScope }),
    favIndexObserveRecordsNow:async (records, options) => {
      calls.writes.push({ records:structuredClone(records), options:structuredClone(options) });
      return ['written'];
    },
    favCommittedNativeQuery0138:() => committedQuery,
    favMaybeCommitSubmittedNativeQuery0140:() => {
      if (nextCommittedQuery === null) return false;
      const next = String(nextCommittedQuery);
      nextCommittedQuery = null;
      const changed = next !== committedQuery;
      committedQuery = next;
      return changed;
    },
    structuredClone,
  });
  context.globalThis = context;

  vm.runInContext(`${countSource}\nglobalThis.testApi={
    counts:()=>favScopeCounts0120(),
    evidence:(candidate=favCatalogCurrentDescriptor0141())=>favEtsyCountEvidence01511(candidate),
    expected:(candidate=favCatalogCurrentDescriptor0141())=>favCatalogExpectedTotal0141(candidate),
    publish:(candidate, patch)=>favCatalogPublish0141(candidate, patch),
    observe:(records, options)=>favIndexObserveRecordsNow(records, options),
    commitQuery:()=>favMaybeCommitSubmittedNativeQuery0140(),
    generation:()=>favState.nativeQueryGeneration01511,
  };`, context);

  const api = context.testApi;
  api.calls = calls;
  api.states = catalogStates;
  api.setScope = (next) => {
    currentScope = { ...next };
    context.favState.loadKey = currentScope.datasetKey;
  };
  api.setLoadKey = (value) => { context.favState.loadKey = String(value); };
  api.setCacheTotal = (value) => { context.favState.total = Number(value); };
  api.setNextCommittedQuery = (value) => { nextCommittedQuery = String(value); };
  api.addScript = (value) => { scriptList.push(propsScript(value)); };
  api.replaceScripts = (values) => { scriptList = values.map(propsScript); };
  return api;
}

test('current Etsy 108 outranks stale committed cache 107', () => {
  const api = loadFixture();
  const result = api.counts();
  assert.equal(result.total, 108);
  assert.equal(result.totalSource, 'etsy-props.totalListings');
  assert.equal(result.totalAuthoritative, true);
});

test('authoritative Etsy zero is not collapsed into unknown or stale cache count', () => {
  const api = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:0 })],
  });
  assert.deepEqual({ ...api.evidence() }, {
    known:true, value:0, source:'etsy-props.totalListings', authoritative:true,
  });
  assert.equal(api.expected(), 0);
  assert.equal(api.counts().total, 0);
});

test('coercion-only or non-integral raw counts never become authoritative Etsy zero/count evidence', () => {
  const invalidValues = [null, '', '   ', false, true, 1.5, -1, '1.5', '-1'];
  for (const totalListings of invalidValues) {
    const api = loadFixture({
      scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings })],
    });
    assert.equal(api.evidence().known, false, `must reject ${JSON.stringify(totalListings)}`);
    const result = api.counts();
    assert.equal(result.total, 107);
    assert.equal(result.totalSource, 'committed-cache');
    assert.equal(result.totalAuthoritative, false);
  }
});

test('invalid totalListings falls through to a valid explicit itemCount, including zero', () => {
  const positive = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:null, itemCount:108 })],
  });
  assert.deepEqual({ ...positive.evidence() }, {
    known:true, value:108, source:'etsy-props.itemCount', authoritative:true,
  });

  const zero = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:'', itemCount:0 })],
  });
  assert.deepEqual({ ...zero.evidence() }, {
    known:true, value:0, source:'etsy-props.itemCount', authoritative:true,
  });
});

test('decimal digit strings remain valid explicit count payloads without accepting general coercion', () => {
  const api = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:'108' })],
  });
  assert.deepEqual({ ...api.evidence() }, {
    known:true, value:108, source:'etsy-props.totalListings', authoritative:true,
  });
});

test('missing current dataset identity cannot label a complete cache as current', () => {
  const scope = { owner:'owner-1', type:'items', id:'', query:'', datasetKey:'' };
  const api = loadFixture({
    scope,
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', listings:[] })],
    cachedTotal:107,
  });
  const result = api.counts();
  assert.equal(result.total, 107);
  assert.equal(result.totalSource, 'records');
  assert.equal(result.totalAuthoritative, false);
});

test('mismatched complete dataset identity falls back to records instead of committed-current provenance', () => {
  const api = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', listings:[] })],
  });
  api.setLoadKey('different-dataset');
  const result = api.counts();
  assert.equal(result.total, 107);
  assert.equal(result.totalSource, 'records');
  assert.equal(result.totalAuthoritative, false);
});

test('missing server count means unknown zero and falls back to the committed dataset', () => {
  const api = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', listings:[] })],
  });
  assert.equal(api.evidence().known, false);
  assert.equal(api.expected(), 0, 'numeric compatibility API still returns zero');
  const result = api.counts();
  assert.equal(result.total, 107);
  assert.equal(result.totalSource, 'committed-cache');
  assert.equal(result.totalAuthoritative, false);
});

test('query mismatch never lets old SSR count outrank the current dataset', () => {
  const scope = { owner:'owner-1', type:'items', id:'', query:'search', datasetKey:'owner-1|items||q:search' };
  const api = loadFixture({
    scope,
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:108 })],
    cachedTotal:9,
  });
  assert.equal(api.evidence().source, 'query-mismatch');
  assert.equal(api.counts().total, 9);
  assert.equal(api.counts().totalSource, 'committed-cache');
});

test('native search generation prevents original SSR count reviving after search then clear', () => {
  const api = loadFixture();
  assert.equal(api.counts().total, 108);
  assert.equal(api.generation(), 0);

  api.setNextCommittedQuery('search');
  assert.equal(api.commitQuery(), true);
  assert.equal(api.generation(), 1);
  api.setScope({ owner:'owner-1', type:'items', id:'', query:'search', datasetKey:'owner-1|items||q:search' });
  api.setCacheTotal(5);
  assert.equal(api.counts().total, 5, 'initial SSR props are stale after client search commit');

  api.addScript({ profileOwnerUserId:'owner-1', query:'search', itemCount:6 });
  assert.equal(api.counts().total, 6, 'new props in the new query generation may become authority');

  api.setNextCommittedQuery('');
  assert.equal(api.commitQuery(), true);
  assert.equal(api.generation(), 2);
  api.setScope({ owner:'owner-1', type:'items', id:'', query:'', datasetKey:'owner-1|items||q:' });
  api.setCacheTotal(107);
  assert.equal(api.counts().total, 107, 'generation 0 SSR 108 must not revive merely because query is empty again');

  api.addScript({ profileOwnerUserId:'owner-1', query:'', totalListings:109 });
  assert.equal(api.counts().total, 109, 'fresh generation-2 props regain authority');
});

test('soft-navigation scope stamps reject stale props from the previous Favorites scope', () => {
  const api = loadFixture();
  assert.equal(api.counts().total, 108);

  api.setScope({ owner:'owner-1', type:'collection', id:'new-collection', query:'', datasetKey:'owner-1|collection|new-collection|q:' });
  api.setCacheTotal(4);
  assert.equal(api.counts().total, 4, 'old All props stay bound to the All scope');

  api.addScript({ profileOwnerUserId:'owner-1', query:'', totalListings:7 });
  assert.equal(api.counts().total, 7, 'new props observed in the collection may become authority');
});

test('owner mismatch is never accepted as count authority', () => {
  const api = loadFixture({
    scripts:[propsScript({ profileOwnerUserId:'different-owner', query:'', totalListings:999 })],
  });
  assert.equal(api.evidence().known, false);
  assert.equal(api.counts().total, 107);
});

test('known-zero provenance stays attached to one crawl even after visible currentness changes', async () => {
  const oldScope = { owner:'owner-1', type:'items', id:'', query:'', datasetKey:'owner-1|items||q:' };
  const api = loadFixture({
    scope:oldScope,
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:0 })],
    cachedTotal:0,
  });

  const started = api.publish(oldScope, {
    status:'running', processed:0, expectedTotal:0, startedAt:100,
  });
  assert.equal(started.expectedTotalKnown, true);

  api.setScope({ owner:'owner-1', type:'collection', id:'elsewhere', query:'', datasetKey:'owner-1|collection|elsewhere|q:' });
  const progressed = api.publish(oldScope, {
    status:'running', processed:1, expectedTotal:0,
  });
  assert.equal(progressed.expectedTotalKnown, true, 'navigation cannot erase the crawl-start evidence');

  await assert.rejects(
    api.observe([{ id:'unexpected' }], { scope:oldScope, complete:true }),
    /1 crawled, 0 expected/,
  );
  assert.equal(api.calls.writes.length, 0, 'mismatching known-zero complete snapshot is rejected before persistence');

  const accepted = await api.observe([], { scope:oldScope, complete:true });
  assert.deepEqual(Array.from(accepted), ['written']);
  assert.equal(api.calls.writes.length, 1);
});

test('a new crawl must establish its own expected-count provenance and cannot inherit a prior run', () => {
  const scope = { owner:'owner-1', type:'items', id:'', query:'', datasetKey:'owner-1|items||q:' };
  const api = loadFixture({
    scope,
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:0 })],
    cachedTotal:0,
  });
  assert.equal(api.publish(scope, { status:'running', processed:0, expectedTotal:0, startedAt:100 }).expectedTotalKnown, true);

  api.setNextCommittedQuery('search');
  api.commitQuery();
  api.setScope({ ...scope, query:'search', datasetKey:'owner-1|items||q:search' });

  const restarted = api.publish(scope, { status:'running', processed:0, expectedTotal:0, startedAt:200 });
  assert.equal(restarted.expectedTotalKnown, false, 'new run cannot reuse the previous run provenance');
});

test('known positive count uses unique listing identity at the final complete-write guard', async () => {
  const scope = { owner:'owner-1', type:'items', id:'', query:'', datasetKey:'owner-1|items||q:' };
  const api = loadFixture({
    scope,
    scripts:[propsScript({ profileOwnerUserId:'owner-1', query:'', totalListings:1 })],
    cachedTotal:1,
  });
  api.publish(scope, { status:'running', processed:0, expectedTotal:1, startedAt:100 });

  const result = await api.observe([{ id:'A' }, { id:'A' }], { scope, complete:true });
  assert.deepEqual(Array.from(result), ['written']);
  assert.equal(api.calls.writes.length, 1);

  await assert.rejects(
    api.observe([{ id:'A' }, { id:'B' }], { scope, complete:true }),
    /2 crawled, 1 expected/,
  );
  assert.equal(api.calls.writes.length, 1);
});
