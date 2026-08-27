import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stability = await readFile(new URL('../src/88-favorites-revamp-stability.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('final Favorites stability module loads after shell and style modules', () => {
  const shell = userscript.indexOf('/src/86-favorites-page-shell.js');
  const style = userscript.indexOf('/src/87-favorites-revamp-style.js');
  const guard = userscript.indexOf('/src/88-favorites-revamp-stability.js');
  assert.ok(shell >= 0 && style > shell && guard > style);
});

test('collection selector rejects pagination-corrupted DOM even with a matching signature', () => {
  assert.match(stability, /function favCollectionStripIntact0123/);
  assert.match(stability, /\.ebsf-collection-fixed/);
  assert.match(stability, /\.ebsf-collection-scroll/);
  assert.match(stability, /\.ebsf-all-pill/);
  assert.match(stability, /\.ebsf-collection-add/);
  assert.match(stability, /\.wt-action-group__item-container/);
  assert.match(stability, /!favCollectionStripIntact0123\(current,signature\)/);
});

test('All header placement is idempotent instead of moving on every shell pass', () => {
  assert.match(stability, /strip\.nextElementSibling!==header/);
  assert.doesNotMatch(stability, /if\(strip\)strip\.after\(header\);else content\.prepend\(header\)/);
});

test('final toolbar layout clears legacy negative-margin geometry', () => {
  assert.match(stability, /favRepairToolbarLayout = function favRepairToolbarLayout0123/);
  assert.match(stability, /'width','max-width','margin-left','transform','flex'/);
  assert.match(stability, /row\.classList\.remove\('ebsf-toolbar-preserve-search','ebsf-toolbar-compact'\)/);
  assert.match(stability, /favToolbarGeometrySnapshots010\.delete\(row\)/);
});

test('shell observer ignores BetterSearch-owned shell mutations', () => {
  assert.match(stability, /favState\.shellObserver0120\?\.disconnect/);
  assert.match(stability, /function favOwnedShellNode0123/);
  assert.match(stability, /if\(favOwnedShellNode0123\(record\.target\)\)return false/);
  assert.doesNotMatch(stability, /node\.matches\?\.\('\[data-testid="sidebar"\],[^']*\[data-ebsf-collection-strip\]/);
});

test('category visibility is constrained by layout-v2 enabled instances', () => {
  assert.match(stability, /favVisibleBindingCount0120\(bindingKey\)>0/);
  assert.match(stability, /bindingKey\.startsWith\('category:'\).*favCategoryBindingEnabled0123/s);
  assert.match(stability, /favBuildCategory=function favBuildCategory0123/);
  assert.match(stability, /!favCategoryBindingEnabled0123\(bindingKey\)\|\|!favBindingAvailable0120\(bindingKey\)/);
});

test('drawers disappear when layout editing leaves them with no visible options', () => {
  assert.match(stability, /const configured=drawer\.optionInstances\.filter/);
  assert.match(stability, /if\(!configured\.length\)\{section\.hidden=true;continue;\}/);
  assert.match(stability, /section\.hidden=!options\.some\(\(option\)=>!option\.hidden\)/);
});

test('legacy pagination restore cannot target the reconstructed shell', () => {
  assert.match(stability, /favRestorePaginationBefore0123=favRestorePagination0122/);
  assert.match(stability, /nav\.matches\?\.\('\[data-ebsf-collection-strip\],\[data-ebsf-all-header\]'\)/);
  assert.match(stability, /favState\.nativePagination0120=null/);
});
