import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

test('Favorites shell foundation uses real collection props and preserves native controls', async () => {
  const source = await readFile(resolve(ROOT, 'src/85-favorites-shell-foundation.js'), 'utf8');
  assert.match(source, /collectionsTabs/);
  assert.match(source, /__type.*collection/);
  assert.match(source, /data-ebsf-native-sidebar-source/);
  assert.match(source, /add-collection-button/);
  assert.match(source, /tab=items/);
  assert.match(source, /tab=shops/);
  assert.match(source, /expanded-updates-module-header/);
});

test('Favorites shell makes desktop filters permanent but preserves the mobile overlay path', async () => {
  const source = await readFile(resolve(ROOT, 'src/85-favorites-shell-foundation.js'), 'utf8');
  assert.match(source, /FAV_SHELL_DESKTOP_MIN0120 = 900/);
  assert.match(source, /favShellEnsureDesktopRail0120/);
  assert.match(source, /favOpenFiltersBefore0120/);
  assert.match(source, /favToggleFilters0120/);
  assert.match(source, /button\.hidden=desktop/);
  assert.match(source, /aria-hidden/);
  assert.match(source, /heading\.replaceWith/);
});

test('Favorites collection strip supports mouse drag, wheel, touch scrolling, and keyboard navigation', async () => {
  const source = await readFile(resolve(ROOT, 'src/85-favorites-shell-foundation.js'), 'utf8');
  for (const token of ['pointerdown', 'pointermove', 'wheel', 'touch-action:pan-x', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
