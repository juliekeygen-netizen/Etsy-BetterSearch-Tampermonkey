import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hotfix = await readFile(new URL('../src/101-favorites-v0141-smoke-fixes.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const shell = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');
const legacyPagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');

test('v0.14.1 cache-busts every userscript module and loads the smoke fix last', () => {
  assert.equal(packageJson.version, '0.14.1');
  assert.match(userscript, /@version\s+0\.14\.1/);
  const requires = Array.from(userscript.matchAll(/^\/\/ @require\s+([^\s]+)$/gm), (match) => match[1]);
  assert.ok(requires.length > 50, 'expected the shared module chain');
  assert.ok(requires.every((url) => /[?&]v=0\.14\.1(?:&|$)/.test(url)), 'every @require must invalidate the v0.14.0 cache');
  assert.match(requires.at(-1) || '', /\/src\/101-favorites-v0141-smoke-fixes\.js\?v=0\.14\.1$/);
});

test('shown count follows actual grid ownership instead of merely active filter state', () => {
  assert.match(hotfix, /function favLocalGridAuthoritative0142/);
  assert.match(hotfix, /favState\.renderMode0141 === 'bettersearch-local'/);
  assert.match(hotfix, /local\?\.isConnected/);
  assert.match(hotfix, /nativeGrid\.hidden === true/);
  assert.match(hotfix, /nativeGrid\.hasAttribute\?\.\('data-ebsf-native-hidden'\)/);
  assert.match(hotfix, /if \(!favLocalGridAuthoritative0142\(\)\) return \{ total, shown:total \}/);
  assert.match(hotfix, /shown:Array\.isArray\(favState\.filtered\) \? favState\.filtered\.length : total/);

  // Lock the exact v0.14 regression that produced “N favorites · 0 shown”:
  // the old shell counted favState.filtered whenever any enhancement was active.
  assert.match(shell, /favEnhancementActive\(\)&&Array\.isArray\(favState\.filtered\)\?favState\.filtered\.length:total/);
});

test('desktop rail ownership is claimed before the old shell content-column gate', () => {
  const wrapper = hotfix.slice(
    hotfix.indexOf('var favInstallPageShellBefore0142'),
    hotfix.indexOf('function favRenderIntegrityReady0142'),
  );
  const ensureCall = wrapper.indexOf('favEnsurePermanentRail0142()');
  const oldShellCall = wrapper.indexOf('favInstallPageShellBefore0142?.()');
  assert.ok(ensureCall >= 0 && oldShellCall > ensureCall, 'rail is installed before delegating to the old shell');
  assert.match(hotfix, /const sidebar = document\.querySelector\('\[data-testid="sidebar"\]'\)/);
  assert.match(hotfix, /if \(!sidebar\.querySelector\(':scope > \[data-ebsf-rail\]'\)\) favInstallPermanentRail0120\(\)/);
});

test('v0.14.1 neutralizes the legacy 20-item local-pagination override', () => {
  // Module 95 is the old behavior that survived into v0.14 and contradicted the
  // release's explicit “local pagination deferred” boundary.
  assert.match(legacyPagination, /FAV_LOCAL_PAGE_SIZE0129 = 20/);
  assert.match(legacyPagination, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0129/);

  assert.match(hotfix, /favRenderCurrent = function favRenderCurrent0142/);
  assert.match(hotfix, /favState\.localPage = 1/);
  assert.match(hotfix, /favState\.pageSize = Math\.max\(1, favState\.records\.length \|\| 1\)/);
  assert.match(hotfix, /return favRenderCurrentBefore0122\(\)/);
  assert.match(hotfix, /favRenderPagination = function favRenderPagination0142/);
  assert.match(hotfix, /classList\.remove\('ebsf-local-single-page0129'\)/);
});

test('ready enhanced results are repaired if Etsy reconciles away the sibling local grid', () => {
  assert.match(hotfix, /function favRenderIntegrityReady0142/);
  assert.match(hotfix, /favState\.loadComplete/);
  assert.match(hotfix, /favState\.loadKey !== datasetKey/);
  assert.match(hotfix, /Number\(favState\.metadataCoverage0141\?\.pending\) > 0/);
  assert.match(hotfix, /if \(!favLocalGridAuthoritative0142\(\)\) favRenderCurrent\(\)/);

  const reapply = hotfix.slice(hotfix.indexOf('var favReapplyBefore0142'), hotfix.indexOf('var favScheduleSyncBefore0142'));
  assert.match(reapply, /await favReapplyBefore0142\(\.\.\.args\)/);
  assert.match(reapply, /favScheduleRenderIntegrity0142\(0, datasetKey\)/);
  assert.match(reapply, /favScheduleRenderIntegrity0142\(120, datasetKey\)/);

  // Reuse the existing lifecycle signal instead of creating yet another broad observer.
  assert.doesNotMatch(hotfix, /new MutationObserver/);
  assert.match(hotfix, /favScheduleSync = function favScheduleSync0142/);
  assert.match(hotfix, /favState\.renderMode0141 === 'bettersearch-local'/);
});

test('native restoration schedules a truthful header refresh', () => {
  assert.match(hotfix, /var favRestoreNativeBefore0142 = favRestoreNative/);
  assert.match(hotfix, /favRestoreNative = function favRestoreNative0142/);
  assert.match(hotfix, /requestAnimationFrame\(\(\) => favUpdateScopeHeader0120\?\.\(\)\)/);
});
