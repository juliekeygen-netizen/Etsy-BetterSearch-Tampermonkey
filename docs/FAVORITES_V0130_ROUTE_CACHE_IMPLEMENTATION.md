# Favorites v0.13.0 route/cache implementation

This document records the implementation of the first three phases in `FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`.

## Scope

### Phase 1 — freeze the current UI

The v0.12.15 Favorites shell is the visual acceptance baseline. Architecture/performance work must not redesign it.

The detailed contract is in `FAVORITES_UI_VISUAL_CONTRACT.md` and is enforced by regression tests covering:

- final 95 -> 98 UI-layer order;
- All using the literal collection-header anatomy;
- invisible All edit/+ geometry twins;
- complete `Public/Private collection | N favorites · M shown` wording;
- exact All/collection Search width and right-edge alignment;
- 1 px Search border;
- no Search X-shift while typing;
- out-of-flow loading/progress position;
- responsive desktop/tablet/phone behavior;
- Etsy ownership of pager DOM and the existing 20-item local page size.

No v0.12.15 shell geometry was intentionally changed in v0.13.0.

### Phase 2 — separate dataset identity from view identity

The runtime now distinguishes:

```text
dataset = owner + scope type + scope id + effective dataset query
view    = native scope/query + requested page
href    = diagnostic only; ref/tracking noise is not an invalidation key
```

Consequences:

- `page=1 -> page=2 -> page=3` retains the complete in-memory catalogue;
- a harmless `ref=`/tracking-only URL change retains the catalogue and current network work;
- a genuine All/collection/query dataset change still performs the full reset;
- same-dataset page transitions do not abort `favLoadAll()` or clear `records`, `recordsById`, `loadKey`, `loadComplete`, or auxiliary metadata state;
- page changes let Etsy settle its new native card DOM before recapturing the native-grid restore snapshot;
- leaving Favorites and later re-entering it is detected explicitly, so returning to the same dataset does not get mistaken for a no-op;
- Back/Forward continues to use the requested `page=` route while enhanced local rendering keeps the existing 20-item page behavior.

This directly addresses the HAR finding where page navigation caused repeated full 0/20/40/60 catalogue downloads.

### Phase 3 — IndexedDB cache-first startup

New module: `src/61e-favorites-cache-bootstrap.js`.

A complete IndexedDB scope is now read before the complete-network loader. The cache reader:

1. reads the exact scope record;
2. requires `scope.complete === true`;
3. reads only listing IDs referenced by that scope, rather than scanning the entire listings store;
4. reads only shops referenced by those listings;
5. rejects a corrupt complete snapshot if a referenced listing record is missing;
6. materializes the live Favorites record model from indexed card/shipping/urgency/deep metadata;
7. overlays current server-rendered Etsy listing/card data where it is already available.

When usable cache data exists, BetterSearch can become data-ready without first crawling every Favorites API page. `favMaybeAutoSync(false)` is then started asynchronously so stale cache refresh no longer blocks the cached catalogue.

## Presentation-snapshot migration

The pre-v0.13 index intentionally did not retain enough presentation-only fields to recreate every off-page card without another network pass. v0.13 therefore stores a compact `presentationSnapshot` beside each listing:

- image URLs;
- formatted current/original price;
- shop name/URL;
- formatted shipping/urgency text;
- a few card presentation booleans;
- observation/version metadata.

It does **not** store entire card HTML.

A legacy complete cache can still hydrate metadata immediately. However, if enhanced global rendering needs off-page cards and those records have not yet received the v0.13 presentation snapshot, BetterSearch deliberately performs one normal network catalogue refresh instead of rendering degraded image-less cards. After that migration pass, future cache-first enhanced startup can use the snapshot.

A <=20-item scope whose entire active set is already present in Etsy's current SSR page can use those live cards immediately even before every record has a persisted presentation snapshot.

## Background refresh behavior

Cache readiness and freshness are separate concepts.

- A complete cache is usable immediately.
- Existing 12-hour synchronization freshness policy remains authoritative.
- Automatic stale synchronization runs in the background instead of being awaited by route startup.
- If a background synchronization completes for the still-current dataset, the live records/filter rail/header are refreshed.
- A running same-dataset sync no longer blocks `favReapply()` when a complete usable catalogue is already in memory.

## Audit findings fixed during implementation

The implementation was audited after the first green/static pass. Additional problems found and corrected:

1. **Whole-database cache reads:** the first draft used `getAll()` for listings and shops. It now performs scope-targeted reads only.
2. **Legacy cache presentation gap:** old complete scopes could otherwise be treated as fully render-ready and create image-less fallback cards. A presentation-version migration gate now prevents that.
3. **Native-page snapshot race:** URL/history can change before Etsy has reconciled the new page's card DOM. Native restore snapshots are now captured after the new page settles, not immediately at the URL change.
4. **Same-dataset re-entry:** leaving Favorites and returning to the exact same All/collection dataset now performs a real re-entry refresh instead of being classified as an href no-op.
5. **Native page reconciliation while enhanced mode is active:** if Etsy replaces the current page cards under an enhanced grid, the runtime recognizes fresh unowned native cards, captures that native page for restoration, then reapplies the already-loaded enhanced catalogue without a catalogue refetch.
6. **Version-lock regression test:** an old UI test incorrectly required exactly v0.12.15. It now protects the UI-layer ordering across later architecture releases without preventing version bumps.

## Explicit non-goals of v0.13.0

These are later phases from the canonical plan and are not silently mixed into this change:

- merging `favLoadAll()` and `favSyncScope()` into one catalogue service;
- demand-driven auxiliary metadata scheduling;
- changing native-vs-local product-grid ownership;
- replacing the body-wide lifecycle observer with the future single controller;
- moving BetterSearch-owned shell DOM outside Etsy's hydrated island;
- experimenting with Etsy server-delegable `query`, `available_only`, `on_sale_only`, or `filters` parameters;
- consolidating/removing modules 86-98;
- document-start critical-CSS/bootstrap work.

Those remain ordered follow-up phases in `FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`.

## Live smoke test after merge

The most important real-Etsy verification is network behavior:

1. open All and wait for it to settle;
2. use pages 1 -> 2 -> 3 -> Back;
3. change only a harmless `ref=` parameter if convenient;
4. switch All -> collection -> All;
5. repeat once with a BetterSearch local filter/sort active;
6. verify the v0.12.15 UI remains pixel-consistent on desktop/tablet/mobile.

Expected result for same-dataset page navigation: BetterSearch must **not** restart a complete 0/20/40/60 catalogue crawl. Etsy may still fetch the one native page it needs. A genuine dataset change or a cache-migration/freshness refresh can still legitimately issue broader requests.
