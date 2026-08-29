import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const parity = await readFile(new URL('../src/96-favorites-exact-header-parity.js', import.meta.url), 'utf8');
const allHeader = await readFile(new URL('../src/97-favorites-all-native-header.js', import.meta.url), 'utf8');
const exactSearch = await readFile(new URL('../src/98-favorites-exact-search-width.js', import.meta.url), 'utf8');

test('architecture refactor leaves the final visual layers in their established order', () => {
  const p95 = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  const p96 = userscript.indexOf('/src/96-favorites-exact-header-parity.js');
  const p97 = userscript.indexOf('/src/97-favorites-all-native-header.js');
  const p98 = userscript.indexOf('/src/98-favorites-exact-search-width.js');
  assert.ok(p95 >= 0 && p96 > p95 && p97 > p96 && p98 > p97);
});

test('All keeps literal collection-header anatomy and invisible native button geometry', () => {
  assert.match(allHeader, /header\.id = 'collections-landing-phase-3-header-container'/);
  assert.match(allHeader, /title\.id = 'collections-landing-left-side-header-title'/);
  assert.match(allHeader, /title\.className = 'wt-text-title-large'/);
  assert.match(allHeader, /titleText\.textContent = 'All'/);
  assert.match(allHeader, /favAllTitleSpacerButton0133\('edit'\)/);
  assert.match(allHeader, /favAllTitleSpacerButton0133\('add'\)/);
  assert.match(allHeader, /visibility:hidden!important/);
  assert.match(allHeader, /pointer-events:none!important/);
  assert.match(allHeader, /tabIndex = -1/);
});

test('full collection metadata wording remains invariant with no compact mode', () => {
  assert.match(parity, /Private collection/);
  assert.match(parity, /\$\{total\} favorites · \$\{shown\} shown/);
  assert.match(parity, /classList\.remove\('ebsf-scope-meta-compact'\)/);
  assert.doesNotMatch(parity, /compact \? 'Private'/);
  assert.doesNotMatch(parity, /\$\{total\} · \$\{shown\}/);
});

test('Search keeps the exact v0.12.15 width and right-edge alignment contract', () => {
  assert.match(exactSearch, /FAV_EXACT_SEARCH_RATIO0135 = 0\.5/);
  assert.match(exactSearch, /FAV_EXACT_TOOLBAR_MAX_RATIO0135 = 0\.74/);
  assert.match(exactSearch, /favCollectionToolbarTarget0136/);
  assert.match(exactSearch, /const delta = targetRect\.right - rightRect\.right/);
  assert.match(exactSearch, /right\.style\.setProperty\('transform', `translateX\(\$\{rounded\}px\)`/);
  assert.match(exactSearch, /border-width:1px!important/);
  assert.match(exactSearch, /border-color:#222!important/);
  assert.match(exactSearch, /\['input','search','change'\]/);
});

test('loading status remains out of flow on the metadata baseline', () => {
  assert.match(allHeader, /favProgress = function favProgress0134/);
  assert.match(allHeader, /ebsf-progress-inline0134/);
  assert.match(allHeader, /position:absolute!important/);
  assert.match(allHeader, /metaRect\.top - headerRect\.top/);
  const finalProgress = allHeader.slice(allHeader.indexOf('favProgress = function favProgress0134'));
  assert.doesNotMatch(finalProgress, /section\.prepend\(node\)/);
});

test('native pagination visual contract stays Etsy-native while local page state stays separate', () => {
  assert.match(pagination, /function favPageRouteKey0129/);
  assert.match(pagination, /function favRequestedPage0129/);
  assert.match(pagination, /FAV_LOCAL_PAGE_SIZE0150 = 20/);
  assert.match(pagination, /favRenderPagination\s*=\s*function favRenderPagination0150/);
  assert.match(pagination, /pager\.dataset\.ebsfLocalPagination = '1'/);
  assert.match(pagination, /function favNativePagerTemplate0151/);
  assert.match(pagination, /data-clg-id.*WtPagination/);
  assert.match(pagination, /wt-action-group__item-container/);
  assert.match(pagination, /wt-btn.*wt-action-group__item/);
  assert.match(pagination, /dataset\.ebsfPaginationPresentation = 'etsy-native'/);
  assert.doesNotMatch(pagination, /BetterSearch filtered favorites pages|ebsf-local-page-button|ebsf-local-page-ellipsis/);
  assert.doesNotMatch(pagination, /favRenderCurrent\s*=/);
});
