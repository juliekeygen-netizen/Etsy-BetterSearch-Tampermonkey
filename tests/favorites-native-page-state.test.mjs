import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const adapter = await readFile(new URL('../src/95a-favorites-native-page-state.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');
const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function executeAdapterFixture({ selectedPage = 1, url = 'https://www.etsy.com/people/test?tab=items' } = {}) {
  let selectedText = String(selectedPage);
  let pagerMounted = true;
  let clickHandler = null;
  let popstateHandler = null;
  const selectedButton = { textContent: selectedText };
  const pager = {
    isConnected: true,
    getClientRects: () => [{}],
    querySelector: () => selectedButton,
  };
  const context = {
    favState: { localPage: 1, localPageRouteKey0129: '' },
    favRequestedRoutePage0137: () => 1,
    favViewKey0137: () => '',
    favPageRouteKey0129: () => '',
    favRequestedPage0129: () => 1,
    favScopeKey: () => 'owner|items||',
    isFavoritesPage: () => true,
    favScheduleSync: () => {},
    favScheduleCurrentPageObservation: () => {},
    document: {
      querySelectorAll: () => pagerMounted ? [pager] : [],
      addEventListener: (name, handler) => { if (name === 'click') clickHandler = handler; },
    },
    window: {
      addEventListener: (name, handler) => { if (name === 'popstate') popstateHandler = handler; },
    },
    location: { href: url },
    URL,
    Date,
    Number,
    String,
    Math,
    Array,
    setTimeout: () => 0,
    console,
  };
  vm.createContext(context);
  vm.runInContext(adapter, context);
  return {
    context,
    setSelectedPage(page) { selectedText = String(page); selectedButton.textContent = selectedText; },
    setPagerMounted(value) { pagerMounted = Boolean(value); },
    click(button) { clickHandler?.({ target: { closest: () => button } }); },
    popstate() { popstateHandler?.(); },
  };
}

test('native page-state adapter loads after local paging and before final UI/runtime release', () => {
  const runtimeIndex = userscript.indexOf('/src/63-favorites-runtime.js');
  const paginationIndex = userscript.indexOf('/src/95-favorites-responsive-pagination.js');
  const adapterIndex = userscript.indexOf('/src/95a-favorites-native-page-state.js');
  const parityIndex = userscript.indexOf('/src/96-favorites-exact-header-parity.js');
  assert.ok(runtimeIndex >= 0 && paginationIndex > runtimeIndex && adapterIndex > paginationIndex && parityIndex > adapterIndex);
});

test('Favorites page identity reads Etsy WtPagination button state before URL fallback', () => {
  assert.match(adapter, /nav\[aria-label="Favorite Items Page Results"\]/);
  assert.match(adapter, /button\[aria-current="true"\]/);
  assert.match(adapter, /button\.wt-is-selected/);
  assert.match(adapter, /function favNativeSelectedPage0139\(\)/);
  assert.match(adapter, /function favUrlPage0139\(\)/);
  const current = adapter.slice(
    adapter.indexOf('function favCurrentFavoritePage0139'),
    adapter.indexOf('favRequestedRoutePage0137 =')
  );
  assert.match(current, /favNativeSelectedPage0139\(\)/);
  assert.match(current, /favUrlPage0139\(\)/);
  assert.ok(current.indexOf('favNativeSelectedPage0139()') < current.indexOf('favUrlPage0139()'));
});

test('captured Etsy button state wins over a stale page query and changes from page 1 to 2 to 3', () => {
  const fixture = executeAdapterFixture({ selectedPage: 1, url: 'https://www.etsy.com/people/test?tab=items&page=1' });
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 1);
  fixture.setSelectedPage(2);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 2);
  fixture.setSelectedPage(3);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 3);
});

test('URL page remains a direct/history fallback when native WtPagination is not mounted yet', () => {
  const fixture = executeAdapterFixture({ selectedPage: 1, url: 'https://www.etsy.com/people/test?tab=items&page=4' });
  fixture.setPagerMounted(false);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 4);
});

test('runtime and 20-item renderer are rebound to the same native page identity', () => {
  assert.match(runtime, /function favViewKey0137\(\)/);
  assert.match(pagination, /function favSyncLocalPageFromRoute0129\(\)/);
  assert.match(adapter, /favRequestedRoutePage0137 = function favRequestedRoutePage0139/);
  assert.match(adapter, /favViewKey0137 = function favViewKey0139/);
  assert.match(adapter, /favPageRouteKey0129 = function favPageRouteKey0139/);
  assert.match(adapter, /favRequestedPage0129 = function favRequestedPage0139/);
  assert.match(adapter, /page:\$\{favCurrentFavoritePage0139\(\)\}/);
  assert.match(adapter, /favState\.localPageRouteKey0129 = ''/);
});

test('native pager clicks seed page intent but never hijack Etsy pagination', () => {
  assert.match(adapter, /document\.addEventListener\('click'/);
  assert.match(adapter, /favPagerButtonTargetPage0139\(button\)/);
  assert.match(adapter, /favSetNativePageIntent0139\(target\)/);
  assert.match(adapter, /favState\.localPage = target/);
  assert.match(adapter, /favScheduleSync\(0\)/);
  assert.match(adapter, /favScheduleCurrentPageObservation\(300\)/);
  assert.doesNotMatch(adapter, /preventDefault\(|stopPropagation\(|stopImmediatePropagation\(/);
  assert.doesNotMatch(adapter, /replaceChildren\(|createElement\(['"]nav['"]\)|\.remove\(\)/);
});

test('a numeric native page click immediately becomes the local view intent while Etsy owns the click', () => {
  const fixture = executeAdapterFixture({ selectedPage: 1 });
  const button = {
    textContent: '2',
    disabled: false,
    getAttribute: () => null,
    querySelector: () => null,
  };
  fixture.click(button);
  assert.equal(fixture.context.favState.localPage, 2);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 2);
});

test('Previous and Next button intents derive from Etsy current page', () => {
  const block = adapter.slice(
    adapter.indexOf('function favPagerButtonTargetPage0139'),
    adapter.indexOf('function favScheduleNativePageReconcile0139')
  );
  assert.match(block, /label === 'next'/);
  assert.match(block, /current \+ 1/);
  assert.match(block, /label === 'previous'/);
  assert.match(block, /Math\.max\(1, current - 1\)/);
  assert.match(block, /button\.disabled/);
  assert.match(block, /aria-disabled/);
});

test('page-only interaction cannot clear or redownload the complete catalogue', () => {
  assert.doesNotMatch(adapter, /favResetForDatasetChange0137\(/);
  assert.doesNotMatch(adapter, /favLoadAll\(/);
  assert.doesNotMatch(adapter, /controller\?\.abort|records\s*=\s*\[\]|loadComplete\s*=\s*false/);
  assert.match(adapter, /favState\.localPageRouteKey0129 = ''/);
});

test('history page navigation can seed the transient page intent before runtime classification', () => {
  assert.match(adapter, /window\.addEventListener\('popstate'/);
  assert.match(adapter, /const page = favUrlPage0139\(\)/);
  assert.match(adapter, /favSetNativePageIntent0139\(page\)/);
});
