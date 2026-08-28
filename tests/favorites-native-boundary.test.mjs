import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const defer = await readFile(new URL('../src/85a-favorites-runtime-defer.js', import.meta.url), 'utf8');
const boundary = await readFile(new URL('../src/94-favorites-native-boundary.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('Favorites runtime is deferred before page shell and released only by final module', () => {
  const deferIndex = userscript.indexOf('/src/85a-favorites-runtime-defer.js');
  const shellIndex = userscript.indexOf('/src/86-favorites-page-shell.js');
  const boundaryIndex = userscript.indexOf('/src/94-favorites-native-boundary.js');
  assert.ok(deferIndex >= 0 && shellIndex > deferIndex && boundaryIndex > shellIndex);
  assert.match(defer, /favStartRuntime = function favStartRuntimeDeferred0128/);
  assert.match(boundary, /favReleaseRuntime0128\(\);/);
});

test('final collection strip does not use a nav element', () => {
  assert.match(boundary, /document\.createElement\('div'\)/);
  assert.match(boundary, /setAttribute\('role', 'navigation'\)/);
  const build = boundary.slice(boundary.indexOf('function favBuildCollectionStrip0128'), boundary.indexOf('favBuildCollectionStrip0120 = favBuildCollectionStrip0128'));
  assert.doesNotMatch(build, /createElement\('nav'\)/);
});

test('final collection installer contains no pagination recovery or movement', () => {
  const install = boundary.slice(boundary.indexOf('favInstallCollectionStrip0120 = function favInstallCollectionStrip0128'), boundary.indexOf('favProtectNativePagination0126 ='));
  assert.doesNotMatch(install, /WtPagination|Favorite Items Page Results|favHasPaginationPayload0126|favRecoverPaginationFromCorruptStrip0126|favPlacePaginationBelowGrid0126/);
});

test('live pagination compatibility hooks are final no-ops', () => {
  assert.match(boundary, /favProtectNativePagination0126 = function favProtectNativePagination0128\(\) \{\};/);
  assert.match(boundary, /favRestorePagination0122 = function favRestorePagination0128\(\) \{\s*favState\.nativePagination0120 = null;\s*\};/);
  assert.match(boundary, /favRenderPagination = function favRenderPagination0128\(\) \{\};/);
});

test('final shell observer does not watch or repair pagination', () => {
  const observer = boundary.slice(boundary.indexOf('function favShellMutationRelevant0128'), boundary.indexOf('function favSyncNarrowSortWidth0128'));
  assert.doesNotMatch(observer, /WtPagination|Favorite Items Page Results|pagination|favProtectNativePagination0126/);
});

test('narrow header spans the parent Etsy grid and preserves full sort width before Search', () => {
  assert.match(boundary, /\[data-ebsf-collection-strip\],[\s\S]*\.ebsf-scope-header\{[\s\S]*grid-column:1 \/ -1!important;/);
  assert.match(boundary, /grid-template-columns:max-content var\(--ebsf-narrow-sort-width,220px\) 40px minmax\(0,1fr\)!important/);
  assert.match(boundary, /favMeasureSortTrigger\?\.\(root\)/);
  assert.match(boundary, /row\.style\.setProperty\('--ebsf-narrow-sort-width', measured\)/);
});
