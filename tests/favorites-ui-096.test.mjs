import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ROOT } from '../scripts/project.mjs';

const repairPath = resolve(ROOT, 'src/68-favorites-ui-repair.js');

test('v0.9.6 preserves the native Favorites search width on desktop', async () => {
  const source = await readFile(repairPath, 'utf8');
  assert.match(source, /favRepairToolbarLayout/);
  assert.match(source, /nativeWidth \+ controlsWidth \+ gap/);
  assert.match(source, /margin-left/);
  assert.match(source, /0 0 \$\{nativeWidth\}px/);
});

test('v0.9.6 sort menu is a stable top-level portal with whole-row selection', async () => {
  const source = await readFile(repairPath, 'utf8');
  assert.match(source, /document\.body\.append\(menu\)/);
  assert.match(source, /z-index:2147483646/);
  assert.match(source, /ebsf-sort-row\.is-selected/);
  assert.match(source, /root\.__ebsfSortMenu = menu/);
  assert.match(source, /favOpenSortMenu\(root\)/);
});

test('v0.9.6 settings order is Favorites data, Deep listing metadata, Automatic sync', async () => {
  const source = await readFile(repairPath, 'utf8');
  const favorites = source.indexOf('<h3>Favorites data</h3>');
  const deep = source.indexOf('<h3>Deep listing metadata</h3>');
  const automatic = source.indexOf('<h3>Automatic sync</h3>');
  assert.ok(favorites >= 0);
  assert.ok(deep > favorites);
  assert.ok(automatic > deep);
  assert.match(source, /Favorites &amp; shops coverage/);
  assert.match(source, /Last favorites sync/);
  assert.match(source, /ebsf-single-action/);
});

test('v0.9.6 repair loads after previous Favorites polish and before runtime', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const polish = userscript.indexOf('src/66-favorites-settings-sort-polish.js');
  const activation = userscript.indexOf('src/67-favorites-sort-activation.js');
  const repair = userscript.indexOf('src/68-favorites-ui-repair.js');
  const runtime = userscript.indexOf('src/63-favorites-runtime.js');
  assert.ok(polish >= 0);
  assert.ok(activation > polish);
  assert.ok(repair > activation);
  assert.ok(runtime > repair);
  assert.match(userscript, /@version\s+0\.9\.6/);
});
