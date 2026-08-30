import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

async function source(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

function loadRailGeometryHelpers(boundary) {
  const start = boundary.indexOf('function favSetRailGeometryStyle01516');
  const end = boundary.indexOf('function favSyncRailPortalGeometry0155', start);
  assert.ok(start >= 0 && end > start, 'rail geometry helper block must exist');
  const context = vm.createContext({ String });
  vm.runInContext(`${boundary.slice(start, end)}\nglobalThis.testApi={apply:favApplyRailPortalRect01516};`, context);
  return context.testApi;
}

function geometrySlot() {
  const values = new Map();
  const writes = [];
  return {
    writes,
    slot:{
      style:{
        getPropertyValue(property) { return values.get(property) || ''; },
        setProperty(property, value) {
          writes.push([property, value]);
          values.set(property, String(value));
        },
      },
    },
  };
}

test('stable rail modules load before shell repair and after the final smoke layer', async () => {
  const userscript = await source('etsy-bettersearch.user.js');
  const style = userscript.indexOf('/src/87-favorites-revamp-style.js');
  const boundary = userscript.indexOf('/src/87a-favorites-stable-rail-ownership.js');
  const stability = userscript.indexOf('/src/88-favorites-revamp-stability.js');
  const smoke = userscript.indexOf('/src/101-favorites-v0141-smoke-fixes.js');
  const final = userscript.indexOf('/src/102-favorites-v0155-stable-ownership-final.js');
  assert.ok(style >= 0 && boundary > style && stability > boundary);
  assert.ok(smoke >= 0 && final > smoke);
});

test('native sidebar capture is read-only and never reparents Etsy children', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const start = boundary.indexOf('favCaptureNativeSource0120 = function favCaptureNativeSource0155');
  const end = boundary.indexOf('favFavoritesContentColumn0120 = function', start);
  const block = boundary.slice(start, end);
  assert.match(block, /favState\.nativeSource0120 = sidebar/);
  assert.doesNotMatch(block, /\.append\(|\.prepend\(|\.replaceWith\(|\.replaceChildren\(|\.remove\(|\.inert\s*=|\.hidden\s*=/);
});

test('desktop rail lives in a body portal, never under Etsy sidebar or its parent', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const ensureStart = boundary.indexOf('function favEnsureRailSlot0155');
  const ensureEnd = boundary.indexOf('function favReleasePermanentRail0155', ensureStart);
  const ensure = boundary.slice(ensureStart, ensureEnd);
  const installStart = boundary.indexOf('favInstallPermanentRail0120 = function favInstallPermanentRail0155');
  const installEnd = boundary.indexOf('/* Preserve the permanent rail root identity.', installStart);
  const install = boundary.slice(installStart, installEnd);

  assert.match(ensure, /document\.body\.append\(slot\)/);
  assert.match(ensure, /document\.body\.querySelector\(':scope > \[data-ebsf-rail-slot\]'\)/);
  assert.doesNotMatch(ensure, /sidebar\.append\(|sidebar\.prepend\(|sidebar\.parentElement\.insertBefore|parent\.insertBefore/);
  assert.match(install, /slot\.querySelector\(':scope > \[data-ebsf-rail\]'\)/);
  assert.match(install, /slot\.append\(rail\)/);
  assert.doesNotMatch(install, /sidebar\.querySelector\(':scope > \[data-ebsf-rail\]'\)|sidebar\.append\(rail\)/);
});

test('native sidebar keeps its layout footprint while the body portal follows its rect', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  assert.match(boundary, /\[data-testid="sidebar"\]\.ebsf-native-sidebar-suppressed\{\s*visibility:hidden!important;\s*pointer-events:none!important;/s);
  assert.doesNotMatch(boundary, /\[data-testid="sidebar"\]\.ebsf-native-sidebar-suppressed\{[^}]*display:none/s);
  assert.match(boundary, /\[data-ebsf-rail-slot\]\{\s*position:fixed!important;/s);
  assert.match(boundary, /const rect = sidebar\.getBoundingClientRect/);
  assert.match(boundary, /favApplyRailPortalRect01516\(slot, rect\)/);
  assert.match(boundary, /ResizeObserver/);
  assert.match(boundary, /window\.addEventListener\('scroll', favScheduleRailPortalGeometry0155/);
});

test('rail geometry writes all five values once, then performs zero writes for an identical rect', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const { apply } = loadRailGeometryHelpers(boundary);
  const fixture = geometrySlot();
  const rect = { left:24, top:120, width:248 };

  assert.equal(apply(fixture.slot, rect), 5);
  assert.deepEqual(fixture.writes.map(([property]) => property), [
    'left', 'top', 'width', 'max-width', '--ebsf-native-sidebar-width',
  ]);
  fixture.writes.length = 0;
  assert.equal(apply(fixture.slot, rect), 0);
  assert.deepEqual(fixture.writes, []);
});

test('rail geometry updates only top when scrolling changes vertical position', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const { apply } = loadRailGeometryHelpers(boundary);
  const fixture = geometrySlot();
  apply(fixture.slot, { left:24, top:120, width:248 });
  fixture.writes.length = 0;

  assert.equal(apply(fixture.slot, { left:24, top:76, width:248 }), 1);
  assert.deepEqual(fixture.writes, [['top', '76px']]);
});

test('rail geometry updates only the three width-owned values when width changes', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const { apply } = loadRailGeometryHelpers(boundary);
  const fixture = geometrySlot();
  apply(fixture.slot, { left:24, top:120, width:248 });
  fixture.writes.length = 0;

  assert.equal(apply(fixture.slot, { left:24, top:120, width:264 }), 3);
  assert.deepEqual(fixture.writes, [
    ['width', '264px'],
    ['max-width', '264px'],
    ['--ebsf-native-sidebar-width', '264px'],
  ]);
});

test('rail refresh preserves the permanent root identity', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const start = boundary.indexOf('favRefreshRail = function favRefreshRail0155');
  const end = boundary.indexOf('var favInstallPageShellBefore0155', start);
  const block = boundary.slice(start, end);
  assert.match(block, /rail\.replaceChildren\(\.\.\.Array\.from\(replacement\.childNodes\)\)/);
  assert.doesNotMatch(block, /old\.replaceWith|rail\.replaceWith|slot\.replaceChildren/);
});

test('final smoke integration verifies the body portal instead of sidebar-child ownership', async () => {
  const final = await source('src/102-favorites-v0155-stable-ownership-final.js');
  const start = final.indexOf('favEnsurePermanentRail0142 = function favEnsurePermanentRail0155');
  const end = final.indexOf('/* Category presence', start);
  const block = final.slice(start, end);
  assert.match(block, /rail\?\.closest\?\.\('\[data-ebsf-rail-slot\]'\)/);
  assert.match(block, /slot\.parentElement !== document\.body/);
  assert.doesNotMatch(block, /sidebar\.querySelector\(':scope > \[data-ebsf-rail\]'\)/);
});

test('final category owner uses category evidence rather than global deep readiness', async () => {
  const final = await source('src/102-favorites-v0155-stable-ownership-final.js');
  const start = final.indexOf('favBindingAvailable0120 = function favBindingAvailable0155');
  const end = final.indexOf('function favMutationElement0155', start);
  const block = final.slice(start, end);
  assert.match(block, /records\.some\(\(record\) => favCategoryMatch/);
  assert.doesNotMatch(block, /favDeepVisibilityReady0110|favBindingKnowledgeComplete0143/);

  let active = '';
  const context = vm.createContext({
    favBindingAvailableBefore0155: () => true,
    favAvailabilityMode0110: () => 'filtered',
    favBindingActive0120: (key) => key === active,
    favVisibleBindingCount0120: () => 1,
    favRecordsForBinding0120: () => [
      { deepMetadata:{ category:['Jewelry'] } },
      { deepMetadata:{ category:['Art & Collectibles'] } },
    ],
    favCategoryMatch: (values, key) => (values || []).some((value) => String(value).toLowerCase().includes(String(key).toLowerCase())),
  });
  vm.runInContext(`${block}\nglobalThis.testApi={available:favBindingAvailable0120};`, context);
  assert.equal(context.testApi.available('category:jewelry'), true);
  assert.equal(context.testApi.available('category:clothing'), false);
  active = 'category:clothing';
  assert.equal(context.testApi.available('category:clothing'), true);
});

test('final shell observer ignores BetterSearch portal churn and narrows native sidebar triggers', async () => {
  const final = await source('src/102-favorites-v0155-stable-ownership-final.js');
  const start = final.indexOf('function favShellMutationRelevant0155');
  const end = final.indexOf('favState.shellObserver0120?.disconnect?.()', start);
  const block = final.slice(start, end);
  assert.match(block, /target\?\.closest\?\.\('\[data-ebsf-rail-slot\]'\)/);
  assert.match(block, /favNodeContainsNativeSidebarControl0155/);
  assert.match(final, /a\[href\*="tab=items"\].*add-collection-button.*tab=shops/s);
  assert.doesNotMatch(block, /target\?\.closest\?\.\('\[data-testid="sidebar"\]'\)\) \{\s*return true/);
});

test('teardown never restores or moves Etsy-owned sidebar children', async () => {
  const boundary = await source('src/87a-favorites-stable-rail-ownership.js');
  const start = boundary.indexOf('favTeardownPageShell0121 = function favTeardownPageShell0155');
  const end = boundary.indexOf("window.addEventListener('scroll'", start);
  const block = boundary.slice(start, end);
  assert.match(block, /favReleasePermanentRail0155\(\)/);
  assert.doesNotMatch(block, /insertBefore\(|source\.childNodes|source\.remove\(|source\.hidden|source\.inert/);
});
