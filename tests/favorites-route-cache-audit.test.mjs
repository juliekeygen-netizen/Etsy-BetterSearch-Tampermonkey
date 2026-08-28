import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cache = await readFile(new URL('../src/61e-favorites-cache-bootstrap.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');

test('re-entering Favorites refreshes even when the previous dataset key is unchanged', () => {
  assert.match(runtime, /wasFavoritesPage0137/);
  assert.match(runtime, /reentered=!favState\.wasFavoritesPage0137/);
  assert.match(runtime, /if\(reentered\)\{favRefreshAfterReentry0137\(\);return;\}/);
  const block = runtime.slice(runtime.indexOf('function favRefreshAfterReentry0137'), runtime.indexOf('function favScheduleSync'));
  assert.match(block, /favClearNativeViewCapture0137\(\)/);
  assert.match(block, /favCaptureNativeGrid\(\)/);
  assert.match(block, /favRefreshRouteData\(\)/);
});

test('view changes wait for settled Etsy DOM before refreshing the native snapshot', () => {
  const block = runtime.slice(runtime.indexOf('function favRefreshForViewChange0137'), runtime.indexOf('function favRefreshAfterReentry0137'));
  assert.match(block, /nativeCaptureViewKey0137=''/);
  assert.match(block, /favScheduleCurrentPageObservation\(350\)/);
  assert.doesNotMatch(block, /favIndexObserveCurrentPage\(\)\.catch/);
  assert.match(runtime, /function favMaybeCaptureSettledNativePage0137\(\)/);
  assert.match(runtime, /!node\.hasAttribute\('data-ebsf-id'\)/);
  assert.match(runtime, /recaptured=favMaybeCaptureSettledNativePage0137\(\)/);
});

test('cache scope read avoids whole-database bulk scans', () => {
  const block = cache.slice(cache.indexOf('async function favCacheReadScope0137'), cache.indexOf('function favCacheRecordFromIndexed0137'));
  assert.match(block, /objectStore\('scopes'\)\.get\(scopeKey\)/);
  assert.match(block, /listingStore\.get\(idValue\)/);
  assert.match(block, /shopStore\.get\(shopId\)/);
  assert.doesNotMatch(block, /\.getAll\(\)/);
  assert.match(block, /listings\.some\(\(listing\) => !listing\)/);
});

test('legacy complete cache never becomes an image-less enhanced-grid source', () => {
  assert.match(cache, /function favCachePresentationReadyForScope0137/);
  assert.match(cache, /presentationSnapshot\?\.version/);
  assert.match(cache, /cachePresentationReady0137 = favCachePresentationReadyForScope0137\(snapshot\)/);
  const wrapper = cache.slice(cache.indexOf('favLoadAll = async function favLoadAllCacheFirst0137'));
  assert.match(wrapper, /loadSource0137 !== 'cache' \|\| favState\.cachePresentationReady0137/);
  assert.match(wrapper, /primed && favState\.cachePresentationReady0137/);
  assert.match(wrapper, /favLoadAllNetwork0137\(force\)/);
});
