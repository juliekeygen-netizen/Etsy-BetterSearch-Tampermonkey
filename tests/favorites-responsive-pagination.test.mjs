import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const final = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('v0.12.8 final correction loads after the native-boundary module', () => {
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const finalIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  assert.ok(boundary >= 0 && finalIndex > boundary);
  assert.match(userscript, /@version\s+0\.12\.8/);
});

test('local enhanced results keep Etsy-style 20-item paging instead of rendering the whole catalogue', () => {
  assert.match(final, /FAV_LOCAL_PAGE_SIZE0129 = 20/);
  assert.match(final, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0129/);
  assert.match(final, /return favRenderCurrentBefore0122\(\)/);
  assert.match(final, /searchParams\.get\('page'\)/);
  assert.doesNotMatch(final, /pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
});

test('native pager remains structurally owned by Etsy and is only hidden as a whole for one local page', () => {
  assert.match(final, /body\.ebsf-local-single-page0129 nav\[aria-label="Favorite Items Page Results"\]/);
  assert.match(final, /classList\.toggle\('ebsf-local-single-page0129'/);
  assert.doesNotMatch(final, /createElement\(['"]nav['"]\)|replaceChildren\(|\.after\(nav\)|append\(nav\)/);
});

test('metadata wording is always full and cannot oscillate into compact labels', () => {
  assert.match(final, /privacy\.textContent = 'Private collection'/);
  assert.match(final, /`\$\{total\} favorites · \$\{shown\} shown`/);
  assert.match(final, /classList\.remove\('ebsf-scope-meta-compact'\)/);
  assert.doesNotMatch(final, /favInlineMetaFits0129|privacy\.textContent = 'Private';|`\$\{total\} · \$\{shown\}`/);
});

test('All mirrors the collection header with title and toolbar first, metadata beneath', () => {
  assert.match(final, /grid-template-areas:[\s\S]*"title controls"[\s\S]*"meta meta"/);
  assert.match(final, /\.ebsf-scope-copy\{display:contents!important\}/);
  assert.match(final, /grid-area:title!important/);
  assert.match(final, /grid-area:controls!important/);
  assert.match(final, /grid-area:meta!important/);
  assert.match(final, /favEnsureAllPrivacyIcon0130/);
});

test('wide toolbar keeps measured Sort and Settings fixed while Search alone grows', () => {
  assert.match(final, /grid-template-columns:var\(--ebsf-narrow-sort-width,210px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /\.ebsf-sort\{[\s\S]*width:var\(--ebsf-narrow-sort-width,210px\)!important;[\s\S]*min-width:var\(--ebsf-narrow-sort-width,210px\)!important/);
  assert.match(final, /\.ebsf-native-search-slot\{[\s\S]*width:100%!important;[\s\S]*max-width:none!important;[\s\S]*min-width:0!important/);
  assert.match(final, /ebsf-collection-toolbar-host0130/);
});

test('sidebar-hidden widths retain full Sort until phone fallback and keep toolbar edge-to-edge', () => {
  assert.match(final, /@media\(max-width:899px\)/);
  assert.match(final, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width,210px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /@media\(max-width:520px\)/);
  assert.match(final, /clamp\(132px,40vw,var\(--ebsf-narrow-sort-width,210px\)\)/);
});

test('privacy icons are vertically aligned for both All and native collection metadata', () => {
  assert.match(final, /ebsf-scope-privacy-icon/);
  assert.match(final, /collection-privacy-icon/);
  assert.match(final, /transform:translateY\(-1px\)!important/);
});
