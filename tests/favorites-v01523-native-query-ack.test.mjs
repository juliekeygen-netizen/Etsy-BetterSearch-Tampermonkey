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
  return { children:Array.from(ids, (id) => ({ id:String(id) })) };
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
  let performanceNow = 100;
  let timerId = 0;
  const resources = [];
  const scheduled = [];
  const observers = [];

  class FakePerformanceObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe() {}
    disconnect() { this.disconnected = true; }
  }

  const performance = {
    now:() => performanceNow,
    getEntriesByType:(type) => type === 'resource' ? resources.slice() : [],
  };

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
    favIndexObserveCurrentPage:async () => {},
    favShellMutationRelevant0128:() => false,
    favMutationElement0128:(node) => node?.nodeType === 1 ? node : node?.parentElement || null,
    favDesktopShell0120:() => true,
    favScheduleShellRepair0123:() => {},
    MutationObserver:class { disconnect() {} observe() {} },
    PerformanceObserver:FakePerformanceObserver,
    performance,
    GM_addStyle:() => {},
    document:{
      addEventListener:() => {},
      body:{},
      createElement:() => ({ innerHTML:'', content:{ firstElementChild:null } }),
    },
    location:{
      origin:'https://www.etsy.com',
      get href() { return href; },
      set href(value) { href = String(value); },
    },
    URL,
    setTimeout:() => ++timerId,
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
    verification:()=>({ verified:favState.nativeQueryCommitVerified01523, value:favState.nativeQueryVerifiedValue01523 }),
    submission:()=>favState.nativeQuerySubmission01523,
    record:favNativeQueryRecordResource01523,
  };`, context);

  function emitResource({
    query,
    status = 200,
    startTime = performanceNow + 10,
    responseStart = startTime + 10,
    responseEnd = startTime + 20,
    includeQuery = true,
  } = {}) {
    const url = new URL('https://www.etsy.com/api/v3/ajax/bespoke/member/users/owner/collections/vns/landing-listings-bespoke');
    url.searchParams.set('limit', '20');
    url.searchParams.set('offset', '0');
    if (includeQuery) url.searchParams.set('query', String(query ?? ''));
    const entry = { entryType:'resource', name:url.href, startTime, responseStart, responseEnd, responseStatus:status };
    resources.push(entry);
    for (const observer of observers) {
      if (!observer.disconnected) observer.callback({ getEntries:() => [entry] });
    }
    return entry;
  }

  return {
    context,
    api:context.testApi,
    input,
    get grid() { return nativeGrid; },
    setGrid(next) { nativeGrid = next; },
    replaceGrid(ids) { nativeGrid = grid(ids); return nativeGrid; },
    setIds(ids) { nativeGrid.children = Array.from(ids, (id) => ({ id:String(id) })); },
    setPropsQuery(value) { propsQuery = String(value ?? ''); },
    setHref(value) { href = String(value); },
    emitResource,
    setPerformanceNow(value) { performanceNow = Number(value) || 0; },
    get syncCalls() { return syncCalls; },
    scheduled,
    observers,
  };
}

function ageSubmission(f, ms) {
  const submission = f.api.submission();
  assert.ok(submission, 'expected active submission');
  submission.submittedAt = Date.now() - ms;
}

function typeDraft(f, value) {
  f.context.favRememberNativeQueryDraft0140(input(value));
}

test('release load order is 99 -> 99a -> 100 at 0.15.25 identity', () => {
  const p99 = userscript.indexOf('/src/99-favorites-v0131-correctness.js?v=0.15.25');
  const p99a = userscript.indexOf('/src/99a-favorites-native-query-ack.js?v=0.15.25');
  const p100 = userscript.indexOf('/src/100-favorites-all-search-clear-parity.js?v=0.15.25');
  assert.ok(p99 >= 0 && p99a > p99 && p100 > p99a);
  assert.match(userscript, /@version\s+0\.15\.25/);
});

test('source proves historical module99 timeout promoted unacknowledged pending text', () => {
  const old = sourceBlock(
    correction,
    'function favMaybeCommitSubmittedNativeQuery0140()',
    "document.addEventListener('input'",
  );
  assert.match(old, /elapsed < FAV_QUERY_SETTLE_FALLBACK_MS0140/);
  assert.match(old, /favState\.nativeCommittedQuery0140 = next/);
  assert.match(old, /nativePendingQuery0140/);
});

test('typing and timer alone never change final committed query identity', () => {
  const f = fixture();
  const field = input('timer must not commit');
  typeDraft(f, field.value);
  assert.equal(f.api.committed(), '');
  f.api.submit(field);
  ageSubmission(f, 1000);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
  assert.equal(f.syncCalls, 0);
});

test('deadline fails closed and preserves the submitted text only as dirty draft when the native grid never changed', () => {
  const f = fixture();
  const field = input('failed request');
  f.api.submit(field);
  ageSubmission(f, 6000);
  assert.equal(f.api.settle(), false);
  assert.equal(f.api.committed(), '');
  assert.equal(f.context.favState.nativePendingQuery0140, 'failed request');
  assert.equal(f.context.favState.nativeQueryPendingDirty0140, true);
  assert.equal(f.context.favState.nativeQueryAwaitingSettle0140, false);
  assert.equal(f.api.submission(), null);
});

test('deadline never resumes old-scope observation after native grid changed without query-specific proof', () => {
  const f = fixture();
  f.api.submit(input('unverified changed grid'));
  f.setIds(['C']);
  ageSubmission(f, 6000);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
  assert.equal(f.context.favState.nativeQueryAwaitingSettle0140, true);
  assert.equal(f.api.submission()?.expired, true);
  assert.equal(f.syncCalls, 0);
});

test('exact successful Favorites resource acknowledges the exact submitted non-empty query', () => {
  const f = fixture();
  f.api.submit(input('exact query'));
  f.emitResource({ query:'exact query', status:200 });
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'exact query');
  assert.deepEqual({ ...f.api.provenance('exact query') }, {
    queryCommitSource:'favorites-search-commit',
    queryCommitVerified:true,
  });
  assert.equal(f.syncCalls, 1);
});

test('different-query resource cannot acknowledge current submission', () => {
  const f = fixture();
  f.api.submit(input('wanted'));
  f.emitResource({ query:'other', status:200 });
  f.setIds(['changed-by-other']);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
});

test('known failed exact response cannot commit and changed native results stay unresolved', () => {
  const f = fixture();
  f.api.submit(input('server fails'));
  f.emitResource({ query:'server fails', status:500 });
  f.setIds(['error-ui-change']);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
  assert.equal(f.context.favState.nativeQueryAwaitingSettle0140, true);
  assert.equal(f.api.submission()?.expired, true);
});

test('when responseStatus is unavailable, exact completed request also requires native grid settlement', () => {
  const f = fixture();
  f.api.submit(input('unknown status'));
  f.emitResource({ query:'unknown status', status:0 });
  assert.equal(f.api.settle(), 'pending');
  f.setIds(['C','D']);
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'unknown status');
});

test('unknown-status timing entry without responseStart cannot acknowledge even if the grid changes', () => {
  const f = fixture();
  f.api.submit(input('opaque failure'));
  f.emitResource({ query:'opaque failure', status:0, responseStart:0 });
  f.setIds(['C','D']);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
  assert.equal(f.syncCalls, 0);
});

test('submit A then type B: acknowledgement for A commits A and leaves B as dirty unsubmitted draft', () => {
  const f = fixture();
  f.api.submit(input('alpha'));
  typeDraft(f, 'beta');
  f.emitResource({ query:'alpha', status:200 });
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'alpha');
  assert.equal(f.context.favState.nativePendingQuery0140, 'beta');
  assert.equal(f.context.favState.nativeQueryPendingDirty0140, true);
  assert.equal(f.api.provenance('beta').queryCommitVerified, false);
});

test('submit A then submit B: late exact A response cannot acknowledge B', () => {
  const f = fixture();
  f.api.submit(input('alpha'));
  const first = f.api.submission();
  f.api.submit(input('beta'));
  const second = f.api.submission();
  assert.notEqual(second.sequence, first.sequence);

  f.emitResource({ query:'alpha', status:200 });
  f.setIds(['late-alpha']);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');

  f.emitResource({ query:'beta', status:200 });
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'beta');
});

test('late observer from superseded submission is disconnected and cannot mutate current evidence', () => {
  const f = fixture();
  f.api.submit(input('first'));
  const oldObserver = f.observers.at(-1);
  f.api.submit(input('second'));
  assert.equal(oldObserver.disconnected, true);
  f.emitResource({ query:'first', status:200 });
  assert.equal(f.api.submission().value, 'second');
  assert.equal(f.api.submission().resourceCompleted, false);
});

test('route or SSR evidence must change after submit and match exact submitted value', () => {
  const f = fixture();
  f.api.submit(input('explicit'));
  assert.equal(f.api.settle(), 'pending');
  f.setPropsQuery('wrong');
  assert.equal(f.api.settle(), 'pending');
  f.setPropsQuery('explicit');
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'explicit');
});

test('clear-to-All never commits from timer or exact request alone; native settlement is required', () => {
  const f = fixture({ initialCommitted:'old query', initialIds:['A','B'] });
  f.api.submit(input(''));
  f.emitResource({ query:'', status:200, includeQuery:false });
  ageSubmission(f, 1000);
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), 'old query');
  f.setIds(['A','B','C']);
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), '');
  assert.deepEqual({ ...f.api.provenance('') }, {
    queryCommitSource:'none',
    queryCommitVerified:true,
  });
});

test('zero-result transition can acknowledge when paired with exact completed resource lacking responseStatus', () => {
  const f = fixture({ initialIds:['A','B'] });
  f.api.submit(input('nothing'));
  f.emitResource({ query:'nothing', status:0 });
  f.setIds([]);
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.committed(), 'nothing');
});

test('re-submitting an already verified identical query remains verified without creating a generation', () => {
  const f = fixture();
  f.api.submit(input('same'));
  f.emitResource({ query:'same', status:200 });
  assert.equal(f.api.settle(), true);
  assert.equal(f.api.verification().verified, true);
  assert.equal(f.syncCalls, 1);

  f.api.submit(input('same'));
  assert.equal(f.api.settle(), false);
  assert.equal(f.api.verification().verified, true);
  assert.equal(f.syncCalls, 1);
});

test('resource matcher rejects pre-submit timeline entries', () => {
  const f = fixture();
  f.api.submit(input('fresh'));
  f.emitResource({ query:'fresh', status:200, startTime:50 });
  assert.equal(f.api.settle(), 'pending');
  assert.equal(f.api.committed(), '');
});

test('Strict/Multi mode never enters native query commit boundary', () => {
  const f = fixture();
  f.context.favCfg.strict = true;
  f.api.submit(input('strict local text'));
  assert.equal(f.api.settle(), false);
  assert.equal(f.api.committed(), '');
});

test('final module is acknowledgement-only: no catalogue coordinator/storage writer override remains', () => {
  assert.match(ack, /PerformanceObserver/);
  assert.match(ack, /favNativeQueryResourceEndpointMatches01523/);
  assert.match(ack, /submission\.value/);
  assert.match(ack, /FAV_NATIVE_QUERY_ACK_DEADLINE_MS01523/);
  assert.doesNotMatch(ack, /favCatalogWithCrossTabLease0141\s*=/);
  assert.doesNotMatch(ack, /favIndexOpen\(|favCatalogCoordinatorMutateScope01522|\.put\(/);
});
