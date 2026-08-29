import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const metadata = await readFile(new URL('../src/61h-favorites-metadata-coordinator.js', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');
const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
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

test('page shell no longer forces every local result onto one giant page', () => {
  assert.doesNotMatch(shell, /favState\.pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
  assert.doesNotMatch(shell, /favRenderCurrentBefore0122/);
  assert.doesNotMatch(shell, /favRenderCurrent\s*=\s*function favRenderCurrent0122/);
  assert.match(shell, /Result pagination is no longer a page-shell responsibility/);
});

test('module 95 is the explicit local-pagination owner without touching Etsy native pager state', () => {
  assert.match(pagination, /FAV_LOCAL_PAGE_SIZE0144 = 20/);
  assert.match(pagination, /favRenderCurrentBefore0144 = favRenderCurrent/);
  assert.match(pagination, /favRenderCurrent = function favRenderCurrent0144/);
  assert.match(pagination, /favRenderPagination = favRenderPagination0144/);
  assert.match(pagination, /BetterSearch filtered favorites pages/);
  assert.match(pagination, /favState\.localPage = target/);
  assert.doesNotMatch(pagination, /preventDefault\(|stopPropagation\(|stopImmediatePropagation\(/);
  assert.doesNotMatch(pagination, /location\.(?:assign|replace)|history\.(?:pushState|replaceState)/);
});

test('local ownership strongly hides Etsy grid and pager while preserving them in DOM', () => {
  assert.match(pagination, /nativeGrid\.style\.setProperty\('display', 'none', 'important'\)/);
  assert.match(pagination, /nativeGrid\.setAttribute\('data-ebsf-native-hidden', '1'\)/);
  assert.match(pagination, /nativeGrid\.style\.removeProperty\('display'\)/);
  assert.match(pagination, /body\.ebsf-results-active nav\[aria-label="Favorite Items Page Results"\]/);
  assert.match(pagination, /display:none!important/);
  assert.doesNotMatch(pagination, /nativeGrid\.remove\(\)|nativeGrid\.replaceChildren\(/);
});

test('local paging resets on dataset/config generation and uses exactly 20 records per page', () => {
  assert.match(pagination, /function favLocalPagingKey0144\(\)/);
  assert.match(pagination, /return `\$\{favDatasetKey\(\)\}\|\$\{config\}`/);
  assert.match(pagination, /favState\.localPagingKey0144 !== key/);
  assert.match(pagination, /favState\.localPage = 1/);
  assert.match(pagination, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0144/);
});

test('final browser hardening never jumps backward to a historical renderer', () => {
  assert.doesNotMatch(hardening, /favRenderCurrent\s*=/);
  assert.doesNotMatch(hardening, /favRenderCurrentBefore0122/);
  assert.match(hardening, /favReapplyBefore0142/);
  assert.match(hardening, /favRequestedRenderSignature0143/);
  assert.match(hardening, /favState\.renderSignature0143 === favRequestedRenderSignature0143\(\)/);
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
