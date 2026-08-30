import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const adapter = await readFile(new URL('../src/95a-favorites-native-page-state.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');
const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function executeAdapterFixture({
  selectedPage = 1,
  localSelectedPage = 1,
  url = 'https://www.etsy.com/people/test?tab=items',
  includeLocalPager = false,
  localPagerFirst = false,
} = {}) {
  let selectedText = String(selectedPage);
  let localSelectedText = String(localSelectedPage);
  let pagerMounted = true;
  let localPagerMounted = includeLocalPager;
  let clickHandler = null;
  let popstateHandler = null;

  const nativeSelectedButton = { textContent: selectedText };
  const localSelectedButton = { textContent: localSelectedText };
  const nativePager = {
    isConnected: true,
    getClientRects: () => [{}],
    matches: (selector) => selector === '[data-ebsf-local-pagination]' ? false : false,
    querySelector: () => nativeSelectedButton,
  };
  const localPager = {
    isConnected: true,
    getClientRects: () => [{}],
    matches: (selector) => selector === '[data-ebsf-local-pagination]',
    querySelector: () => localSelectedButton,
  };

  const mountedPagers = () => {
    const list = [];
    if (pagerMounted) list.push(nativePager);
    if (localPagerMounted) list.push(localPager);
    return localPagerFirst ? list.reverse() : list;
  };

  const context = {
    favState: { localPage: Number(localSelectedPage) || 1, localPageRouteKey0129: '' },
    favRequestedRoutePage0137: () => 1,
    favViewKey0137: () => '',
    favPageRouteKey0129: () => '',
    favRequestedPage0129: () => 1,
    favScopeKey: () => 'owner|items||',
    isFavoritesPage: () => true,
    favScheduleSync: () => {},
    favScheduleCurrentPageObservation: () => {},
    document: {
      querySelectorAll: () => mountedPagers(),
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

  const makeClickButton = (button, pager) => ({
    ...button,
    closest: (selector) => selector === 'nav[aria-label="Favorite Items Page Results"]' ? pager : null,
  });

  return {
    context,
    nativePager,
    localPager,
    setSelectedPage(page) {
      selectedText = String(page);
      nativeSelectedButton.textContent = selectedText;
    },
    setLocalSelectedPage(page) {
      localSelectedText = String(page);
      localSelectedButton.textContent = localSelectedText;
      context.favState.localPage = Number(page) || 1;
    },
    setPagerMounted(value) { pagerMounted = Boolean(value); },
    setLocalPagerMounted(value) { localPagerMounted = Boolean(value); },
    clickNative(button) {
      const ownedButton = makeClickButton(button, nativePager);
      clickHandler?.({ target: { closest: () => ownedButton } });
    },
    clickLocal(button) {
      const ownedButton = makeClickButton(button, localPager);
      clickHandler?.({ target: { closest: () => ownedButton } });
    },
    popstate() { popstateHandler?.(); },
  };
}

function numericButton(page) {
  return {
    textContent: String(page),
    disabled: false,
    getAttribute: () => null,
    querySelector: () => null,
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
  assert.ok(adapter.includes('nav[aria-label="Favorite Items Page Results"]'));
  assert.ok(adapter.includes('button[aria-current="true"]'));
  assert.ok(adapter.includes('button.wt-is-selected'));
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

test('native view identity and BetterSearch local-result page identity are intentionally separate', () => {
  assert.match(runtime, /function favViewKey0137\(\)/);
  assert.match(pagination, /FAV_LOCAL_PAGE_SIZE0150 = 20/);
  assert.match(pagination, /function favSyncLocalPageFromRoute0129\(\)/);
  assert.match(pagination, /Compatibility no-op/);
  assert.match(adapter, /favRequestedRoutePage0137 = function favRequestedRoutePage0139/);
  assert.match(adapter, /favViewKey0137 = function favViewKey0139/);
  assert.match(adapter, /favPageRouteKey0129 = function favPageRouteKey0139/);
  assert.match(adapter, /favRequestedPage0129 = function favRequestedPage0139/);
  assert.match(adapter, /page:\$\{favCurrentFavoritePage0139\(\)\}/);
  assert.doesNotMatch(adapter, /favState\.localPage\s*=\s*target/);
});

test('native pager discovery explicitly excludes BetterSearch local pagination', () => {
  assert.match(adapter, /function favNativePagers0139\(\)/);
  assert.match(adapter, /!pager\.matches\?\.\('\[data-ebsf-local-pagination\]'\)/);
  assert.match(adapter, /const pagers = favNativePagers0139\(\)/);
});

test('native pager clicks seed native intent but never hijack Etsy pagination or BetterSearch localPage', () => {
  assert.match(adapter, /document\.addEventListener\('click'/);
  assert.match(adapter, /pager\.matches\?\.\('\[data-ebsf-local-pagination\]'\)/);
  assert.match(adapter, /favPagerButtonTargetPage0139\(button\)/);
  assert.match(adapter, /favSetNativePageIntent0139\(target\)/);
  assert.doesNotMatch(adapter, /favState\.localPage\s*=\s*target/);
  assert.match(adapter, /favScheduleSync\(0\)/);
  assert.match(adapter, /favScheduleCurrentPageObservation\(300\)/);
  assert.doesNotMatch(adapter, /preventDefault\(|stopPropagation\(|stopImmediatePropagation\(/);
  assert.doesNotMatch(adapter, /replaceChildren\(|createElement\(['"]nav['"]\)|\.remove\(\)/);
});

test('a numeric Etsy page click changes native view intent but leaves local result page untouched', () => {
  const fixture = executeAdapterFixture({ selectedPage: 1 });
  fixture.clickNative(numericButton(2));
  assert.equal(fixture.context.favState.localPage, 1);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 2);
});

test('local and native pagers may share the Etsy aria-label without sharing page-state ownership', () => {
  const fixture = executeAdapterFixture({
    selectedPage: 3,
    localSelectedPage: 7,
    includeLocalPager: true,
    localPagerFirst: true,
    url: 'https://www.etsy.com/people/test?tab=items&page=1',
  });

  // The local pager is intentionally returned first and is visually mounted,
  // but native page identity must still come from Etsy's native pager.
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 3);
  assert.equal(fixture.context.favState.localPage, 7);

  // A capture-phase click on the local pager must be invisible to the native
  // adapter. Module 95 owns the actual local-page mutation separately.
  fixture.clickLocal(numericButton(8));
  assert.equal(fixture.context.favState.nativePageIntent0139, 0);
  assert.equal(fixture.context.favState.localPage, 7);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 3);

  // The real Etsy pager still seeds native intent normally.
  fixture.clickNative(numericButton(4));
  assert.equal(fixture.context.favState.localPage, 7);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 4);
});

test('a local aria-current value cannot override native selected page identity', () => {
  const fixture = executeAdapterFixture({
    selectedPage: 2,
    localSelectedPage: 9,
    includeLocalPager: true,
    localPagerFirst: true,
  });
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 2);
  fixture.setLocalSelectedPage(10);
  assert.equal(fixture.context.favCurrentFavoritePage0139(), 2);
});

test('Previous and Next button intents derive only from Etsy current page', () => {
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
  assert.doesNotMatch(block, /favState\.localPage/);
});

test('native page-only interaction cannot clear or redownload the complete catalogue', () => {
  assert.doesNotMatch(adapter, /favResetForDatasetChange0137\(/);
  assert.doesNotMatch(adapter, /favLoadAll\(/);
  assert.doesNotMatch(adapter, /controller\?\.abort|records\s*=\s*\[\]|loadComplete\s*=\s*false/);
});

test('history page navigation seeds native transient intent without mutating local result pagination', () => {
  assert.match(adapter, /window\.addEventListener\('popstate'/);
  assert.match(adapter, /const page = favUrlPage0139\(\)/);
  assert.match(adapter, /favSetNativePageIntent0139\(page\)/);
  const popstateBlock = adapter.slice(adapter.indexOf("window.addEventListener('popstate'"));
  assert.doesNotMatch(popstateBlock, /favState\.localPage/);
});
