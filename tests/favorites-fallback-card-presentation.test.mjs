import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/65-favorites-style.js', import.meta.url), 'utf8');

test('fallback cards distinguish native-style cart and options affordances without changing their bridge action text', () => {
  const fallback = runtime.slice(runtime.indexOf('function favFallbackNode'), runtime.indexOf('function favPrepareOwnedCard0141'));
  assert.match(fallback, /const action = record\.hasVariations \? 'Multiple options' : 'Add to cart'/);
  assert.match(fallback, /const actionKind = record\.hasVariations \? 'options' : 'cart'/);
  assert.match(fallback, /data-ebsf-card-action="\$\{actionKind\}"/);
  assert.match(fallback, /aria-label="Remove from favorites"/);
});

test('fallback heart uses a fixed centered circular hit target', () => {
  assert.match(styles, /\.ebsf-fallback-card \.ebsf-heart\{[^}]*display:inline-flex!important[^}]*align-items:center!important[^}]*justify-content:center!important[^}]*width:40px!important[^}]*height:40px!important/s);
  assert.match(styles, /\.ebsf-fallback-card \.ebsf-heart \.etsy-icon\{[^}]*width:18px!important[^}]*height:18px!important/s);
  assert.match(styles, /\.ebsf-fallback-card \.ebsf-heart svg\{[^}]*flex:0 0 18px!important/s);
});

test('fallback actions stay unobtrusive until pointer or keyboard focus reaches the card', () => {
  assert.match(styles, /\.ebsf-fallback-card \.ebsf-card-actions\{[^}]*max-height:0[^}]*opacity:0[^}]*pointer-events:none/s);
  assert.match(styles, /\.ebsf-fallback-card:hover \.ebsf-card-actions,\.ebsf-fallback-card:focus-within \.ebsf-card-actions\{[^}]*max-height:44px[^}]*opacity:1[^}]*pointer-events:auto/s);
  assert.match(styles, /\[data-ebsf-card-action="cart"\]>button/);
  assert.match(styles, /\[data-ebsf-card-action="options"\]>button/);
});
