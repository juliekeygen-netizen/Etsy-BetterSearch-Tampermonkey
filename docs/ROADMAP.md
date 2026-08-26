# Etsy BetterSearch roadmap

This roadmap is the implementation plan for evolving BetterSearch from a userscript-first project into one shared codebase that can ship as Tampermonkey, Chrome, and Firefox builds while adding a durable Favorites metadata index and deeper filtering later.

The shared build, Favorites UI parity pass, durable metadata index, authoritative cheap Favorites synchronization, persistent deep-listing queue, and Favorites filter reliability pass are implemented. Moving queue ownership into the extension service worker and adding more evidence-backed fields remain future work.

The filter reliability pass adds semantic shipping-origin parsing, verified-destination Ship to behavior, metadata rehydration after deep scans, local filter application with viewport preservation, facet-aware unavailable-option detection, dynamic currency labels, and complete removal of the Favorites video filter. Gift-card support remains visibly unavailable until a dependable source exists.

## Guiding rules

- Keep the existing Tampermonkey install working throughout the migration.
- Chrome, Firefox, and Tampermonkey must share the same feature modules instead of becoming three separate codebases.
- Do not fake unknown metadata. `unknown` is different from `false`, `0`, or unavailable.
- Reuse Etsy's own current-page DOM and same-site logged-in requests where practical.
- Never treat recommendation modules as Favorites results.
- No CAPTCHA, anti-bot, throttling-bypass, or other evasion logic.
- Expensive metadata is loaded only when a filter/sort actually needs it, then cached.
- Every scanner job is cancelable, retryable, resumable, and keyed by stable listing/shop IDs.

---

## Phase 0 — Cross-browser build foundation **(implemented; browser smoke testing continues)**

Goal: make the existing BetterSearch source buildable as a Chrome or Firefox extension without rewriting the working feature modules.

Implemented infrastructure:

- Tampermonkey remains the source-of-truth module ordering through `etsy-bettersearch.user.js`.
- `scripts/build.mjs` bundles that exact ordered module list into an extension content script.
- The extension platform prelude provides the existing synchronous `GM_getValue`, `GM_setValue`, and `GM_addStyle` surface on top of `browser.storage.local` / `chrome.storage.local`.
- Chrome build: Manifest V3 + service worker.
- Firefox build: Manifest V3 + Firefox background script.
- A minimal background shell exists now so the future metadata queue has a stable home.
- GitHub Actions runs syntax/consistency checks, tests, builds both browser targets, and uploads build artifacts.
- Tag releases can package Chrome + Firefox ZIPs together with the userscript.

Exit criteria:

- Existing marketplace and current Favorites functionality behaves the same in Tampermonkey, Chrome, and Firefox.
- Build output contains no remote `@require` dependencies; extension builds run the bundled shared modules.
- All three delivery targets use the same BetterSearch feature source.

Known limitation during this phase: Tampermonkey storage and extension storage are separate. Automatic migration is deliberately deferred until we define an explicit import/export format.

---

## Phase 1 — Browser-extension parity and smoke testing

Before adding more data features, harden the conversion.

Tasks:

1. Install unpacked Chrome build and Firefox temporary add-on build.
2. Smoke-test:
   - Keep filters
   - Strict title
   - Multi-search
   - scan settings
   - sort coverage
   - result rendering
   - imported favorite-heart bridge
   - Favorites sidebar/filter UI
   - Favorites local sorting/pagination
3. Confirm extension storage survives reload/restart.
4. Verify all same-site Etsy requests still carry the logged-in session correctly in both browsers.
5. Add browser-specific compatibility notes only where behavior truly differs.
6. Add a small debug/version panel or console banner so bug reports identify userscript vs Chrome vs Firefox build.

Do **not** start the deep scanner until fetch/session behavior is proven in both browsers.

---

## Phase 2 — Durable Favorites metadata database **(foundation implemented in v0.8.0)**

Goal: separate "what is currently displayed" from "what we know about each favorite".

Implemented stores behind the shared IndexedDB interface:

### `listings`

Key: `listingId`

Important fields:

```text
listingId
url
title
shopId
isFavorite
favoriteScopes / collection memberships
firstSeenAt
lastSeenFavoriteAt
unfavoritedAt
lastCardRefreshAt
lastDeepScanAt
availabilityState
metadataVersion
cardMetadata
listingMetadata
shippingMetadata
urgencyMetadata
```

### `shops`

Key: `shopId`

Store shop-level fields once, not once per listing:

```text
shopId
shopName
starSeller
giftCardSupport
shopRating
shopReviewCount
salesCount
tenure
lastScannedAt
```

### `scopes`

Track authoritative Favorite scopes:

```text
all-items
etsy auto group
custom collection
native Favorites query
```

### Unfavorite lifecycle

An unfavorite should normally **not delete metadata immediately**.

- Direct heart removal: mark `isFavorite=false`, set `unfavoritedAt`, remove from active Favorite scopes/results immediately.
- Removing a listing from one collection while it remains favorited only changes collection membership.
- A listing merely missing from one partial page is never enough evidence to mark it unfavorited.
- A complete authoritative Favorites sync may mark records absent from the full scope as no longer favorite.
- If refavorited later, reactivate the existing record and refresh only stale fields.
- If the Etsy listing itself disappears, preserve the record as `unavailable/deleted` for history/cache cleanup rather than silently discarding it.
- Optional future maintenance action: "Clean unused metadata" for dormant records older than a chosen retention period.

This design avoids needless rescanning and makes refavoriting instant.

Current implementation notes:

- `src/61a-favorites-index.js` is shared by Tampermonkey, Chrome, and Firefox.
- Small preferences remain in the Favorites GM/storage namespace; the potentially large index is not one settings object.
- Current embedded/card observations and records loaded by the existing Favorites runtime update the index.
- Field values preserve `known`, `source`, `observedAt`, and `parserVersion` semantics.
- Fresh structured Star Seller data updates the shop store instead of requiring a shop/listing scan.
- Scope observations explicitly distinguish partial from complete; only completed scope observations reconcile absence.
- Direct unfavorite/refavorite lifecycle preserves reusable metadata.
- IndexedDB schema migrations beyond version 1, retention cleanup, export, and a background owner remain future work.

---

## Phase 3 — Authoritative Favorites scope synchronization **(implemented in v0.9.0)**

Goal: know the complete active Favorite set without opening every listing page.

Implemented behavior:

1. Current embedded Favorites state/card data is observed continuously as a partial cheap source.
2. A dedicated controller synchronizes All Items, generated groups, custom collections, and native Favorites queries through Etsy's same-site pagination JSON.
3. Sequential pages are deduplicated by listing ID and written to IndexedDB in batches.
4. Partial observations survive a retry failure or cancellation without changing the previous complete snapshot.
5. Only a completed unfiltered All Items job may infer a global unfavorite by absence; collection completion removes only that membership.
6. The default auto-sync checks a scope at most when entering/changing Favorites routes and only refreshes a completed snapshot after a 12-hour stale interval.
7. Route changes cancel view-bound work, while an intentionally independent All Items job may finish if its owner remains valid.

UI:

- The native search form is preserved and visually covered only while a meaningful sync displays progress such as `Syncing favorites… 40 / 61`.
- Favorites Settings presents active Favorites, distinct shops, sync state, and last-full-sync time in a compact 2×2 summary, with manual sync, cancellation, and auto-sync controls.
- v0.9.1 consolidates Favorites sorts into a migrated base-sort plus reverse-direction model, keeps unknown numeric metadata last, restores useful native-search width, and shares one scoped chevron/icon language.
- Recommendation modules such as "Discover similar items" remain explicitly excluded.

Terminology and implementation boundary: **Favorites sync** is the implemented, cheap Favorites API/card/auxiliary-data index refresh. A **deep metadata scan** is the future individual listing/shop-page crawler. This phase does not crawl those pages, provide future deep-filter metadata, or implement the persistent deep-scan queue.

---

## Phase 4 — Deep listing metadata parser

Goal: enrich only listings whose required fields are missing/stale.

Fetch pipeline:

1. Request the listing URL as HTML; do not visually open a tab.
2. Parse `application/ld+json` Product data first.
3. Parse Etsy's structured `data-appears-event-data` / page-state fields second.
4. Use targeted DOM selectors only for fields not available structurally.
5. Normalize into the listing/shop database.
6. Discard raw HTML after extraction.

Fields already demonstrated as realistic from listing HTML include:

- category hierarchy / taxonomy
- exact price and original price
- discount percentage
- availability
- reported eligible quantity
- rating and review count
- shop ID/name
- shipping origin
- free-shipping flag
- shipping cost to current destination
- estimated delivery window
- returns/exchanges accepted
- variations
- description/highlights
- production partner
- listing-level favorite count where Etsy exposes it

Fields that require positive examples or network confirmation before becoming filtering truth:

- digital/physical universal flag
- Etsy's Pick
- Star Seller if not available from the Favorites/shop source
- native color attributes
- vintage
- personalizable/customizable
- gift wrapping
- arbitrary ship-to-country availability
- exact processing/ready-to-ship days

Rule: a parser version bump invalidates only fields whose extraction logic changed, not the whole index.

---

## Phase 5 — Persistent scan queue (implemented in shared content runtime)

The cross-browser foundation is implemented with one persistent IndexedDB queue and a bounded content-context worker. This gives all targets identical semantics and restart-safe jobs while an Etsy Favorites page is active.

### Extension behavior

Future extension hardening may move queue ownership into the background context without changing the stored job model.

Each implemented listing job includes:

```text
id
listingId
type
priority
status
attempts
createdAt
startedAt
finishedAt
error
```

Priority examples:

1. Metadata required by the filter currently open/active.
2. Newly favorited listings.
3. Visible current-scope stale listings.
4. General background refresh.

Requirements:

- persistent queue storage
- idempotent jobs keyed by listing/shop + field group
- bounded concurrency
- retry with backoff
- cancellation when no longer needed
- browser restart/suspension safe
- pause or reduce work after repeated Etsy failures
- no retry-budget burning while the browser background context is suspended
- per-field TTLs rather than one universal expiration time

### Tampermonkey fallback

Tampermonkey can use the same parser/database model but only process jobs while an Etsy tab is alive. Persist queue state and resume on the next Etsy visit.

This keeps feature compatibility without pretending a userscript has a true always-available background worker.

---

## Phase 6 — Wire richer Favorites filters and sorts

Only activate a filter once its backing metadata is reliable.

### Strong/local fields first

- price min/max
- sale / minimum discount
- free shipping
- available only / sold out
- rating minimum
- review count minimum
- shop
- Best Seller if present in Favorites JSON
- variations
- personalizable if present

### Deep-index fields after parser validation

- Category tree
- Digital / physical
- Etsy's Pick
- Star Seller
- Ships from
- Ready to ship
- Color
- Vintage
- gift cards / gift wrapping
- Customizable / personalizable
- stock quantity / low stock
- cart-popularity signal
- shipping cost
- returns / exchanges
- estimated delivery
- Ship to country

### Unknown semantics

Every metadata field should support at least:

```text
known value
known false/zero
unknown
stale
```

A filter must not silently reject an `unknown` listing unless the UI explicitly offers a "known only" behavior.

### Category UI

Build the Favorites category tree dynamically from categories actually present in the indexed Favorite set instead of hardcoding Etsy's entire taxonomy. Parent selection includes descendants. Preserve Etsy-style nested navigation and Show more behavior.

---

## Phase 7 — Favorites UI/native-parity pass **(substantially implemented in v0.8.0)**

Desktop layout remains:

```text
[ Filters ] [ Etsy order ▾ ] [ Settings ] [ native Search your favorites... ]
```

Rules:

- Native search form stays native and functional.
- Desktop Filters replace the existing Favorites sidebar in the same column instead of pushing the grid sideways.
- Preserve/detach/reattach actual Etsy sidebar nodes rather than recreating them with `innerHTML`, so Etsy listeners survive.
- Mobile uses a full-height Etsy-style overlay with a bottom `Show results (N items)` action.
- Sort uses Etsy-like transparent trigger/menu styling.
- Strict title and Multi-search stay near the top of the Favorites filter rail and remain mutually exclusive.
- BetterSearch filters persist across Favorite scopes unless Reset is used.
- Current native Favorites search/scope changes update the underlying candidate pool; metadata filters then apply locally.
- Desktop rail scrolls with the document and has no independent scrollbar.
- Fresh pages auto-open sections with active values; arbitrary manual accordion state is not persisted.
- Ordinary control changes keep the mounted rail DOM; structural controls update only their affected section where practical.
- Color remains hidden because no reliable metadata source is known.

Edge cases to test:

- empty collection
- one-item collection
- thousands of favorites
- unfavorite while filtered
- refavorite during the same session
- move between collections
- sold-out/deleted listing
- native Favorites query changed while Multi-search is active
- narrow desktop/tablet breakpoints
- browser back/forward and BFCache

---

## Phase 8 — Migration, export/import, and releases

Once extension parity is proven:

- Add BetterSearch settings export/import as a versioned JSON format.
- Allow Tampermonkey users to export settings/rules and import them into Chrome/Firefox.
- Consider metadata-index export separately because it can be much larger.
- Add schema migrations for browser storage/IndexedDB.
- Keep old schema migration paths for at least several releases.
- Produce tagged GitHub releases with:
  - userscript
  - Chrome ZIP
  - Firefox ZIP
  - release notes with schema/build changes

Do not automatically read Tampermonkey's private script storage from the extension; use explicit user-controlled migration.

---

## Phase 9 — Hardening and maintenance

Ongoing work:

- fixture-based parsers using saved sanitized Etsy HTML/JSON examples
- tests for every known metadata positive/negative/unknown case
- request adapter tests
- card rendering regression tests
- browser smoke tests where practical
- telemetry-free debug logs that can be copied into bug reports
- endpoint/selector fallbacks when Etsy changes page structure
- stale-cache and failed-scan recovery
- documentation of unsupported/unknown filters instead of silent degradation

## Recommended release sequence

```text
0.8.x  cross-browser extension parity + build/test infrastructure
0.9.x  complete authoritative/background Favorites synchronization and index migration hardening
0.10.x deep listing/shop parser + persistent queue
0.11.x wire richer metadata filters/sorts
0.12.x UI/native-parity and large-library hardening
1.0.0  stable Tampermonkey + Chrome + Firefox release line
```

Version numbers are a planning guide, not a requirement. Reliability of the data/index lifecycle matters more than forcing features into a particular version.
