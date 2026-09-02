import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/79-favorites-sort-layout.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function makeNode(kind) {
  return {
    kind,
    isConnected:true,
    hidden:true,
    dataset:{},
    __ebsfSortMenu:null,
    __ebsfSortRoot01526:null,
    removeCalls:0,
    remove() {
      this.removeCalls += 1;
      this.isConnected = false;
    },
    removeAttribute(name) {
      if (name === 'data-ebsf-orphaned') delete this.dataset.ebsfOrphaned;
    },
    querySelector() { return null; },
  };
}

function fixture() {
  const roots = [];
  const portals = [];
  const raf = [];
  const favState = { sortRoot:null, sortMenu:null };

  const document = {
    querySelectorAll(selector) {
      if (selector === '[data-ebsf-sort-menu-portal]') return portals.filter((node) => node.isConnected);
      if (selector === '[data-ebsf-sort]') return roots.filter((node) => node.isConnected);
      return [];
    },
    querySelector(selector) {
      if (selector === '[data-ebsf-sort]') return roots.find((node) => node.isConnected) || null;
      return null;
    },
    createElement() {
      throw new Error('createElement is not needed in lifetime tests');
    },
    body:{ append() {} },
  };

  function baseOpen(root = favState.sortRoot) {
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (!root || !menu) return false;
    favState.sortRoot = root;
    favState.sortMenu = menu;
    menu.removeAttribute('data-ebsf-orphaned');
    for (const other of document.querySelectorAll('[data-ebsf-sort-menu-portal]')) {
      if (other !== menu) {
        other.hidden = true;
        other.dataset.ebsfOrphaned = '1';
      }
    }
    menu.hidden = false;
    return true;
  }

  function baseClose() {
    const root = favState.sortRoot;
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (menu) menu.hidden = true;
    return true;
  }

  const context = vm.createContext({
    console,
    document,
    favState,
    favUiPrefs:{ sortMenuHidden:[], sortMenuOrder:[] },
    FAV_SORT_DEFINITIONS:[],
    favCreateSort:() => null,
    favMeasureSortTrigger:() => {},
    favOpenSortMenu:baseOpen,
    favCloseSortMenu:baseClose,
    requestAnimationFrame:(callback) => { raf.push(callback); return raf.length; },
  });
  vm.runInContext(source, context);

  function addController({ connected = true, orphaned = false } = {}) {
    const root = makeNode('root');
    const menu = makeNode('portal');
    root.isConnected = connected;
    menu.isConnected = true;
    menu.dataset.ebsfSortMenuPortal = '';
    if (orphaned) menu.dataset.ebsfOrphaned = '1';
    roots.push(root);
    portals.push(menu);
    context.favBindSortPortal01526(root, menu);
    if (orphaned) menu.dataset.ebsfOrphaned = '1';
    return { root, menu };
  }

  function connectedPortals() {
    return portals.filter((node) => node.isConnected);
  }

  function flushRaf() {
    while (raf.length) raf.shift()();
  }

  return { context, favState, roots, portals, addController, connectedPortals, flushRaf };
}

test('behavior gate keeps release identity at 0.15.29 and module79 remains before module80', () => {
  const p79 = userscript.indexOf('/src/79-favorites-sort-layout.js?v=0.15.29');
  const p80 = userscript.indexOf('/src/80-favorites-layout-editor-core.js?v=0.15.29');
  assert.ok(p79 >= 0 && p80 > p79);
  assert.match(userscript, /@version\s+0\.15\.29/);
});

test('detached-root portal is disposed and its stale state references are cleared', () => {
  const f = fixture();
  const stale = f.addController({ connected:false });
  f.favState.sortRoot = stale.root;
  f.favState.sortMenu = stale.menu;

  f.context.favPruneSortPortals01526();

  assert.equal(stale.menu.isConnected, false);
  assert.equal(stale.menu.removeCalls, 1);
  assert.equal(stale.root.__ebsfSortMenu, null);
  assert.equal(stale.menu.__ebsfSortRoot01526, null);
  assert.equal(f.favState.sortRoot, null);
  assert.equal(f.favState.sortMenu, null);
});

test('connected current portal is preserved while a detached predecessor is removed', () => {
  const f = fixture();
  const stale = f.addController({ connected:false });
  const current = f.addController({ connected:true });
  f.favState.sortRoot = current.root;
  f.favState.sortMenu = current.menu;

  f.context.favPruneSortPortals01526(current.menu);

  assert.equal(stale.menu.isConnected, false);
  assert.equal(current.menu.isConnected, true);
  assert.equal(current.root.__ebsfSortMenu, current.menu);
  assert.equal(current.menu.__ebsfSortRoot01526, current.root);
});

test('opening a newer connected controller removes the older portal after module69 marks it orphaned', () => {
  const f = fixture();
  const old = f.addController({ connected:true });
  const next = f.addController({ connected:true });
  f.favState.sortRoot = next.root;
  f.favState.sortMenu = next.menu;

  assert.equal(f.context.favOpenSortMenu(next.root), true);
  assert.equal(old.menu.dataset.ebsfOrphaned, '1', 'module69 compatibility path marks the older portal');
  assert.equal(old.menu.isConnected, true, 'cleanup is deferred until the current click/reconcile task settles');

  f.flushRaf();

  assert.equal(old.menu.isConnected, false, 'orphan is removed rather than retained as hidden body DOM');
  assert.equal(old.root.__ebsfSortMenu, null, 'the briefly connected predecessor cannot retain a dead portal backlink');
  assert.equal(old.menu.__ebsfSortRoot01526, null, 'the disposed portal cannot retain its old root');
  assert.equal(next.menu.isConnected, true);
  assert.equal(next.menu.hidden, false);
  assert.equal(f.connectedPortals().length, 1);
});

test('repeated detached-root replacement keeps connected portal count bounded at one', () => {
  const f = fixture();
  let current = f.addController({ connected:true });
  f.favState.sortRoot = current.root;
  f.favState.sortMenu = current.menu;

  for (let cycle = 0; cycle < 20; cycle += 1) {
    current.root.isConnected = false;
    const next = f.addController({ connected:true });
    f.favState.sortRoot = next.root;
    f.favState.sortMenu = next.menu;
    f.context.favPruneSortPortals01526(next.menu);
    assert.equal(f.connectedPortals().length, 1, `cycle ${cycle + 1} retains only the live controller portal`);
    current = next;
  }
});

test('closing after root detachment disposes the portal immediately', () => {
  const f = fixture();
  const current = f.addController({ connected:true });
  f.favState.sortRoot = current.root;
  f.favState.sortMenu = current.menu;
  current.menu.hidden = false;
  current.root.isConnected = false;

  assert.equal(f.context.favCloseSortMenu(), true);

  assert.equal(current.menu.isConnected, false);
  assert.equal(f.favState.sortRoot, null);
  assert.equal(f.favState.sortMenu, null);
});

test('portal lifetime fence adds no observer, polling loop, or route-lifecycle wrapper', () => {
  assert.doesNotMatch(source, /MutationObserver|ResizeObserver|setInterval\s*\(/);
  assert.doesNotMatch(source, /favScheduleSync\s*=|favTeardownPageShell0121\s*=/);
  assert.match(source, /favPruneSortPortals01526/);
  assert.match(source, /favOpenSortMenuBefore01526/);
  assert.match(source, /favCloseSortMenuBefore01526/);
});
