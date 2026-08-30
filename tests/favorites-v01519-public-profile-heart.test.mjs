import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const runtimePath = resolve(ROOT, 'src/63-favorites-runtime.js');

async function removeFunctionSource() {
  const source = await readFile(runtimePath, 'utf8');
  const start = source.indexOf('function favRemoveLocalFavorite');
  const end = source.indexOf('function favNativeActionForOwnedCard0141', start);
  assert.ok(start >= 0 && end > start, 'favRemoveLocalFavorite source should be extractable');
  return { source, fn:source.slice(start, end) };
}

function makeContext(fnSource, ownProfile) {
  let persisted = 0;
  const record = { id:'X' };
  const context = vm.createContext({
    favIsOwnFavoritesPage:() => ownProfile,
    favState:{
      recordsById:new Map([['X', record]]),
      records:[record],
      total:1,
    },
    favIndexMarkUnfavorite() {
      persisted += 1;
      return Promise.resolve(true);
    },
  });
  vm.runInContext(fnSource, context);
  return { context, get persisted() { return persisted; } };
}

test('public-profile personal heart does not remove BetterSearch profile membership', async () => {
  const { fn } = await removeFunctionSource();
  const harness = makeContext(fn, false);

  assert.equal(harness.context.favRemoveLocalFavorite('X'), false);
  assert.equal(harness.context.favState.records.length, 1);
  assert.equal(harness.context.favState.recordsById.has('X'), true);
  assert.equal(harness.context.favState.total, 1);
  assert.equal(harness.persisted, 0);
});

test('own-profile confirmed removal still updates live catalogue and persistence', async () => {
  const { fn } = await removeFunctionSource();
  const harness = makeContext(fn, true);

  assert.equal(harness.context.favRemoveLocalFavorite('X'), true);
  assert.equal(harness.context.favState.records.length, 0);
  assert.equal(harness.context.favState.recordsById.has('X'), false);
  assert.equal(harness.context.favState.total, 0);
  assert.equal(harness.persisted, 1);
});

test('transplanted cards rerender only when profile membership was actually removed', async () => {
  const { source } = await removeFunctionSource();
  assert.match(
    source,
    /if\(!stillFavorited&&favRemoveLocalFavorite\(card\.dataset\.ebsfId\)\)favRenderCurrent\(\)/,
  );
  assert.match(
    source,
    /if\(!isFavoritedButton\(favorite\)&&favRemoveLocalFavorite\(card\.dataset\.ebsfId\)\)favRenderCurrent\(\)/,
  );
});
