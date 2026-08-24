# Favorites metadata source evidence

This document records concrete Etsy signals already observed for Favorites filtering and the preferred acquisition order for each field. It is meant to guide the future durable Favorites index/deep-scanner work without forcing every filter to open every listing page.

## Acquisition priority

For each field, use the cheapest reliable source first:

1. **Favorites structured JSON / embedded page data**
2. **Current Favorites card DOM**
3. **Existing Favorites auxiliary JSON endpoints** such as additional listing info
4. **Fetched listing-page HTML**
5. **Fetched shop-page HTML** for fields that are truly shop-level

Do not deep-scan a listing when the current Favorites dataset already gives a reliable value. Store field provenance and freshness so a later higher-quality source can replace an older fallback.

Recommended per-field metadata shape:

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

## Scanner/index implications

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

## Filter-rail UI findings to address before the richer-filter release

### Prevent accidental text selection

Interactive rail chrome should not be selectable while clicking/toggling:

- accordion titles
- filter option labels
- split-button labels/carets
- Reset / Show more / helper labels
- checkbox/radio row text

Use scoped `user-select: none` on the filter-rail UI, but **do not** disable selection inside text/number/search inputs or other editable fields.

### Checkbox/radio toggling feels unstable because the rail is rebuilt

The current v0.7.9 helper `favSaveAndApplyV079()` calls `favRefreshRail()` after essentially every checkbox/radio/select change while the rail is open. That destroys and recreates the clicked controls immediately before/while result reapplication runs.

This is a likely cause of the reported delayed/weird behavior when toggling nearby options quickly.

Planned fix:

- ordinary value changes should save state and reapply results **without rebuilding the entire rail**
- keep the existing DOM/input focused and responsive
- rebuild only for structural changes such as Show more/less, opening Strict settings, changing a section whose available controls actually change, or a full route/scope refresh
- debounce expensive result reapplication where useful, but update the control state immediately

### Color drawer

Remove it from the active Favorites rail until a reliable data source exists.

## Parser testing requirements

Create positive, negative, and unknown fixtures for every deep field. For the signals in this document, include fixtures for:

- Star Seller badge present / absent
- Etsy's Pick signal present / absent
- vintage highlight present / absent
- personalization component present / absent
- gift wrapping highlight present / absent
- digital card signal present / absent

Tests must verify that a missing selector in an incomplete or changed page can remain `unknown` rather than silently becoming `false`.
