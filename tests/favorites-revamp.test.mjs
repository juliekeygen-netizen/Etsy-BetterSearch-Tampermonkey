import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

async function loadLayout(saved = {}, storedLayout = null) {
  const source = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const end = source.indexOf('function favSaveFilterLayout0120');
  const selected = source.slice(0, end);
  const context = vm.createContext({
    console, Set, Map, Array, String, Number, Date, Math,
    FAV_NATIVE_CATEGORIES_: [['jewelry','Jewelry'], ['clothing','Clothing']],
    favNormalizeUiPrefs: (value) => structuredClone(value || {}),
    favUiPrefs: {},
    FAV_UI_PREFS_STORAGE_KEY: 'prefs',
    GM_getValue: (key, fallback) => structuredClone(key === 'etsy-bettersearch.favorites.filter-layout.v2' ? (storedLayout ?? fallback) : saved),
    favSaveUiPrefs: () => {},
  });
  vm.runInContext(`${selected}\nglobalThis.testApi={favDefaultFilterLayout0120,favNormalizeFilterLayout0120,getPrefs:()=>favUiPrefs};`, context);
  return context.testApi;
}

async function loadGeneratedRouting(href, enabled = true) {
  const source = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const start = source.indexOf('function favAllItemsUrl0122');
  const end = source.indexOf("document.addEventListener('click'", start);
  const calls = [];
  const location = {
    href,
    origin: new URL(href).origin,
    replace: (value) => calls.push(value),
  };
  const context = vm.createContext({ URL, location, calls, encodeURIComponent, favProfileLogin: () => 'test-user', favUiPrefs: { redirectGeneratedGroups: enabled } });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.testApi={favAllItemsUrl0122,favIsGeneratedGroupUrl0122,favMaybeRedirectGeneratedGroup0122,calls:globalThis.calls};`, context);
  return context.testApi;
}

test('filter layout v2 has the exact default drawer and Item qualities order', async () => {
  const api = await loadLayout();
  const layout = api.favDefaultFilterLayout0120();
  assert.deepEqual(Array.from(layout, (drawer) => drawer.label), [
    'Search', 'Category', 'Ships from', 'Price', 'Item qualities', 'Item type', 'Seller',
    'Popularity & stock', 'Rating & reviews', 'Delivery',
  ]);
  assert.deepEqual(Array.from(layout, (drawer) => drawer.hidden), [false,false,false,false,false,false,false,true,true,true]);
  const qualities = layout.find((drawer) => drawer.definitionKey === 'item-qualities');
  assert.deepEqual(Array.from(qualities.optionInstances, (option) => option.label), [
    "Etsy's Picks", 'Star Seller', 'Available only', 'On sale', 'Free shipping',
    'Customizable', 'Has variations', 'Can be gift wrapped',
    'Exclude digital downloads', 'Digital downloads only',
  ]);
  assert.deepEqual(Array.from(qualities.optionInstances, (option) => option.hidden), [true,false,false,false,false,true,true,true,false,false]);
  assert.equal(new Set(layout.flatMap((drawer) => drawer.optionInstances.map((option) => option.instanceId))).size,
    layout.flatMap((drawer) => drawer.optionInstances).length);
});

test('v1 filter-layout preferences reset once to schema v2 while unrelated preferences survive', async () => {
  const api = await loadLayout({
    filterLayoutSchemaVersion: 1,
    filterSectionOrder: ['delivery','search'],
    filterLayout: [{ instanceId:'legacy' }],
    sortMenuOrder: ['price','etsy'],
    filterAvailabilityMode: 'filtered',
  });
  const prefs = api.getPrefs();
  assert.equal(prefs.filterLayoutSchemaVersion, 2);
  assert.equal(prefs.filterLayout[0].definitionKey, 'search');
  assert.deepEqual(Array.from(prefs.sortMenuOrder), ['price','etsy']);
  assert.equal(prefs.filterAvailabilityMode, 'filtered');
});

test('dedicated v2 layout storage wins on reload and preserves editor changes', async () => {
  const defaults = (await loadLayout()).favDefaultFilterLayout0120();
  defaults[0].label = 'My search tools';
  defaults[0].hidden = true;
  defaults[1].optionInstances.reverse();
  const api = await loadLayout({ filterLayoutSchemaVersion: 2 }, defaults);
  const saved = api.getPrefs().filterLayout;
  assert.equal(saved[0].label, 'My search tools');
  assert.equal(saved[0].hidden, true);
  assert.deepEqual(Array.from(saved[1].optionInstances, (option) => option.bindingKey), ['category:clothing','category:jewelry']);
});

test('page shell replaces the native desktop sidebar and renders only real collections', async () => {
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const styles = await readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8');
  assert.match(shell, /source\.hidden=true;source\.inert=true/);
  assert.match(shell, /entry\?\.__type==='collection'/);
  assert.match(shell, /<span>All<\/span>/);
  assert.match(shell, /nativeCreate\?\.click\(\)/);
  assert.match(shell, /setPointerCapture/);
  assert.match(shell, /scrollLeft\+=event\.deltaY/);
  assert.match(shell, /event\.key==='Home'/);
  assert.match(shell, /favRefreshCollectionModel0120/);
  assert.match(filter, /function favBuildShopsLink0120/);
  assert.match(shell, /expanded-updates-module-header/);
  assert.match(styles, /@media\(min-width:900px\).*display:none!important/);
  assert.match(styles, /@media\(max-width:899px\)/);
});

test('only native Etsy pagination remains and local results no longer create a pager', async () => {
  const runtime = await readFile(resolve(ROOT, 'src/63-favorites-runtime.js'), 'utf8');
  const baseStyles = await readFile(resolve(ROOT, 'src/65-favorites-style.js'), 'utf8');
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  const styles = await readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8');
  assert.doesNotMatch(`${runtime}\n${baseStyles}\n${shell}\n${styles}`, /ebsf-pagination|ebsf-page-active|data-ebsf-pagination/);
  assert.match(shell, /favRenderPagination=function favRenderPagination0122\(\)\{favRestorePagination0122\(\);\}/);
  assert.match(shell, /favState\.pageSize=Math\.max\(1,favState\.records\.length\)/);
  assert.doesNotMatch(shell, /data-clg-id="WtPagination"|wt-action-group__item-container/);
  assert.doesNotMatch(styles, /native-pagination[^}]*margin-(?:left|right)/);
  assert.equal((shell.match(/scrollIntoView/g) || []).length, 0);
});

test('local filters reuse the hydrated catalogue and async loads show one stale-safe placeholder', async () => {
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  assert.match(filter, /favState\.loadComplete&&favState\.loadKey===favDatasetKey\(\)/);
  assert.match(filter, /favScheduleLocalRender0121\(\)/);
  assert.doesNotMatch(filter, /favReapply\(true\)/);
  assert.match(shell, /dataset\.ebsfResultsLoading/);
  assert.match(shell, /requestKey!==favDatasetKey\(\)/);
  const loadWrapper = shell.slice(shell.indexOf('favLoadAll=function favLoadAll0120'));
  assert.ok(loadWrapper.indexOf('favLoadAllBefore0120(force)') < loadWrapper.indexOf('favShowResultsLoading0120()'), 'native cards are captured before replacement');
});

test('removed controls are absent from normalized configuration and the v2 registry', async () => {
  const state = await readFile(resolve(ROOT, 'src/60-favorites-state.js'), 'utf8');
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const normalizedBlock = state.slice(state.indexOf('function favDefaultConfig'), state.indexOf('var favCfg'));
  const registryBlock = filter.slice(0, filter.indexOf('function favLayoutId0120'));
  assert.doesNotMatch(`${normalizedBlock}\n${registryBlock}`, /ready1Day|ready3Days|shipTo|minDiscount|bestSeller|gift.?cards/i);
  assert.match(registryBlock, /ships-eu/);
  assert.match(filter, /countryIsoCode\s*\|\|\s*''/);
  assert.match(filter, /FAV_COUNTRY_CODES_\.includes\(code\)\?code:''/);
  assert.doesNotMatch(filter, /countryIsoCode\s*\|\|\s*'FI'/);
});

test('layout v2 supports shared duplicates, cross-drawer moves, safe deletion, and both resets', async () => {
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  assert.match(filter, /instanceId:favLayoutId0120\('option'\), bindingKey/);
  assert.match(filter, /optionInstances\.splice\(index\+1,0/);
  assert.match(filter, /favSyncBindingControls0120/);
  assert.match(filter, /found\.drawer\.optionInstances=found\.drawer\.optionInstances\.filter/);
  assert.match(filter, /targetDrawer\.optionInstances\.splice/);
  assert.match(filter, /favVisibleBindingCount0120\(bindingKey\)===0\)favClearBinding0120/);
  assert.match(filter, /function favResetDrawers0120/);
  assert.match(filter, /function favResetOptions0120/);
  assert.match(filter, /favOpenLayoutContext0120\(event,option\?'option':'drawer'/);
});

test('persistent controls retain live config references and price changes stay local', async () => {
  const state = await readFile(resolve(ROOT, 'src/60-favorites-state.js'), 'utf8');
  const price = await readFile(resolve(ROOT, 'src/62b-favorites-filter-ui.js'), 'utf8');
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const save = state.slice(state.indexOf('function favSaveConfig'), state.indexOf('function isFavoritesPage'));
  assert.match(save, /const liveFilters/);
  assert.match(save, /Object\.assign\(liveFilters, normalized\.filters\)/);
  assert.doesNotMatch(save, /favCfg\s*=\s*favNormalizeConfig/);
  assert.match(price, /requestAnimationFrame\(\(\)=>favSaveAndApply\(true\)\)/);
  assert.match(filter, /favState\.loadComplete&&favState\.loadKey===favDatasetKey\(\)/);
});

test('shell recaptures late native sidebar nodes and leaves pagination to Etsy', async () => {
  const runtime = await readFile(resolve(ROOT, 'src/63-favorites-runtime.js'), 'utf8');
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  const styles = await readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8');
  const capture = shell.slice(shell.indexOf('function favCaptureNativeSource0120'), shell.indexOf('function favNativeItemsLink0120'));
  assert.match(capture, /sidebar\.querySelector\(':scope > \.ebsf-native-favorites-source'\)/);
  assert.match(capture, /source\.append\(\.\.\.children\)/);
  assert.doesNotMatch(capture, /isConnected\)return/);
  assert.match(styles, /ebsf-sidebar-permanent>:not\(\.ebsf-native-favorites-source\):not\(\[data-ebsf-rail\]\)\{display:none!important\}/);
  assert.match(shell, /BetterSearch no longer creates, rewrites, moves, or duplicates pagination/);
  assert.doesNotMatch(shell, /section\.append\(nav\)/);
  assert.match(styles, /\.ebsf-empty\{grid-column:1\/-1!important/);
  assert.doesNotMatch(runtime, /\nfavStartRuntime\(\);/);
  assert.match(shell, /runtimeStarted0120.*favStartRuntime\(\)/);
});

test('desktop search and scan progress share one bounded right-aligned slot', async () => {
  const styles = await readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8');
  assert.match(styles, /grid-template-columns:minmax\(180px,1fr\) minmax\(0,auto\)/);
  assert.match(styles, /justify-self:end/);
  assert.match(styles, /width:clamp\(180px,26vw,380px\)!important/);
  assert.match(styles, /@media\(min-width:900px\) and \(max-width:1200px\)/);
  assert.match(styles, /grid-column:1;width:min\(100%,640px\);justify-self:end/);
  assert.match(styles, /\.ebsf-sync-progress\{inset:0!important;width:100%!important;max-width:100%!important/);
});

test('shell reasserts collection strip then header order after every Etsy rerender', async () => {
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  assert.match(shell, /content\.firstElementChild!==next\)content\.prepend\(next\)/);
  assert.match(shell, /if\(strip\)strip\.after\(header\);else content\.prepend\(header\)/);
  assert.match(shell, /listing&&parent\.contains\(listing\)/);
  assert.ok(shell.indexOf('favInstallCollectionStrip0120(content)') < shell.indexOf('favEnsureAllHeader0120(content)'));
});

test('one v2 editor owns filter and sort tabs with confirmations and drag feedback', async () => {
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  const styles = await readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8');
  const editor = filter.slice(filter.indexOf('favOpenLayoutEditor0110=function favOpenLayoutEditor0120'));
  assert.match(editor, />Filter sidebar<\/button>/);
  assert.match(editor, />Sort menu<\/button>/);
  assert.doesNotMatch(editor, /favOpenLayoutEditorBefore0120/);
  assert.doesNotMatch(editor, /data-sort>Sort menu/);
  assert.match(filter, /\['editor','Open editor'\]/);
  assert.match(filter, /\['hide',type==='sort'\?'Hide'/);
  assert.match(filter, /function favConfirmLayoutAction0120/);
  assert.match(editor, /title:'Reset drawers\?'/);
  assert.match(editor, /title:'Reset options\?'/);
  assert.match(editor, /layoutExpandedDrawers0120=new Set\(\)/);
  assert.match(styles, /is-drop-before/);
  assert.match(styles, /is-drop-after/);
  assert.match(styles, /ebsf-layout-ghost/);
  assert.match(editor, /scrollBody\.scrollTop\+=autoScrollDirection\*14/);
  assert.match(editor, /updateAutoScroll\(event\.clientY\)/);
});

test('country and seller choices use current facet records and custom country bindings survive layout normalization', async () => {
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  assert.match(filter, /\^ships-origin:\[A-Z\]\{2\}\$/);
  assert.match(filter, /favLayoutOption0120\(`ships-origin:\$\{code\}`/);
  assert.match(filter, /favRecordsForBinding0120\(key\)\.map\(\(record\)=>record\.shopName\)/);
  assert.match(filter, /availabilityMode==='filtered'\|\|allowed\.size/);
  assert.match(filter, /favFilterCountryOptions0101\(options,allowed,selected\)/);
  assert.match(filter, /favScheduleFacetAvailability0121/);
});

test('rapid local changes coalesce rendering and stale route completions cannot rebuild an old scope', async () => {
  const runtime = await readFile(resolve(ROOT, 'src/63-favorites-runtime.js'), 'utf8');
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  const audit = await readFile(resolve(ROOT, 'src/71-favorites-phase5-audit-fixes.js'), 'utf8');
  assert.match(shell, /function favScheduleLocalRender0121/);
  assert.match(shell, /localRenderPromise0121/);
  assert.match(shell, /requestKey!==favDatasetKey\(\)/);
  assert.match(runtime, /requestKey!==favDatasetKey\(\)/);
  assert.match(audit, /records!==favState\.records/);
  assert.match(runtime, /runtimeObserverBound0121/);
});

test('route teardown preserves the toolbar and restores captured native navigation', async () => {
  const shell = await readFile(resolve(ROOT, 'src/86-favorites-page-shell.js'), 'utf8');
  assert.match(shell, /function favReleaseAllHeader0121/);
  assert.ok(shell.indexOf('origin.parent.insertBefore(toolbar') < shell.indexOf('header.remove()'));
  assert.match(shell, /function favTeardownPageShell0121/);
  assert.match(shell, /for\(const child of Array\.from\(source\.childNodes\)\)sidebar\.insertBefore\(child,source\)/);
  assert.match(shell, /favDesktopShell0120\(\)&&isFavoritesPage\(\)/);
});

test('category and country controls synchronize immediately while expensive availability waits for idle time', async () => {
  const filter = await readFile(resolve(ROOT, 'src/85-favorites-filter-revamp.js'), 'utf8');
  assert.match(filter, /dataset\.ebsfAllCategories/);
  assert.match(filter, /button\.classList\.toggle\('is-selected',active\)/);
  assert.match(filter, /function favSyncShippingControls0121/);
  assert.match(filter, /focusCountry:value==='country'/);
  assert.match(filter, /requestIdleCallback\(run,\{timeout:250\}\)/);
  const categoryAvailability = filter.slice(filter.indexOf("if(bindingKey.startsWith('category:')){"), filter.indexOf("if(bindingKey==='ships-anywhere'"));
  assert.match(categoryAvailability, /records\.some\(\(record\)=>favCategoryMatch/);
  assert.doesNotMatch(categoryAvailability, /deepUnknown|return true/);
});

test('generated collectionId routes redirect to All by default and honor the preference', async () => {
  for (const href of [
    'https://www.etsy.com/fi-en/people/test-user?collectionId=164&ref=phase3_fl_auto',
    'https://www.etsy.com/people/test-user?collectionId=465&ref=phase3_fl_auto',
  ]) {
    const api = await loadGeneratedRouting(href);
    assert.equal(api.favIsGeneratedGroupUrl0122(), true);
    assert.equal(api.favMaybeRedirectGeneratedGroup0122(), true);
    assert.deepEqual(Array.from(api.calls), ['https://www.etsy.com/people/test-user?ref=hdr-fav&tab=items']);
  }
  const normal = await loadGeneratedRouting('https://www.etsy.com/people/test-user?ref=hdr-fav&tab=items');
  assert.equal(normal.favIsGeneratedGroupUrl0122(), false);
  assert.equal(normal.favMaybeRedirectGeneratedGroup0122(), false);
  const disabled = await loadGeneratedRouting('https://www.etsy.com/fi-en/people/test-user?collectionId=67&ref=phase3_fl_auto', false);
  assert.equal(disabled.favMaybeRedirectGeneratedGroup0122(), false);
  assert.deepEqual(Array.from(disabled.calls), []);
});

test('fresh installs default availability to current filtered items and overlays stay above the sort portal', async () => {
  const layout = await readFile(resolve(ROOT, 'src/76-favorites-layout-state.js'), 'utf8');
  const styles = await readFile(resolve(ROOT, 'src/87-favorites-revamp-style.js'), 'utf8');
  assert.match(layout, /GM_getValue\(FAV_UI_PREFS_STORAGE_KEY, \{\}\)/);
  assert.match(layout, /: 'filtered'/);
  assert.match(styles, /\.ebsf-layout-context\{z-index:2147483647!important\}/);
  assert.match(styles, /\.ebsf-confirm-layer,\.ebsf-country-option-layer,\.ebsf-rename-layer\{z-index:2147483647!important\}/);
});
