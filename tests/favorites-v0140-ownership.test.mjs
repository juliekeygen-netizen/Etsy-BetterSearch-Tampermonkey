import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const dataSource = await readFile(new URL('../src/61-favorites-data.js', import.meta.url), 'utf8');
const syncSource = await readFile(new URL('../src/61b-favorites-sync.js', import.meta.url), 'utf8');
const catalogSource = syncSource;
const metadataSource = await readFile(new URL('../src/61h-favorites-metadata-coordinator.js', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');
const shellSource = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');
const correctnessSource = await readFile(new URL('../src/99-favorites-v0131-correctness.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function catalogueFixture(pageLengths) {
  const requests = [];
  const observations = [];
  const context = vm.createContext({
    console, Date, Map, Set, URL, Promise, AbortController, DOMException,
    crypto: { randomUUID: () => 'worker' },
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { origin: 'https://www.etsy.com' },
    favState: {},
    favScope: () => ({ owner:'owner', type:'items', id:'', login:'test' }),
    favDatasetQuery: () => '',
    favDatasetKey: () => 'owner|items||q:',
    favIndexScopeKey: (scope) => `${scope.owner}|${scope.type}|${scope.id}|${scope.query || ''}`,
    isFavoritesPage: () => false,
    favProps: () => ({ totalListings: 0 }),
    normalize: (value) => String(value || '').toLowerCase(),
    favCardMap: () => new Map(),
    favApiUrlForScope: (_scope, offset) => ({ offset }),
    favFetchJson: async (url) => {
      requests.push(url.offset);
      const pageIndex = url.offset / 20;
      const length = pageLengths[pageIndex] ?? 0;
      return { listings:Array.from({ length }, (_, index) => ({ id:`${url.offset + index}` })) };
    },
    favApiListings: (payload) => payload.listings || [],
    favRecordsFromListings: (listings, offset) => listings.map((item, index) => ({ id:String(item.id), order:offset + index })),
    favMergeRecords: (map, records) => records.forEach((record) => map.set(record.id, record)),
    favIndexObserveRecords: async (records, options) => observations.push({ records, options }),
    favIndexHydrateRecords: async (records) => records,
    favIndexGetScope: async () => null,
    favProgress: () => {},
    favClearProgress: () => {},
    favPrimeDatasetFromCache0137: async () => false,
    favCacheReadScope0137: async () => null,
    favCachePresentationReadyForScope0137: () => true,
    favIndexCurrentScope: () => ({ scopeKey:'owner|items||' }),
    sleep: async () => {},
    document: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(_name, options) { this.detail = options?.detail; } },
  });
  vm.runInContext(`${catalogSource}\nglobalThis.testApi={favCatalogDescriptor0141,favCatalogCrawlSimple0141,favCatalogRepeatedFingerprint0141};`, context);
  return { ...context.testApi, requests, observations };
}

async function crawlLengths(lengths) {
  const fixture = catalogueFixture(lengths);
  const scope = fixture.favCatalogDescriptor0141({ owner:'owner', type:'items', id:'', login:'test' }, '');
  const result = await fixture.favCatalogCrawlSimple0141(scope, new AbortController(), {});
  return { fixture, result };
}

test('v0.14.0 wires the consolidated catalogue/sync owner before metadata and Favorites runtime', () => {
  assert.match(userscript, /@version\s+0\.14\.0/);
  const catalog = userscript.indexOf('/src/61b-favorites-sync.js');
  const metadata = userscript.indexOf('/src/61h-favorites-metadata-coordinator.js');
  const runtime = userscript.indexOf('/src/63-favorites-runtime.js');
  assert.ok(catalog > 0 && metadata > catalog && runtime > metadata);
  assert.doesNotMatch(userscript, /61g-favorites-catalog-service/);
});

test('there is exactly one production complete-catalogue crawler', () => {
  assert.doesNotMatch(dataSource, /for\s*\(let offset\s*=\s*0;\s*;/);
  assert.match(dataSource, /return favCatalogAcquireCurrent/);
  assert.match(syncSource, /async function favCatalogCrawlSimple0141/);
  assert.equal((syncSource.match(/async function favCatalogCrawlSimple0141/g) || []).length, 1);
  const compatibility = syncSource.slice(syncSource.indexOf('/* Sync UI/controller compatibility.'));
  assert.doesNotMatch(compatibility, /favFetchJson\s*\(/);
  assert.doesNotMatch(compatibility, /favSyncFetchSimpleScope/);
  assert.match(compatibility, /favCatalogRefresh\(scope/);
});

test('catalogue completeness verifies a short boundary for exact page multiples and 61 items', async () => {
  for (const [lengths, expectedRequests, expectedRecords] of [
    [[0], [0], 0],
    [[1], [0], 1],
    [[19], [0], 19],
    [[20, 0], [0, 20], 20],
    [[20, 20, 0], [0, 20, 40], 40],
    [[20, 20, 20, 0], [0, 20, 40, 60], 60],
    [[20, 20, 20, 1], [0, 20, 40, 60], 61],
  ]) {
    const { fixture, result } = await crawlLengths(lengths);
    assert.deepEqual(fixture.requests, expectedRequests);
    assert.equal(result.records.length, expectedRecords);
    assert.equal(result.boundaryVerified, true);
  }
});

test('catalogue crawler rejects a repeated full page instead of marking it complete', async () => {
  const fixture = catalogueFixture([20, 20]);
  let call = 0;
  fixture.requests.length = 0;
  const context = vm.createContext({});
  assert.throws(() => fixture.favCatalogRepeatedFingerprint0141('1,2', [{ id:'1' }, { id:'2' }]), /repeated a page/i);
  void call; void context;
});

test('same-dataset refresh is keyed while unrelated datasets have independent in-flight slots', () => {
  assert.match(catalogSource, /var favCatalogInflight0141 = new Map\(\)/);
  assert.match(catalogSource, /const existing = favCatalogInflight0141\.get\(key\)/);
  assert.match(catalogSource, /favCatalogInflight0141\.set\(key, entry\)/);
  assert.doesNotMatch(runtimeSource, /favSyncState\.status\s*===\s*['"]running['"]/);
  assert.match(syncSource, /Promise\.all\(due\.map/);
});

test('cross-tab catalogue refresh has a dataset-scoped Web Locks path and storage-lease fallback', () => {
  assert.match(catalogSource, /globalThis\.navigator\?\.locks/);
  assert.match(catalogSource, /if \(locks\?\.request\)/);
  assert.match(catalogSource, /return locks\.request/);
  assert.match(catalogSource, /favCatalogLeaseStorageKey0141/);
  assert.match(catalogSource, /leaseUntil/);
  assert.match(catalogSource, /favCatalogPeerCompleted0141/);
});

test('metadata requirements are capability-driven instead of one extra-info flag', () => {
  const start = metadataSource.indexOf('function favMetadataRequirements0141');
  const end = metadataSource.indexOf('function favMetadataAuxRequirements0141');
  const selected = metadataSource.slice(start, end);
  const context = vm.createContext({ favCfg:{} });
  vm.runInContext(`${selected}\nglobalThis.req=favMetadataRequirements0141;`, context);
  const req = context.req({
    sort:'shipping',
    filters:{ category:'art', shipsFrom:'europe', returns:true, minCarts:'3', freeShipping:false },
  });
  assert.deepEqual(Array.from(req).sort(), ['carts','category','returns','shipping','shipsFrom'].sort());
});

test('metadata freshness distinguishes destination-sensitive shipping from policy and urgency TTLs', () => {
  assert.match(metadataSource, /shipping:\s*6 \* 60 \* 60 \* 1000/);
  assert.match(metadataSource, /returns:\s*7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(metadataSource, /carts:\s*15 \* 60 \* 1000/);
  assert.match(metadataSource, /meta\.contextKey === destination\.contextKey/);
  assert.match(metadataSource, /contextSensitive = key === 'shipping' \|\| key === 'estimatedDelivery'/);
  assert.match(metadataSource, /normalized\.contextKey = String\(field\?\.contextKey \|\| ''\)/);
});

test('plain Favorites browsing cannot trigger a whole-catalogue automatic deep scan', () => {
  const autoBlock = metadataSource.slice(metadataSource.indexOf('favDeepMaybeAutoScan ='), metadataSource.indexOf('function favMetadataScheduleReapply0141'));
  assert.match(autoBlock, /if \(!deep\.size\) return false/);
  assert.doesNotMatch(autoBlock, /favDeepStart\(/);
  assert.match(autoBlock, /favMetadataEnsureCurrentRequirements0141/);
  assert.match(metadataSource, /priority:visible\.has\(String\(record\.id\)\) \? 1 : 2/);
});

test('owner-scoped deep maintenance reads exact scope membership instead of all historical listings', () => {
  const block = metadataSource.slice(metadataSource.indexOf('favIndexGetActiveListings = async function'), metadataSource.indexOf('favDeepMaybeAutoScan ='));
  const ownerBlock = block.slice(block.indexOf('const authoritativeKey'));
  assert.match(ownerBlock, /authoritativeKey/);
  assert.match(ownerBlock, /store\.get\(idValue\)/);
  assert.doesNotMatch(ownerBlock, /store\.getAll\(\)/);
  assert.match(block, /store\.index\('isFavorite'\)\.getAll\(true\)/);
});

test('local mode owns a sibling grid and never reparents/replaces Etsy native card children', () => {
  assert.match(runtimeSource, /data-ebsf-local-grid/);
  assert.match(runtimeSource, /live\.cloneNode\(true\)/);
  assert.match(runtimeSource, /localGrid\.replaceChildren\(frag\)/);
  assert.match(runtimeSource, /nativeGrid\.hidden=true/);
  assert.match(runtimeSource, /nativeGrid\.hidden = false/);
  assert.doesNotMatch(runtimeSource, /nativeGrid\.replaceChildren/);
  assert.doesNotMatch(runtimeSource, /return live;/);
  assert.match(runtimeSource, /renderMode0141='bettersearch-local'/);
  assert.match(runtimeSource, /renderMode0141='native'/);
});

test('late Favorites shell cannot blank the native grid or bypass v0.14 metadata requirements', () => {
  const loading = shellSource.slice(
    shellSource.indexOf('function favShowResultsLoading0120'),
    shellSource.indexOf('function favHideResultsLoading0120')
  );
  assert.doesNotMatch(loading, /replaceChildren|favMainGrid\(|createElement\('li'\)/);

  const reapply = shellSource.match(/favReapply=async function favReapply0120\([^)]*\)\{[\s\S]*?\};/)?.[0] || '';
  assert.match(reapply, /return favReapplyBefore0120\(force\)/);
  assert.doesNotMatch(reapply, /favNeedsExtraInfo|favScheduleLocalRender0121|favRenderCurrent/);

  const legacyHelper = shellSource.match(/function favScheduleLocalRender0121\([^)]*\) \{[^}]*\}/)?.[0] || '';
  assert.match(legacyHelper, /favReapplyBefore0120\(force\)/);
  assert.doesNotMatch(legacyHelper, /favRenderCurrent/);
});

test('late route-settle paths re-enter metadata coordination before local rendering', () => {
  const view = correctnessSource.slice(
    correctnessSource.indexOf('favRefreshForViewChange0137 = function favRefreshForViewChange0140'),
    correctnessSource.indexOf('favScheduleCurrentPageObservation = function favScheduleCurrentPageObservation0140')
  );
  assert.match(view, /void favReapply\(\)/);
  assert.doesNotMatch(view, /favRenderCurrent\(\)/);

  const observation = correctnessSource.slice(
    correctnessSource.indexOf('favScheduleCurrentPageObservation = function favScheduleCurrentPageObservation0140'),
    correctnessSource.indexOf('function favMutationContainsRail0140')
  );
  assert.match(observation, /void favReapply\(\)/);
  assert.doesNotMatch(observation, /favRenderCurrent\(\)/);
});

test('dependency-aware render stays native while required deep work is pending and final shell exposes unresolved coverage', () => {
  assert.match(runtimeSource, /if\(coverage\.pending>0\)/);
  assert.match(runtimeSource, /favRestoreNative\(\)/);
  assert.match(metadataSource, /unresolved/);
  assert.match(shellSource, /metadataCoverage0141\?\.unresolved/);
  assert.match(shellSource, /metadata values unknown/);
});
