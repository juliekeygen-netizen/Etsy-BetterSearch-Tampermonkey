import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const correction = await readFile(new URL('../src/99-favorites-v0131-correctness.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function fixture({ cacheReady = false } = {}) {
  const networkForces = [];
  let syncCalls = 0;
  const context = {
    favState: {
      records: [], loadKey: '', loadComplete: false, loadSource0137: '', cachePresentationReady0137: false,
      shellObserver0120: null, nativeQuerySettleTimers0140: [],
    },
    favCfg: { strict:false, multi:false },
    FAV_CACHE_PRESENTATION_VERSION0137: 1,
    favRecordFromListing: (listing, _node, order) => ({ id:String(listing.id || '1'), imageUrl:String(listing.imageUrl || ''), secondaryImageUrl:'', order }),
    favDatasetKey: () => 'scope',
    favPrimeDatasetFromCache0137: async () => {
      context.favState.records = [{ id:'cached', imageUrl:'', secondaryImageUrl:'', html:'' }];
      context.favState.loadKey = 'scope';
      context.favState.loadComplete = true;
      context.favState.loadSource0137 = 'cache';
      context.favState.cachePresentationReady0137 = cacheReady;
      return true;
    },
    favLoadAll: async () => [],
    favLoadAllNetwork0137: async (force) => {
      networkForces.push(force);
      await Promise.resolve();
      const records = [{ id:'network', imageUrl:'https://i.etsystatic.com/x.jpg', secondaryImageUrl:'', html:'' }];
      context.favState.records = records;
      context.favState.loadKey = 'scope';
      context.favState.loadComplete = true;
      return records;
    },
    favCacheReadScope0137: async () => null,
    favIndexGetScope: async () => null,
    favIndexCurrentScope: () => ({ scopeKey:'scope' }),
    isFavoritesPage: () => true,
    favCardMap: () => new Map(),
    favListingsFromProps: () => [],
    favProps: () => ({}),
    favIndexOpen: async () => ({}),
    favIndexRequest: async () => null,
    favCommittedNativeQuery0138: () => '',
    favScope: () => ({ owner:'owner', type:'collection', id:'vns' }),
    favMainGrid: () => null,
    favListingIdFromNode: () => '',
    favScheduleCurrentPageObservation: () => {},
    favScheduleSync: () => { syncCalls += 1; },
    favShellMutationRelevant0128: () => false,
    favMutationElement0128: (node) => node?.nodeType === 1 ? node : node?.parentElement || null,
    favDesktopShell0120: () => true,
    favScheduleShellRepair0123: () => {},
    MutationObserver: class { disconnect() {} observe() {} },
    GM_addStyle: () => {},
    document: {
      addEventListener: () => {},
      body: {},
      createElement: () => ({ innerHTML:'', content:{ firstElementChild:null } }),
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => fn(),
    Date,
    String,
    Number,
    Boolean,
    Array,
    Map,
    Set,
    Promise,
    console,
  };
  vm.createContext(context);
  vm.runInContext(correction, context);
  return { context, networkForces, get syncCalls() { return syncCalls; } };
}

test('v0.13.1 correctness layer loads after final geometry modules and before deferred runtime RAF can fire', () => {
  const p98 = userscript.indexOf('/src/98-favorites-exact-search-width.js');
  const p99 = userscript.indexOf('/src/99-favorites-v0131-correctness.js');
  assert.ok(p98 >= 0 && p99 > p98);
  assert.match(userscript, /@version\s+0\.13\.1/);
});

test('incomplete presentation cache forces one real network migration and marks source only after completion', async () => {
  const f = fixture({ cacheReady:false });
  const [first, second] = await Promise.all([f.context.favLoadAll(false), f.context.favLoadAll(false)]);
  assert.deepEqual(f.networkForces, [true]);
  assert.equal(first[0].id, 'network');
  assert.equal(second[0].id, 'network');
  assert.equal(f.context.favState.loadSource0137, 'network');
});

test('renderable complete cache avoids catalogue network refresh', async () => {
  const f = fixture({ cacheReady:true });
  const records = await f.context.favLoadAll(false);
  assert.equal(records[0].id, 'cached');
  assert.deepEqual(f.networkForces, []);
});

test('presentation readiness rejects a versioned snapshot with no thumbnail', () => {
  const f = fixture();
  const base = { isFavorite:true, availabilityState:'available', title:'Item', url:'https://etsy.test/listing/1', presentationSnapshot:{ version:1, imageUrl:'', secondaryImageUrl:'' } };
  assert.equal(f.context.favIndexedPresentationRenderable0140(base), false);
  assert.equal(f.context.favIndexedPresentationRenderable0140({ ...base, presentationSnapshot:{ ...base.presentationSnapshot, imageUrl:'https://i.etsystatic.com/1.jpg' } }), true);
});

test('native search typing stays draft-only until a submitted query settles', () => {
  const f = fixture();
  const input = {
    value:'gay',
    matches: () => true,
    closest: () => ({}),
    getAttribute: () => 'Search within this collection',
  };
  f.context.favRememberNativeQueryDraft0140(input);
  assert.equal(f.context.favCommittedNativeQuery0138(), '');
  f.context.favMarkNativeQuerySubmitted0140(input);
  f.context.favState.nativeQuerySubmittedAt0140 = Date.now() - 1000;
  assert.equal(f.context.favMaybeCommitSubmittedNativeQuery0140(), true);
  assert.equal(f.context.favCommittedNativeQuery0138(), 'gay');
  assert.equal(f.syncCalls, 1);
});

test('removing the permanent rail is a shell-repair mutation again', () => {
  const f = fixture();
  const rail = { nodeType:1, matches:(selector) => selector === '[data-ebsf-rail]', querySelector:() => null, closest:() => null };
  const target = { nodeType:1, closest:() => null };
  assert.equal(f.context.favShellMutationRelevant0140({ target, removedNodes:[rail], addedNodes:[] }), true);
});

test('correctness layer keeps image placeholders card-sized and waits before cached page rerender', () => {
  assert.match(correction, /\.ebsf-fallback-card \.ebsf-fallback-image/);
  assert.match(correction, /aspect-ratio:1\.259 \/ 1!important/);
  const view = correction.slice(correction.indexOf('favRefreshForViewChange0137 = function favRefreshForViewChange0140'), correction.indexOf('favScheduleCurrentPageObservation = function favScheduleCurrentPageObservation0140'));
  assert.match(view, /favScheduleCurrentPageObservation\(350\)/);
  assert.match(view, /FAV_VIEW_NATIVE_SETTLE_FALLBACK_MS0140/);
  assert.doesNotMatch(view, /requestAnimationFrame\(\(\) => \{\s*if \(!isFavoritesPage\(\).*favRenderCurrent\(\)/s);
});

test('complete index reconciliation is scope-bounded instead of getAll()', () => {
  const block = correction.slice(correction.indexOf('favIndexReadObservation = async function favIndexReadObservation0140'), correction.indexOf('function favRecordPresentationRenderable0140'));
  assert.match(block, /scope\?\.listingIds/);
  assert.match(block, /listingStore\.get\(idValue\)/);
  assert.doesNotMatch(block, /getAll\(/);
});
