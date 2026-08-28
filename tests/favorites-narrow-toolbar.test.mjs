import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const narrow = await readFile(new URL('../src/93-favorites-narrow-toolbar.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('narrow toolbar module is loaded after the three audit layers', () => {
  const third = userscript.indexOf('/src/92-favorites-third-audit.js');
  const narrowIndex = userscript.indexOf('/src/93-favorites-narrow-toolbar.js');
  assert.ok(third >= 0 && narrowIndex > third);
});

test('stacked narrow header gives controls the full content width', () => {
  assert.match(narrow, /@media\(max-width:760px\)/);
  assert.match(narrow, /\.ebsf-scope-controls\{[\s\S]*grid-column:1 \/ -1!important;[\s\S]*justify-self:stretch!important;[\s\S]*width:100%!important;/);
  assert.match(narrow, /\.ebsf-scope-controls \.ebsf-toolbar-row\{[\s\S]*display:grid!important;[\s\S]*width:100%!important;/);
  assert.match(narrow, /justify-content:stretch!important/);
});

test('narrow controls use four columns and Search owns the flexible remainder', () => {
  assert.match(narrow, /grid-template-columns:auto minmax\(72px,\.75fr\) 40px minmax\(120px,1\.75fr\)!important/);
  assert.match(narrow, /\.ebsf-search-left-controls\{\s*display:contents!important;/);
  assert.match(narrow, /\.ebsf-native-search-slot\{[\s\S]*grid-column:4!important;[\s\S]*width:100%!important;[\s\S]*justify-self:stretch!important;/);
});

test('phone widths preserve all four controls while prioritizing Search', () => {
  assert.match(narrow, /@media\(max-width:520px\)/);
  assert.match(narrow, /grid-template-columns:40px minmax\(64px,\.65fr\) 40px minmax\(96px,1\.85fr\)!important/);
  assert.match(narrow, /\[data-ebsf-filter-label\]\{\s*display:none!important;/);
});
