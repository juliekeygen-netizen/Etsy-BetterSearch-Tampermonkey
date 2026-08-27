import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

test('price bounds filter locally and reject records whose price is unknown', async () => {
  const source = await readFile(resolve(ROOT, 'src/61-favorites-data.js'), 'utf8');
  const filters = {
    minPrice: '10', maxPrice: '20', minDiscount: '', availableOnly: false, onSale: false,
    freeShipping: false, itemFormat: 'all', minRating: '', minReviews: '', starSeller: false,
    bestSeller: false, personalizable: false, hasVariations: false, shop: '', etsysPick: false,
    vintage: false, giftWrap: false, category: '', maxShipping: '', returns: false,
    exchanges: false, lowStock: false, minCarts: '',
  };
  const records = [
    { id:'low', price:9, order:0 },
    { id:'match', price:15, order:1 },
    { id:'high', price:21, order:2 },
    { id:'unknown', price:Number.NaN, order:3 },
  ].map((record) => ({
    title:'item', discountPercent:0, rating:5, reviews:1, shipping:0, carts:0,
    known:{}, deepMetadata:{}, videoSources:[], ...record,
  }));
  const context = vm.createContext({
    console, URL, AbortController, DOMException,
    document:{ hidden:false, addEventListener:()=>{}, body:{} }, location:{ origin:'https://www.etsy.com' },
    favCfg:{ filters, strict:false, multi:false, sort:'etsy', sortReversed:false },
    favState:{ records }, favScope:()=>({ type:'items' }), favNativeQuery:()=>'',
    normalize:(value)=>String(value || '').toLowerCase(), compileMultiPlan:()=>null,
    ruleMatchesTitle:()=>true,
  });
  vm.runInContext(`${source}\nglobalThis.testApi={favFilteredRecords};`, context);
  assert.deepEqual(Array.from(context.testApi.favFilteredRecords(), (record) => record.id), ['match']);
});

test('Ships from matches known country origins without treating unknown as local', async () => {
  const source = await readFile(resolve(ROOT, 'src/71-favorites-phase5-audit-fixes.js'), 'utf8');
  const start = source.indexOf('function favNormalizeCountryCode0101');
  const end = source.indexOf('function favRecordShipsTo0101');
  const selected = source.slice(start, end);
  const names = { FI:'Finland', DE:'Germany', US:'United States', GB:'United Kingdom' };
  const context = vm.createContext({
    Set, Array, String,
    FAV_COUNTRY_CODES_:Object.keys(names),
    favCountryName:(code)=>names[code] || code,
    normalize:(value)=>String(value || '').toLowerCase(),
    favProps:()=>({ countryIsoCode:'FI' }),
  });
  vm.runInContext(`${selected}\nglobalThis.testApi={favNormalizeCountryCode0101,favRecordShipsFrom0101};`, context);
  const api = context.testApi;
  const finland = { shipsFromCountry:'Finland', known:{ shipsFromCountry:true } };
  const germany = { shipsFromCountry:'DE', known:{ shipsFromCountry:true } };
  const usa = { shipsFromCountry:'United States', known:{ shipsFromCountry:true } };
  const unknown = { shipsFromCountry:'', known:{} };
  assert.equal(api.favRecordShipsFrom0101(finland, 'local'), true);
  assert.equal(api.favRecordShipsFrom0101(germany, 'europe'), true);
  assert.equal(api.favRecordShipsFrom0101(germany, 'eu'), true);
  assert.equal(api.favRecordShipsFrom0101({ shipsFromCountry:'GB', known:{ shipsFromCountry:true } }, 'europe'), true);
  assert.equal(api.favRecordShipsFrom0101({ shipsFromCountry:'GB', known:{ shipsFromCountry:true } }, 'eu'), false);
  assert.equal(api.favRecordShipsFrom0101(usa, 'europe'), false);
  assert.equal(api.favRecordShipsFrom0101(usa, 'country', 'US'), true);
  assert.equal(api.favRecordShipsFrom0101(unknown, 'local'), false);
  assert.equal(api.favRecordShipsFrom0101(unknown, 'anywhere'), true);
});

test('current-results availability excludes its own facet and restores live config', async () => {
  const source = await readFile(resolve(ROOT, 'src/76-favorites-layout-state.js'), 'utf8');
  const start = source.indexOf('function favConfigWithoutFilterSection0110');
  const end = source.indexOf('function favDeepVisibilityReady0110');
  const selected = source.slice(start, end);
  const live = { strict:false, multi:false, filters:{ category:'jewelry', minPrice:'10', itemFormat:'all' } };
  let observed;
  const context = vm.createContext({
    Array,
    favCfg:live,
    favUiPrefs:{ filterAvailabilityMode:'filtered' },
    FAV_FILTER_AVAILABILITY_MODES0110:['disabled','catalogue','filtered'],
    favAvailabilityMode0110:()=> 'filtered',
    favNormalizeConfig:(value)=>structuredClone(value),
    favFilteredRecords:()=>{ observed = structuredClone(context.favCfg); return [{ id:'1' }]; },
    favState:{ records:[], filtered:[] },
  });
  vm.runInContext(`${selected}\nglobalThis.testApi={favAvailabilityRecords0110,getConfig:()=>favCfg};`, context);
  assert.equal(context.testApi.favAvailabilityRecords0110('category').length, 1);
  assert.equal(observed.filters.category, '');
  assert.equal(observed.filters.minPrice, '10');
  assert.equal(context.testApi.getConfig(), live);
});

test('filter reliability runtime rehydrates deep metadata and preserves a viewport anchor', async () => {
  const ui = await readFile(resolve(ROOT, 'src/62-favorites-ui.js'), 'utf8');
  const runtime = await readFile(resolve(ROOT, 'src/78-favorites-filter-layout-runtime.js'), 'utf8');
  assert.match(ui, /favRehydrateAndReapply0101\(\)/);
  assert.match(runtime, /favCaptureViewportAnchor0110/);
  assert.match(runtime, /window\.scrollBy\(0, delta\)/);
  assert.doesNotMatch(ui, /favReapply\(true\)/);
});

test('removed video and city-origin filters do not remain in production modules', async () => {
  const files = [
    'src/60-favorites-state.js', 'src/61-favorites-data.js', 'src/61a-favorites-index.js',
    'src/62b-favorites-filter-ui.js', 'src/71-favorites-phase5-audit-fixes.js',
    'src/76-favorites-layout-state.js', 'src/77-favorites-filter-capabilities.js',
    'src/78-favorites-filter-layout-runtime.js',
  ];
  const source = (await Promise.all(files.map((file) => readFile(resolve(ROOT, file), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /hasVideo|has-video|Has video|shipsFromCity|Near a city/);
});
