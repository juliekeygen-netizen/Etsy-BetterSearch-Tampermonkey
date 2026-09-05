import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleSource = await readFile(new URL('../src/109-favorites-card-cart-actions.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

test('local card action slot reserves checkout geometry before hover', () => {
  assert.match(moduleSource, /data-ebsf-owned-cart-slot/);
  assert.match(moduleSource, /flex:0 0 52px!important/);
  assert.match(moduleSource, /height:52px!important/);
  assert.match(moduleSource, /min-height:52px!important/);
  assert.match(moduleSource, /opacity:0!important;pointer-events:none!important/);
  assert.match(moduleSource, /:hover \[data-ebsf-owned-cart-slot="1"\].*opacity:1!important;pointer-events:auto!important/s);
  assert.doesNotMatch(moduleSource, /visibility:hidden/);
  assert.doesNotMatch(moduleSource, /max-height:0/);
});

test('owned cards stretch their row and push the reserved cart slot to the bottom', () => {
  assert.match(moduleSource, /\[data-ebsf-local-grid\] > \[data-ebsf-owned-card="1"\]\{align-self:stretch!important;height:100%!important\}/);
  assert.match(moduleSource, /data-ebsf-owned-card-stack/);
  assert.match(moduleSource, /flex-direction:column!important/);
  assert.match(moduleSource, /margin-top:auto!important/);
});

test('cart actions prefer a live native Etsy control and never use listing navigation for plain Add to cart', () => {
  assert.match(moduleSource, /favSyncOwnedCartFromNative01530\(card\)/);
  assert.match(moduleSource, /favMatchingNativeCartControl01530\(card, label\)/);
  assert.match(moduleSource, /nativeControl\.click\(\)/);
  assert.match(moduleSource, /if \(\/\^add to cart\$\/i\.test\(label\)\) favScheduleNativeCartSync01530\(card\)/);
  assert.match(moduleSource, /void favSubmitOwnedCart01530\(card, control\)/);
  const plainAddBranch = moduleSource.slice(moduleSource.indexOf('if (favSyncOwnedCartFromNative01530(card)) return;'), moduleSource.indexOf('document.addEventListener'));
  assert.match(plainAddBranch, /multiple options\|select options/);
  assert.match(plainAddBranch, /void favSubmitOwnedCart01530\(card, control\)/);
});

test('off-page simple cards submit Etsy cart/listing form state with the logged-in session', () => {
  assert.match(moduleSource, /form\[action\*="\/cart\/listing\.php"\]/);
  assert.match(moduleSource, /params\.set\('listing_id', id\)/);
  assert.match(moduleSource, /params\.set\('listing_url', listingUrl\)/);
  assert.match(moduleSource, /params\.set\('quantity', '1'\)/);
  assert.match(moduleSource, /method: 'POST'/);
  assert.match(moduleSource, /credentials: 'include'/);
  assert.match(moduleSource, /redirect: 'follow'/);
});

test('off-page cart state is committed only after Etsy redirects to a cart URL', () => {
  assert.match(moduleSource, /function favCartResponseConfirmed01530/);
  assert.match(moduleSource, /if \(!response\?\.ok\) return false/);
  assert.match(moduleSource, /\^\\\/cart\\\/?\$\/i/);
  assert.match(moduleSource, /\^\\\/cart\\\/\\d\+\/i/);
  assert.match(moduleSource, /if \(!favCartResponseConfirmed01530\(response\)\)/);
  assert.match(moduleSource, /favSetOwnedCartState01530\(request\.id, true\)/);
});

test('confirmed cart state renders native-style In cart and Go to cart affordance', () => {
  assert.match(moduleSource, />In cart<\/span>/);
  assert.match(moduleSource, /data-ebsf-go-to-cart="1" href="\/cart">Go to cart/);
  assert.match(moduleSource, /location\.assign\(new URL\(href, location\.origin\)\.href\)/);
  assert.match(moduleSource, /favState\.cartListingIds01530/);
});

test('the final module replaces the older transplanted click owner and is loaded last', () => {
  assert.match(moduleSource, /document\.removeEventListener\('click', favTransplantedClickBefore01530, true\)/);
  assert.match(moduleSource, /document\.addEventListener\('click', favHandleOwnedCardClick01530, true\)/);
  const requireLines = userscript.split(/\r?\n/).filter((line) => line.includes('// @require'));
  assert.match(requireLines.at(-1) || '', /src\/109-favorites-card-cart-actions\.js\?v=0\.15\.29$/);
});
