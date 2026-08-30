import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const modulePath = resolve(ROOT, 'src/66a-favorites-multitab-config.js');

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const filters = source.filters && typeof source.filters === 'object' ? source.filters : {};
  return {
    strict: source.strict === true,
    strictMode: source.strictMode === 'all' ? 'all' : 'phrase',
    multi: source.multi === true,
    multiRules: Array.isArray(source.multiRules) ? clone(source.multiRules) : [{ join:'or', text:'' }],
    sort: ['etsy', 'price', 'rating'].includes(source.sort) ? source.sort : 'etsy',
    sortReversed: source.sortReversed === true,
    autoSync: source.autoSync !== false,
    autoScanMissingMetadata: source.autoScanMissingMetadata !== false,
    filters: {
      onSale: filters.onSale === true,
      minPrice: String(filters.minPrice ?? ''),
    },
  };
}

function normalizePrefs(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    autoOpenActiveSections: source.autoOpenActiveSections !== false,
    autoSyncIntervalHours: [1, 3, 6, 12, 24].includes(Number(source.autoSyncIntervalHours)) ? Number(source.autoSyncIntervalHours) : 12,
    filterAvailabilityMode: ['disabled', 'catalogue', 'filtered'].includes(source.filterAvailabilityMode) ? source.filterAvailabilityMode : 'filtered',
    hideUnavailableCatalogFilters: source.filterAvailabilityMode !== 'disabled',
    filterSectionOrder: Array.isArray(source.filterSectionOrder) ? [...source.filterSectionOrder] : ['search', 'price'],
    filterSectionHidden: Array.isArray(source.filterSectionHidden) ? [...source.filterSectionHidden] : [],
    filterOptionOrder: source.filterOptionOrder && typeof source.filterOptionOrder === 'object'
      ? clone(source.filterOptionOrder)
      : { search:['strict-title', 'multi-search'], price:['price-range'] },
    filterOptionHidden: source.filterOptionHidden && typeof source.filterOptionHidden === 'object'
      ? clone(source.filterOptionHidden)
      : { search:[], price:[] },
    sortMenuOrder: Array.isArray(source.sortMenuOrder) ? [...source.sortMenuOrder] : ['etsy', 'price'],
    sortMenuHidden: Array.isArray(source.sortMenuHidden) ? [...source.sortMenuHidden] : [],
  };
}

function makeBus(initial = {}) {
  const storage = new Map(Object.entries(clone(initial)));
  const tabs = new Map();
  let nextListenerId = 1;
  let deliverRemote = true;

  function api(tabId) {
    const listeners = new Map();
    tabs.set(tabId, listeners);
    return {
      GM_getValue(key, fallback) {
        return storage.has(key) ? clone(storage.get(key)) : fallback;
      },
      GM_setValue(key, value) {
        const oldValue = storage.has(key) ? clone(storage.get(key)) : undefined;
        storage.set(key, clone(value));
        if (!deliverRemote) return;
        for (const [otherId, otherListeners] of tabs) {
          for (const { key: watchedKey, callback } of otherListeners.values()) {
            if (watchedKey !== key) continue;
            callback(key, oldValue, clone(value), otherId !== tabId);
          }
        }
      },
      GM_addValueChangeListener(key, callback) {
        const id = nextListenerId++;
        listeners.set(id, { key, callback });
        return id;
      },
    };
  }

  return {
    storage,
    api,
    set deliverRemote(value) { deliverRemote = value; },
    get deliverRemote() { return deliverRemote; },
  };
}

async function createTab(bus, id) {
  const source = await readFile(modulePath, 'utf8');
  const storageKey = 'etsy-bettersearch.favorites.config.v1';
  const prefsKey = 'etsy-bettersearch.favorites.ui-prefs.v1';
  const transport = bus.api(id);
  const context = vm.createContext({
    ...transport,
    structuredClone: globalThis.structuredClone,
    FAV_STORAGE_KEY: storageKey,
    FAV_UI_PREFS_STORAGE_KEY: prefsKey,
    favNormalizeConfig: normalizeConfig,
    favNormalizeUiPrefs: normalizePrefs,
    favCfg: normalizeConfig(transport.GM_getValue(storageKey, {})),
    favUiPrefs: normalizePrefs(transport.GM_getValue(prefsKey, {})),
    favState: { localPage:1, settingsModal:null, layoutModal:null, filterOpen:false, rail:null },
    requestAnimationFrame: (callback) => { callback(); return 1; },
    setTimeout,
    isFavoritesPage: () => false,
    console,
  });
  vm.runInContext(source, context);
  return context;
}

function fieldKey(base, path) {
  return `${base}.field.v1.${encodeURIComponent(path)}`;
}

test('stale tabs changing unrelated config fields cannot overwrite each other', async () => {
  const configKey = 'etsy-bettersearch.favorites.config.v1';
  const prefsKey = 'etsy-bettersearch.favorites.ui-prefs.v1';
  const bus = makeBus({
    [configKey]: normalizeConfig({ autoSync:true, sort:'etsy' }),
    [prefsKey]: normalizePrefs({}),
  });
  const tabA = await createTab(bus, 'A');
  const tabB = await createTab(bus, 'B');

  bus.deliverRemote = false;
  tabA.favCfg.autoSync = false;
  tabA.favSaveConfig();
  assert.equal(tabB.favCfg.autoSync, true, 'B remains intentionally stale while remote delivery is paused');

  tabB.favCfg.sort = 'price';
  tabB.favSaveConfig();

  assert.equal(bus.storage.get(fieldKey(configKey, 'autoSync')), false);
  assert.equal(bus.storage.get(fieldKey(configKey, 'sort')), 'price');

  const tabC = await createTab(bus, 'C');
  assert.equal(tabC.favCfg.autoSync, false, 'new tab overlays canonical autoSync leaf over stale aggregate');
  assert.equal(tabC.favCfg.sort, 'price', 'new tab overlays canonical sort leaf over stale aggregate');
});

test('remote config leaves update live objects in place and worker policy immediately', async () => {
  const configKey = 'etsy-bettersearch.favorites.config.v1';
  const prefsKey = 'etsy-bettersearch.favorites.ui-prefs.v1';
  const bus = makeBus({
    [configKey]: normalizeConfig({ autoScanMissingMetadata:true, filters:{ onSale:false } }),
    [prefsKey]: normalizePrefs({}),
  });
  const tabA = await createTab(bus, 'A');
  const tabB = await createTab(bus, 'B');
  const configIdentity = tabB.favCfg;
  const filtersIdentity = tabB.favCfg.filters;

  tabA.favCfg.filters.onSale = true;
  tabA.favSaveConfig();
  assert.equal(tabB.favCfg.filters.onSale, true);
  assert.equal(tabB.favCfg, configIdentity);
  assert.equal(tabB.favCfg.filters, filtersIdentity);

  tabA.favCfg.autoScanMissingMetadata = false;
  tabA.favSaveConfig();
  assert.equal(tabB.favCfg.autoScanMissingMetadata, false, 'remote disable reaches the live worker-policy object');
});

test('stale tabs changing unrelated UI preference leaves both survive', async () => {
  const configKey = 'etsy-bettersearch.favorites.config.v1';
  const prefsKey = 'etsy-bettersearch.favorites.ui-prefs.v1';
  const bus = makeBus({
    [configKey]: normalizeConfig({}),
    [prefsKey]: normalizePrefs({ filterAvailabilityMode:'filtered', filterSectionOrder:['search', 'price'] }),
  });
  const tabA = await createTab(bus, 'A');
  const tabB = await createTab(bus, 'B');

  bus.deliverRemote = false;
  tabA.favUiPrefs.filterAvailabilityMode = 'disabled';
  tabA.favUiPrefs.hideUnavailableCatalogFilters = false;
  tabA.favSaveUiPrefs();

  tabB.favUiPrefs.filterSectionOrder = ['price', 'search'];
  tabB.favSaveUiPrefs();

  assert.equal(bus.storage.get(fieldKey(prefsKey, 'filterAvailabilityMode')), 'disabled');
  assert.deepEqual(bus.storage.get(fieldKey(prefsKey, 'filterSectionOrder')), ['price', 'search']);

  const tabC = await createTab(bus, 'C');
  assert.equal(tabC.favUiPrefs.filterAvailabilityMode, 'disabled');
  assert.deepEqual(Array.from(tabC.favUiPrefs.filterSectionOrder), ['price', 'search']);
});

test('userscript and extension expose the shared remote-value listener contract in the correct load order', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const prelude = await readFile(resolve(ROOT, 'extension/platform-prelude.js'), 'utf8');
  const base = userscript.indexOf('/src/66-favorites-settings-sort-polish.js');
  const owner = userscript.indexOf('/src/66a-favorites-multitab-config.js');
  const next = userscript.indexOf('/src/67-favorites-sort-activation.js');

  assert.match(userscript, /@grant\s+GM_addValueChangeListener/);
  assert.ok(base >= 0 && owner > base && next > owner);
  assert.match(prelude, /function GM_addValueChangeListener\(key, callback\)/);
  assert.match(prelude, /const remote = !ebsExtConsumeLocalValue\(key, newValue\)/);
  assert.match(prelude, /ebsExtDispatchValueChange\(key, change\?\.oldValue, newValue, remote\)/);
});
