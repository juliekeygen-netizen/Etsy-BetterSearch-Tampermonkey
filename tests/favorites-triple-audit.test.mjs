import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = await readFile(new URL('../src/91-favorites-triple-audit-hardening.js', import.meta.url), 'utf8');
const responsive = await readFile(new URL('../src/89-favorites-responsive-shell.js', import.meta.url), 'utf8');
const polish = await readFile(new URL('../src/90-favorites-responsive-polish.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('triple-audit hardening remains after the responsive shell layers', () => {
  const responsiveIndex = userscript.indexOf('/src/89-favorites-responsive-shell.js');
  const polishIndex = userscript.indexOf('/src/90-favorites-responsive-polish.js');
  const auditIndex = userscript.indexOf('/src/91-favorites-triple-audit-hardening.js');
  assert.ok(responsiveIndex >= 0 && polishIndex > responsiveIndex && auditIndex > polishIndex);
  assert.match(userscript, /@version\s+0\.12\.5/);
});

test('final collection installer ends the revision-2 versus revision-3 rebuild loop', () => {
  assert.match(responsive, /ebsfScrollerRevision !== '2'/);
  assert.match(polish, /ebsfScrollerRevision !== '3'/);
  assert.match(audit, /dataset\.ebsfScrollerRevision = '4'/);
  assert.match(audit, /favInstallCollectionStrip0120 = function favInstallCollectionStrip0126/);
  assert.match(audit, /favCollectionStripIntact0123\(current, signature\)/);
  assert.match(audit, /scroller\?\.dataset\.ebsfScrollerRevision === '4'/);
  assert.doesNotMatch(audit.slice(audit.indexOf('favInstallCollectionStrip0120 = function favInstallCollectionStrip0126'), audit.indexOf('var favRestorePaginationBefore0126')), /favInstallCollectionStripBefore012[45]/);
});

test('dragging is robust on pills and does not trap wheel or touch scrolling', () => {
  assert.match(audit, /on\(strip, 'pointerdown'/);
  assert.match(audit, /on\(strip, 'lostpointercapture'/);
  assert.match(audit, /strip\.hasPointerCapture\?\./);
  assert.match(audit, /clearSuppressSoon/);
  assert.match(audit, /Math\.abs\(next - before\) < 0\.5\) return/);
  assert.match(audit, /touch-action:pan-y pinch-zoom!important/);
  assert.match(audit, /\[data-ebsf-collection-strip\] \.ebsf-collection-scroll/);
});

test('pagination corruption is salvaged before the collection strip is rebuilt', () => {
  assert.match(audit, /function favRecoverPaginationFromCorruptStrip0126/);
  assert.match(audit, /Favorite Items Page Results/);
  assert.match(audit, /dataset\.ebsfRecoveredPagination/);
  assert.match(audit, /favPlacePaginationBelowGrid0126/);
  assert.match(audit, /if \(current && favHasPaginationPayload0126\(current\)\)/);
  assert.match(audit, /saved\.generated = false/);
  assert.match(audit, /favRenderPagination = function favRenderPagination0126/);
});

test('native pagination wins if Etsy later recreates a real pager', () => {
  assert.match(audit, /const genuine = nodes\.filter\(\(nav\) => !nav\.matches\('\[data-ebsf-recovered-pagination\]'\)\)/);
  assert.match(audit, /for \(const recovered of nodes\.filter/);
  assert.match(audit, /favState\.recoveredPagination0126 = null/);
});

test('toolbar hardening clears legacy inline locks and constrains the real search input', () => {
  assert.match(audit, /favClearLegacyToolbarGeometry0126/);
  assert.match(audit, /\['width','min-width','max-width','flex'\]/);
  assert.match(audit, /favFilterWidthCache010\.delete\(filter\)/);
  assert.match(audit, /\.ebsf-native-search-slot input\{/);
  assert.match(audit, /flex:1 1 0%!important/);
  assert.match(audit, /width:100%!important/);
  assert.match(audit, /@media\(max-width:760px\)/);
  assert.match(audit, /@media\(min-width:761px\)/);
});

test('scope metadata compacts by actual width and collection pages get the same density treatment', () => {
  assert.match(audit, /width < 1180 \|\| crowded/);
  assert.match(audit, /favApplyScopeMetaDensity0125 = favApplyScopeMetaDensity0126/);
  assert.match(audit, /function favApplyCollectionMetaDensity0126/);
  assert.match(audit, /compact \? `\$\{total\} · \$\{shown\}`/);
  assert.match(audit, /favUpdateScopeHeader0120 = function favUpdateScopeHeader0126/);
  assert.match(audit, /ResizeObserver/);
});

test('category visibility obeys both v2 editor visibility and current-filtered-items evidence', () => {
  assert.match(audit, /favVisibleBindingCount0120\(bindingKey\) > 0/);
  assert.match(audit, /favAvailabilityMode0110\(\) === 'disabled'/);
  assert.match(audit, /favRecordsForBinding0120\(bindingKey\)/);
  assert.match(audit, /favCategoryMatch\(record\?\.deepMetadata\?\.category, bindingKey\.slice\(9\)\)/);
  assert.match(audit, /favSanitizeHiddenCategory0126/);
});

test('shell observer no longer ignores Etsy pagination injected into owned collection DOM', () => {
  const observer = audit.slice(audit.indexOf('favState.shellObserver0120?.disconnect'), audit.indexOf('GM_addStyle'));
  assert.match(observer, /favHasPaginationPayload0126\(strip\)/);
  assert.match(observer, /favProtectNativePagination0126\(\)/);
  assert.match(observer, /favScheduleShellRepair0123\(\)/);
});
