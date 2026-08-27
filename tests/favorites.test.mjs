import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

async function loadState() {
  const source = await readFile(resolve(ROOT, 'src/60-favorites-state.js'), 'utf8');
  const holder = { saved: undefined };
  const context = vm.createContext({
    console,
    URL,
    location: { href: 'https://www.etsy.com/people/test/favorites', pathname: '/people/test/favorites' },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    GM_getValue: () => ({}),
    GM_setValue: (_key, value) => { holder.saved = structuredClone(value); },
    defaultRule: (logic, value) => ({ id: 'rule', enabled: true, logic, polarity: 'match', operator: 'contains', value, options: {} }),
    normalizeRules: (rules) => structuredClone(rules),
  });
  vm.runInContext(`${source}\nglobalThis.testApi={FAV_SORT_DEFINITIONS,favDefaultConfig,favNormalizeSort,favNormalizeConfig,favSortLabel,favActiveSectionKeys,favInitializeOpenSections,favPrepareOpenSectionsForRail,favSetSearchMode,favSaveConfig,getConfig:()=>favCfg,getState:()=>favState};`, context);
  context.testApi.getSaved = () => holder.saved;
  return context.testApi;
}

async function loadSorting() {
  const source = await readFile(resolve(ROOT, 'src/61-favorites-data.js'), 'utf8');
  const context = vm.createContext({ console, favCfg: { sort: 'etsy', sortReversed: false } });
  vm.runInContext(`${source}\nglobalThis.testApi={favCompareKnownNumber,favSortRecords,setSort:(sort,sortReversed=false)=>{favCfg={sort,sortReversed};}};`, context);
  return context.testApi;
}

async function loadUiHelpers() {
  const stateSource = await readFile(resolve(ROOT, 'src/60-favorites-state.js'), 'utf8');
  const uiSource = await readFile(resolve(ROOT, 'src/62-favorites-ui.js'), 'utf8');
  const context = vm.createContext({
    console, URL, location: { href: 'https://www.etsy.com/people/test/favorites', pathname: '/people/test/favorites' },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    window: { addEventListener: () => {} }, GM_getValue: () => ({}), GM_setValue: () => {},
    defaultRule: (logic, value) => ({ id: 'rule', logic, value }), normalizeRules: (rules) => rules,
  });
  vm.runInContext(`${stateSource}\n${uiSource}\nglobalThis.testApi={favChevronMarkup,favReverseSortIconMarkup,favSortTriggerWidth,favSyncCompactDetail};`, context);
  return context.testApi;
}

async function loadScrollLock() {
  const source = await readFile(resolve(ROOT, 'src/40-toolbar.js'), 'utf8');
  const selected = source.slice(source.indexOf('function pageScrollLockAllowsKey'), source.indexOf('function modalCounts'));
  const listeners = new Map();
  const makeClassList = () => {
    const values = new Set();
    return { add: (...items) => items.forEach((item) => values.add(item)), remove: (...items) => items.forEach((item) => values.delete(item)), contains: (item) => values.has(item) };
  };
  const html = { clientWidth: 1180, classList: makeClassList(), style: { overflow: 'clip', overscrollBehavior: 'contain' } };
  const body = { classList: makeClassList(), style: { overflow: 'auto', position: 'relative', top: '1px', left: '2px', right: '3px', width: '90%', paddingRight: '4px' } };
  const scrolls = [];
  const context = vm.createContext({
    state: { scrollLock: null },
    document: {
      documentElement: html, body,
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: (type) => listeners.delete(type),
    },
    window: { scrollX: 17, scrollY: 231, innerWidth: 1200, scrollTo: (x, y) => scrolls.push([x, y]) },
    getComputedStyle: () => ({ paddingRight: '4px' }),
  });
  vm.runInContext(`${selected}\nglobalThis.testApi={lockPageScroll,unlockPageScroll,getLock:()=>state.scrollLock};`, context);
  return { ...context.testApi, html, body, listeners, scrolls };
}

async function loadIndex({ currentListings = [], liveIds = [] } = {}) {
  const source = await readFile(resolve(ROOT, 'src/61a-favorites-index.js'), 'utf8');
  const liveNodes = new Map(liveIds.map((id) => [String(id), {}]));
  const context = vm.createContext({ console, Date, encodeURIComponent, indexedDB: {}, document: {}, favProps: () => ({}), favListingsFromProps: () => currentListings, favCardMap: () => liveNodes, favRecordsFromListings: (items) => items.map((item) => ({ ...item, id: String(item.listingId), known: {}, videoSources: [] })), favIndexCurrentScope: () => ({ scopeKey: 'current' }) });
  vm.runInContext(`${source}\nglobalThis.testApi={favIndexUnknown,favIndexField,favIndexMergeField,favIndexEmptyListing,favIndexScopeKey,favIndexPatchFromRecord,favIndexMergeListing,favIndexMarkListingUnfavorite,favIndexMarkListingAvailability,favIndexApplyScopeCompletion,favIndexMergeShop,favIndexApplyListingMetadataToRecord,favIndexObserveRecordsNow,favIndexObserveCurrentPage,setObservationDeps:(read,write)=>{favIndexReadObservation=read;favIndexWrite=write;},setObserve:(fn)=>{favIndexObserveRecords=fn;},setCurrentScope:(fn)=>{favIndexCurrentScope=fn;}};`, context);
  return context.testApi;
}

async function loadSync({ fetchJson, observe } = {}) {
  const source = await readFile(resolve(ROOT, 'src/61b-favorites-sync.js'), 'utf8');
  let fetchImpl = fetchJson || (async () => ({ listings: [] }));
  let observeImpl = observe || (async () => []);
  const events = [];
  const context = vm.createContext({
    console, Date, Map, Set, URL, AbortController, DOMException,
    document: { dispatchEvent: (event) => events.push(event.detail) },
    CustomEvent: class { constructor(_name, options) { this.detail = options.detail; } },
    favIndexScopeKey: (scope) => [scope.owner || '', scope.type || 'items', scope.id || '', scope.query || ''].join('|'),
    favScope: () => ({ owner: 'owner', login: 'test', type: 'items', id: '' }), favDatasetKey: () => 'owner|items|||',
    favNativeQuery: () => '', favProps: () => ({ totalListings: 0 }),
    favCardMap: () => new Map(), favApiUrlForScope: () => 'endpoint',
    favFetchJson: (...args) => fetchImpl(...args),
    favApiListings: (payload) => payload.listings || [],
    favRecordsFromListings: (listings, offset) => listings.map((item, index) => ({ ...item, id: String(item.id), order: offset + index, known: {} })),
    favIndexObserveRecords: (...args) => observeImpl(...args), favIndexHydrateRecords: async (records) => records,
    sleep: (_ms, signal) => signal?.aborted ? Promise.reject(new DOMException('Aborted', 'AbortError')) : Promise.resolve(),
    favIndexGetScope: async () => null, favCfg: { autoSync: true }, favState: {},
    isFavoritesPage: () => true, favIsOwnFavoritesPage: () => true,
  });
  vm.runInContext(`${source}\nglobalThis.testApi={favSyncCreateState,favSyncIsDue,favSyncScopeDescriptor,favSyncJobIsCurrent,favSyncProgressModel,favSyncScope,favCancelSync,getState:()=>favSyncState,setFetch:(fn)=>{favFetchJson=fn;},setObserve:(fn)=>{favIndexObserveRecords=fn;}};`, context);
  context.testApi.events = events;
  context.testApi.setFetchImpl = (fn) => { fetchImpl = fn; };
  context.testApi.setObserveImpl = (fn) => { observeImpl = fn; };
  return context.testApi;
}

test('Favorites config normalization preserves durable defaults and migrates removed filters', async () => {
  const api = await loadState();
  const cfg = api.favNormalizeConfig({ strictMode: 'bad', filters: { itemFormat: 'digital', vintage: true, shipsFrom: 'country', colors: ['red'] } });
  assert.equal(cfg.strictMode, 'phrase');
  assert.equal(cfg.filters.itemFormat, 'digital');
  assert.equal(cfg.filters.vintage, true);
  assert.equal(cfg.filters.shipsFrom, 'country');
  assert.equal('colors' in cfg.filters, false);
  for (const removed of ['ready1Day','ready3Days','shipTo','minDiscount','bestSeller']) assert.equal(removed in cfg.filters, false);
  assert.equal(cfg.autoSync, true);
  assert.equal(cfg.autoScanMissingMetadata, true);
  const migrated = api.favNormalizeConfig({ filters:{ hasVideo:true, shipsFrom:'near', shipsFromCity:'Helsinki' } });
  assert.equal('hasVideo' in migrated.filters, false);
  assert.equal('shipsFromCity' in migrated.filters, false);
  assert.equal(migrated.filters.shipsFrom, 'anywhere');
  const disabled = api.favNormalizeConfig({ autoSync: false });
  assert.equal(disabled.autoSync, false);
  assert.equal(api.favNormalizeConfig({ autoScanMissingMetadata: false }).autoScanMissingMetadata, false);
});

test('legacy Favorites sort values migrate to base sort and direction without resetting', async () => {
  const api = await loadState();
  const expected = {
    etsy: ['etsy', false], priceAsc: ['price', false], priceDesc: ['price', true],
    ratingDesc: ['rating', true], reviewsDesc: ['reviews', false], discountDesc: ['discount', false],
    titleAsc: ['title', false], titleDesc: ['title', true], shopAsc: ['shop', false],
    shippingAsc: ['shipping', false], cartsDesc: ['carts', false], lowStock: ['stock', false],
  };
  for (const [legacy, [sort, sortReversed]] of Object.entries(expected)) {
    const migrated = api.favNormalizeConfig({ sort: legacy });
    assert.equal(migrated.sort, sort, legacy);
    assert.equal(migrated.sortReversed, sortReversed, legacy);
  }
  assert.equal(api.favNormalizeConfig({ sort: 'shop', sortReversed: true }).sortReversed, true);
  Object.assign(api.getConfig(), { sort: 'shop', sortReversed: true });
  api.favSaveConfig();
  assert.equal(api.getSaved().sort, 'shop');
  assert.equal(api.getSaved().sortReversed, true);
});

test('every reversible Favorites sort flips direction and keeps unknown numbers last', async () => {
  const api = await loadSorting();
  const cases = {
    price: [{ price: 1 }, { price: 9 }], rating: [{ rating: 1, reviews: 2 }, { rating: 5, reviews: 9 }],
    reviews: [{ reviews: 20 }, { reviews: 2 }], discount: [{ discountPercent: 40 }, { discountPercent: 5 }],
    title: [{ title: 'Alpha' }, { title: 'Zulu' }], shop: [{ shopName: 'Alpha' }, { shopName: 'Zulu' }],
    shipping: [{ shipping: 1 }, { shipping: 9 }], carts: [{ carts: 20 }, { carts: 2 }],
    stock: [{ stockLeft: 1 }, { stockLeft: 9 }],
  };
  for (const [sort, pair] of Object.entries(cases)) {
    const items = pair.map((item, order) => ({ ...item, order, id: String(order) }));
    api.setSort(sort, false);
    const normal = api.favSortRecords(items).map((item) => item.id).join('');
    api.setSort(sort, true);
    const reversed = api.favSortRecords(items).map((item) => item.id).join('');
    assert.notEqual(normal, reversed, sort);
  }
  for (const [sort, field] of Object.entries({ price: 'price', rating: 'rating', reviews: 'reviews', discount: 'discountPercent', shipping: 'shipping', carts: 'carts', stock: 'stockLeft' })) {
    const items = [{ [field]: Number.NaN, order: 0, id: 'unknown' }, { [field]: 3, order: 1, id: 'known' }];
    for (const reversed of [false, true]) {
      api.setSort(sort, reversed);
      assert.equal(api.favSortRecords(items).at(-1).id, 'unknown', `${sort}/${reversed}`);
    }
  }
});

test('Favorites sort labels reverse immediately, including Shop, while Etsy order stays native', async () => {
  const stateApi = await loadState();
  assert.equal(stateApi.favSortLabel('shop', false), 'Shop: A to Z');
  assert.equal(stateApi.favSortLabel('shop', true), 'Shop: Z to A');
  assert.equal(stateApi.favSortLabel('reviews', true), 'Least reviews');
  const sorting = await loadSorting();
  const items = [{ order: 2, id: 'two' }, { order: 0, id: 'zero' }, { order: 1, id: 'one' }];
  sorting.setSort('etsy', true);
  assert.deepEqual(Array.from(sorting.favSortRecords(items), (item) => item.id), ['zero', 'one', 'two']);
});

test('Favorites UI helpers provide stable sort width, outline icons, and one shared chevron', async () => {
  const api = await loadUiHelpers();
  assert.equal(api.favSortTriggerWidth((label) => label.length), 'Shipping: high to low'.length + 54);
  assert.equal((api.favChevronMarkup().match(/class="ebsf-chevron"/g) || []).length, 1);
  assert.match(api.favReverseSortIconMarkup(), /fill="none"/);
  assert.equal(api.favSyncCompactDetail({ processed: 40, expectedTotal: 61, estimatedRemainingMs: 4100 }), '40 / 61 · ~5s');

  const iconSource = await readFile(resolve(ROOT, 'src/45-scan-settings-ui.js'), 'utf8');
  assert.match(iconSource, /viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
  assert.doesNotMatch(iconSource.match(/function ebsSettingsIconMarkup[\s\S]*?\n}/)?.[0] || '', /fill="currentColor"/);

  const railSource = await readFile(resolve(ROOT, 'src/62b-favorites-filter-ui.js'), 'utf8');
  assert.match(railSource, /favChevronMarkup\(\)/);
  assert.doesNotMatch(railSource, /wt-content-toggle--btn__icon/);
  assert.doesNotMatch(railSource, /collapsible-filter-bb/);
  assert.doesNotMatch(railSource, /trigger\.className = 'wt-btn/);
});

test('shared modal scroll lock is balanced and restores exact page state', async () => {
  const api = await loadScrollLock();
  const originalBody = { ...api.body.style };
  api.lockPageScroll();
  api.lockPageScroll();
  assert.equal(api.getLock().count, 2);
  assert.equal(api.body.style.position, 'fixed');
  assert.equal(api.html.classList.contains('ebs-page-scroll-locked'), true);
  assert.equal(api.body.classList.contains('ebs-page-scroll-locked'), true);
  assert.equal(api.body.style.top, '-231px');
  assert.equal(api.listeners.has('wheel'), true);
  api.unlockPageScroll();
  assert.equal(api.getLock().count, 1);
  assert.equal(api.body.style.position, 'fixed');
  api.unlockPageScroll();
  assert.equal(api.getLock(), null);
  assert.deepEqual(api.body.style, originalBody);
  assert.equal(api.html.classList.contains('ebs-page-scroll-locked'), false);
  assert.equal(api.body.classList.contains('ebs-page-scroll-locked'), false);
  assert.deepEqual(api.scrolls, [[17, 231]]);
  assert.equal(api.listeners.size, 0);
});

test('Favorites search progress preserves the native form and restores it on every terminal state', async () => {
  const source = await readFile(resolve(ROOT, 'src/62-favorites-ui.js'), 'utf8');
  const styles = await readFile(resolve(ROOT, 'src/65-favorites-style.js'), 'utf8');
  assert.match(source, /anchor\.form\.classList\.add\('ebsf-native-search-sync-hidden'\)/);
  assert.match(source, /searchSlot\.before\(row\);row\.append\(searchSlot\)/);
  assert.match(styles, /\.ebsf-toolbar-row\{[^}]*width:100%!important/);
  assert.match(styles, /\.ebsf-sync-progress\{[^}]*position:absolute;inset:0/);
  assert.match(source, /<strong>Syncing<\/strong>/);
  assert.match(source, /favSyncCompactDetail\(\)/);
  assert.doesNotMatch(source, /<strong><\/strong>/);
  assert.match(source, /classList\.remove\('ebsf-native-search-sync-hidden'\)/);
  assert.match(source, /if\(favSyncState\.status==='running'\)favRenderSyncProgress\(\);else favHideSyncProgress\(\)/);
});

test('Favorites Settings owns a viewport-bounded scroll container', async () => {
  const styles = await readFile(resolve(ROOT, 'src/65-favorites-style.js'), 'utf8');
  assert.match(styles, /\.ebsf-settings-modal>\.ebs-modal-editor\{[^}]*overflow-y:auto/);
  assert.match(styles, /max-height:min\(760px,calc\(100dvh - 24px\)\)/);
});

test('active Favorites values reopen accordion sections whenever the rail is shown without persisting manual disclosure state', async () => {
  const api = await loadState();
  const cfg = api.favDefaultConfig();
  cfg.strict = true;
  cfg.filters.minPrice = '10';
  cfg.filters.starSeller = true;
  cfg.filters.minReviews = '50';
  const active = Array.from(api.favActiveSectionKeys(cfg));
  assert.deepEqual(active, ['search', 'item-qualities', 'price', 'rating-and-reviews']);

  const state = api.getState();
  state.openSectionsInitialized = false;
  Object.assign(api.getConfig(), cfg);
  api.favInitializeOpenSections();
  state.manualOpenSections.add('category');
  state.openSections.delete('price');
  api.favPrepareOpenSectionsForRail();
  assert.equal(state.openSections.has('price'), true);
  assert.equal(state.openSections.has('category'), true);
  api.getConfig().filters.minPrice = '';
  api.favPrepareOpenSectionsForRail();
  assert.equal(state.openSections.has('price'), false);
  assert.equal(state.openSections.has('category'), true);
  api.favSaveConfig();
  assert.equal(api.getSaved().openSections, undefined);
  assert.equal(api.getSaved().filters.openSections, undefined);
});

test('Favorites Strict and Multi modes are mutually exclusive', async () => {
  const api = await loadState();
  const cfg = api.favDefaultConfig();
  api.favSetSearchMode('strict', true, cfg);
  assert.equal(cfg.strict, true);
  assert.equal(cfg.multi, false);
  api.favSetSearchMode('multi', true, cfg);
  assert.equal(cfg.strict, false);
  assert.equal(cfg.multi, true);
});

test('metadata known false remains distinct from unknown and source priority is stable', async () => {
  const api = await loadIndex();
  const unknown = api.favIndexUnknown();
  const knownFalse = api.favIndexField(false, { known: true, source: 'favorites-json', observedAt: 10 });
  assert.equal(unknown.known, false);
  assert.equal(knownFalse.known, true);
  assert.equal(knownFalse.value, false);
  assert.equal(api.favIndexMergeField(unknown, knownFalse).value, false);

  const newerDom = api.favIndexField(true, { source: 'favorites-card-dom', observedAt: 20 });
  assert.equal(api.favIndexMergeField(knownFalse, newerDom).value, false);
  const newerJson = api.favIndexField(true, { source: 'favorites-json', observedAt: 30 });
  assert.equal(api.favIndexMergeField(knownFalse, newerJson).value, true);
});

test('deep seller metadata hydrates a live record when cheap Favorites data omitted the shop', async () => {
  const api = await loadIndex();
  const record = { id:'123', shopName:'', known:{} };
  api.favIndexApplyListingMetadataToRecord(record, {
    lastDeepScanAt: 20,
    deepParserVersion: 'listing-html-v3',
    listingMetadata: { sellerName:api.favIndexField('Example Studio', { known:true, source:'listing-page-html', observedAt:20 }) },
  });
  assert.equal(record.shopName, 'Example Studio');
  assert.equal(record.known.shopName, true);
});

test('listing upsert preserves deep metadata through unfavorite and refavorite lifecycle', async () => {
  const api = await loadIndex();
  const scope = { owner: '1', type: 'items', id: '', query: '', scopeKey: 'all', authoritativeFavoriteScope: true };
  const record = {
    id: '42', title: 'Item', url: '/listing/42', shopId: '7', shopName: 'Shop',
    price: 12, isStarSeller: false, isDownload: false, videoSources: [],
    known: { isStarSeller: true, isDownload: true },
  };
  const patch = api.favIndexPatchFromRecord(record, scope, 100);
  let listing = api.favIndexMergeListing(null, patch, 100);
  listing.listingMetadata.vintage = api.favIndexField(true, { source: 'listing-page-html', observedAt: 90 });
  listing = api.favIndexMarkListingUnfavorite(listing, 200);
  assert.equal(listing.isFavorite, false);
  assert.equal(listing.listingMetadata.vintage.value, true);
  const stalePatch = api.favIndexPatchFromRecord({ ...record, indexObservedAt: 150 }, scope, 250);
  listing = api.favIndexMergeListing(listing, stalePatch, 250);
  assert.equal(listing.isFavorite, false);
  assert.equal(listing.favoriteScopes.all.active, false);
  listing = api.favIndexMergeListing(listing, api.favIndexPatchFromRecord(record, scope, 300), 300);
  assert.equal(listing.isFavorite, true);
  assert.equal(listing.unfavoritedAt, 0);
  assert.equal(listing.listingMetadata.vintage.value, true);
});

test('partial scope observations do not imply absence; complete scopes update only their membership', async () => {
  const api = await loadIndex();
  const listing = api.favIndexEmptyListing('42', 10);
  listing.favoriteScopes = {
    collection: { active: true, lastSeenAt: 10 },
    all: { active: true, lastSeenAt: 10 },
  };
  const unchanged = api.favIndexApplyScopeCompletion([listing], { scopeKey: 'collection', authoritativeFavoriteScope: false }, ['42'], 20)[0];
  assert.equal(unchanged.favoriteScopes.collection.active, true);

  const removedFromCollection = api.favIndexApplyScopeCompletion([listing], { scopeKey: 'collection', authoritativeFavoriteScope: false }, [], 30)[0];
  assert.equal(removedFromCollection.isFavorite, true);
  assert.equal(removedFromCollection.favoriteScopes.collection.active, false);
  assert.equal(removedFromCollection.favoriteScopes.all.active, true);

  const globallyRemoved = api.favIndexApplyScopeCompletion([listing], { scopeKey: 'all', authoritativeFavoriteScope: true }, [], 40)[0];
  assert.equal(globallyRemoved.isFavorite, false);
  assert.equal(globallyRemoved.unfavoritedAt, 40);
});

test('fresh cheap Star Seller metadata updates the normalized shop record', async () => {
  const api = await loadIndex();
  const oldShop = api.favIndexMergeShop(null, {
    shopId: '7', shopName: 'Shop', shopUrl: '/shop/Shop',
    starSeller: api.favIndexField(false, { source: 'favorites-json', observedAt: 10 }), observedAt: 10,
  });
  const updated = api.favIndexMergeShop(oldShop, {
    shopId: '7', shopName: 'Shop', shopUrl: '/shop/Shop',
    starSeller: api.favIndexField(true, { source: 'favorites-json', observedAt: 20 }), observedAt: 20,
  });
  assert.equal(updated.starSeller.known, true);
  assert.equal(updated.starSeller.value, true);
  assert.equal(updated.lastObservedAt, 20);
});

test('complete All Items reconciliation is authoritative while a partial pass is not', async () => {
  const api = await loadIndex();
  const listing = api.favIndexEmptyListing('lost', 1);
  listing.favoriteScopes = { all: { active: true, lastSeenAt: 1 } };
  const partial = api.favIndexApplyScopeCompletion([listing], { scopeKey: 'all', authoritativeFavoriteScope: false }, [], 2)[0];
  assert.equal(partial.isFavorite, true);
  const complete = api.favIndexApplyScopeCompletion([listing], { scopeKey: 'all', authoritativeFavoriteScope: true }, [], 3)[0];
  assert.equal(complete.isFavorite, false);
  assert.equal(complete.favoriteScopes.all.active, false);
});

test('large scope reconciliation uses set semantics and removes only absent memberships', async () => {
  const api = await loadIndex();
  const listings = Array.from({ length: 5000 }, (_, index) => {
    const listing = api.favIndexEmptyListing(String(index), 1);
    listing.favoriteScopes = { collection: { active: true } };
    return listing;
  });
  const seen = Array.from({ length: 2500 }, (_, index) => String(index * 2));
  const reconciled = api.favIndexApplyScopeCompletion(listings, { scopeKey: 'collection', authoritativeFavoriteScope: false }, seen, 2);
  assert.equal(reconciled.filter((listing) => listing.favoriteScopes.collection.active).length, 2500);
  assert.equal(reconciled.every((listing) => listing.isFavorite), true);
});

test('bulk observations deduplicate listing IDs and use one read plus one atomic write', async () => {
  const api = await loadIndex();
  let reads = 0, writes = 0;
  const puts = { listings: [], shops: [], scopes: [] };
  api.setObservationDeps(async () => { reads += 1; return { listings: [], shops: [], shopIds: [], scope: null }; }, async (stores, writer) => {
    writes += 1;
    assert.deepEqual(Array.from(stores), ['listings', 'shops', 'scopes']);
    writer({ objectStore: (name) => ({ put: (value) => puts[name].push(value) }) });
  });
  const record = { id: '1', title: 'new', shopId: '7', shopName: 'Shop', price: 1, known: {}, videoSources: [] };
  await api.favIndexObserveRecordsNow([{ ...record, title: 'old' }, record], { scope: { owner: 'o', type: 'items', scopeKey: 'all' }, complete: false, observedAt: 10 });
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  assert.equal(puts.listings.length, 1);
  assert.equal(puts.listings[0].title, 'new');
  assert.equal(puts.scopes[0].listingIds.length, 1);
});

test('current-page observation is partial and excludes structured modules outside the Favorites grid', async () => {
  const api = await loadIndex({ currentListings: [{ listingId: 'favorite' }, { listingId: 'recommendation' }], liveIds: ['favorite'] });
  let captured;
  api.setObserve(async (records, options) => { captured = { records, options }; return records; });
  api.setCurrentScope(() => ({ scopeKey: 'current' }));
  await api.favIndexObserveCurrentPage();
  assert.deepEqual(Array.from(captured.records, (record) => record.id), ['favorite']);
  assert.equal(captured.options.complete, false);
});

test('timestamps and provenance reject unknown or stale observations without losing false/zero', async () => {
  const api = await loadIndex();
  const zero = api.favIndexField(0, { known: true, source: 'favorites-aux-json', observedAt: 20 });
  const unknown = api.favIndexField(null, { known: false, observedAt: 30 });
  assert.equal(api.favIndexMergeField(zero, unknown).value, 0);
  const stale = api.favIndexField(5, { known: true, source: 'favorites-aux-json', observedAt: 10 });
  assert.equal(api.favIndexMergeField(zero, stale).value, 0);
  const fresh = api.favIndexField(false, { known: true, source: 'favorites-aux-json', observedAt: 40 });
  assert.equal(api.favIndexMergeField(zero, fresh).value, false);
});

test('auto-sync due decisions honor never-synced, fresh, and stale timestamps', async () => {
  const api = await loadSync();
  assert.equal(api.favSyncIsDue(null, 1000, 100), true);
  assert.equal(api.favSyncIsDue({ lastCompleteSyncAt: 950 }, 1000, 100), false);
  assert.equal(api.favSyncIsDue({ lastCompleteSyncAt: 800 }, 1000, 100), true);
});

test('authoritative synchronization deduplicates pages and completes only after the last page', async () => {
  const observations = [];
  let page = 0;
  const api = await loadSync({
    fetchJson: async () => ({ listings: page++ === 0 ? Array.from({ length: 20 }, (_, index) => ({ id: index })) : [{ id: 5 }, { id: 20 }] }),
    observe: async (records, options) => { observations.push({ ids: records.map((record) => record.id), ...options }); },
  });
  const scope = api.favSyncScopeDescriptor({ owner: 'owner', type: 'items', id: '' }, '');
  await api.favSyncScope(scope, { expectedTotal: 21 });
  assert.equal(api.getState().status, 'completed');
  assert.equal(api.getState().processed, 21);
  assert.equal(observations.at(-1).complete, true);
  assert.equal(new Set(observations.at(-1).ids).size, 21);
});

test('failed partial synchronization preserves observations but never emits completion', async () => {
  const observations = [];
  let call = 0;
  const api = await loadSync({
    fetchJson: async () => { if (call++ === 0) return { listings: Array.from({ length: 20 }, (_, index) => ({ id: index })) }; throw new Error('network'); },
    observe: async (_records, options) => observations.push(options),
  });
  await api.favSyncScope(api.favSyncScopeDescriptor({ owner: 'owner', type: 'items', id: '' }, ''));
  assert.equal(api.getState().status, 'error');
  assert.equal(observations.length, 1);
  assert.equal(observations[0].complete, false);
});

test('sync cancellation rejects the active request and does not complete its scope', async () => {
  const observations = [];
  const api = await loadSync({
    fetchJson: (_url, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
    observe: async (_records, options) => observations.push(options),
  });
  const promise = api.favSyncScope(api.favSyncScopeDescriptor({ owner: 'owner', type: 'items', id: '' }, ''));
  assert.equal(api.favCancelSync('test'), true);
  await promise;
  assert.equal(api.getState().status, 'cancelled');
  assert.equal(observations.some((entry) => entry.complete), false);
});

test('job identity rejects stale scope results and progress model is UI-ready', async () => {
  const api = await loadSync();
  assert.equal(api.favSyncJobIsCurrent(99, 'other'), false);
  const model = api.favSyncProgressModel({ processed: 40, expectedTotal: 61, pagesProcessed: 2, estimatedRemainingMs: 4100 });
  assert.equal(model.title, 'Syncing');
  assert.match(model.detail, /^40 \/ 61/);
  assert.match(model.detail, /2 pages left/);
  assert.match(model.detail, /~4s/);
  assert.equal(Math.round(model.ratio * 100), 66);
});
