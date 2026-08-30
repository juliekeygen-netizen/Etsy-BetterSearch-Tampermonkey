import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hardening = await readFile(new URL('../src/101-favorites-v0141-smoke-fixes.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8').catch(() => '');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8').catch(() => '{"version":"0.0.0"}'));
const shell = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');
const legacyPagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');

test('current release cache-busts every userscript module and keeps final stable-ownership hardening last', () => {
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  if (!userscript) return;
  const metaVersion = userscript.match(/^\/\/ @version\s+(\S+)$/m)?.[1] || '';
  assert.equal(metaVersion, packageJson.version);
  const requires = Array.from(userscript.matchAll(/^\/\/ @require\s+([^\s]+)$/gm), (match) => match[1]);
  assert.ok(requires.length > 50, 'expected the shared module chain');
  assert.ok(requires.every((url) => new URL(url).searchParams.get('v') === packageJson.version), 'every @require must use the current package version as its cache key');
  const smoke = `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/101-favorites-v0141-smoke-fixes.js?v=${packageJson.version}`;
  const finalOwnership = `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/102-favorites-v0155-stable-ownership-final.js?v=${packageJson.version}`;
  assert.ok(requires.indexOf(smoke) >= 0, 'historical browser smoke hardening remains loaded');
  assert.ok(requires.indexOf(finalOwnership) > requires.indexOf(smoke), 'stable ownership finalizer must run after historical smoke hardening');
  assert.equal(requires.at(-1) || '', finalOwnership);
});

test('shown count follows the current signed local-grid ownership', () => {
  assert.match(hardening, /function favRequestedRenderSignature0143/);
  assert.match(hardening, /function favLocalGridAuthoritative0142/);
  assert.match(hardening, /favState\.renderSignature0143 === favRequestedRenderSignature0143\(\)/);
  assert.match(hardening, /if \(!favLocalGridAuthoritative0142\(\)\) return \{ total, shown:total \}/);
  assert.match(hardening, /shown:Array\.isArray\(favState\.filtered\) \? favState\.filtered\.length : total/);
  assert.match(shell, /favEnhancementActive\(\)&&Array\.isArray\(favState\.filtered\)\?favState\.filtered\.length:total/);
});

test('desktop rail ownership is claimed early and fails safe to Etsy native sidebar', () => {
  const wrapper = hardening.slice(
    hardening.indexOf('var favInstallPageShellBefore0142'),
    hardening.indexOf('function favBindingKnowledgeComplete0143'),
  );
  const ensureCall = wrapper.indexOf('favEnsurePermanentRail0142()');
  const oldShellCall = wrapper.indexOf('favInstallPageShellBefore0142?.()');
  assert.ok(ensureCall >= 0 && oldShellCall > ensureCall, 'rail is installed before delegating to the old shell');
  assert.match(hardening, /function favRestoreNativeSidebarAfterRailFailure0143/);
  assert.match(hardening, /source\.hidden = false/);
  assert.match(hardening, /source\.inert = false/);
  assert.match(hardening, /Filter rail install failed; restored Etsy sidebar/);
});

test('v0.15 module 95 owns local pagination without replacing the authoritative renderer', () => {
  assert.match(legacyPagination, /function favPageRouteKey0129/);
  assert.match(legacyPagination, /function favRequestedPage0129/);
  assert.match(legacyPagination, /function favSyncLocalPageFromRoute0129/);
  assert.match(legacyPagination, /FAV_LOCAL_PAGE_SIZE0150 = 20/);
  assert.match(legacyPagination, /function favGoToLocalPage0150/);
  assert.match(legacyPagination, /favRenderPagination\s*=\s*function favRenderPagination0150/);
  assert.doesNotMatch(legacyPagination, /favRenderCurrent\s*=/);
  assert.doesNotMatch(legacyPagination, /favRenderCurrentBefore0122/);
});

test('ready enhanced results repair only through current reapply pipeline', () => {
  assert.match(hardening, /function favRenderIntegrityReady0142/);
  assert.match(hardening, /favState\.loadComplete/);
  assert.match(hardening, /favState\.loadKey !== datasetKey/);
  assert.match(hardening, /Number\(favState\.metadataCoverage0141\?\.pending\) > 0/);

  const repair = hardening.slice(
    hardening.indexOf('function favRepairLocalOwnership0142'),
    hardening.indexOf('function favScheduleRenderIntegrity0142'),
  );
  assert.match(repair, /favLocalGridAuthoritative0142\(\)/);
  assert.match(repair, /Promise\.resolve\(favReapply\(\)\)/);
  assert.doesNotMatch(repair, /favRenderCurrent\(\)|favRenderCurrentBefore0122/);

  const reapply = hardening.slice(hardening.indexOf('var favReapplyBefore0142'), hardening.indexOf('var favScheduleSyncBefore0142'));
  assert.match(reapply, /await favReapplyBefore0142\(\.\.\.args\)/);
  assert.match(reapply, /favScheduleRenderIntegrity0142\(0, datasetKey\)/);
  assert.match(reapply, /favScheduleRenderIntegrity0142\(120, datasetKey\)/);
});

test('unknown filter capabilities remain visible until their absence is known', () => {
  assert.match(hardening, /function favBindingKnowledgeComplete0143/);
  assert.match(hardening, /favBindingAvailable0120 = function favBindingAvailable0143/);
  assert.match(hardening, /if \(available\) return true/);
  assert.match(hardening, /return !favBindingKnowledgeComplete0143\(bindingKey, records\)/);
});

test('native-card metadata hydration refresh is narrow and local-mode only', () => {
  assert.match(hardening, /function favWatchNativeHydration0143/);
  assert.match(hardening, /observer\.observe\(native, \{/);
  assert.match(hardening, /favRefreshOwnedCardsFromNative0143/);
  assert.match(hardening, /native\.cloneNode\(true\)/);
  const observerBlock = hardening.slice(hardening.indexOf('function favWatchNativeHydration0143'), hardening.indexOf('function favRenderIntegrityReady0142'));
  assert.doesNotMatch(observerBlock, /observe\(document\.body/);
});

test('native restoration clears local render generation and schedules truthful count refresh', () => {
  assert.match(hardening, /var favRestoreNativeBefore0142 = favRestoreNative/);
  assert.match(hardening, /favState\.renderSignature0143 = ''/);
  assert.match(hardening, /favStopNativeHydrationWatch0143\(\)/);
  assert.match(hardening, /requestAnimationFrame\(\(\) => favUpdateScopeHeader0120\?\.\(\)\)/);
});
