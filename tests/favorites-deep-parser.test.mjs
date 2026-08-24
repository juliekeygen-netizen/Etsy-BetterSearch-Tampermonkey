import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

async function loadDeepParser() {
  const source = await readFile(resolve(ROOT, 'src/61c-favorites-deep-parser.js'), 'utf8');
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    RegExp,
    parseInt,
  });
  vm.runInContext(`${source}\nglobalThis.testApi={\n  FAV_DEEP_PARSER_VERSION,\n  favDeepParseListingHtml,\n  favDeepNormalizeAvailability,\n  favDeepShippingFromOffer\n};`, context);
  return context.testApi;
}

test('deep parser extracts confirmed listing-page signals without treating absence as false', async () => {
  const api = await loadDeepParser();
  const html = `
    <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@type":"Product",
        "name":"Example vintage charm",
        "category":"Accessories",
        "aggregateRating":{"ratingValue":"4.9","reviewCount":"123"},
        "offers":{"@type":"Offer","price":"14.63","availability":"https://schema.org/InStock"}
      }
    </script>
    <div class="clg-profile-avatar__badge-star-seller"></div>
    <button aria-describedby="etsys_pick"><clg-signal>Etsy’s Pick</clg-signal></button>
    <li><clg-icon name="vintage"></clg-icon><div>Vintage from the 1970s</div></li>
    <div data-selector="listing-page-personalization"><button data-selector="enhanced-perso-content-toggle">Add personalization</button></div>
    <li>Gift wrapping available</li>
  `;
  const parsed = api.favDeepParseListingHtml(
    html,
    'https://www.etsy.com/listing/123456789/example',
    { observedAt: 1234 }
  );

  assert.equal(parsed.parserVersion, 'listing-html-v1');
  assert.equal(parsed.identity.listingId, '123456789');
  assert.equal(parsed.identity.title, 'Example vintage charm');
  assert.equal(parsed.cardMetadata.price.value, 14.63);
  assert.equal(parsed.cardMetadata.rating.value, 4.9);
  assert.equal(parsed.cardMetadata.reviewCount.value, 123);
  assert.equal(parsed.availabilityState, 'available');
  assert.deepEqual(Array.from(parsed.listingMetadata.category.value), ['Accessories']);
  assert.equal(parsed.listingMetadata.etsysPick.value, true);
  assert.equal(parsed.listingMetadata.vintage.value, true);
  assert.equal(parsed.listingMetadata.vintageEra.value, '1970s');
  assert.equal(parsed.listingMetadata.personalizable.value, true);
  assert.equal(parsed.listingMetadata.giftWrap.value, true);
  assert.equal(parsed.shopMetadata.starSeller.value, true);

  assert.equal(parsed.listingMetadata.digital.known, false);
});

test('deep parser preserves unknown for missing positive-only UI signals', async () => {
  const api = await loadDeepParser();
  const html = `
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Plain item","offers":{"@type":"Offer","price":"5"}}
    </script>
  `;
  const parsed = api.favDeepParseListingHtml(
    html,
    'https://www.etsy.com/listing/999999999/plain',
    { observedAt: 50 }
  );

  for (const field of [
    parsed.listingMetadata.etsysPick,
    parsed.listingMetadata.vintage,
    parsed.listingMetadata.vintageEra,
    parsed.listingMetadata.giftWrap,
    parsed.listingMetadata.personalizable,
    parsed.shopMetadata.starSeller,
  ]) {
    assert.equal(field.known, false);
    assert.equal(field.value, null);
  }
});

test("deep parser recognizes Etsy's Pick oneofakind icon fallback", async () => {
  const api = await loadDeepParser();
  const parsed = api.favDeepParseListingHtml(
    '<div><clg-icon name="oneofakind"></clg-icon><span>Etsy\'s Pick</span></div>',
    'https://www.etsy.com/listing/777777777/pick',
    { observedAt: 77 }
  );
  assert.equal(parsed.listingMetadata.etsysPick.value, true);
});

test('deep parser accepts explicit shipping and return values from structured/semantic evidence', async () => {
  const api = await loadDeepParser();
  const html = `
    <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@type":"Product",
        "name":"Shipping fixture",
        "offers":{
          "@type":"Offer",
          "price":"20",
          "availability":"https://schema.org/OutOfStock",
          "shippingDetails":{
            "@type":"OfferShippingDetails",
            "shippingRate":{"@type":"MonetaryAmount","value":"0"},
            "shippingDestination":{"addressCountry":"FI"},
            "deliveryTime":{"handlingTime":{"minValue":1,"maxValue":3}}
          }
        }
      }
    </script>
    <div>Returns not accepted</div>
    <div>Exchanges accepted</div>
  `;
  const parsed = api.favDeepParseListingHtml(
    html,
    'https://www.etsy.com/listing/888888888/shipping',
    { observedAt: 500 }
  );

  assert.equal(parsed.availabilityState, 'sold-out');
  assert.equal(parsed.shippingMetadata.cost.value, 0);
  assert.equal(parsed.shippingMetadata.freeShipping.value, true);
  assert.deepEqual(Array.from(parsed.shippingMetadata.shipsTo.value), ['FI']);
  assert.equal(parsed.shippingMetadata.processingDays.value, 3);
  assert.equal(parsed.shippingMetadata.returnsAccepted.value, false);
  assert.equal(parsed.shippingMetadata.exchangesAccepted.value, true);
});

test('Phase 4 toolbar patch freezes geometry across filter rail toggles', async () => {
  const source = await readFile(resolve(ROOT, 'src/70-favorites-phase4-polish.js'), 'utf8');
  assert.match(source, /favToolbarGeometrySnapshots010 = new WeakMap/);
  assert.match(source, /snapshot\.left - current\.left/);
  assert.match(source, /Show filters/);
  assert.match(source, /Hide filters/);
  assert.match(source, /viewportWidth !== viewportWidth/);
});
