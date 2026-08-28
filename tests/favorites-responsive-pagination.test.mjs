import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const final = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('v0.12.7 final correction loads after the native-boundary module', () => {
  const boundary = userscript.indexOf('/src/94-favorites-native-boundary.js');
  const finalIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  assert.ok(boundary >= 0 && finalIndex > boundary);
  assert.match(userscript, /@version\s+0\.12\.7/);
});

test('local enhanced results restore Etsy-style 20-item paging instead of rendering the whole catalogue', () => {
  assert.match(final, /FAV_LOCAL_PAGE_SIZE0129 = 20/);
  assert.match(final, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0129/);
  assert.match(final, /return favRenderCurrentBefore0122\(\)/);
  assert.match(final, /searchParams\.get\('page'\)/);
  assert.doesNotMatch(final, /pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
});

test('native pager remains structurally owned by Etsy and is only hidden as a whole for one local page', () => {
  assert.match(final, /body\.ebsf-local-single-page0129 nav\[aria-label="Favorite Items Page Results"\]/);
  assert.match(final, /classList\.toggle\('ebsf-local-single-page0129'/);
  assert.doesNotMatch(final, /createElement\(['"]nav['"]\)|replaceChildren\(|insertBefore\(|\.after\(nav\)|append\(nav\)/);
});

test('sidebar-hidden widths through 899px give Search the entire remaining row width', () => {
  assert.match(final, /@media\(max-width:899px\)/);
  assert.match(final, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width,220px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /\.ebsf-native-search-slot\{[\s\S]*grid-column:4!important;[\s\S]*width:100%!important;[\s\S]*max-width:none!important;/);
});

test('tight desktop widths reserve Sort and Settings before flexible Search so controls cannot overlap', () => {
  assert.match(final, /@media\(min-width:900px\) and \(max-width:1200px\)/);
  assert.match(final, /grid-template-columns:var\(--ebsf-narrow-sort-width,220px\) 40px minmax\(0,1fr\)!important/);
  assert.match(final, /\.ebsf-settings-button\{[\s\S]*grid-column:2!important/);
  assert.match(final, /\.ebsf-native-search-slot\{[\s\S]*grid-column:3!important/);
});

test('scope metadata uses real no-wrap fit instead of a hard-coded 1180px threshold', () => {
  assert.match(final, /function favInlineMetaFits0129/);
  assert.match(final, /needed <= available \+ 1/);
  assert.match(final, /Private collection/);
  assert.match(final, /favorites · \$\{shown\} shown/);
  assert.doesNotMatch(final, /1180/);
});
