import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const source = () => readFile(resolve(ROOT, 'src/88-favorites-shell-stability.js'), 'utf8');

test('stable shell owns a separate desktop rail host and hides Etsy native sidebar wholesale', async () => {
  const text = await source();
  assert.match(text, /data-ebsf-shell-rail-host/);
  assert.match(text, /data-ebsf-native-sidebar-hidden/);
  assert.match(text, /favShellEnsureStableRail0123/);
  assert.match(text, /favBuildFilterRail\(\)/);
  assert.match(text, /display:none!important/);
});

test('stable shell uses the known native Shops row instead of cloning arbitrary shop content', async () => {
  const text = await source();
  assert.match(text, /sidebar__link wt-text-body-small wt-display-flex-xs/);
  assert.match(text, /M12 2C15\.115 2 17\.589 2\.32/);
  assert.match(text, /document\.createTextNode\('Shops'\)/);
  assert.doesNotMatch(text, /cloneNode\(true\).*tab=shops/);
});

test('collection selector capture handler navigates before Etsy handlers and distinguishes drag from click', async () => {
  const text = await source();
  assert.match(text, /addEventListener\('click',[\s\S]*true\)/);
  assert.match(text, /stopImmediatePropagation/);
  assert.match(text, /window\.location\.href = link\.href/);
  assert.match(text, /suppressClickUntil/);
  assert.match(text, /Math\.abs\(dx\) > 6/);
});

test('create collection delegates to Etsy native add-collection control after clearing hidden and inert ancestors', async () => {
  const text = await source();
  assert.match(text, /data-testid=\\"add-collection-button\\"|data-testid="add-collection-button"/);
  assert.match(text, /favShellTemporarilyEnableAncestors0123/);
  assert.match(text, /current\.hidden = false/);
  assert.match(text, /current\.inert = false/);
  assert.match(text, /button\.click\(\)/);
});

test('toolbar sync progress is removed from the reconstructed Favorites shell', async () => {
  const text = await source();
  assert.match(text, /favShellSuppressToolbarProgress0123/);
  assert.match(text, /\.ebsf-sync-progress/);
  assert.match(text, /ebsf-native-search-sync-hidden/);
  assert.match(text, /visibility:visible!important/);
});
