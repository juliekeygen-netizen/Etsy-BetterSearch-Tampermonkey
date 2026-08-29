import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const cache = await readFile(new URL('../src/61e-favorites-cache-bootstrap.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');

test('cache bootstrap loads after index/sync and before later Favorites runtime modules', () => {
  const index = userscript.indexOf('/src/61a-favorites-index.js');
  const sync = userscript.indexOf('/src/61b-favorites-sync.js');
  const cacheIndex = userscript.indexOf('/src/61e-favorites-cache-bootstrap.js');
  const deep = userscript.indexOf('/src/61c-favorites-deep-parser.js');
  const runtimeIndex = userscript.indexOf('/src/63-favorites-runtime.js');
  assert.ok(index >= 0 && sync > index && cacheIndex > sync && deep > cacheIndex && runtimeIndex > deep);
  assert.match(userscript, /^\/\/ @version\s+\d+\.\d+\.\d+$/m);
});

test('route classification uses dataset and view keys rather than raw href', () => {
  assert.match(runtime, /function favViewKey0137\(\)/);
  assert.match(runtime, /return `\$\{favScopeKey\(\)\}\|page:\$\{favRequestedRoutePage0137\(\)\}`/);
  assert.match(runtime, /const datasetKey=favDatasetKey\(\)/);
  assert.match(runtime, /const viewKey=favViewKey0137\(\)/);
  assert.match(runtime, /lastDatasetKey0137!==datasetKey/);
  assert.match(runtime, /lastViewKey0137!==viewKey/);
  assert.doesNotMatch(runtime, /lastHref!==location\.href\|\|favState\.lastScopeKey/);
});

test('dataset changes retain the full reset while view-only changes avoid catalogue destruction', () => {
  const datasetReset = runtime.slice(
    runtime.indexOf('function favResetForDatasetChange0137'),
    runtime.indexOf('function favResetForNativeChange')
  );
  const viewRefresh = runtime.slice(
    runtime.indexOf('function favRefreshForViewChange0137'),
    runtime.indexOf('function favScheduleSync')
  );
  assert.match(datasetReset, /favState\.controller\?\.abort\(\)/);
  assert.match(datasetReset, /favState\.records=\[\]/);
  assert.match(datasetReset, /favState\.loadKey=''/);
  assert.doesNotMatch(viewRefresh, /controller\?\.abort|records=\[\]|loadKey=''|loadComplete=false/);
  assert.match(viewRefresh, /favState\.loadKey===requestKey&&favState\.loadComplete/);
  assert.match(viewRefresh, /void favReapply\(\)/);
});

test('harmless href-only changes do not trigger reset or data reload', () => {
  const schedule = runtime.slice(runtime.indexOf('function favScheduleSync'), runtime.indexOf('function favScheduleCurrentPageObservation'));
  assert.match(schedule, /if\(datasetChanged\)\{favResetForDatasetChange0137\(\);return;\}/);
  assert.match(schedule, /if\(viewChanged\)\{favRefreshForViewChange0137\(\);return;\}/);
  const unchangedTail = schedule.slice(schedule.indexOf('if(viewChanged)'));
  assert.match(unchangedTail, /favEnsureToolbar\(\);favBindNativeSearch\(\);/);
  assert.doesNotMatch(unchangedTail, /favResetForDatasetChange0137\(\).*favResetForDatasetChange0137\(\)|favRefreshRouteData\(\)|favLoadAll\(/s);
});

test('complete IndexedDB scope is materialized before the network loader', () => {
  assert.match(cache, /if \(!scopeRecord\?\.complete\) return null/);
  assert.match(cache, /scopeRecord\.listingIds/);
  assert.match(cache, /function favCacheMaterializeScope0137/);
  assert.match(cache, /favState\.loadSource0137 = 'cache'/);
  assert.match(cache, /favState\.loadComplete = true/);
  const wrapper = cache.slice(cache.indexOf('favLoadAll = async function favLoadAllCacheFirst0137'));
  assert.match(wrapper, /await favPrimeDatasetFromCache0137\(\)/);
  assert.match(wrapper, /favLoadAllNetwork0137\(force\)/);
  assert.ok(wrapper.indexOf('favPrimeDatasetFromCache0137') < wrapper.indexOf('favLoadAllNetwork0137'));
});

test('cache persistence keeps a compact presentation snapshot without storing card HTML', () => {
  assert.match(cache, /presentationSnapshot/);
  assert.match(cache, /imageUrl:String\(record\?\.imageUrl \|\| ''\)/);
  assert.match(cache, /priceFormatted:String\(record\?\.priceFormatted \|\| ''\)/);
  assert.match(cache, /shopName:String\(record\?\.shopName \|\| ''\)/);
  const presentation = cache.slice(
    cache.indexOf('function favCachePresentationFromRecord0137'),
    cache.indexOf('function favCacheMergePresentation0137')
  );
  assert.doesNotMatch(presentation, /outerHTML|html:/);
});

test('cached catalogue remains interactive while stale auto-sync runs in background', () => {
  const refresh = runtime.slice(runtime.indexOf('async function favRefreshRouteData'), runtime.indexOf('function favRemoveLocalFavorite'));
  assert.match(refresh, /await favPrimeDatasetFromCache0137\?\.\(\)/);
  assert.match(refresh, /if\(favEnhancementActive\(\)\)await favReapply\(\)/);
  assert.match(refresh, /void Promise\.resolve\(favMaybeAutoSync\(false\)\)/);
  assert.doesNotMatch(refresh, /await favMaybeAutoSync\(false\)/);
  assert.doesNotMatch(runtime, /favSyncState\.status===['"]running['"].*await favSyncState\.promise/s);
});

test('cache restores indexed metadata required by existing filters', () => {
  assert.match(cache, /shipping:favCacheKnown0137\(shipping, 'cost'\)/);
  assert.match(cache, /acceptsReturns:favCacheKnown0137\(shipping, 'returnsAccepted'\)/);
  assert.match(cache, /acceptsExchanges:favCacheKnown0137\(shipping, 'exchangesAccepted'\)/);
  assert.match(cache, /carts:favCacheKnown0137\(urgency, 'carts'\)/);
  assert.match(cache, /stockLeft:favCacheKnown0137\(urgency, 'stockLeft'\)/);
  assert.match(cache, /favIndexApplyListingMetadataToRecord\(record, indexed\)/);
});
