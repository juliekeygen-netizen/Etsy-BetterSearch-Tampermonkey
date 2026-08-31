import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const correction = await readFile(new URL('../src/99-favorites-v0131-correctness.js', import.meta.url), 'utf8');
const ack = await readFile(new URL('../src/99a-favorites-native-query-ack.js', import.meta.url), 'utf8');
const routeIdentity = await readFile(new URL('../src/61f-favorites-route-identity.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function sourceBlock(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `expected source block ${startText}`);
  return source.slice(start, end);
}

const provenanceSource = sourceBlock(
  routeIdentity,
  'function favCommittedNativeQueryProvenance01510',
  'function favScopeWithQueryProvenance01510',
);

function grid(ids = []) {
  return {
    children:Array.from(ids, (id) => ({ id:String(id) })),
  };
}

function input(value) {
  return {
    value:String(value),
    matches:() => true,
    closest:() => ({}),
    getAttribute:() => 'Search within this collection',
  };
}

function fixture({ initialCommitted = '', initialIds = ['A','B'] } = {}) {
  let nativeGrid = grid(initialIds);
  let propsQuery = initialCommitted;
  let href = 'https://www.etsy.com/people/example?tab=items';
  let syncCalls = 0;
  let observations = 0;
  const scheduled = [];

  const context = {
    favState:{
      records:[], loadKey:'', loadComplete:false, loadSource0137:'', cachePresentationReady0137:false,
      shellObserver0120:null, nativeQuerySettleTimers0140:[], localPage:1, localPageRouteKey0129:'',
      nativePageIntent0139:0, nativePageIntentAt0139:0,
    },
    favCfg:{ strict:false, multi:false },
    FAV_CACHE_PRESENTATION_VERSION0137:1,
    favRecordFromListing:(listing, _node, order) => ({ id:String(listing.id || '1'), imageUrl:String(listing.imageUrl || ''), secondaryImageUrl:'', order }),
    favDatasetKey:() => 'scope',
    favDatasetQuery:() => String(context.favCommittedNativeQuery0138?.() || ''),
    favPrimeDatasetFromCache0137:async () => false,
    favLoadAll:async () => [],
    favLoadAllNetwork0137:async () => [],
    favCacheReadScope0137:async () => null,
    favIndexGetScope:async () => null,
    favIndexCurrentScope:() => ({ scopeKey:'scope' }),
    isFavoritesPage:() => true,
    favCardMap:() => new Map(),
    favListingsFromProps:() => [],
    favProps:() => ({ query:propsQuery }),
    favIndexOpen:async () => ({}),
    favIndexRequest:async () => null,
    favCommittedNativeQuery0138:() => initialCommitted,
    favScope:() => ({ owner:'owner', type:'collection', id:'vns' }),
    favMainGrid:() => nativeGrid,
    favNativeMainGrid0141:() => nativeGrid,
    favListingIdFromNode:(node) => String(node?.id || ''),
    favScheduleCurrentPageObservation:(delay = 0) => { scheduled.push(delay); },
    favScheduleSync:() => { syncCalls += 1; },
    favIndexObserveCurrentPage:() => { observations += 1; },
    favShellMutationRelevant0128:() => false,
    favMutationElement0128:(node) => node?.nodeType === 1 ? node : node?.parentElement || null,
    favDesktopShell0120:() => true,
    favScheduleShellRepair0123:() => {},
    MutationObserver:class { disconnect() {} observe() {} },
    GM_addStyle:() => {},
    document:{
      addEventListener:() => {},
      body:{},
      createElement:() => ({ innerHTML:'', content:{ firstElementChild:null } }),
    },
    location:{ get href() { return href; }, set href(value) { href = String(value); } },
    URL,
    setTimeout:() => 1,
    clearTimeout:() => {},
    requestAnimationFrame:(fn) => fn(),
    Date, String, Number, Boolean, Array, Object, Map, Set, Promise, console,
  };

  vm.createContext(context);
  vm.runInContext(provenanceSource, context);
  vm.runInContext(correction, context);
  vm.runInContext(`${ack}\nglobalThis.testApi={
    submit:favMarkNativeQuerySubmitted0140,
    settle:favMaybeCommitSubmittedNativeQuery0140,
    provenance:favCommittedNativeQueryProvenance01510,
    committed:()=>favCommittedNativeQuery0138(),
    verification:()=>({
      verified:favState.nativeQueryCommitVerified01523,
      value:favState.nativeQueryVerifiedValue01523,
      unverified:favState.nativeQueryUnverifiedValue01523,
      unverifiedAt:favState.nativeQueryUnverifiedSubmittedAt01523,
    }),
  };`, context);

  return {
    context,
    api:context.testApi,
    get grid() { return nativeGrid; },
    setGrid(next) { nativeGrid = next; },
    replaceGrid(ids) { nativeGrid = grid(ids); return nativeGrid; },
    setIds(ids) { nativeGrid.children = Array.from(ids, (id) => ({ id:String(id) })); },
    setPropsQuery(value) { propsQuery = String(value || ''); },
    setHref(value) { href = String(value); },
    get syncCalls() { return syncCalls; },
    get observations() { return observations; },
    scheduled,
  };
}

function ageSubmission(f, ms) {
  f.context.favState.nativeQuerySubmittedAt0140 = Date.now() - ms;
}

function ageUnverified(f, ms) {
  f.context.favState.nativeQueryUnverifiedSubmittedAt01523 = Date.now() - ms;
}

test('behavior gate load order is 99 -> 99a -> 100 -> 101 while release identity remains 0.15.22', () => {
  const p99 = userscript.indexOf('/src/99-favorites-v0131-correctness.js?v=0.15.22');
  const p99a = userscript.indexOf('/src/99a-favorites-native-query-ack.js?v=0.15.22');
  const p100 = userscript.indexOf('/src/100-favorites-all-search-clear-parity.js?v=0.15.22');
  const p101 = userscript.indexOf('/src/101-favorites-v0141-smoke-fixes.js?v=0.15.22');
  assert.ok(p99 >= 0 && p99a > p99 && p100 > p99a && p101 > p100);
  assert.match(userscript, /@version\s+0\.15\.22/);
});

test('typing stays draft-only and a submitted unchanged grid stays pending before timeout', () => {
  const f = fixture();
  const field = input('search one');
  f.context.favRememberNativeQueryDraft0140(field);
  assert.equal(f.api.committed(), '');

  f.api.submit(field);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
  assert.equal(f.syncCalls, 0);
});

test('timeout can advance nonempty runtime query but durable provenance remains unverified', () => {
  const f = fixture();
  const field = input('runtime only');
  f.api.submit(field);
  ageSubmission(f, 1000);

  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'runtime only');
  assert.deepEqual({ ...f.api.provenance('runtime only') }, {
    queryCommitSource:'favorites-search-unverified',
    queryCommitVerified:false,
  });
  assert.deepEqual({ ...f.api.verification() }, {
    verified:false,
    value:'',
    unverified:'runtime only',
    unverifiedAt:f.context.favState.nativeQueryUnverifiedSubmittedAt01523,
  });
});

test('changed native listing IDs positively acknowledge submitted query before timeout', () => {
  const f = fixture();
  const field = input('changed ids');
  f.api.submit(field);
  f.setIds(['C','D']);

  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'changed ids');
  assert.deepEqual({ ...f.api.provenance('changed ids') }, {
    queryCommitSource:'favorites-search-commit',
    queryCommitVerified:true,
  });
});

test('zero-result native transition is positive acknowledgement rather than waiting for timeout', () => {
  const f = fixture({ initialIds:['A','B'] });
  const field = input('nothing matches');
  f.api.submit(field);
  f.setIds([]);

  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'nothing matches');
  assert.equal(f.api.verification().verified, true);
});

test('native grid replacement with identical IDs is positive acknowledgement', () => {
  const f = fixture({ initialIds:['A','B'] });
  const before = f.grid;
  const field = input('same ids new response');
  f.api.submit(field);
  const after = f.replaceGrid(['A','B']);
  assert.notEqual(after, before);

  assert.equal(f.api.settle(), true);
  assert.equal(f.api.verification().verified, true);
});

test('failed clear-to-All never timeout-promotes canonical empty query', () => {
  const f = fixture({ initialCommitted:'old query', initialIds:['A','B'] });
  const field = input('');
  f.api.submit(field);
  ageSubmission(f, 2000);

  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), 'old query');
  assert.deepEqual({ ...f.api.provenance('old query') }, {
    queryCommitSource:'ssr-props',
    queryCommitVerified:true,
  });
});

test('clear-to-All commits only after positive native grid acknowledgement', () => {
  const f = fixture({ initialCommitted:'old query', initialIds:['A','B'] });
  const field = input('');
  f.api.submit(field);
  f.setIds(['A','B','C']);

  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), '');
  assert.deepEqual({ ...f.api.provenance('') }, {
    queryCommitSource:'none',
    queryCommitVerified:true,
  });
});

test('matching route/SSR evidence must change after submit to count as a fresh explicit acknowledgement', () => {
  const f = fixture();
  const field = input('explicit query');
  f.api.submit(field);

  /* Route/props still carry their submit-time values, so no fresh ack yet. */
  assert.equal(f.api.settle(), 'pending');

  f.setPropsQuery('explicit query');
  assert.equal(f.api.settle(), true);
  assert.deepEqual({ ...f.api.provenance('explicit query') }, {
    queryCommitSource:'ssr-props',
    queryCommitVerified:true,
  });
});

test('timeout-promoted query upgrades to durable verified state on bounded late grid acknowledgement', () => {
  const f = fixture();
  const field = input('late result');
  f.api.submit(field);
  ageSubmission(f, 1000);
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.verification().verified, false);

  f.setIds(['late-A']);
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.verification().verified, true);
  assert.deepEqual({ ...f.api.provenance('late result') }, {
    queryCommitSource:'favorites-search-commit',
    queryCommitVerified:true,
  });
});

test('old unverified query cannot be upgraded later by an unrelated grid change after late-ack window', () => {
  const f = fixture();
  const field = input('stale late query');
  f.api.submit(field);
  ageSubmission(f, 1000);
  assert.equal(f.api.settle(), true);
  ageUnverified(f, 6000);
  f.setIds(['unrelated-page-change']);

  assert.equal(f.api.settle(), false);
  assert.equal(f.api.verification().verified, false);
  assert.equal(f.api.provenance('stale late query').queryCommitVerified, false);
});

test('changed exact route evidence can still prove a timeout query after the grid late-ack window', () => {
  const f = fixture();
  const field = input('eventual route query');
  f.api.submit(field);
  ageSubmission(f, 1000);
  assert.equal(f.api.settle(), true);
  ageUnverified(f, 6000);
  f.setHref('https://www.etsy.com/people/example?tab=items&q=eventual%20route%20query');

  assert.equal(f.api.settle(), true);
  assert.equal(f.api.verification().verified, true);
  assert.equal(f.api.provenance('eventual route query').queryCommitVerified, true);
});

test('module source makes timeout-only query provenance fail closed and does not mutate persistence itself', () => {
  assert.match(ack, /favorites-search-unverified/);
  assert.match(ack, /if \(!acknowledged && !next\) return 'pending'/);
  assert.match(ack, /favNativeMainGrid0141/);
  assert.match(ack, /grid !== favState\.nativeQuerySubmitGrid01523/);
  assert.match(ack, /favNativeQueryGridFingerprint01523\(grid\) !== favState\.nativeQuerySubmitGridFingerprint01523/);
  assert.doesNotMatch(ack, /indexedDB|\.put\(|readwrite|listingIds\s*=/);
});
