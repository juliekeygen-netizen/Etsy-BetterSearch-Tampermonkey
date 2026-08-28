import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const third = await readFile(new URL('../src/92-favorites-third-audit.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('third audit module is final in userscript order', () => {
  const hardening = userscript.indexOf('/src/91-favorites-triple-audit-hardening.js');
  const thirdIndex = userscript.indexOf('/src/92-favorites-third-audit.js');
  assert.ok(hardening >= 0 && thirdIndex > hardening);
});

test('mutation-hot route identity is URL-only and does not rescan props through favScope', () => {
  const start = third.indexOf('favRouteIdentity0126 = function favRouteIdentity0127');
  const end = third.indexOf('var favInstallCollectionStripBefore0127');
  const routeBlock = third.slice(start, end);
  assert.match(routeBlock, /url\.pathname\.match/);
  assert.match(routeBlock, /url\.searchParams\.get\('collectionId'\)/);
  assert.doesNotMatch(routeBlock, /favScope\s*\(/);
});

test('collection strip refreshes when native Create collection source late-mounts or is replaced', () => {
  assert.match(third, /const nativeCreate = favNativeCreateButton0120\(\) \|\| null/);
  assert.match(third, /const previousCreate = favState\.collectionCreateSource0127 \|\| null/);
  assert.match(third, /previousCreate !== nativeCreate/);
  assert.match(third, /current\.remove\(\)/);
  assert.match(third, /favState\.collectionCreateSource0127 = nativeCreate/);
  assert.match(third, /favApplyNativeControlTheme0120\(installed\)/);
});

test('compact sort trigger opens a readable viewport-bounded popup', () => {
  assert.match(third, /favPositionSortMenu = function favPositionSortMenu0127/);
  assert.match(third, /const preferredWidth = Math\.max\(190, Math\.ceil\(rect\.width\)\)/);
  assert.match(third, /const width = Math\.min\(maxWidth, preferredWidth\)/);
  assert.match(third, /style\.setProperty\('width', `\$\{width\}px`, 'important'\)/);
  assert.match(third, /innerWidth - width - 8/);
});
