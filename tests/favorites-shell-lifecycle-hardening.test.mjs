import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const source = () => readFile(resolve(ROOT, 'src/89-favorites-shell-lifecycle-hardening.js'), 'utf8');

test('lifecycle hardening discards a stale rail host after Etsy replaces its parent', async () => {
  const text = await source();
  assert.match(text, /host\.parentElement !== parent/);
  assert.match(text, /host\.remove\(\)/);
  assert.match(text, /favShellRailHostBefore0124\(create\)/);
});

test('lifecycle hardening rebuilds an empty or partial filter rail', async () => {
  const text = await source();
  assert.match(text, /!rail\.querySelector\('\.ebsf-rail-header'\)/);
  assert.match(text, /!rail\.querySelector\('\.ebsf-section'\)/);
  assert.match(text, /favShellEnsureStableRailBefore0124\(true\)/);
});

test('mobile restore clears desktop shell classes and native hidden state', async () => {
  const text = await source();
  assert.match(text, /favShellRestoreMobile0120 = function favShellRestoreMobile0124/);
  assert.match(text, /classList\.remove\('ebsf-sidebar-active', 'ebsf-shell-sidebar'\)/);
  assert.match(text, /delete sidebar\.dataset\.ebsfNativeSidebarHidden/);
});

test('hardened repair replaces observer and captured event callback references', async () => {
  const text = await source();
  assert.match(text, /favShellStableObserver0123\?\.disconnect/);
  assert.match(text, /removeEventListener\('ebsf:favorites-sync-state', favShellStableRepairBefore0124\)/);
  assert.match(text, /new MutationObserver\(favShellStableRepair0123\)/);
  assert.match(text, /addEventListener\('ebsf:favorites-sync-state', favShellStableRepair0123\)/);
});
