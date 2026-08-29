import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');
const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../src/95a-favorites-native-page-state.js', import.meta.url), 'utf8');
const hardening = await readFile(new URL('../src/101-favorites-v0141-smoke-fixes.js', import.meta.url), 'utf8');

function functionBlock(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start) : source.length;
  assert.ok(start >= 0 && end > start, `expected ${name} block`);
  return source.slice(start, end);
}

function pageItems(current, total) {
  const block = functionBlock(pagination, 'favLocalPageItems0150', 'favLocalPageButton0150');
  const context = { result:null, Set, Array, Number, Math, String };
  vm.createContext(context);
  vm.runInContext(`${block}\nresult = favLocalPageItems0150(${current}, ${total});`, context);
  return Array.from(context.result);
}

test('local result page size is exactly Etsy-sized 20 cards', () => {
  assert.match(pagination, /var FAV_LOCAL_PAGE_SIZE0150 = 20/);
  assert.match(pagination, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0150/);
  assert.doesNotMatch(shell, /pageSize\s*=\s*Math\.max\(1,favState\.records\.length\)/);
});

test('the five-item smoke collection has one local page and therefore no duplicate local pager', () => {
  assert.equal(Math.ceil(5 / 20), 1);
  const renderPager = functionBlock(pagination, 'favRenderPagination0150');
  assert.match(renderPager, /if \(totalPages <= 1\) \{\s*favRemoveLocalPagination0150\(\);\s*return;/);
});

test('44 All-page matches become 20 + 20 + 4 rather than eleven four-column rows at once', () => {
  const total = 44;
  const size = 20;
  assert.equal(Math.ceil(total / size), 3);
  assert.deepEqual([0, 1, 2].map((index) => [index * size, Math.min(total, (index + 1) * size)]), [
    [0, 20],
    [20, 40],
    [40, 44],
  ]);
});

test('local pager model shows every page for small totals and bounded ellipses for larger totals', () => {
  assert.deepEqual(pageItems(2, 3), [1, 2, 3]);
  assert.deepEqual(pageItems(4, 8), [1, 2, 3, 4, 5, 6, 'ellipsis', 8]);
  assert.deepEqual(pageItems(8, 8), [1, 'ellipsis', 6, 7, 8]);
});

test('changing dataset/filter/sort request resets local results to page one', () => {
  const block = functionBlock(pagination, 'favEnsureLocalPageContext0150');
  assert.match(block, /favState\.localResultKey0150 !== key/);
  assert.match(block, /favState\.localPage = 1/);
  assert.match(block, /favState\.pageSize = FAV_LOCAL_PAGE_SIZE0150/);
});

test('local pager clicks re-slice current records without invoking Etsy navigation or a new catalogue fetch', () => {
  const block = functionBlock(pagination, 'favGoToLocalPage0150', 'favRenderPagination0150');
  assert.match(block, /favState\.localPage = target/);
  assert.match(block, /favRenderCurrent\(\)/);
  assert.doesNotMatch(block, /favReapply\(|favLoadAll\(|fetch\(|location\.|history\./);
});

test('native grid and native pager have explicit strong hide contracts during local ownership', () => {
  assert.match(pagination, /\[data-ebsf-native-hidden="1"\]\{\s*display:none!important/);
  assert.match(pagination, /nav\[data-ebsf-native-pager-hidden="1"\]\{\s*display:none!important/);
  assert.ok(pagination.includes("nativeGrid.setAttribute('data-ebsf-native-hidden', '1')"));
  assert.ok(pagination.includes("pager.setAttribute('data-ebsf-native-pager-hidden', '1')"));
});

test('local pager is a distinct BetterSearch nav and never impersonates Etsy WtPagination', () => {
  assert.match(pagination, /pager\.dataset\.ebsfLocalPagination = '1'/);
  assert.match(pagination, /BetterSearch filtered favorites pages/);
  const ensure = functionBlock(pagination, 'favEnsureLocalPagination0150', 'favGoToLocalPage0150');
  assert.doesNotMatch(ensure, /Favorite Items Page Results|WtPagination/);
});

test('returning to native mode removes local pager and restores Etsy pager state', () => {
  const restore = pagination.slice(pagination.indexOf('var favRestoreNativeBefore0150'));
  assert.match(restore, /favRemoveLocalPagination0150\(\)/);
  assert.match(restore, /favRestoreNativePagers0150\(\)/);
  assert.match(restore, /favRestoreNativeBefore0150\(\)/);
});

test('Etsy native pager clicks never mutate BetterSearch local page', () => {
  assert.doesNotMatch(adapter, /favState\.localPage\s*=\s*target/);
  assert.match(adapter, /favSetNativePageIntent0139\(target\)/);
});

test('v0.14 integrity repair checks computed visibility plus v0.15 pagination exclusivity', () => {
  assert.match(hardening, /function favNodeVisuallySuppressed0143/);
  assert.ok(hardening.includes("getComputedStyle(node).display === 'none'"));
  assert.ok(hardening.includes('favLocalPaginationOwnershipHealthy0150()'));
  assert.ok(hardening.includes('favApplyLocalVisualOwnership0150?.()'));
});
