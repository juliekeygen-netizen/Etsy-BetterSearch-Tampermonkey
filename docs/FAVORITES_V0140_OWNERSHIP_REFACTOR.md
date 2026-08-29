# Favorites v0.14.0 ownership refactor

Date: 2026-08-29

Status: implemented and merged, with a two-pass post-merge ownership/correctness audit completed afterward. This document records the bounded implementation of the ownership work from `FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`. It is deliberately narrower than the full architecture plan.

## Scope

v0.14.0 changes data and DOM ownership underneath the accepted v0.13.2 Favorites UI. It does not intentionally redesign the Favorites toolbar, rail, collection strip, headers, responsive geometry, or visual styling.

Implemented in this release:

1. one complete-catalogue service;
2. demand-driven metadata coordination;
3. BetterSearch-owned local results grid with Etsy-native grid preservation;
4. scope-bounded IndexedDB reads for automatic deep maintenance;
5. release-gate tests and `git diff --check` coverage.

Explicitly deferred:

- lifecycle/MutationObserver consolidation;
- server-filter delegation experiments;
- a new local-pagination architecture;
- late-module-chain consolidation;
- moving the persistent deep queue into the extension background/service worker.

## 1. Single complete-catalogue owner

`src/61b-favorites-sync.js` contains the authoritative catalogue service and the existing sync compatibility/controller layer.

The old split where `favLoadAll()` and `favSyncScope()` could each crawl an entire Favorites scope has been removed. `favLoadAll()` is a compatibility entry point into the catalogue service, while manual/automatic sync is a freshness-policy/controller consumer of that same service.

Important invariants:

- one production function owns page-by-page complete-scope crawling;
- same-dataset callers coalesce through a dataset-keyed in-flight map;
- unrelated datasets have independent in-flight entries;
- same-dataset cross-tab refreshes use Web Locks when available and a dataset-scoped storage lease fallback;
- the storage-lease fallback heartbeats while work is active so one slow request/retry cannot let the lease expire underneath the owning tab;
- route/view changes do not globally serialize unrelated scope work;
- a refresh is complete only after a page shorter than the 20-item page size is observed;
- exact 20/40/60 totals therefore fetch the next boundary-verification page;
- repeated full-page fingerprints abort safely instead of looping or accepting a false complete snapshot;
- a reordered/rotating full page that contributes zero new listing IDs also aborts safely;
- partial observations remain partial and cannot reconcile absence;
- completed unfiltered All observations remain the authoritative path that may reconcile global unfavorites.

The catalogue merge operation is private to the service so the crawler has no hidden dependency on the legacy data module's merge helper.

## 2. Demand-driven metadata ownership

`src/61h-favorites-metadata-coordinator.js` derives requirements from the active Favorites filter/sort instead of treating auxiliary/deep metadata as one catalogue-wide prerequisite.

The coordinator separates:

- auxiliary capabilities such as shipping cost, returns, exchanges, cart signal, and stock signal;
- deep capabilities such as category, Etsy's Pick, vintage, gift wrap, ships-from, processing, and ship-to metadata.

Scheduling rules:

- no active metadata-dependent filter/sort means no automatic whole-catalogue metadata pass;
- visible/current-page records are prioritized before off-screen records;
- auxiliary requests include only records whose required observations are missing, stale, or context-invalid;
- auxiliary requests capture their dataset/scope before network I/O and discard a response if that dataset becomes stale before the response returns;
- deep queue entries are created only when an active deep capability needs a stale/missing parser result;
- automatic capability-driven deep work respects a terminal failed queue job rather than immediately requeueing it after the retry budget is exhausted;
- manual `Update all` remains a force-requeue path for explicit retries;
- listing IDs are read from IndexedDB by key for the current live set instead of scanning all historical listings;
- owner-scoped maintenance trusts the authoritative All scope only when that scope is complete; an incomplete All scope falls back to the union of known owner-scope membership before keyed listing reads.

Freshness is field-aware. Shipping-sensitive observations include a destination context key and are not reused for a different destination merely because their timestamp is recent. Policy and urgency observations use different TTLs.

Unknown remains distinct from false/zero. While required deep work is pending, BetterSearch leaves the native result set visible. After work settles, unresolved positive-only fields remain represented as unknown and the coverage/count UI exposes that unresolved state rather than presenting it as fully known.

## 3. Native/local grid ownership

The runtime has an explicit ownership split:

- native mode: Etsy owns and displays the native hydrated grid;
- BetterSearch-local mode: BetterSearch renders a separate sibling grid from the complete local result set.

In local mode BetterSearch hides the native grid but leaves it in the document. It does not empty the native `<ul>` or move Etsy's live Preact-owned card nodes into another parent. When a current native card is useful as a presentation template, BetterSearch clones it for the local grid.

When leaving local mode the sibling local grid is removed/hidden as appropriate and the native Etsy grid is revealed again with its original node ownership intact.

Favorite/cart actions on cloned local cards forward to the matching live Etsy control when that native card exists. Existing fallback behavior remains available for records without a live native counterpart.

## 4. IndexedDB performance boundary

Automatic owner-scoped deep maintenance no longer materializes the complete historical listings store before filtering it.

The v0.14 path:

1. resolves a complete authoritative All scope for the owner, or owner-relevant scope membership as fallback;
2. deduplicates the scope listing IDs;
3. performs keyed listing reads for those IDs;
4. keeps only currently favorited records.

The generic no-owner utility path may still use the `isFavorite` index and retains a compatibility fallback for older database/index conditions. The automatic owner-scoped startup/deep-maintenance path does not use that whole-history fallback.

## 5. Tests and release gates

v0.14 focused ownership tests cover:

- the full 0/1/19/20/21/39/40/41/60/61 catalogue boundary acceptance set;
- exact repeated-page rejection and reordered full pages with zero new IDs;
- exactly one production crawler;
- same-dataset coalescing and unrelated-dataset independence;
- Web Locks plus the heartbeating storage-lease cross-tab fallback;
- capability-driven metadata requirements;
- field/context freshness behavior;
- stale auxiliary-response rejection and captured-scope persistence;
- no plain-browsing whole-catalogue deep scan;
- terminal failed-job protection with manual force-retry preservation;
- complete-authoritative-scope requirements for owner maintenance;
- sibling local-grid ownership and native-grid preservation;
- dependency-aware pending/unresolved metadata behavior.

The repository CI release gate runs:

1. checkout with full history;
2. `git diff --check` against PR base/head;
3. repository syntax/consistency checks;
4. the complete Node test suite;
5. Chrome build;
6. Firefox build;
7. artifact uploads for both extension targets.

## Post-merge audit record

Two independent audits were performed after the first v0.14.0 merge.

Audit 1 mapped the merged implementation back to the bounded plan and confirmed the intended v0.14 ownership boundaries are actually present. The lifecycle-controller consolidation, server-filter delegation experiments, dedicated local-pagination architecture, and late-module-chain consolidation remain intentionally deferred rather than partially implemented by accident.

Audit 2 adversarially checked route races, IndexedDB membership semantics, deep-queue retries, cross-tab ownership, and catalogue boundary behavior. It found the following edge cases and hardened them in their existing owning modules rather than adding another late compatibility layer:

- stale auxiliary responses after a dataset change;
- partial All-scope membership being treated as authoritative for deep maintenance;
- automatic requeue loops after terminal deep-scan failure;
- storage-lease expiry during one unusually slow catalogue request/retry;
- full duplicate pages whose listing order changes while contributing no new IDs;
- missing regression coverage for 21/39/41 catalogue sizes.

No visual/style/runtime-shell redesign was introduced by the audit fixes.

## Manual smoke tests still required

Automated CI does not replace a real logged-in Etsy smoke test. Before calling the release fully field-verified, exercise at minimum:

- All Favorites with no BetterSearch-only filter/sort;
- a real collection;
- page navigation and Back/Forward within one dataset;
- exact-multiple catalogue sizes when a suitable account/fixture is available;
- Strict and Multi local modes;
- shipping/returns/carts/deep filters;
- switching a metadata-dependent filter on and off while a scan is pending;
- unfavorite/favorite and cart actions from a BetterSearch-local card;
- two tabs requesting the same scope;
- two tabs/scopes requesting different datasets;
- narrow responsive layouts in Chrome and Firefox/Tampermonkey where practical.

Any visual change outside the existing accepted contract should be treated as a regression unless deliberately approved separately.
