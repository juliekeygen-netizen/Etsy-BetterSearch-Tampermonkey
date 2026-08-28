import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cache = await readFile(new URL('../src/61e-favorites-cache-bootstrap.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');
const correction = await readFile(new URL('../src/99-favorites-v0131-correctness.js', import.meta.url), 'utf8');

test('re-entering Favorites refreshes even when the previous dataset key is unchanged', () => {
  assert.match(runtime, /wasFavoritesPage0137/);
  assert.match(runtime, /reentered=!favState\.wasFavoritesPage0137/);
  assert.match(runtime, /if\(reentered\)\{favRefreshAfterReentry0137\(\);return;\}/);
  const block = runtime.slice(runtime.indexOf('function favRefreshAfterReentry0137'), runtime.indexOf('function favScheduleSync'));
  assert.match(block, /favClearNativeViewCapture0137\(\)/);
  assert.match(block, /favCaptureNativeGrid\(\)/);
  assert.match(block, /favRefreshRouteData\(\)/);
});

test('final view-change layer waits for settled Etsy DOM before cached enhanced rendering', () => {
  const block = correction.slice(
    correction.indexOf('favRefreshForViewChange0137 = function favRefreshForViewChange0140'),
    correction.indexOf('favScheduleCurrentPageObservation = function favScheduleCurrentPageObservation0140')
  );
  assert.match(block, /nativeCaptureViewKey0137 = ''/);
  assert.match(block, /favScheduleCurrentPageObservation\(350\)/);
  assert.match(block, /FAV_VIEW_NATIVE_SETTLE_FALLBACK_MS0140/);
  assert.match(correction, /favMaybeCaptureSettledNativePage0137\(\)/);
});

test('cache scope read avoids whole-database bulk scans', () => {
  const block = cache.slice(cache.indexOf('async function favCacheReadScope0137'), cache.indexOf('function favCacheRecordFromIndexed0137'));
  assert.match(block, /objectStore\('scopes'\)\.get\(scopeKey\)/);
  assert.match(block, /listingStore\.get\(idValue\)/);
  assert.match(block, /shopStore\.get\(shopId\)/);
  assert.doesNotMatch(block, /\.getAll\(\)/);
  assert.match(block, /listings\.some\(\(listing\) => !listing\)/);
});

test('final cache migration requires renderable presentation and forces the real network loader', () => {
  assert.match(correction, /function favIndexedPresentationRenderable0140/);
  assert.match(correction, /presentation\.imageUrl/);
  assert.match(correction, /presentation\.secondaryImageUrl/);
  assert.match(correction, /favLoadAllNetwork0137\(true\)/);
  assert.match(correction, /presentationMigrationPromise0140/);
  assert.doesNotMatch(
    correction.slice(correction.indexOf('async function favRunPresentationMigration0140'), correction.indexOf('var favCommittedNativeQueryBefore0140')),
    /favLoadAllNetwork0137\(false\)/
  );
});

test('complete index reconciliation reads only prior scope ids plus incoming patches', () => {
  const block = correction.slice(
    correction.indexOf('favIndexReadObservation = async function favIndexReadObservation0140'),
    correction.indexOf('function favRecordPresentationRenderable0140')
  );
  assert.match(block, /scope\?\.listingIds/);
  assert.match(block, /patchIds/);
  assert.match(block, /listingStore\.get\(idValue\)/);
  assert.doesNotMatch(block, /getAll\(/);
});
