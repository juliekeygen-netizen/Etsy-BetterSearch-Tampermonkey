import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const source = await readFile(resolve(ROOT, 'src/103-favorites-v0157-diagnostics-fixes.js'), 'utf8');
const stableOwner = await readFile(resolve(ROOT, 'src/102-favorites-v0155-stable-ownership-final.js'), 'utf8');
const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');

function loadPureHelpers() {
  const end = source.indexOf('/* Ships-from options require');
  const context = vm.createContext({
    Set, Math, Number, String,
    FAV_SETTINGS_WIDTH0135:40,
    FAV_TOOLBAR_GAP_TOTAL0135:12,
    FAV_EXACT_SEARCH_RATIO0135:0.5,
    FAV_EXACT_TOOLBAR_MAX_RATIO0135:0.74,
    FAV_EUROPE_COUNTRY_CODES0101:new Set(['FI','NO','GB']),
    FAV_EU_COUNTRY_CODES0120:new Set(['FI']),
  });
  vm.runInContext(`${source.slice(0, end)}\nglobalThis.testApi={
    shipping:favShippingCodesAvailable0157,
    toolbar:favToolbarPlan0157,
  };`, context);
  return context.testApi;
}

test('v0.15.7 final diagnostics module is loaded after stable ownership', () => {
  const stable = userscript.indexOf('/src/102-favorites-v0155-stable-ownership-final.js');
  const diagnostics = userscript.indexOf('/src/103-favorites-v0157-diagnostics-fixes.js');
  assert.ok(stable >= 0 && diagnostics > stable);
});

test('Ships-from availability requires positive origin evidence instead of treating unknown as every country', () => {
  const { shipping } = loadPureHelpers();
  assert.equal(shipping('ships-origin:FI', new Set(), 'FI'), false);
  assert.equal(shipping('ships-europe', new Set(), 'FI'), false);
  assert.equal(shipping('ships-eu', new Set(), 'FI'), false);
  assert.equal(shipping('ships-local', new Set(), 'FI'), false);

  const known = new Set(['FI']);
  assert.equal(shipping('ships-origin:FI', known, 'FI'), true);
  assert.equal(shipping('ships-europe', known, 'FI'), true);
  assert.equal(shipping('ships-eu', known, 'FI'), true);
  assert.equal(shipping('ships-local', known, 'FI'), true);
  assert.equal(shipping('ships-origin:SE', known, 'FI'), false);
});

test('active Ships-from values remain controllable while inactive values use the positive-evidence helper', () => {
  assert.match(source, /favBindingActive0120\(bindingKey\)\) return true/);
  assert.match(source, /return favShippingCodesAvailable0157\(bindingKey, caps\.shipsFromCodes/);
  assert.doesNotMatch(source, /!caps\.shipsFromCodes\?\.size\s*\|\|/);
});

test('diagnostic-like 994px header shrinks the toolbar to the actual side-by-side space without overlap', () => {
  const { toolbar } = loadPureHelpers();
  const plan = toolbar({ viewportWidth:994, headerWidth:702, leftWidth:250, sortWidth:190 });
  assert.equal(plan.stacked, false);
  assert.ok(plan.searchWidth >= 160);
  assert.ok(plan.toolbarWidth <= plan.available);
  assert.ok(250 + 16 + plan.toolbarWidth <= 702 + 0.001);
});

test('desktop header stacks early when the title/edit controls leave less than a useful Search width', () => {
  const { toolbar } = loadPureHelpers();
  const plan = toolbar({ viewportWidth:994, headerWidth:702, leftWidth:330, sortWidth:190 });
  assert.equal(plan.stacked, true);
});

test('885px resize path deliberately releases desktop width ownership for the responsive full-remainder track', () => {
  const { toolbar } = loadPureHelpers();
  assert.equal(toolbar({ viewportWidth:885, headerWidth:660, leftWidth:230, sortWidth:180 }).stacked, true);
  assert.match(source, /@media \(min-width:761px\) and \(max-width:899px\)[\s\S]*minmax\(0,1fr\)!important/);
  assert.match(source, /innerWidth < 900[\s\S]*removeProperty\('--ebsf-shared-search-width0134'\)/);
});

test('zero-result Etsy recommendations accept both live identities, are offset in place, and are never reparented', () => {
  assert.match(source, /querySelector\('#favorites_similar_listings,\[data-favorites-similar-listings\]'\)/);
  assert.match(source, /targetRect\.left - moduleRect\.left/);
  assert.match(source, /padding-left/);
  assert.match(source, /box-sizing/);
  assert.doesNotMatch(source, /favorites_similar_listings[\s\S]{0,500}(appendChild|replaceChildren|insertBefore)\(/);
});

test('recommendation lifecycle reuses the final shell observer instead of installing a second body-wide observer', () => {
  assert.match(stableOwner, /#favorites_similar_listings,\[data-favorites-similar-listings\]/);
  assert.match(stableOwner, /favScheduleShellRepair0123\(\)/);
  assert.match(stableOwner, /observe\(document\.body, \{ childList:true, subtree:true \}\)/);
  assert.doesNotMatch(source, /new MutationObserver/);
  assert.doesNotMatch(source, /observe\(document\.body/);
});

test('toolbar alignment compensates for its current transform mathematically instead of clearing it on the normal measurement path', () => {
  const body = source.slice(source.indexOf('function favAlignToolbarX0157'), source.indexOf('/* Final toolbar owner'));
  assert.match(body, /const currentShift = favOwnedToolbarTranslate0157\(right\)/);
  assert.match(body, /const baseRight = rightRect\.right - currentShift/);
  const normalMeasurement = body.slice(
    body.indexOf('const target = favCollectionToolbarTarget0136(header)'),
    body.indexOf('const currentShift = favOwnedToolbarTranslate0157(right)'),
  );
  assert.doesNotMatch(normalMeasurement, /favClearCollectionToolbarX0136\(right\)/);
});
