import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const source = await readFile(resolve(ROOT, 'src/104-favorites-v0157-filter-state-sync.js'), 'utf8');
const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
const packageJson = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));

function defaultConfig() {
  return {
    strict:false,
    multi:false,
    filters:{
      minPrice:'', maxPrice:'', availableOnly:false, onSale:false, freeShipping:false,
      itemFormat:'all', minRating:'', minReviews:'', starSeller:false,
      personalizable:false, hasVariations:false, shop:'', maxShipping:'',
      returns:false, exchanges:false, lowStock:false, minCarts:'', category:'',
      etsysPick:false, shipsFrom:'anywhere', shipsFromCountry:'', vintage:false,
      giftWrap:false,
    },
  };
}

function loadPureHelpers() {
  const end = source.indexOf('/* Replace the historical binding-state predicate');
  const context = vm.createContext({ String, Array, Boolean });
  vm.runInContext(`${source.slice(0, end)}\nglobalThis.testApi={
    active:favBindingMeaningfullyActive0157,
    drawer:favDrawerShouldOpen0157,
  };`, context);
  return context.testApi;
}

function cloneConfig(value) {
  return structuredClone(value);
}

function classList(initial = []) {
  const values = new Set(initial);
  return {
    contains:(name) => values.has(name),
    toggle:(name, enabled) => { enabled ? values.add(name) : values.delete(name); },
    has:(name) => values.has(name),
  };
}

function loadVisualSyncHelper() {
  const start = source.indexOf('function favToggleClass0157');
  const end = source.indexOf('favSyncBindingControls0120 = function');
  const context = vm.createContext({ String, Boolean });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.testApi={sync:favSyncOneBindingRoot0157};`, context);
  return context.testApi.sync;
}

test('state/count semantics stay final until render transaction and metadata-context boundaries', () => {
  const diagnostics = userscript.indexOf('/src/103-favorites-v0157-diagnostics-fixes.js');
  const stateSync = userscript.indexOf('/src/104-favorites-v0157-filter-state-sync.js');
  const transaction = userscript.indexOf('/src/105-favorites-v01512-atomic-render.js');
  const metadataContext = userscript.indexOf('/src/106-favorites-v01524-metadata-context-generation.js');
  assert.ok(diagnostics >= 0 && stateSync > diagnostics && transaction > stateSync && metadataContext > transaction);
  const requires = Array.from(userscript.matchAll(/^\/\/ @require\s+([^\s]+)$/gm), (match) => match[1]);
  assert.equal(requires.at(-3) || '', `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/104-favorites-v0157-filter-state-sync.js?v=${packageJson.version}`);
  assert.equal(requires.at(-2) || '', `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/105-favorites-v01512-atomic-render.js?v=${packageJson.version}`);
  assert.equal(requires.at(-1) || '', `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/106-favorites-v01524-metadata-context-generation.js?v=${packageJson.version}`);
});

test('normalized default configuration has no meaningfully active v2 filter binding', () => {
  const { active } = loadPureHelpers();
  const config = defaultConfig();
  const bindings = [
    'strict-title','multi-search','category:art-and-collectibles',
    'ships-anywhere','ships-europe','ships-eu','ships-local','ships-country','ships-origin:FI',
    'price-range','etsys-picks','star-seller','available-only','on-sale','free-shipping',
    'customizable','has-variations','gift-wrap','physical','digital','vintage','shop',
    'low-stock','min-carts','min-rating','min-reviews','max-shipping','returns','exchanges',
  ];
  for (const binding of bindings) assert.equal(active(binding, config), false, `${binding} must be neutral by default`);
  assert.equal(active('category:', config), false, 'synthetic category refresh key is never an active filter');
});

test('Ships from Anywhere and incomplete country mode stay neutral while real origin choices are active', () => {
  const { active } = loadPureHelpers();
  const config = defaultConfig();
  assert.equal(active('ships-anywhere', config), false);

  config.filters.shipsFrom = 'country';
  assert.equal(active('ships-country', config), false, 'country mode without a selected country is incomplete, not active');
  config.filters.shipsFromCountry = 'FI';
  assert.equal(active('ships-country', config), true);
  assert.equal(active('ships-origin:FI', config), true);
  assert.equal(active('ships-origin:SE', config), false);
  config.filters.shipsFrom = 'europe';
  config.filters.shipsFromCountry = '';
  assert.equal(active('ships-europe', config), true);
  assert.equal(active('ships-anywhere', config), false);
  config.filters.shipsFrom = 'eu';
  assert.equal(active('ships-eu', config), true);
  config.filters.shipsFrom = 'local';
  assert.equal(active('ships-local', config), true);
});

test('every non-shipping v2 filter family has a representative non-default active state', () => {
  const { active } = loadPureHelpers();
  const base = defaultConfig();
  const cases = [
    ['strict-title', (c) => { c.strict = true; }],
    ['multi-search', (c) => { c.multi = true; }],
    ['category:art-and-collectibles', (c) => { c.filters.category = 'art-and-collectibles'; }],
    ['price-range', (c) => { c.filters.maxPrice = '25'; }],
    ['etsys-picks', (c) => { c.filters.etsysPick = true; }],
    ['star-seller', (c) => { c.filters.starSeller = true; }],
    ['available-only', (c) => { c.filters.availableOnly = true; }],
    ['on-sale', (c) => { c.filters.onSale = true; }],
    ['free-shipping', (c) => { c.filters.freeShipping = true; }],
    ['customizable', (c) => { c.filters.personalizable = true; }],
    ['has-variations', (c) => { c.filters.hasVariations = true; }],
    ['gift-wrap', (c) => { c.filters.giftWrap = true; }],
    ['physical', (c) => { c.filters.itemFormat = 'physical'; }],
    ['digital', (c) => { c.filters.itemFormat = 'digital'; }],
    ['vintage', (c) => { c.filters.vintage = true; }],
    ['shop', (c) => { c.filters.shop = 'Example shop'; }],
    ['low-stock', (c) => { c.filters.lowStock = true; }],
    ['min-carts', (c) => { c.filters.minCarts = '5'; }],
    ['min-rating', (c) => { c.filters.minRating = '4'; }],
    ['min-reviews', (c) => { c.filters.minReviews = '20'; }],
    ['max-shipping', (c) => { c.filters.maxShipping = '0'; }],
    ['returns', (c) => { c.filters.returns = true; }],
    ['exchanges', (c) => { c.filters.exchanges = true; }],
  ];
  for (const [binding, mutate] of cases) {
    const config = cloneConfig(base);
    mutate(config);
    assert.equal(active(binding, config), true, `${binding} must become active when its real filter value changes`);
  }
});

test('auto-open uses meaningful binding state, respects the preference, and preserves manual disclosure', () => {
  const { drawer } = loadPureHelpers();
  const config = defaultConfig();
  const shipping = {
    instanceId:'shipping-drawer', definitionKey:'ships-from', hidden:false,
    optionInstances:[
      { bindingKey:'ships-anywhere', hidden:false },
      { bindingKey:'ships-europe', hidden:false },
      { bindingKey:'ships-country', hidden:false },
    ],
  };
  assert.equal(drawer(shipping, config, true, false), false, 'Anywhere must not auto-open Ships from');
  config.filters.shipsFrom = 'europe';
  assert.equal(drawer(shipping, config, true, false), true, 'a real shipping restriction auto-opens its drawer');
  assert.equal(drawer(shipping, config, false, false), false, 'disabled preference suppresses automatic opening');
  assert.equal(drawer(shipping, config, false, true), true, 'manual disclosure remains open independently of the preference');
});

test('Strict and Multi visual state follows config in both ON and OFF directions', () => {
  const sync = loadVisualSyncHelper();
  const rootClasses = classList();
  const splitClasses = classList();
  const attrs = new Map([['aria-pressed','false']]);
  const button = {
    classList:classList(),
    getAttribute:(name) => attrs.get(name) ?? null,
    setAttribute:(name, value) => attrs.set(name, String(value)),
  };
  const input = { checked:false };
  const split = { classList:splitClasses };
  const root = {
    classList:rootClasses,
    querySelectorAll:(selector) => {
      if (selector === 'input[type="checkbox"],input[type="radio"]') return [input];
      if (selector === '[aria-pressed]') return [button];
      if (selector === '.ebsf-search-split') return [split];
      return [];
    },
  };

  sync(root, true);
  assert.equal(rootClasses.has('is-active'), true);
  assert.equal(splitClasses.has('ebs-active'), true);
  assert.equal(button.classList.has('is-selected'), true);
  assert.equal(attrs.get('aria-pressed'), 'true');
  assert.equal(input.checked, true);

  sync(root, false);
  assert.equal(rootClasses.has('is-active'), false);
  assert.equal(splitClasses.has('ebs-active'), false, 'dark split state must be removed when the mode is disabled');
  assert.equal(button.classList.has('is-selected'), false);
  assert.equal(attrs.get('aria-pressed'), 'false');
  assert.equal(input.checked, false);
});

test('final binding sync updates every duplicate instance and keeps category radio-group refresh behavior', () => {
  assert.match(source, /for \(const root of document\.querySelectorAll\('\[data-ebsf-binding\]'\)\)/);
  assert.match(source, /root\.dataset\.ebsfBinding === key/);
  assert.match(source, /querySelectorAll\?\.\('\.ebsf-search-split'\)/);
  assert.match(source, /favToggleClass0157\(split, 'ebs-active', active\)/);
  assert.match(source, /\[data-ebsf-binding\^="category:"\]/);
  assert.match(source, /\[data-ebsf-all-categories\]/);
});
