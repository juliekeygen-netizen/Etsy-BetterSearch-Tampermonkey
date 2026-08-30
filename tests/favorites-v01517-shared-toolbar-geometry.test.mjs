import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const sourcePath = resolve(ROOT, 'src/97-favorites-all-native-header.js');

function makeStyle(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getPropertyValue(property) {
      return values.get(property) || '';
    },
    setProperty(property, value) {
      writes.push(['set', property, String(value)]);
      values.set(property, String(value));
    },
    removeProperty(property) {
      writes.push(['remove', property]);
      const old = values.get(property) || '';
      values.delete(property);
      return old;
    },
  };
}

async function geometryBlock() {
  const source = await readFile(sourcePath, 'utf8');
  const start = source.indexOf('function favSetSharedToolbarStyle01517');
  const end = source.indexOf('/* Module 94 owns the route/resize hooks', start);
  assert.ok(start >= 0 && end > start, 'shared toolbar geometry block must remain discoverable');
  return source.slice(start, end);
}

test('module 97 shared toolbar writer is compare-before-write', async () => {
  const block = await geometryBlock();
  assert.match(block, /getPropertyValue\(property\) === text/);
  assert.match(block, /favSetSharedToolbarStyle01517\(document\.documentElement/);
  assert.match(block, /favSetSharedToolbarStyle01517\(row/);
  assert.match(block, /favRemoveSharedToolbarStyle01517\(row/);
});

test('shared toolbar geometry emits no writes for an unchanged desktop reconcile', async () => {
  const block = await geometryBlock();
  const rootStyle = makeStyle({ '--ebsf-sort-trigger-width': '172px' });
  const rowStyle = makeStyle();
  const documentStyle = makeStyle();
  const sizes = { header: 800, row: 600 };

  const header = {
    getBoundingClientRect: () => ({ width: sizes.header }),
  };
  const row = {
    style: rowStyle,
    closest: (selector) => selector === '#collections-landing-phase-3-header-container' ? header : null,
    getBoundingClientRect: () => ({ width: sizes.row }),
  };
  const root = {
    style: rootStyle,
    closest: (selector) => selector === '[data-ebsf-toolbar-row]' ? row : null,
  };

  const context = vm.createContext({
    favState: { sortRoot: root },
    favMeasureSortTrigger: () => {},
    FAV_SHARED_SEARCH_RATIO0134: 0.5,
    innerWidth: 1200,
    document: {
      documentElement: { style: documentStyle },
      querySelector: () => null,
    },
  });
  vm.runInContext(`${block}\nglobalThis.testApi={run:favSharedToolbarGeometry0134};`, context);

  context.testApi.run();
  assert.deepEqual(documentStyle.writes, [
    ['set', '--ebsf-shared-sort-width0134', '172px'],
  ]);
  assert.deepEqual(rowStyle.writes, [
    ['set', '--ebsf-narrow-sort-width', '172px'],
    ['set', '--ebsf-shared-search-width0134', '376px'],
  ]);

  documentStyle.writes.length = 0;
  rowStyle.writes.length = 0;
  context.testApi.run();
  assert.deepEqual(documentStyle.writes, []);
  assert.deepEqual(rowStyle.writes, []);

  sizes.row = 620;
  context.testApi.run();
  assert.deepEqual(documentStyle.writes, []);
  assert.deepEqual(rowStyle.writes, [
    ['set', '--ebsf-shared-search-width0134', '396px'],
  ]);
});

test('shared toolbar mobile cleanup removes search width once then becomes a no-op', async () => {
  const block = await geometryBlock();
  const rootStyle = makeStyle({ '--ebsf-sort-trigger-width': '172px' });
  const rowStyle = makeStyle({ '--ebsf-shared-search-width0134': '376px' });
  const documentStyle = makeStyle();
  const header = { getBoundingClientRect: () => ({ width: 800 }) };
  const row = {
    style: rowStyle,
    closest: (selector) => selector === '#collections-landing-phase-3-header-container' ? header : null,
    getBoundingClientRect: () => ({ width: 600 }),
  };
  const root = {
    style: rootStyle,
    closest: (selector) => selector === '[data-ebsf-toolbar-row]' ? row : null,
  };

  const context = vm.createContext({
    favState: { sortRoot: root },
    favMeasureSortTrigger: () => {},
    FAV_SHARED_SEARCH_RATIO0134: 0.5,
    innerWidth: 720,
    document: {
      documentElement: { style: documentStyle },
      querySelector: () => null,
    },
  });
  vm.runInContext(`${block}\nglobalThis.testApi={run:favSharedToolbarGeometry0134};`, context);

  context.testApi.run();
  assert.deepEqual(rowStyle.writes, [
    ['set', '--ebsf-narrow-sort-width', '172px'],
    ['remove', '--ebsf-shared-search-width0134'],
  ]);

  rowStyle.writes.length = 0;
  documentStyle.writes.length = 0;
  context.testApi.run();
  assert.deepEqual(rowStyle.writes, []);
  assert.deepEqual(documentStyle.writes, []);
});
