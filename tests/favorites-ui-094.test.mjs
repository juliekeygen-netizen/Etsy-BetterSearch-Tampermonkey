import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ROOT } from '../scripts/project.mjs';

test('Favorites sort polish uses a top-level portal and whole-row selection', async () => {
  const source = await readFile(resolve(ROOT, 'src/66-favorites-settings-sort-polish.js'), 'utf8');
  assert.match(source, /Etsy order reversed/);
  assert.match(source, /document\.body\.append\(menu\)/);
  assert.match(source, /z-index:2147483000/);
  assert.match(source, /\.ebsf-sort-row\.is-selected/);
  assert.doesNotMatch(source, /wt-options__item--checkable/);
});

test('Favorites settings expose pages, active-drawer preference, and sync intervals', async () => {
  const source = await readFile(resolve(ROOT, 'src/66-favorites-settings-sort-polish.js'), 'utf8');
  assert.match(source, /Data &amp; sync/);
  assert.match(source, /Preferences/);
  assert.match(source, /Favorites data/);
  assert.match(source, /Deep listing metadata/);
  assert.match(source, /data-ebsf-auto-open-active/);
  assert.match(source, /autoOpenActiveSections: source\.autoOpenActiveSections !== false/);
  assert.match(source, /\[1, 3, 6, 12, 24\]/);
  assert.match(source, /data-ebsf-auto-sync-interval/);
});

test('Favorites polish module loads before the Favorites runtime', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const polish = userscript.indexOf('src/66-favorites-settings-sort-polish.js');
  const runtime = userscript.indexOf('src/63-favorites-runtime.js');
  assert.ok(polish >= 0);
  assert.ok(runtime > polish);
});
