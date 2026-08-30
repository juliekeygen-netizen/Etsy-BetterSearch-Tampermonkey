import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

async function sources() {
  const [runtime, settings, revamp, styles] = await Promise.all([
    readFile(resolve(ROOT, 'src/78-favorites-filter-layout-runtime.js'), 'utf8'),
    readFile(resolve(ROOT, 'src/82-favorites-layout-settings.js'), 'utf8'),
    readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8'),
    readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8'),
  ]);
  return { runtime, settings, revamp, styles };
}

test('v2 rail dispatches availability only to the v2 facet owner', async () => {
  const { runtime } = await sources();
  const start = runtime.indexOf('function favRefreshFilterAvailability0110');
  const end = runtime.indexOf('/* Replace the destructive', start);
  assert.ok(start >= 0 && end > start);

  let legacyCalls = 0;
  let v2Calls = 0;
  const context = vm.createContext({
    favState: { rail: null },
    favApplyFilterLayoutAndAvailability0110: (rail) => { legacyCalls += 1; return rail; },
    favScheduleFacetAvailability0121: () => { v2Calls += 1; },
  });
  vm.runInContext(`${runtime.slice(start, end)}\nglobalThis.testApi={refresh:favRefreshFilterAvailability0110};`, context);

  const v2Rail = {
    classList: { contains: (value) => value === 'ebsf-rail-v2' },
    dataset: {},
  };
  assert.equal(context.testApi.refresh(v2Rail), v2Rail);
  assert.equal(v2Calls, 1);
  assert.equal(legacyCalls, 0);

  const legacyRail = {
    classList: { contains: () => false },
    dataset: {},
  };
  assert.equal(context.testApi.refresh(legacyRail), legacyRail);
  assert.equal(v2Calls, 1);
  assert.equal(legacyCalls, 1);
});

test('settings and legacy reapply wrappers use the final availability dispatcher', async () => {
  const { runtime, settings } = await sources();
  const changeBlock = settings.slice(
    settings.indexOf("availability.querySelector('select').addEventListener('change'"),
    settings.indexOf("layoutRow.querySelector('[data-ebsf-open-layout-editor]"),
  );
  assert.match(changeBlock, /favRefreshFilterAvailability0110\(favState\.rail\)/);
  assert.doesNotMatch(changeBlock, /favApplyFilterLayoutAndAvailability0110/);

  const reapplyBlock = runtime.slice(runtime.indexOf('favReapply = async function favReapply0110'));
  assert.match(reapplyBlock, /favRefreshFilterAvailability0110\(favState\.rail\)/);
  assert.doesNotMatch(reapplyBlock, /requestAnimationFrame\(\(\) => favApplyFilterLayoutAndAvailability0110/);
});

test('v2 hidden option state cannot be overridden by its display grid rule', async () => {
  const { revamp, styles } = await sources();
  assert.match(revamp, /root\.hidden=found\.option\.hidden\|\|!favBindingAvailable0120/);
  assert.match(revamp, /option\.hidden=!favBindingAvailable0120\(instance\.bindingKey\)/);
  assert.match(styles, /\.ebsf-v2-option\{display:grid;gap:6px\}\.ebsf-v2-option\[hidden\]\{display:none!important\}/);
});

test('v2 category availability requires positive evidence but keeps an active category controllable', async () => {
  const { revamp } = await sources();
  const start = revamp.indexOf('function favBindingAvailable0120');
  const end = revamp.indexOf('function favReplaceSelectChoices0120', start);
  assert.ok(start >= 0 && end > start);

  let active = '';
  const records = [
    { deepMetadata: { category: ['Accessories', 'Jewelry'] } },
    { deepMetadata: { category: ['Art & Collectibles'] } },
  ];
  const context = vm.createContext({
    Set,
    WeakMap,
    favState: {},
    favAvailabilityMode0110: () => 'filtered',
    favBindingActive0120: (key) => key === active,
    favRecordsForBinding0120: () => records,
    favCategoryMatch: (categories, selected) => (categories || []).some((value) => String(value).toLowerCase().includes(String(selected).toLowerCase())),
    favCatalogueCapabilities0101: () => ({}),
    favCurrentCountry0120: () => '',
    FAV_EUROPE_COUNTRY_CODES0101: new Set(),
    FAV_EU_COUNTRY_CODES0120: new Set(),
    favDeepVisibilityReady0110: () => false,
  });
  vm.runInContext(`${revamp.slice(start, end)}\nglobalThis.testApi={available:favBindingAvailable0120,setActive:(value)=>{active=value}};`, context);

  assert.equal(context.testApi.available('category:jewelry'), true);
  assert.equal(context.testApi.available('category:clothing'), false);
  context.testApi.setActive('category:clothing');
  assert.equal(context.testApi.available('category:clothing'), true);
});

test('availability refresh mutates option visibility in place instead of rebuilding the rail', async () => {
  const { revamp } = await sources();
  const block = revamp.slice(
    revamp.indexOf('function favRefreshFacetAvailability0120'),
    revamp.indexOf('function favScheduleFacetAvailability0121'),
  );
  assert.match(block, /querySelectorAll\('\[data-ebsf-option-instance\]'\)/);
  assert.match(block, /root\.hidden=/);
  assert.doesNotMatch(block, /replaceChildren|replaceWith|favRefreshRail|\.remove\(\)/);
});
