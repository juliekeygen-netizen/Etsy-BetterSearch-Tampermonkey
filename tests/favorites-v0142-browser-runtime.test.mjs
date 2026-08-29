import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const metadata = await readFile(new URL('../src/61h-favorites-metadata-coordinator.js', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');
const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../src/95a-favorites-native-page-state.js', import.meta.url), 'utf8');
const exactSearch = await readFile(new URL('../src/98-favorites-exact-search-width.js', import.meta.url), 'utf8');
const hardening = await readFile(new URL('../src/101-favorites-v0141-smoke-fixes.js', import.meta.url), 'utf8');
const data = await readFile(new URL('../src/61-favorites-data.js', import.meta.url), 'utf8');
const check = await readFile(new URL('../scripts/check.mjs', import.meta.url), 'utf8');

test('metadata coordinator exports the exact runtime symbol used by Favorites reapply', () => {
  assert.match(metadata, /async function favMetadataEnsureCurrentRequirements0141\(options = \{\}\)/);
  assert.doesNotMatch(metadata, /async function favMetadataEnsureCurrentRequirements\(options = \{\}\)/);
  assert.ok((metadata.match(/favMetadataEnsureCurrentRequirements0141/g) || []).length >= 3);
});

test('repository check rejects undefined version-suffixed Favorites runtime symbols', () => {
  assert.match(check, /Undefined versioned runtime symbol/);
  assert.match(check, /fav\[A-Za-z0-9_\$\]\*\\d\{4\}/);
  assert.match(check, /missingRuntimeSymbols/);
});

test('no late shell layer can reintroduce the obsolete all-results-on-one-page renderer', () => {
  assert.doesNotMatch(shell, /favRenderCurrent\s*=\s*function favRenderCurrent0122/);
  assert.doesNotMatch(shell, /pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
  assert.match(pagination, /FAV_LOCAL_PAGE_SIZE0150 = 20/);
  assert.match(pagination, /favRenderPagination = function favRenderPagination0150/);
  assert.doesNotMatch(pagination, /favRenderCurrent\s*=/);
});

test('native pager and local-result page identity cannot alias each other', () => {
  assert.match(adapter, /Native page identity is ONLY a view identity/);
  assert.doesNotMatch(adapter, /favState\.localPage\s*=\s*target/);
  assert.match(pagination, /Compatibility no-op/);
  assert.match(pagination, /favState\.localResultKey0150/);
  assert.match(pagination, /favState\.localPage = 1/);
});

test('local ownership strongly suppresses native grid and pager and restores them on native mode', () => {
  assert.match(pagination, /\[data-ebsf-native-hidden="1"\]\{\s*display:none!important/);
  assert.match(pagination, /nav\[data-ebsf-native-pager-hidden="1"\]\{\s*display:none!important/);
  assert.match(pagination, /function favApplyLocalVisualOwnership0150/);
  assert.match(pagination, /function favRestoreNativePagers0150/);
  assert.match(pagination, /function favRemoveLocalPagination0150/);
  assert.match(pagination, /favRestoreNative = function favRestoreNative0150/);
});

test('final browser hardening verifies computed visibility and pagination ownership', () => {
  assert.doesNotMatch(hardening, /favRenderCurrent\s*=/);
  assert.match(hardening, /favReapplyBefore0142/);
  assert.match(hardening, /favRequestedRenderSignature0143/);
  assert.match(hardening, /favState\.renderSignature0143 === favRequestedRenderSignature0143\(\)/);
  assert.match(hardening, /function favNodeVisuallySuppressed0143/);
  assert.match(hardening, /getComputedStyle\(node\)\.display === 'none'/);
  assert.match(hardening, /favLocalPaginationOwnershipHealthy0150\(\)/);
  assert.match(hardening, /favApplyLocalVisualOwnership0150\?\.\(\)/);
});

test('desktop rail failure restores Etsy native sidebar instead of leaving an empty column', () => {
  assert.match(hardening, /function favRestoreNativeSidebarAfterRailFailure0143/);
  assert.match(hardening, /source\.hidden = false/);
  assert.match(hardening, /source\.inert = false/);
  assert.match(hardening, /sidebar\.insertBefore\(child, source\)/);
  assert.match(hardening, /Filter rail install failed; restored Etsy sidebar/);
});

test('unknown capability coverage stays visible until absence is actually known', () => {
  assert.match(hardening, /function favBindingKnowledgeComplete0143/);
  assert.match(hardening, /if \(!favState\.loadComplete \|\| !Array\.isArray\(records\) \|\| !records\.length\) return false/);
  assert.match(hardening, /favBindingAvailable0120 = function favBindingAvailable0143/);
  assert.match(hardening, /if \(available\) return true/);
  assert.match(hardening, /return !favBindingKnowledgeComplete0143\(bindingKey, records\)/);
});

test('local clones refresh from Etsy native hydration without another broad body observer', () => {
  assert.match(hardening, /function favRefreshOwnedCardsFromNative0143/);
  assert.match(hardening, /native\.cloneNode\(true\)/);
  assert.match(hardening, /favPrepareOwnedCard0141/);
  assert.match(hardening, /observer\.observe\(native, \{/);
  assert.match(hardening, /attributeFilter:\['class','aria-label','aria-pressed'\]/);
  const observerBlock = hardening.slice(hardening.indexOf('function favWatchNativeHydration0143'), hardening.indexOf('function favRenderIntegrityReady0142'));
  assert.doesNotMatch(observerBlock, /observe\(document\.body/);
});

test('All and collection desktop toolbars share the same live right-edge alignment', () => {
  const block = exactSearch.slice(exactSearch.indexOf('function favAlignCollectionToolbarX0136'), exactSearch.indexOf('function favScheduleExactToolbar0136'));
  assert.match(block, /if \(innerWidth < 900\)/);
  assert.doesNotMatch(block, /header\.matches\?\.\('\[data-ebsf-all-header\]'\)/);
  assert.match(block, /const delta = targetRect\.right - rightRect\.right/);
});

test('Retry-After is not truncated to the old eight-second client cap', () => {
  assert.match(data, /error\.status = response\.status/);
  assert.match(data, /const retryAfterMs = Math\.max/);
  assert.match(data, /retryAfterMs > 0 \? Math\.min\(120000, retryAfterMs\) : clientBackoffMs/);
  assert.doesNotMatch(data, /Math\.min\(8000, Math\.max\(400 \* \(attempt \+ 1\), Number\(error\?\.retryAfterMs\)/);
});
