import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/65-favorites-style.js', import.meta.url), 'utf8');
const cartActions = await readFile(new URL('../src/109-favorites-card-cart-actions.js', import.meta.url), 'utf8');

test('fallback cards preserve Etsy card structure while adding only the requested shop/rating row', () => {
  const fallback = runtime.slice(runtime.indexOf('function favFallbackNode'), runtime.indexOf('function favPrepareOwnedCard0141'));
  assert.match(fallback, /li\.setAttribute\('data-clg-id', 'WtListItem'\)/);
  assert.match(fallback, /implicit-comparison-listing-card-title/);
  assert.match(fallback, /data-testid="price-details"/);
  assert.match(fallback, /data-testid="delivery-and-returns-details"/);
  assert.match(fallback, /class="wt-text-body-small wt-sem-text-secondary wt-pb-xs-1 ebsf-card-shop-rating"/);
  assert.match(fallback, /data-accessible-btn-fave="true"/);
  assert.match(fallback, /data-testid="add-to-cart-button"/);
});

test('fallback heart uses Etsy’s native Favorites control contract', () => {
  const fallback = runtime.slice(runtime.indexOf('function favFallbackNode'), runtime.indexOf('function favPrepareOwnedCard0141'));
  assert.match(fallback, /favorites-landing-heart-button/);
  assert.match(fallback, /data-listing-id="\$\{safe\(record\.id\)\}"/);
  assert.match(fallback, /class="favorited-icon-container should-animate wt-nudge-l-1 wt-nudge-b-1"/);
  assert.match(fallback, /data-favorited-icon="true"/);
  assert.match(runtime, /const url=String\(card\.dataset\.ebsfUrl\|\|card\.dataset\.ebsListingUrl\|\|''\)\.trim\(\)/);
  assert.match(runtime, /window\.open\(url,'_blank','noopener'\)/);
  assert.match(styles, /\.ebsf-fallback-card \.ebsf-fallback-heart\{[^}]*display:inline-flex!important[^}]*align-items:center!important[^}]*justify-content:center!important/s);
});

test('fallback option badges retain Etsy semantics while the final cart owner reserves hover space', () => {
  const fallback = runtime.slice(runtime.indexOf('function favFallbackNode'), runtime.indexOf('function favPrepareOwnedCard0141'));
  assert.match(fallback, /record\.hasVariations \? '<span[^']*Multiple options/);
  assert.match(fallback, /record\.isPersonalizable \? '<span[^']*Personalizable/);
  assert.match(fallback, /class="wt-mt-xs-2 ebsf-card-options"/);
  assert.match(styles, /\.ebsf-fallback-card \.ebsf-card-options\{[^}]*display:flex[^}]*flex-wrap:wrap/s);
  assert.match(cartActions, /\[data-ebsf-owned-cart-slot="1"\]\{[^}]*flex:0 0 52px!important[^}]*height:52px!important[^}]*opacity:0!important[^}]*visibility:hidden!important/s);
  assert.match(cartActions, /\[data-ebsf-owned-card="1"\]:hover \[data-ebsf-owned-cart-slot="1"\].*opacity:1!important.*visibility:visible!important/s);
  assert.doesNotMatch(cartActions, /max-height:0/);
});
