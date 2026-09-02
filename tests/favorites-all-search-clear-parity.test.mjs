import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const parity = await readFile(new URL('../src/100-favorites-all-search-clear-parity.js', import.meta.url), 'utf8');

test('v0.13.2 clear-button parity layer remains after correctness and cache-busted across current releases', () => {
  const version = userscript.match(/^\/\/ @version\s+(\S+)/m)?.[1] || '';
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const p99 = userscript.indexOf(`/src/99-favorites-v0131-correctness.js?v=${version}`);
  const p100 = userscript.indexOf(`/src/100-favorites-all-search-clear-parity.js?v=${version}`);
  assert.ok(p99 >= 0 && p100 > p99);
  assert.doesNotMatch(userscript, /\?v=0\.13\.2/);
});

test('All copies collection Search form width semantics without touching collection routes', () => {
  assert.match(parity, /favScope\(\)\.type !== 'items'/);
  assert.match(parity, /\[data-ebsf-all-header\]/);
  assert.match(parity, /input\[placeholder="Search your favorites"\]/);
  assert.match(parity, /form\.dataset\.ebsfAllSearchForm/);
  assert.match(parity, /form\.closest\?\.\('\.wt-input-btn-group'\)/);
  assert.match(parity, /group\.dataset\.ebsfAllSearchGroup/);
  assert.match(parity, /flex:1 1 100%!important/);
  assert.match(parity, /width:100%!important/);
  assert.match(parity, /max-width:100%!important/);
  assert.match(parity, /min-width:0!important/);
  assert.doesNotMatch(parity, /Search within this collection/);
});

test('All reuses Etsy native Favorites clear-button geometry instead of inventing a replacement', () => {
  assert.match(parity, /form\[data-ebsf-all-search-form\] \.favorites-landing-search-clear-button/);
  assert.match(parity, /right:62px!important/);
  assert.match(parity, /left:auto!important/);
  assert.doesNotMatch(parity, /createElement\(['"]button['"]\)/);
  assert.doesNotMatch(parity, /innerHTML\s*=.*clear/i);
});

test('All tolerates Etsy either keeping or inserting its extra button-group wrapper', () => {
  assert.match(parity, /\.ebsf-native-search-slot \[data-ebsf-all-search-group\]/);
  assert.match(parity, /\.ebsf-native-search-slot form\[data-ebsf-all-search-form\]/);
  assert.doesNotMatch(parity, /\.ebsf-native-search-slot > form\[data-ebsf-all-search-form\]/);
});

test('clear parity self-heals after shell repair, typing, search clearing and resize', () => {
  assert.match(parity, /favInstallPageShell0120 = function favInstallPageShell0141/);
  for (const eventName of ['input', 'search', 'change']) {
    assert.ok(parity.includes(`'${eventName}'`));
  }
  assert.match(parity, /window\.addEventListener\('resize'/);
  assert.match(parity, /requestAnimationFrame\(favApplyAllSearchClearParity0141\)/);
});
