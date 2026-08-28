import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const polish = await readFile(new URL('../src/90-favorites-responsive-polish.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('responsive polish loads after the responsive shell module', () => {
  const responsive = userscript.indexOf('/src/89-favorites-responsive-shell.js');
  const polishIndex = userscript.indexOf('/src/90-favorites-responsive-polish.js');
  assert.ok(responsive >= 0 && polishIndex > responsive);
});

test('the entire collection strip is a drag surface without native text or link dragging', () => {
  assert.match(polish, /const strip = scroller\.closest\?\.\('\[data-ebsf-collection-strip\]'\)/);
  assert.match(polish, /strip\.addEventListener\('pointerdown'/);
  assert.match(polish, /strip\.addEventListener\('pointermove'/);
  assert.match(polish, /strip\.addEventListener\('pointerleave'/);
  assert.match(polish, /strip\.addEventListener\('dragstart', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(polish, /strip\.addEventListener\('selectstart', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(polish, /touch-action:pan-y!important/);
  assert.match(polish, /dataset\.ebsfScrollerRevision = '3'/);
  assert.match(polish, /if \(!suppressClick\) return;/);
});

test('scope metadata compacts before medium desktop controls run out of room', () => {
  assert.match(polish, /const compact = width > 0 && width < 1100/);
  assert.match(polish, /compact \? 'Private' : 'Private collection'/);
  assert.match(polish, /compact \? `\$\{total\} · \$\{shown\}` : `\$\{total\} favorites · \$\{shown\} shown`/);
  assert.match(polish, /@media\(min-width:760px\) and \(max-width:1440px\)/);
  assert.match(polish, /grid-template-columns:minmax\(150px,27%\) minmax\(0,1fr\)/);
});

test('narrow shell keeps copy and Filters Sort Settings Search in two rows', () => {
  assert.match(polish, /@media\(max-width:759px\)/);
  assert.match(polish, /\.ebsf-scope-copy\{[\s\S]*display:flex!important;[\s\S]*flex-wrap:nowrap!important;/);
  assert.match(polish, /\.ebsf-scope-controls \.ebsf-toolbar-row\{[\s\S]*flex-wrap:nowrap!important;/);
  assert.match(polish, /\.ebsf-scope-header \.ebsf-search-left-controls\{[\s\S]*flex:0 1 min\(276px,64%\)!important;/);
  assert.match(polish, /\.ebsf-scope-header \.ebsf-native-search-slot\{[\s\S]*flex:1 1 120px!important;/);
  assert.match(polish, /\.ebsf-scope-copy \[data-ebsf-scope-count\]\{[\s\S]*flex:0 1 auto!important;/);
});

test('very narrow shell can collapse Filters to its icon instead of wrapping', () => {
  assert.match(polish, /@media\(max-width:460px\)/);
  assert.match(polish, /\.ebsf-filter-button \[data-ebsf-filter-label\]\{[\s\S]*display:none!important;/);
});
