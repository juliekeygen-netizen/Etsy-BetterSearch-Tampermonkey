import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const parity = await readFile(new URL('../src/96-favorites-exact-header-parity.js', import.meta.url), 'utf8');
const allNative = await readFile(new URL('../src/97-favorites-all-native-header.js', import.meta.url), 'utf8');
const exactSearch = await readFile(new URL('../src/98-favorites-exact-search-width.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8').catch(() => '');

test('exact Search parity layer stays after native boundary/page-state modules', () => {
  if (!userscript) return;
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const paginationIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  const adapterIndex = userscript.indexOf('/src/95a-favorites-native-page-state.js');
  const parityIndex = userscript.indexOf('/src/96-favorites-exact-header-parity.js');
  const allNativeIndex = userscript.indexOf('/src/97-favorites-all-native-header.js');
  const exactSearchIndex = userscript.indexOf('/src/98-favorites-exact-search-width.js');
  assert.ok(boundary >= 0 && paginationIndex > boundary && adapterIndex > paginationIndex && parityIndex > adapterIndex && allNativeIndex > parityIndex && exactSearchIndex > allNativeIndex);
});

test('module 95 is page-identity compatibility only and cannot bypass the renderer chain', () => {
  assert.match(pagination, /function favPageRouteKey0129/);
  assert.match(pagination, /function favRequestedPage0129/);
  assert.match(pagination, /function favSyncLocalPageFromRoute0129/);
  assert.match(pagination, /searchParams\.get\('page'\)/);
  assert.doesNotMatch(pagination, /FAV_LOCAL_PAGE_SIZE0129/);
  assert.doesNotMatch(pagination, /favRenderCurrent\s*=/);
  assert.doesNotMatch(pagination, /favRenderPagination\s*=/);
  assert.doesNotMatch(pagination, /favRenderCurrentBefore0122/);
});

test('native pager remains structurally owned by Etsy', () => {
  assert.doesNotMatch(pagination, /createElement\(['"]nav['"]\)|replaceChildren\(|\.after\(nav\)|append\(nav\)/);
  assert.doesNotMatch(pagination, /classList\.toggle\('ebsf-local-single-page0129'/);
  assert.match(pagination, /classList\.remove\('ebsf-local-single-page0129'\)/);
});

test('every historical All metadata callback is rebound to one invariant full writer', () => {
  assert.match(parity, /favApplyScopeMetaDensity0125 = favApplyScopeMetaDensity0131/);
  assert.match(parity, /favApplyScopeMetaDensity0126 = favApplyScopeMetaDensity0131/);
  assert.match(parity, /classList\.remove\('ebsf-scope-meta-compact'\)/);
  assert.match(parity, /Private collection/);
  assert.match(parity, /\$\{total\} favorites · \$\{shown\} shown/);
});

test('module 97 builds All from literal native collection header structure', () => {
  assert.match(allNative, /header\.id = 'collections-landing-phase-3-header-container'/);
  assert.match(allNative, /left\.id = 'collections-landing-left-side-header-container'/);
  assert.match(allNative, /title\.id = 'collections-landing-left-side-header-title'/);
  assert.match(allNative, /right\.id = 'collections-landing-right-side-header-container'/);
  assert.doesNotMatch(allNative, /header\.className = [^\n]*ebsf-scope-header/);
});

test('All title row keeps native edit/add geometry without exposing controls', () => {
  assert.match(allNative, /favAllTitleSpacerButton0133\('edit'\)/);
  assert.match(allNative, /favAllTitleSpacerButton0133\('add'\)/);
  assert.match(allNative, /titleContainer\.append\(title, editSpacerWrapper, addSpacer\)/);
  assert.match(allNative, /visibility:hidden!important/);
  assert.match(allNative, /pointer-events:none!important/);
});

test('All toolbar uses the native listing host and right-side toolbar host', () => {
  assert.match(allNative, /controls\.dataset\.ebsfAllControls = ''/);
  assert.match(allNative, /controls\.append\(toolbar\)/);
  assert.match(allNative, /const listingHost = content\.querySelector\('\.phase3-listing-cards-section'\) \|\| content/);
  assert.match(allNative, /listingHost\.prepend\(header\)/);
});

test('Sort width remains one shared final measurement', () => {
  assert.match(allNative, /favSortTriggerWidth = function favSortTriggerWidth0134/);
  assert.match(allNative, /--ebsf-shared-sort-width0134/);
  assert.match(exactSearch, /favMeasureSortTrigger\?\.\(root\)/);
  assert.match(exactSearch, /--ebsf-shared-sort-width0134/);
});

test('Search width is deterministic from complete header width', () => {
  assert.match(exactSearch, /FAV_EXACT_SEARCH_RATIO0135 = 0\.5/);
  assert.match(exactSearch, /FAV_EXACT_TOOLBAR_MAX_RATIO0135 = 0\.74/);
  assert.match(exactSearch, /const headerWidth = header\.getBoundingClientRect\(\)\.width/);
  assert.match(exactSearch, /desiredSearch = headerWidth \* FAV_EXACT_SEARCH_RATIO0135/);
  assert.match(exactSearch, /toolbarCap = headerWidth \* FAV_EXACT_TOOLBAR_MAX_RATIO0135/);
  assert.doesNotMatch(exactSearch, /rowWidth/);
});

test('desktop All and collection toolbars anchor to the same live listing-column right edge', () => {
  const block = exactSearch.slice(
    exactSearch.indexOf('function favAlignCollectionToolbarX0136'),
    exactSearch.indexOf('function favScheduleExactToolbar0136')
  );
  assert.match(block, /if \(innerWidth < 900\)/);
  assert.doesNotMatch(block, /header\.matches\?\.\('\[data-ebsf-all-header\]'\)/);
  assert.match(block, /const delta = targetRect\.right - rightRect\.right/);
  assert.match(block, /translateX\(\$\{rounded\}px\)/);
});

test('narrow layouts release desktop width/X overrides', () => {
  assert.match(exactSearch, /favClearExactDesktopToolbarWidth0135\(right\)/);
  assert.match(exactSearch, /favClearCollectionToolbarX0136\(right\)/);
  assert.match(exactSearch, /if \(innerWidth > 760\)/);
  assert.match(exactSearch, /row\.style\.removeProperty\('--ebsf-shared-search-width0134'\)/);
});

test('Search keeps a single neutral 1px stroke', () => {
  assert.match(exactSearch, /border-color:#222!important/);
  assert.match(exactSearch, /border-width:1px!important/);
  assert.match(exactSearch, /outline:0!important/);
  assert.match(exactSearch, /box-shadow:none!important/);
});

test('typing in native Favorites Search reanchors toolbar after Etsy updates it', () => {
  assert.match(exactSearch, /function favScheduleExactToolbar0136\(\)/);
  assert.match(exactSearch, /for \(const eventName of \['input','search','change'\]\)/);
  assert.match(exactSearch, /event\.target\?\.closest\?\.\('\.ebsf-native-search-slot'\)/);
});

test('loading progress stays on metadata baseline instead of creating a row', () => {
  assert.match(allNative, /favProgress = function favProgress0134/);
  assert.match(allNative, /node\.dataset\.ebsfProgressInline = ''/);
  assert.match(allNative, /position:absolute!important/);
  const finalProgress = allNative.slice(allNative.indexOf('favProgress = function favProgress0134'));
  assert.doesNotMatch(finalProgress, /section\.prepend\(node\)/);
});

test('soft-route shell repair reapplies exact Search geometry', () => {
  assert.match(exactSearch, /favInstallPageShell0120 = function favInstallPageShell0135/);
  assert.match(exactSearch, /favScheduleExactToolbar0136\(\)/);
  assert.match(exactSearch, /favSyncNarrowSortWidth0128 = function favSyncNarrowSortWidth0135/);
});

test('responsive states retain permanent-rail and phone toolbar behavior', () => {
  assert.match(parity, /@media\(max-width:899px\)/);
  assert.match(allNative, /@media\(min-width:761px\)/);
  assert.match(allNative, /@media\(max-width:760px\)/);
  assert.match(allNative, /@media\(max-width:520px\)/);
});
