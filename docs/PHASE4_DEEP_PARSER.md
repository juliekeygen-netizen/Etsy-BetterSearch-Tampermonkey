# Phase 4 — Deep listing metadata parser

Phase 4 starts in BetterSearch **v0.10.0**. It adds the parser/fetch/index primitives needed by the later persistent scan queue without prematurely enabling crawling controls.

## Implemented in v0.10.0

- `src/61c-favorites-deep-parser.js`
  - parses listing-page HTML without visually opening tabs
  - reads `application/ld+json` Product / Offer / BreadcrumbList data first
  - keeps confirmed Etsy UI signals as positive-only fallbacks
  - preserves `unknown` instead of inventing false/zero values
  - exposes a same-site `fetch -> parse` primitive for the future queue
  - merges parsed fields into the existing IndexedDB listing/shop records with parser/source timestamps
- Confirmed parser coverage now includes:
  - category/breadcrumb data when structurally exposed
  - current price
  - availability
  - rating/review count
  - structured shipping rate/destination/handling-time data when present
  - explicit Returns / Exchanges signals
  - Etsy's Pick positive signal
  - Vintage positive signal + era text
  - personalization positive signal
  - gift-wrapping positive signal
  - Star Seller positive fallback
  - semantic Ships from country
  - listing shop-link seller name with JSON-LD fallback
  - scoped Cost to ship with localized numeric parsing
  - scoped returns/exchanges highlight wording
  - listing-summary rating and review-count fallback
- Digital/physical is intentionally **not** inferred from arbitrary listing-page text because recommendation cards can contain `Digital download` on the same page. Favorites JSON/card data remains the trusted source until a scoped main-listing signal is confirmed.
- A parser result must retain field provenance and parser version before it is written to the durable index.

## Toolbar stability bug folded into this phase

`src/70-favorites-phase4-polish.js` originally fixed toolbar movement while Filters opened and closed. In v0.12.0 the desktop rail is permanent; the legacy toggle is hidden/disabled there and remains the mobile drawer opener.

Expected behavior:

- The mobile Filters opener retains stable geometry.
- Filter / Sort / Settings / native search keep the same widths while toggling the rail.
- Their viewport position is frozen across the sidebar swap.
- Geometry is recalculated only when the route/search layout or viewport width genuinely changes.
- Narrow/responsive layouts still get a fresh calculation after an actual resize.

## Tests

`tests/favorites-deep-parser.test.mjs` covers:

- confirmed positive listing-page signals
- unknown-safe behavior when signals are absent
- structured shipping/availability plus explicit return/exchange values
- the toolbar geometry freeze contract

The project syntax checker now includes this test file as well.

## Deliberately not enabled yet

This phase does **not** start a persistent crawler or automatically request every Favorite listing.

The following remain Phase 5 work:

- persistent deep-scan queue
- resumable/retryable background jobs
- extension background ownership
- Tampermonkey resume-on-next-Etsy-visit fallback
- Scan missing metadata / Update all metadata actions
- scan progress and ETA wiring for deep jobs
- automatic newly-favorited/stale-listing queueing

This separation is intentional: Phase 4 proves parsing and storage first; Phase 5 decides when/how often pages are fetched.

## Phase 5 handoff

The queue should call `favDeepFetchListing(...)`, then commit successful results with `favIndexApplyDeepListingObservation(...)`.

Priority remains:

1. fields required by an active filter/sort
2. newly favorited listings missing deep metadata
3. current-scope stale listings
4. general background refresh

Unfavorited listings keep dormant deep metadata in IndexedDB and simply leave active Favorites scopes/results. They should not be rescanned unless re-favorited or explicitly maintained later.
