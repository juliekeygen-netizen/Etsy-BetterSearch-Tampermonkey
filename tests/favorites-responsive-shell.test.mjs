import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const responsive = await readFile(new URL('../src/89-favorites-responsive-shell.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('responsive shell module loads after the v0.12.1 stability guard', () => {
  const stability = userscript.indexOf('/src/88-favorites-revamp-stability.js');
  const responsiveIndex = userscript.indexOf('/src/89-favorites-responsive-shell.js');
  assert.ok(stability >= 0 && responsiveIndex > stability);
});

test('desktop shell survives narrower desktop CSS viewports', () => {
  assert.match(responsive, /FAV_DESKTOP_SHELL_MIN_WIDTH0124 = 760/);
  assert.match(responsive, /favDesktopShell0120 = function favDesktopShell0124/);
  assert.match(responsive, /innerWidth >= FAV_DESKTOP_SHELL_MIN_WIDTH0124/);
});

test('collection clicks are distinct from drag scrolling and active routes are no-ops', () => {
  assert.match(responsive, /const dragThreshold = 8/);
  assert.match(responsive, /dataset\.ebsfScrollerRevision = '2'/);
  assert.match(responsive, /getAttribute\('aria-current'\) === 'page'/);
  assert.match(responsive, /location\.assign\(link\.href\)/);
  assert.match(responsive, /scroller\.scrollWidth <= scroller\.clientWidth \+ 1/);
});

test('shell observer repairs descendant sidebar rerenders and rail removal', () => {
  assert.match(responsive, /target\?\.closest\?\.\('\[data-testid="sidebar"\]'\)/);
  assert.match(responsive, /node\.matches\?\.\('\[data-ebsf-rail\]'\)/);
  assert.match(responsive, /favState\.shellObserver0120\?\.disconnect/);
  assert.match(responsive, /records\.some\(favMutationTouchesShell0124\)/);
});

test('desktop toolbar geometry is fluid and bounded instead of fixed-width', () => {
  assert.match(responsive, /grid-template-columns:minmax\(145px,max-content\) minmax\(0,1fr\)/);
  assert.match(responsive, /\.ebsf-scope-header \.ebsf-native-search-slot\{/);
  assert.match(responsive, /min-width:96px!important/);
  assert.match(responsive, /max-width:none!important/);
  assert.match(responsive, /\.ebsf-collection-scroll\{[\s\S]*flex:1 1 0!important;[\s\S]*width:0!important/);
});
