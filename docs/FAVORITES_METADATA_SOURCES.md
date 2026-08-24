# Favorites metadata source evidence

This document records concrete Etsy signals already observed for Favorites filtering and the preferred acquisition order for each field. The durable index and cheap Favorites synchronization are implemented; the deep scanner remains future work.

In UI and documentation, **Favorites sync** specifically means the fast Favorites structured/card/auxiliary-data refresh. **Deep metadata scan** means future individual listing/shop-page requests for otherwise unavailable fields. Sync must never be presented as a deep scan.

## Acquisition priority

For each field, use the cheapest reliable source first:

1. **Favorites structured JSON / embedded page data**
2. **Current Favorites card DOM**
3. **Existing Favorites auxiliary JSON endpoints** such as additional listing info
4. **Fetched listing-page HTML**
5. **Fetched shop-page HTML** for fields that are truly shop-level

Do not deep-scan a listing when the current Favorites dataset already gives a reliable value. Store field provenance and freshness so a later higher-quality source can replace an older fallback.

The implemented index uses this per-field metadata shape:

```text
value
known
source        // favorites_json | favorite_card | additional_info | listing_html | shop_html
observedAt
parserVersion
```

`unknown` must stay distinct from `false`, `0`, or unavailable.

## Confirmed signals

### Star Seller

**Preferred source: Favorites JSON.**

The current BetterSearch Favorites parser already reads:

```js
listing.shop.isStarSeller
```

into `record.isStarSeller`, so the existing Star Seller Favorites filter can already work without a listing-page scan.

The listing/shop UI provides useful fallbacks and validation signals:

```css
.clg-profile-avatar__badge-star-seller
```

A second positive signal is the listing-page secondary nudge containing:

```text
Star Seller.
```

Do not key the parser to the SVG path itself. Prefer the stable badge class, semantic text, or structured shop value.

Because Star Seller is shop-level metadata, the durable index should also store it once on the shop record and propagate it to that shop's favorite listings. A fresh Favorites JSON value may update the shop record without requesting the shop page.

### Digital download / physical item

**Preferred source: Favorites JSON.**

The current parser already reads:

```js
listing.priceDetails.isDownload
```

Therefore the Digital download / Exclude digital downloads filter does not require deep scanning when that field is present.

Card-DOM fallback:

```html
<clg-icon name="downloadarrow" ...></clg-icon>
...
Digital download
```

A practical fallback should require the icon and/or nearby `Digital download` label inside the listing card rather than matching unrelated page text.

### Personalizable / customizable

**Preferred source: Favorites JSON when present.**

The current parser already reads:

```js
listing.isPersonalizable
```

so many listings can be filtered without a deep scan.

Listing-page fallback:

```css
[data-selector="listing-page-personalization"]
[data-selector="enhanced-perso-content-toggle"]
```

The observed UI contains an `Add personalization` accordion and personalization field(s). Presence of this component is a strong positive listing-level signal.

Do not treat absence from a partially rendered page as a guaranteed negative unless the parser has confirmed the relevant listing section was fully present.

### Etsy's Pick

**Listing-page positive signal confirmed.**

Observed structure includes an Etsy Pick signal similar to:

```html
<button aria-describedby="etsys_pick" ...>
  <clg-signal ...>
    ...
    Etsy’s Pick
  </clg-signal>
</button>
```

Preferred matching strategy:

- semantic text `Etsy’s Pick`
- `aria-describedby="etsys_pick"`
- the associated signal/icon structure

Do **not** require `.wt-popover--is-open`; that class represents the temporary open state of the tooltip and is not the actual badge truth.

Until a reliable Favorites JSON/card field is found, this remains a deep listing-page field.

### Vintage

**Listing-page positive signal confirmed.**

Observed highlight row:

```html
<clg-icon name="vintage" ...></clg-icon>
...
Vintage from the 1970s
```

Use the `clg-icon[name="vintage"]` highlight plus nearby text beginning with `Vintage from the` as the positive signal. The decade/year text can be captured separately as optional metadata.

Until a structured Favorites field is found, Vintage remains a deep listing-page field.

### Gift wrapping

**Listing-page positive signal confirmed.**

Observed highlight text:

```text
Gift wrapping available
```

The parser should match the semantic highlight row/text rather than the SVG path, because the icon path is less stable.

This is listing/shop capability metadata that currently appears to require listing-page enrichment unless a structured source is discovered.

`gift wrapping` and `accepts Etsy gift cards` are separate fields and must not be conflated.

### Best Seller

The existing Favorites structured record already has `listing.isBestSeller`. Keep this as the preferred source. No listing-page scan is needed when known.

### Variations and video

The existing Favorites record already reads `listing.hasVariations` and `listing.videoSources`. Keep structured Favorites data as the preferred source.

### Color

No reliable listing/card/listing-page color source has been confirmed yet.

Decision for now:

- **remove/hide the current Color Favorites drawer rather than presenting a non-functional filter**
- do not deep-scan for color using guessed image colors or listing text
- revisit only when Etsy exposes a dependable structured attribute or a confirmed listing-page attribute block

The durable schema can still reserve a future color field, but the production UI should not imply it works.

## Why the current Star Seller filter already works

This is expected: BetterSearch currently normalizes the Favorites listing JSON and stores `listing.shop.isStarSeller === true` as `record.isStarSeller`, then the filter engine checks that field directly. The page badge you found is therefore useful as a fallback/validation source, not the primary source for normal Favorites filtering.

The same general rule applies to several other fields:

- Star Seller -> Favorites JSON first
- Digital -> Favorites JSON first, card DOM fallback
- Personalizable -> Favorites JSON first, listing HTML fallback
- Best Seller -> Favorites JSON first
- Variations/video -> Favorites JSON first

Deep scanning should concentrate on metadata that is genuinely absent from the cheaper sources.

## Implemented index and future scanner implications

`src/61a-favorites-index.js` owns a versioned IndexedDB abstraction shared by Tampermonkey, Chrome, and Firefox builds. It stores listing, shop, and scope records separately, merges stronger/newer field observations without collapsing known `false`/`0` into unknown, and accepts partial versus completed scope observations. Current embedded/card records and completed existing Favorites loads feed it automatically. Direct heart unfavorites preserve dormant metadata.

`src/61b-favorites-sync.js` now owns authoritative cheap-data synchronization. It fetches Etsy Favorites JSON sequentially for the unfiltered All Items scope and separately for generated groups, custom collections, and native query scopes. Per-page observations are partial. Only the final deduplicated write after every page succeeds marks the scope complete; therefore cancellation, request failure, repeated-page protection, and route-stale rejection cannot infer absence. Only completed unfiltered All Items absence is a global unfavorite signal.

The runtime also observes current page structured/card data on a debounce without turning DOM churn into full-network synchronization. Auto-sync is enabled by default for the user's own Favorites pages, runs when a relevant scope has never completed or is at least 12 hours stale, and does not crawl listing pages. The search-field-footprint progress UI represents only these meaningful pagination jobs.

The future scan queue should be **field-aware**, not simply "scan every favorite page again".

Example:

```text
listing 123
  starSeller       known from favorites_json -> no listing scan needed
  isDownload       known from favorites_json -> no listing scan needed
  personalizable   known from favorites_json -> no listing scan needed
  etsysPick        unknown -> listing_html job
  vintage          unknown -> listing_html job
  giftWrap         unknown -> listing_html job
```

This makes the automatic scanner much faster and avoids unnecessary Etsy requests.

When a listing is unfavorited, keep cached metadata but mark it inactive as already planned. It should leave active Favorite results immediately; dormant metadata can later be cleaned by retention policy.

## Filter-rail UI decisions implemented in v0.8.0 and v0.9.0

### Prevent accidental text selection

Interactive rail chrome should not be selectable while clicking/toggling:

- accordion titles
- filter option labels
- split-button labels/carets
- Reset / Show more / helper labels
- checkbox/radio row text

Use scoped `user-select: none` on the filter-rail UI, but **do not** disable selection inside text/number/search inputs or other editable fields.

### Checkbox/radio toggling feels unstable because the rail is rebuilt

Ordinary checkbox/radio/select changes now save and reapply results without calling `favRefreshRail()`. Structural changes replace only the affected section body where practical; full rail reconstruction is reserved for scope/DOM replacement and explicit resets.

Accordion manual state remains in memory for the page session; a fresh page derives initially open sections from active filter values. Rail labels/chrome disable accidental selection while editable controls retain normal selection.

### Color drawer

Remove it from the active Favorites rail until a reliable data source exists.

### Future deep-metadata controls

Category, Etsy's Picks, Ships from, Ready to ship, Vintage, gift-card support, gift wrapping, and Ship to retain their saved schema values but are visibly disabled with a compact `Requires listing metadata` status. Cheap fields such as Star Seller, digital, Best Seller, personalization, variations, and video remain active when their source marks them known. The settings UI shows future deep-metadata coverage/status deliberately, but its future scan/update actions are visibly disabled and produce no fake progress or results.

## Parser testing requirements

Create positive, negative, and unknown fixtures for every deep field. For the signals in this document, include fixtures for:

- Star Seller badge present / absent
- Etsy's Pick signal present / absent
- vintage highlight present / absent
- personalization component present / absent
- gift wrapping highlight present / absent
- digital card signal present / absent

Tests must verify that a missing selector in an incomplete or changed page can remain `unknown` rather than silently becoming `false`.
