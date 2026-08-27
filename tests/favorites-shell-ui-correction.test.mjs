import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
async function source() { return readFile(resolve(ROOT, 'src/87-favorites-shell-ui-correction.js'), 'utf8'); }

test('collection metadata reuses Etsy native row rather than creating another row', async () => {
  const text = await source();
  assert.match(text, /data-test-id=\"collections-landing-right-side-header\"/);
  assert.match(text, /favShellWriteNativeCollectionCount0122/);
  assert.match(text, /favShellRemoveDuplicateCollectionMeta0122/);
  assert.match(text, /separator\.nextSibling/);
});

test('native sidebar rerenders stay hidden while permanent rail remains visible', async () => {
  const text = await source();
  assert.match(text, /sidebar.*ebsf-shell-sidebar/);
  assert.match(text, /:not\(\[data-ebsf-shell-rail\]\)/);
  assert.match(text, /> \[data-ebsf-shell-rail\]\{display:block!important/);
});

test('All and create collection are one grouped native-style control', async () => {
  const text = await source();
  assert.match(text, /ebsf-collection-home-group/);
  assert.match(text, /group\.append\(all, plus\)/);
  assert.match(text, /ebsf-collection-create/);
  assert.match(text, /border-left:1px solid var\(--ebsf-shell-border\)/);
  assert.match(text, /ebsf-shell-native-icon/);
});

test('custom collection links explicitly navigate and create delegates to native action', async () => {
  const text = await source();
  assert.match(text, /location\.assign\(link\.href\)/);
  assert.match(text, /data-testid=\"add-collection-button\"/);
  assert.match(text, /button\.click\(\)/);
  assert.match(text, /data-ebsf-native-action-host/);
});

test('Shops clones native Etsy navigation styling instead of inventing a tiny icon row', async () => {
  const text = await source();
  assert.match(text, /native\.cloneNode\(true\)/);
  assert.match(text, /ebsf-shell-shops/);
  assert.match(text, /width:20px!important/);
});
