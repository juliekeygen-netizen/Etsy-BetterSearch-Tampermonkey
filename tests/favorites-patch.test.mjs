import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

test('Favorites sync progress uses compact one-line wording', async () => {
  const source = await readFile(resolve(ROOT, 'src/61b-favorites-sync.js'), 'utf8');
  const start = source.indexOf('function favSyncProgressModel');
  const end = source.indexOf('function favSyncSetState');
  const context = vm.createContext({});
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.model=favSyncProgressModel({processed:20,expectedTotal:61,pagesProcessed:1,estimatedRemainingMs:5000});`, context);
  assert.equal(context.model.title, 'Syncing');
  assert.match(context.model.detail, /^20 \/ 61/);
  assert.match(context.model.detail, /pages left/);
  assert.match(context.model.detail, /~5s/);
  assert.doesNotMatch(context.model.title + context.model.detail, /\n/);
  assert.doesNotMatch(context.model.title, /favorites/i);
});

test('Favorites UI fix module restores active drawers and guards modal scrolling', async () => {
  const source = await readFile(resolve(ROOT, 'src/66-favorites-ui-fixes.js'), 'utf8');
  assert.match(source, /favState\.openSections = favActiveSectionKeys\(favCfg\)/);
  assert.match(source, /if \(!button \|\| favState\.filterOpen\) return;/);
  assert.match(source, /ebsf-settings-modal > \.ebs-modal-editor/);
  assert.match(source, /overflow-y: auto !important/);
  assert.match(source, /overscroll-behavior: contain !important/);
  assert.match(source, /event\.preventDefault\(\)/);
});

test('Favorites toolbar keeps native search width on desktop and shrinks only at narrower widths', async () => {
  const source = await readFile(resolve(ROOT, 'src/66-favorites-ui-fixes.js'), 'utf8');
  assert.match(source, /right: calc\(100% \+ 10px\) !important/);
  assert.match(source, /@media \(max-width: 1100px\)/);
  assert.match(source, /flex-wrap: nowrap !important/);
  assert.match(source, /min-width: 150px !important/);
  assert.match(source, /@media \(max-width: 620px\)/);
});

test('v0.9.2 loads the UI fixes before the Favorites runtime in every build', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  assert.match(userscript, /@version\s+0\.9\.2/);
  assert.equal(pkg.version, '0.9.2');
  const fixes = userscript.indexOf('/src/66-favorites-ui-fixes.js?v=0.9.2');
  const runtime = userscript.indexOf('/src/63-favorites-runtime.js?v=0.9.2');
  assert.ok(fixes >= 0 && runtime > fixes);
});
