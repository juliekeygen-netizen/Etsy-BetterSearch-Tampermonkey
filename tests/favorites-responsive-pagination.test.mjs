import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const parity = await readFile(new URL('../src/96-favorites-exact-header-parity.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('v0.12.9 pagination then exact-parity layers load after the native boundary', () => {
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const paginationIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  const parityIndex = userscript.indexOf('/src/96-favorites-exact-header-parity.js');
  assert.ok(boundary >= 0 && paginationIndex > boundary && parityIndex > paginationIndex);
  assert.match(userscript, /@version\s+0\.12\.9/);
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

test('All header is normalized to native collection anatomy and typography', () => {
  assert.match(parity, /wt-justify-content-space-between/);
  assert.match(parity, /wt-flex-direction-row-lg/);
  assert.match(parity, /wt-flex-direction-column-xs/);
  assert.match(parity, /wt-flex-direction-column-xs', 'wt-flex-gap-xs-1/);
  assert.match(parity, /wt-align-items-center wt-flex-gap-xs-2/);
  assert.match(parity, /title\.classList\.add\('wt-text-title-large'\)/);
  assert.match(parity, /dataset\.ebsfAllTitleRow/);
  assert.match(parity, /dataset\.ebsfAllMetaRow/);
  assert.doesNotMatch(parity, /font-size:16px!important/);
  assert.doesNotMatch(parity, /grid-template-areas:[\s\S]*title controls/);
});

test('All private metadata has exactly one native-style icon location', () => {
  assert.match(parity, /wt-icon--smallest wt-nudge-b-1 etsy-icon ebsf-scope-privacy-icon/);
  assert.match(parity, /meta\.querySelectorAll\(':scope > \[data-ebsf-scope-privacy-icon\]'\)\.forEach\(\(node\) => node\.remove\(\)\)/);
  assert.match(parity, /strong\.prepend\(icon\)/);
  assert.match(parity, /document\.createTextNode\(' Private collection'\)/);
});

test('Sort measures only the label plus compact trigger allowance', () => {
  assert.match(parity, /favSortTriggerWidth = function favSortTriggerWidth0131/);
  assert.match(parity, /\+ 40\)/);
  assert.match(parity, /--ebsf-narrow-sort-width,196px/);
  assert.doesNotMatch(parity, /\+ 54\)/);
});

test('Search is the sole flexible toolbar column and no fixed Search cap survives', () => {
  assert.match(parity, /grid-template-columns:var\(--ebsf-narrow-sort-width,196px\) 40px minmax\(0,1fr\)!important/);
  assert.match(parity, /\.ebsf-native-search-slot\{[\s\S]*grid-column:3!important;[\s\S]*width:100%!important;[\s\S]*max-width:none!important;/);
  assert.match(parity, /\.ebsf-native-search-slot input\{[\s\S]*width:100%!important;[\s\S]*max-width:none!important;[\s\S]*min-width:0!important;/);
  assert.doesNotMatch(parity, /(?:width|max-width):[^;\n]*380px/);
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
  assert.match(parity, /favClearFinalToolbarGeometry0131\(\);/);
});

test('responsive states distinguish the 761px permanent rail from header stacking', () => {
  assert.match(parity, /@media\(max-width:899px\)/);
  assert.match(parity, /@media\(max-width:760px\)/);
  assert.match(parity, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width,196px\) 40px minmax\(0,1fr\)!important/);
  assert.match(parity, /permanent filter rail begins at 761px/);
  const medium = parity.slice(parity.indexOf('@media(max-width:899px)'), parity.indexOf('@media(max-width:760px)'));
  assert.doesNotMatch(medium, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width/);
});

test('phone widths keep Filters and Sort before allowing Search to shrink', () => {
  assert.match(parity, /@media\(max-width:520px\)/);
  assert.match(parity, /grid-template-columns:40px clamp\(156px,31vw,190px\) 40px minmax\(0,1fr\)!important/);
  assert.match(parity, /\[data-ebsf-filter-label\][\s\S]*display:none!important/);
});
