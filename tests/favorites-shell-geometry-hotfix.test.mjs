import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

async function source() {
  return readFile(resolve(ROOT, 'src/86-favorites-shell-geometry-hotfix.js'), 'utf8');
}

test('shell hotfix puts collection selector in listing content above the whole content header', async () => {
  const text = await source();
  assert.match(text, /phase3-listing-cards-section/);
  assert.match(text, /collections-landing-phase-3-header-container/);
  assert.match(text, /data-ebsf-all-header/);
  assert.match(text, /content\.insertBefore\(strip,header\)/);
  assert.doesNotMatch(text, /toolbar\.before\(strip\)/);
});

test('shell hotfix moves All toolbar into a collection-style header and leaves collection toolbar in the right column', async () => {
  const text = await source();
  assert.match(text, /favShellAllHeader0121/);
  assert.match(text, /<h2 class="wt-text-title-large">All<\/h2>/);
  assert.match(text, /Private collection/);
  assert.match(text, /collections-landing-right-side-header-container/);
  assert.match(text, /right\.append\(toolbar\)/);
});

test('shell hotfix disables preserve-search negative geometry on desktop Favorites', async () => {
  const text = await source();
  assert.match(text, /remove\('ebsf-toolbar-preserve-search','ebsf-toolbar-compact'\)/);
  assert.match(text, /\['width','max-width','margin-left','transform','flex'\]/);
  assert.match(text, /favRepairToolbarLayout=function favRepairToolbarLayout0121/);
  assert.match(text, /margin-left:0!important/);
  assert.match(text, /transform:none!important/);
});

test('shell hotfix integrates result counts into collection metadata', async () => {
  const text = await source();
  assert.match(text, /favRenderCount=function favRenderCount0121/);
  assert.match(text, /favorites · \$\{shown\} shown/);
  assert.match(text, /\.ebsf-result-count/);
  assert.match(text, /favShellDiscardLegacyCount0121/);
});
