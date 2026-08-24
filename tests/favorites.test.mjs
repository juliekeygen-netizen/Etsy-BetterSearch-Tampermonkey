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
  vm.runInContext(`${source}\nglobalThis.testApi={favDefaultConfig,favNormalizeConfig,favActiveSectionKeys,favInitializeOpenSections,favSetSearchMode,favSaveConfig,getConfig:()=>favCfg,getState:()=>favState};`, context);
  context.testApi.getSaved = () => holder.saved;
  return context.testApi;
}

async function loadIndex() {
  const source = await readFile(resolve(ROOT, 'src/61a-favorites-index.js'), 'utf8');
  const context = vm.createContext({ console, Date, encodeURIComponent, indexedDB: {} });
  vm.runInContext(`${source}\nglobalThis.testApi={favIndexUnknown,favIndexField,favIndexMergeField,favIndexEmptyListing,favIndexScopeKey,favIndexPatchFromRecord,favIndexMergeListing,favIndexMarkListingUnfavorite,favIndexMarkListingAvailability,favIndexApplyScopeCompletion,favIndexMergeShop};`, context);
  return context.testApi;
}

test('Favorites config normalization preserves durable defaults and future index-backed values', async () => {
  const api = await loadState();
  const cfg = api.favNormalizeConfig({ strictMode: 'bad', filters: { itemFormat: 'digital', vintage: true, shipsFrom: 'country', colors: ['red'] } });
  assert.equal(cfg.strictMode, 'phrase');
  assert.equal(cfg.filters.itemFormat, 'digital');
  assert.equal(cfg.filters.vintage, true);
  assert.equal(cfg.filters.shipsFrom, 'country');
  assert.equal('colors' in cfg.filters, false);
  assert.equal(cfg.filters.ready1Day, false);
});

test('active Favorites values determine initial accordion sections without persisting manual disclosure state', async () => {
  const api = await loadState();
  const cfg = api.favDefaultConfig();
  cfg.strict = true;
  cfg.filters.minPrice = '10';
  cfg.filters.starSeller = true;
  cfg.filters.minReviews = '50';
  const active = Array.from(api.favActiveSectionKeys(cfg));
  assert.deepEqual(active, ['search', 'etsys-best', 'price', 'rating-and-reviews']);

  const state = api.getState();
  state.openSectionsInitialized = false;
  Object.assign(api.getConfig(), cfg);
  api.favInitializeOpenSections();
  state.openSections.add('category');
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

test('listing upsert preserves deep metadata through unfavorite and refavorite lifecycle', async () => {
  const api = await loadIndex();
  const scope = { owner: '1', type: 'items', id: '', query: '', scopeKey: 'all', authoritativeFavoriteScope: true };
  const record = {
    id: '42', title: 'Item', url: '/listing/42', shopId: '7', shopName: 'Shop',
    price: 12, isStarSeller: false, isDownload: false, videoSources: [],
    known: { isStarSeller: true, isDownload: true, hasVideo: true },
  };
  const patch = api.favIndexPatchFromRecord(record, scope, 100);
  let listing = api.favIndexMergeListing(null, patch, 100);
  listing.listingMetadata.vintage = api.favIndexField(true, { source: 'listing-page-html', observedAt: 90 });
  listing = api.favIndexMarkListingUnfavorite(listing, 200);
  assert.equal(listing.isFavorite, false);
  assert.equal(listing.listingMetadata.vintage.value, true);
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
