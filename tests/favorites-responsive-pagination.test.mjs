import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const final = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('v0.12.9 final correction loads after the native-boundary module', () => {
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const finalIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  assert.ok(boundary >= 0 && finalIndex > boundary);
  assert.match(userscript, /@version\s+0\.12\.9/);
});

test('local enhanced results keep Etsy-style 20-item paging', () => {
  assert.match(final, /FAV_LOCAL_PAGE_SIZE0129 = 20/);
  assert.match(final, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0129/);
  assert.match(final, /return favRenderCurrentBefore0122\(\)/);
  assert.match(final, /searchParams\.get\('page'\)/);
  assert.doesNotMatch(final, /pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
});

test('native pager remains structurally owned by Etsy', () => {
  assert.match(final, /body\.ebsf-local-single-page0129 nav\[aria-label="Favorite Items Page Results"\]/);
  assert.match(final, /classList\.toggle\('ebsf-local-single-page0129'/);
  assert.doesNotMatch(final, /createElement\(['"]nav['"]\)|replaceChildren\(|\.after\(nav\)|append\(nav\)/);
});

test('every historical All metadata callback is rebound to the invariant full metadata writer', () => {
  assert.match(final, /favApplyScopeMetaDensity0125 = favApplyScopeMetaDensity0131/);
  assert.match(final, /favApplyScopeMetaDensity0126 = favApplyScopeMetaDensity0131/);
  assert.match(final, /classList\.remove\('ebsf-scope-meta-compact'\)/);
  assert.match(final, /Private collection/);
  assert.match(final, /\$\{total\} favorites · \$\{shown\} shown/);
  assert.doesNotMatch(final, /compact \? 'Private'/);
  assert.doesNotMatch(final, /\$\{total\} · \$\{shown\}/);
});

test('All header is normalized to the native collection header anatomy and typography', () => {
  assert.match(final, /wt-justify-content-space-between/);
  assert.match(final, /wt-flex-direction-row-lg/);
  assert.match(final, /wt-flex-direction-column-xs/);
  assert.match(final, /wt-flex-direction-column-xs', 'wt-flex-gap-xs-1/);
  assert.match(final, /wt-align-items-center wt-flex-gap-xs-2/);
  assert.match(final, /title\.classList\.add\('wt-text-title-large'\)/);
  assert.match(final, /data\.ebsfAllTitleRow/);
  assert.match(final, /data\.ebsfAllMetaRow/);
  assert.doesNotMatch(final, /font-size:16px!important/);
  assert.doesNotMatch(final, /grid-template-areas:[\s\S]*title controls/);
});

test('All private metadata uses one native-style icon inside the strong label', () => {
  assert.match(final, /wt-icon--smallest wt-nudge-b-1 etsy-icon ebsf-scope-privacy-icon/);
  assert.match(final, /strong\.prepend\(icon\)/);
  assert.match(final, /document\.createTextNode\(' Private collection'\)/);
});

test('Sort measures only the label plus compact trigger allowance', () => {
  assert.match(final, /favSortTriggerWidth = function favSortTriggerWidth0131/);
  assert.match(final, /\+ 40\)/);
  assert.match(final, /--ebsf-narrow-sort-width,196px/);
  assert.doesNotMatch(final, /\+ 54\)/);
});

test('Search is the sole flexible toolbar column and old 380px caps are absent from the final layer', () => {
  assert.match(final, /grid-template-columns:var\(--ebsf-narrow-sort-width,196px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /\.ebsf-native-search-slot\{[\s\S]*grid-column:3!important;[\s\S]*width:100%!important;[\s\S]*max-width:none!important;/);
  assert.match(final, /\.ebsf-native-search-slot input\{[\s\S]*width:100%!important;[\s\S]*max-width:none!important;[\s\S]*min-width:0!important;/);
  assert.doesNotMatch(final, /380px/);
});

test('real collection header gives the right-side toolbar the remaining width without escaping the content column', () => {
  assert.match(final, /#collections-landing-phase-3-header-container\{[\s\S]*width:100%!important;[\s\S]*max-width:100%!important;[\s\S]*min-width:0!important;/);
  assert.match(final, /#collections-landing-right-side-header-container\{[\s\S]*flex:1 1 0%!important;[\s\S]*width:auto!important;[\s\S]*min-width:0!important;/);
  assert.match(final, /\.ebsf-content-column0131[\s\S]*flex:1 1 0%!important;[\s\S]*max-width:100%!important;[\s\S]*min-width:0!important;/);
});

test('legacy measured toolbar width and negative-margin geometry is cleared on every final refresh', () => {
  assert.match(final, /favClearLegacyToolbarGeometry0126\?\.\(\)/);
  assert.match(final, /'margin-left'/);
  assert.match(final, /'flex-basis'/);
  assert.match(final, /row\?\.classList\.remove\('ebsf-toolbar-preserve-search', 'ebsf-toolbar-compact'\)/);
  assert.match(final, /favClearFinalToolbarGeometry0131\(\);/);
});

test('responsive states distinguish the 761px permanent rail from Etsy header stacking', () => {
  assert.match(final, /@media\(max-width:899px\)/);
  assert.match(final, /@media\(max-width:760px\)/);
  assert.match(final, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width,196px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /Only widths at\/below 760 use/);
  assert.doesNotMatch(final, /@media\(max-width:899px\)[\s\S]*grid-template-columns:max-content var\(--ebsf-narrow-sort-width/);
});

test('phone widths keep Filters and full Sort before allowing Search to shrink', () => {
  assert.match(final, /@media\(max-width:520px\)/);
  assert.match(final, /grid-template-columns:40px clamp\(156px,31vw,190px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /\[data-ebsf-filter-label\][\s\S]*display:none!important/);
});
