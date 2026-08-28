import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const parity = await readFile(new URL('../src/96-favorites-exact-header-parity.js', import.meta.url), 'utf8');
const allNative = await readFile(new URL('../src/97-favorites-all-native-header.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('v0.12.11 pagination, parity, then literal All native-header layer load after the native boundary', () => {
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const paginationIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  const parityIndex = userscript.indexOf('/src/96-favorites-exact-header-parity.js');
  const allNativeIndex = userscript.indexOf('/src/97-favorites-all-native-header.js');
  assert.ok(boundary >= 0 && paginationIndex > boundary && parityIndex > paginationIndex && allNativeIndex > parityIndex);
  assert.match(userscript, /@version\s+0\.12\.11/);
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

test('final Sort width is tighter while still measuring the longest label', () => {
  assert.match(allNative, /favSortTriggerWidth = function favSortTriggerWidth0133/);
  assert.match(allNative, /Math\.max\(\.\.\.labels\.map\(\(label\) => measure\(label\)\), 0\) \+ 24/);
  assert.match(allNative, /--ebsf-narrow-sort-width,180px/);
  assert.doesNotMatch(allNative, /\+ 32\)/);
});

test('Search remains the sole flexible toolbar column and no fixed Search cap survives', () => {
  assert.match(parity, /\.ebsf-native-search-slot\{[\s\S]*grid-column:3!important;[\s\S]*width:100%!important;[\s\S]*max-width:none!important;/);
  assert.match(parity, /\.ebsf-native-search-slot input\{[\s\S]*width:100%!important;[\s\S]*max-width:none!important;[\s\S]*min-width:0!important;/);
  assert.match(allNative, /grid-template-columns:var\(--ebsf-narrow-sort-width,180px\) 40px minmax\(0,1fr\)!important/);
  assert.doesNotMatch(`${parity}\n${allNative}`, /(?:width|max-width):[^;\n]*380px/);
});

test('real collection toolbar gets remaining width without escaping the content column', () => {
  assert.match(parity, /#collections-landing-phase-3-header-container\{[\s\S]*width:100%!important;[\s\S]*max-width:100%!important;[\s\S]*min-width:0!important;/);
  assert.match(parity, /#collections-landing-right-side-header-container\{[\s\S]*flex:1 1 0%!important;[\s\S]*width:auto!important;[\s\S]*min-width:0!important;/);
  assert.match(parity, /\.ebsf-content-column0131[\s\S]*flex:1 1 0%!important;[\s\S]*max-width:100%!important;[\s\S]*min-width:0!important;/);
});

test('legacy measured toolbar geometry is cleared on every final repair', () => {
  assert.match(parity, /favClearLegacyToolbarGeometry0126\?\.\(\)/);
  assert.match(parity, /'margin-left'/);
  assert.match(parity, /'flex-basis'/);
  assert.match(parity, /row\?\.classList\.remove\('ebsf-toolbar-preserve-search', 'ebsf-toolbar-compact'\)/);
  assert.match(allNative, /favClearFinalToolbarGeometry0131\?\.\(\)/);
});

test('responsive states retain the permanent-rail and phone toolbar behavior', () => {
  assert.match(parity, /@media\(max-width:899px\)/);
  assert.match(allNative, /@media\(max-width:760px\)/);
  assert.match(allNative, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width,180px\) 40px minmax\(0,1fr\)!important/);
  assert.match(allNative, /@media\(max-width:520px\)/);
  assert.match(allNative, /grid-template-columns:40px clamp\(152px,30vw,182px\) 40px minmax\(0,1fr\)!important/);
});
