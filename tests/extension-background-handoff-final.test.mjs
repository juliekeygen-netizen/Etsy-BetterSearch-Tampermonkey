import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(new URL('../extension/background-worker.js', import.meta.url), 'utf8');
const workerFinal = await readFile(new URL('../extension/background-worker-final.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../extension/content-bridge.js', import.meta.url), 'utf8');
const bridgeFinal = await readFile(new URL('../extension/content-bridge-final.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

function executableSource(source) {
  return source.replace(/^\s*\/\/.*$/gm, '');
}

test('final raw-listing handoff merge never treats import wall-clock time as Favorite evidence', () => {
  for (const source of [workerFinal, bridgeFinal]) {
    const start = source.indexOf('function ebs');
    assert.ok(start >= 0);
    const mergeArea = source.slice(start, source.indexOf('return merged;', start) + 'return merged;'.length);
    assert.match(mergeArea, /lastSeenFavoriteAt/);
    assert.match(mergeArea, /lastCardRefreshAt/);
    assert.match(mergeArea, /favoriteScopes/);
    assert.doesNotMatch(executableSource(mergeArea), /Date\.now\(\)/);
  }

  // The older bodies may still exist for readable history, but the final owners
  // must be loaded afterward in both generated contexts.
  const workerBase = build.indexOf('${backgroundWorker.trim()}');
  const workerFence = build.indexOf('${backgroundWorkerFinal.trim()}');
  const coordinator = build.indexOf('${backgroundCoordinator.trim()}');
  assert.ok(workerBase >= 0 && workerFence > workerBase && coordinator > workerFence);

  const bridgeBase = build.indexOf('${contentBridge.trim()}');
  const bridgeFence = build.indexOf('${contentBridgeFinal.trim()}');
  assert.ok(bridgeBase >= 0 && bridgeFence > bridgeBase);
});

test('background-to-page chunk export is acknowledged only if the worker generation stayed stable', () => {
  assert.match(bridgeFinal, /const before = await ebsContentMessage\(\{ type:'maintenance-get-state' \}\)/);
  assert.match(bridgeFinal, /await ebsContentPullBackgroundSnapshot\(\)/);
  assert.match(bridgeFinal, /const after = await ebsContentMessage\(\{ type:'maintenance-get-state' \}\)/);
  assert.match(bridgeFinal, /afterAt !== beforeAt/);
  assert.match(bridgeFinal, /ebsContentBackgroundActive\(after\)/);
  assert.match(bridgeFinal, /maintenance-page-import-complete/);
  assert.match(bridgeFinal, /throughAt:beforeAt/);
  const refresh = bridgeFinal.indexOf('await ebsContentRefreshFromImportedIndex()');
  const afterCheck = bridgeFinal.indexOf('afterAt !== beforeAt');
  assert.ok(refresh > afterCheck, 'mixed generations must not be rendered before stability is rechecked');
});

test('background immutable snapshot keeps pending membership separate from committed membership', () => {
  assert.match(worker, /listingIds:committedIds/);
  assert.match(worker, /pendingListingIds:Array\.from\(new Set\(\(state\.observedIds/);
  assert.match(worker, /listingIds:observedIds/);
  assert.match(worker, /pendingListingIds:\[\]/);
  assert.match(worker, /lastSyncState:'completed'/);
});