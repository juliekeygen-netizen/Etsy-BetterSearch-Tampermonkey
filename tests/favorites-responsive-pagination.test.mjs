import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const parity = await readFile(new URL('../src/96-favorites-exact-header-parity.js', import.meta.url), 'utf8');
const allNative = await readFile(new URL('../src/97-favorites-all-native-header.js', import.meta.url), 'utf8');
const exactSearch = await readFile(new URL('../src/98-favorites-exact-search-width.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('v0.12.15 loads the exact Search parity layer after the native header stack', () => {
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const paginationIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  const parityIndex = userscript.indexOf('/src/96-favorites-exact-header-parity.js');
  const allNativeIndex = userscript.indexOf('/src/97-favorites-all-native-header.js');
  const exactSearchIndex = userscript.indexOf('/src/98-favorites-exact-search-width.js');
  assert.ok(boundary >= 0 && paginationIndex > boundary && parityIndex > paginationIndex && allNativeIndex > parityIndex && exactSearchIndex > allNativeIndex);
  assert.match(userscript, /@version\s+0\.12\.15/);
});

test('module 95 stays focused on Etsy-style 20-item local paging', () => {
  assert.match(pagination, /FAV_LOCAL_PAGE_SIZE0129 = 20/);
  assert.match(pagination, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0129/);
  assert.match(pagination, /return favRenderCurrentBefore0122\(\)/);
  assert.match(pagination, /searchParams\.get\('page'\)/);
  assert.doesNotMatch(pagination, /favApplyScopeMetaDensity|favRepairToolbarLayout|favMarkFinalRuntimeReady0130/);
  assert.doesNotMatch(pagination, /pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
});

test('native pager remains structurally owned by Etsy', () => {
  assert.match(pagination, /body\.ebsf-local-single-page0129 nav\[aria-label="Favorite Items Page Results"\]/);
  assert.match(pagination, /classList\.toggle\('ebsf-local-single-page0129'/);
  assert.doesNotMatch(pagination, /createElement\(['"]nav['"]\)|replaceChildren\(|\.after\(nav\)|append\(nav\)/);
});

test('every historical All metadata callback is rebound to one invariant full writer', () => {
  assert.match(parity, /favApplyScopeMetaDensity0125 = favApplyScopeMetaDensity0131/);
  assert.match(parity, /favApplyScopeMetaDensity0126 = favApplyScopeMetaDensity0131/);
  assert.match(parity, /classList\.remove\('ebsf-scope-meta-compact'\)/);
  assert.match(parity, /Private collection/);
  assert.match(parity, /\$\{total\} favorites · \$\{shown\} shown/);
  assert.doesNotMatch(parity, /compact \? 'Private'/);
  assert.doesNotMatch(parity, /\$\{total\} · \$\{shown\}/);
});

test('module 97 builds All from the literal native collection header structure', () => {
  assert.match(allNative, /header\.id = 'collections-landing-phase-3-header-container'/);
  assert.match(allNative, /left\.id = 'collections-landing-left-side-header-container'/);
  assert.match(allNative, /leftContent\.id = 'collections-landing-left-side-header-content'/);
  assert.match(allNative, /titleContainer\.id = 'collections-landing-left-side-header-title-container'/);
  assert.match(allNative, /title\.id = 'collections-landing-left-side-header-title'/);
  assert.match(allNative, /title\.className = 'wt-text-title-large'/);
  assert.match(allNative, /right\.id = 'collections-landing-right-side-header-container'/);
  assert.match(allNative, /controls\.className = 'wt-display-flex-md wt-flex-grow-xs-1 wt-align-items-center wt-width-full wt-align-self-flex-end'/);
  assert.doesNotMatch(allNative, /header\.className = [^\n]*ebsf-scope-header/);
  assert.doesNotMatch(allNative, /leftContent\.className = [^\n]*ebsf-scope-copy/);
  assert.doesNotMatch(allNative, /controls\.className = [^\n]*ebsf-scope-controls/);
});

test('All title row keeps native edit/add button geometry without exposing controls', () => {
  const spacer = allNative.slice(
    allNative.indexOf('function favAllTitleSpacerButton0133'),
    allNative.indexOf('function favBuildAllNativeCollectionHeader0133')
  );
  const build = allNative.slice(
    allNative.indexOf('function favBuildAllNativeCollectionHeader0133'),
    allNative.indexOf('function favAllHeaderIsNativeCollectionMirror0133')
  );
  assert.match(build, /titleText\.textContent = 'All'/);
  assert.match(build, /editSpacerWrapper = document\.createElement\('div'\)/);
  assert.match(build, /favAllTitleSpacerButton0133\('edit'\)/);
  assert.match(build, /favAllTitleSpacerButton0133\('add'\)/);
  assert.match(build, /titleContainer\.append\(title, editSpacerWrapper, addSpacer\)/);
  assert.match(spacer, /wt-btn wt-btn--tertiary wt-btn--small wt-btn--icon/);
  assert.match(spacer, /button\.tabIndex = -1/);
  assert.match(spacer, /setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(spacer, /addEventListener/);
  assert.match(allNative, /\[data-ebsf-all-title-spacer\][\s\S]*visibility:hidden!important;[\s\S]*pointer-events:none!important/);
});

test('All mirror integrity requires both native title-control geometry twins', () => {
  assert.match(allNative, /data-ebsf-native-collection-mirror="2"/);
  assert.match(allNative, /spacers\?\.length === 2/);
  assert.match(allNative, /data-ebsf-all-title-spacer-wrapper="edit"/);
  assert.match(allNative, /data-ebsf-all-title-spacer="add"/);
});

test('All toolbar uses the same native listing host and right-side toolbar host as collections', () => {
  assert.match(allNative, /controls\.dataset\.ebsfAllControls = ''/);
  assert.match(allNative, /header\.querySelector\('\[data-ebsf-all-controls\]'\)/);
  assert.match(allNative, /controls\.append\(toolbar\)/);
  assert.match(allNative, /const listingHost = content\.querySelector\('\.phase3-listing-cards-section'\) \|\| content/);
  assert.match(allNative, /listingHost\.prepend\(header\)/);
  assert.doesNotMatch(allNative, /strip\.after\(header\)/);
});

test('All private metadata has one native-style icon and full wording', () => {
  assert.match(parity, /wt-icon--smallest wt-nudge-b-1 etsy-icon ebsf-scope-privacy-icon/);
  assert.match(allNative, /favPrivateIconMarkup0131\(\)/);
  assert.match(allNative, /document\.createTextNode\(' Private collection'\)/);
  assert.match(allNative, /count\.dataset\.ebsfScopeCount = ''/);
});

test('Sort width is one shared final measurement across All and collection routes', () => {
  assert.match(allNative, /favSortTriggerWidth = function favSortTriggerWidth0134/);
  assert.match(allNative, /Math\.max\(\.\.\.labels\.map\(\(label\) => measure\(label\)\), 0\) \+ 24/);
  assert.match(allNative, /--ebsf-shared-sort-width0134/);
  assert.match(exactSearch, /favMeasureSortTrigger\?\.\(root\)/);
  assert.match(exactSearch, /--ebsf-shared-sort-width0134/);
});

test('Search width no longer depends on current title or current toolbar-row width', () => {
  assert.match(exactSearch, /FAV_EXACT_SEARCH_RATIO0135 = 0\.5/);
  assert.match(exactSearch, /FAV_EXACT_TOOLBAR_MAX_RATIO0135 = 0\.74/);
  assert.match(exactSearch, /const headerWidth = header\.getBoundingClientRect\(\)\.width/);
  assert.match(exactSearch, /desiredSearch = headerWidth \* FAV_EXACT_SEARCH_RATIO0135/);
  assert.match(exactSearch, /toolbarCap = headerWidth \* FAV_EXACT_TOOLBAR_MAX_RATIO0135/);
  assert.match(exactSearch, /right\.style\.setProperty\('flex', `0 0 \$\{toolbarCss\}`, 'important'\)/);
  assert.match(exactSearch, /row\.style\.setProperty\('--ebsf-shared-search-width0134', searchCss\)/);
  assert.doesNotMatch(exactSearch, /rowWidth/);
  assert.doesNotMatch(exactSearch, /availableForSearch/);
});

test('desktop right-side toolbar width is deterministic and title-independent', () => {
  assert.match(exactSearch, /if \(innerWidth < 900\)/);
  assert.match(exactSearch, /toolbarWidth = reserved \+ searchWidth/);
  assert.match(exactSearch, /right\.style\.setProperty\('width', toolbarCss, 'important'\)/);
  assert.match(exactSearch, /right\.style\.setProperty\('max-width', toolbarCss, 'important'\)/);
  assert.match(exactSearch, /right\.style\.setProperty\('min-width', toolbarCss, 'important'\)/);
});

test('narrow layouts release only the desktop width override and remain responsive', () => {
  assert.match(exactSearch, /favClearExactDesktopToolbarWidth0135\(right\)/);
  assert.match(exactSearch, /favClearCollectionToolbarX0136\(right\)/);
  assert.match(exactSearch, /if \(innerWidth > 760\)/);
  assert.match(exactSearch, /row\.style\.removeProperty\('--ebsf-shared-search-width0134'\)/);
});

test('Search uses a single 1px neutral stroke without nested outline rings', () => {
  assert.match(exactSearch, /\.ebsf-native-search-slot \.wt-input,/);
  assert.match(exactSearch, /\.ebsf-native-search-slot \.wt-input-btn-group__btn/);
  assert.match(exactSearch, /border-color:#222!important/);
  assert.match(exactSearch, /border-width:1px!important/);
  assert.match(exactSearch, /outline:0!important/);
  assert.match(exactSearch, /box-shadow:none!important/);
  assert.doesNotMatch(exactSearch, /outline-color:#222!important/);
});

test('desktop collection toolbar anchors to the All listing-column right edge instead of a guessed offset', () => {
  assert.match(exactSearch, /function favCollectionToolbarTarget0136\(header\)/);
  assert.match(exactSearch, /\.phase3-listing-cards-section/);
  assert.match(exactSearch, /header\.matches\?\.\('\[data-ebsf-all-header\]'\)/);
  assert.match(exactSearch, /const delta = targetRect\.right - rightRect\.right/);
  assert.match(exactSearch, /right\.style\.setProperty\('transform', `translateX\(\$\{rounded\}px\)`, 'important'\)/);
  assert.match(exactSearch, /favAlignCollectionToolbarX0136\(header, right\)/);
  assert.doesNotMatch(exactSearch, /translateX\(-2px\)/);
});

test('typing in native Favorites Search reanchors collection toolbar after Etsy updates it', () => {
  assert.match(exactSearch, /function favScheduleExactToolbar0136\(\)/);
  assert.match(exactSearch, /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{/);
  assert.match(exactSearch, /for \(const eventName of \['input','search','change'\]\)/);
  assert.match(exactSearch, /event\.target\?\.closest\?\.\('\.ebsf-native-search-slot'\)/);
  assert.match(exactSearch, /favScheduleExactToolbar0136\(\)/);
});

test('loading progress is moved onto the metadata baseline instead of creating a header row', () => {
  assert.match(allNative, /favProgress = function favProgress0134/);
  assert.match(allNative, /favClearProgress = function favClearProgress0134/);
  assert.match(allNative, /node\.dataset\.ebsfProgressInline = ''/);
  assert.match(allNative, /if \(node\.parentElement !== header\) header\.append\(node\)/);
  assert.match(allNative, /metaRect\.top - headerRect\.top/);
  assert.match(allNative, /\.ebsf-progress-inline0134\{[\s\S]*position:absolute!important;[\s\S]*right:0!important;/);
  const finalProgress = allNative.slice(allNative.indexOf('favProgress = function favProgress0134'));
  assert.doesNotMatch(finalProgress, /section\.prepend\(node\)/);
});

test('real collection toolbar stays inside the content column', () => {
  assert.match(parity, /#collections-landing-phase-3-header-container\{[\s\S]*width:100%!important;[\s\S]*max-width:100%!important;[\s\S]*min-width:0!important;/);
  assert.match(parity, /#collections-landing-right-side-header-container\{[\s\S]*flex:1 1 0%!important;[\s\S]*width:auto!important;[\s\S]*min-width:0!important;/);
  assert.match(parity, /\.ebsf-content-column0131[\s\S]*flex:1 1 0%!important;[\s\S]*max-width:100%!important;[\s\S]*min-width:0!important;/);
});

test('soft-route shell repair reapplies exact Search geometry', () => {
  assert.match(exactSearch, /favInstallPageShell0120 = function favInstallPageShell0135/);
  assert.match(exactSearch, /favScheduleExactToolbar0136\(\)/);
  assert.match(exactSearch, /favSyncNarrowSortWidth0128 = function favSyncNarrowSortWidth0135/);
});

test('responsive states retain the permanent-rail and phone toolbar behavior', () => {
  assert.match(parity, /@media\(max-width:899px\)/);
  assert.match(allNative, /@media\(min-width:761px\)/);
  assert.match(allNative, /@media\(max-width:760px\)/);
  assert.match(allNative, /grid-template-columns:max-content var\(--ebsf-shared-sort-width0134,180px\) 40px minmax\(0,1fr\)!important/);
  assert.match(allNative, /@media\(max-width:520px\)/);
  assert.match(allNative, /grid-template-columns:40px clamp\(152px,30vw,182px\) 40px minmax\(0,1fr\)!important/);
});
