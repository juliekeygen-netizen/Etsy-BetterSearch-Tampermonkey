import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const index = await readFile(new URL('../src/61a-favorites-index.js', import.meta.url), 'utf8');

test('current-page collection observations require props that match the route collection', () => {
  const helper = index.slice(
    index.indexOf('function favIndexCollectionPropsMatchScope'),
    index.indexOf('function favIndexObserveCurrentPage'),
  );
  const observer = index.slice(
    index.indexOf('function favIndexObserveCurrentPage'),
    index.indexOf('async function favIndexMarkUnfavoriteNow'),
  );
  assert.match(helper, /scope\?\.type !== 'collection'/);
  assert.match(helper, /collection\.slug, collection\.key, props\.slug/);
  assert.match(helper, /return candidates\.includes\(expected\)/);
  assert.match(observer, /const scope = favIndexCurrentScope\(\)/);
  assert.match(observer, /if \(!favIndexCollectionPropsMatchScope\(scope, props\)\) return Promise\.resolve\(\[\]\)/);
  assert.match(observer, /favIndexObserveRecords\(records, \{ scope, complete: false \}\)/);
});

test('a stale collection payload cannot be treated as the route collection', () => {
  const helper = index.slice(
    index.indexOf('function favIndexCollectionPropsMatchScope'),
    index.indexOf('function favIndexObserveCurrentPage'),
  );
  const context = vm.createContext({ URL, String, Object, Array, globalThis:null, location:{ origin:'https://www.etsy.com' } });
  context.globalThis = context;
  vm.runInContext(`${helper}\nglobalThis.matchesScope = favIndexCollectionPropsMatchScope;`, context);

  const oldProps = { collection:{ slug:'old-collection', key:'old-collection', url:'/people/alice/favorites/old-collection' }, slug:'old-collection' };
  assert.equal(context.matchesScope({ type:'collection', id:'new-collection' }, oldProps), false);
  assert.equal(context.matchesScope({ type:'collection', id:'old-collection' }, oldProps), true);
  assert.equal(context.matchesScope({ type:'items', id:'' }, oldProps), true);
  assert.equal(context.matchesScope({ type:'collection', id:'new-collection' }, null), false);
});
