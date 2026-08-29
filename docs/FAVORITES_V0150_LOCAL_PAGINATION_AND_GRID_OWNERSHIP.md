# Favorites v0.15.0 — local pagination and grid ownership

## Why this release exists

A logged-in Favorites browser/HAR smoke pass after v0.14.2 exposed two production-only ownership failures that were not represented by the existing static tests:

1. when a BetterSearch-only filter/sort became active, Etsy's native grid could remain visibly painted while the BetterSearch sibling grid rendered below it, so the same listings appeared twice;
2. an older page-shell wrapper forced BetterSearch local mode to render every matching record in one page by setting `pageSize = records.length`, producing very large result grids (for example, roughly 44 matches as eleven four-column rows) even though the base v0.14 renderer already had a correct 20-item slice.

The raw HAR and logged-in DOM/session material are intentionally not committed. This document records only sanitized architectural conclusions.

## Root causes

### Native/local visual exclusivity was state-only, not browser-visible

The v0.14 local renderer marked Etsy's native grid with `hidden` and `data-ebsf-native-hidden`, but Etsy utility CSS/reconciliation can still make native content visibly participate in layout. The v0.14.2 integrity check only verified JavaScript attributes and did not verify computed visibility.

Therefore this state could incorrectly pass the integrity check:

```text
renderMode = bettersearch-local
local grid connected
native grid hidden attribute = true
native marker present
BUT native grid is still painted
```

### Module 86 still disabled the base local slice

`src/86-favorites-page-shell.js` contained a historical wrapper that reset `localPage = 1` and set `pageSize = records.length` before every local render. This predated the v0.14 ownership model and survived the later module-95 cleanup.

The base renderer in `src/63-favorites-runtime.js` already slices filtered results with:

```text
start = (localPage - 1) * pageSize
page = matched.slice(start, start + pageSize)
```

so the correct fix is to remove the obsolete wrapper rather than add another renderer.

### Etsy native page identity and BetterSearch local page identity were aliased

`src/95a-favorites-native-page-state.js` previously copied an Etsy WtPagination click into `favState.localPage`.

That is incorrect once BetterSearch filters/sorts the complete catalogue:

```text
Etsy native page 2
!=
BetterSearch filtered-results page 2
```

Native pagination is a view identity for Etsy's current 20-card page. BetterSearch local pagination is an independent page inside the complete filtered/sorted result set.

## v0.15.0 ownership contract

### Native mode

```text
Etsy native grid: visible
Etsy native pager: visible/owned by Etsy
BetterSearch local grid: absent/hidden
BetterSearch local pager: absent
```

Etsy order with no BetterSearch-only filter/sort stays native.

### BetterSearch local mode, 20 or fewer matches

```text
Etsy native grid: retained structurally, strongly visually hidden
Etsy native pager: retained structurally, strongly visually hidden
BetterSearch local grid: visible
BetterSearch local pager: absent
```

### BetterSearch local mode, more than 20 matches

```text
Etsy native grid: retained structurally, strongly visually hidden
Etsy native pager: retained structurally, strongly visually hidden
BetterSearch local grid: visible, 20 records per page
BetterSearch local pager: visible, BetterSearch-owned
```

The BetterSearch pager never uses Etsy's `Favorite Items Page Results` label and never moves/recreates Etsy's WtPagination DOM.

### Return to native mode

The BetterSearch local pager is removed, Etsy's prior pager hidden/inert/ARIA state is restored, and the existing native-grid restoration path reveals the untouched Etsy grid again.

## Implementation

### `src/86-favorites-page-shell.js`

- removes the obsolete `favRenderCurrent0122` override;
- no longer changes local `pageSize` or forces local page 1 on every render;
- no longer owns local pagination;
- preserves the real renderer chain, including module-89 post-render shell/rail repair.

### `src/95-favorites-responsive-pagination.js`

Now owns deliberate local-result pagination without replacing `favRenderCurrent()`:

- fixed local page size: 20;
- dataset + normalized BetterSearch configuration define a local-result request key;
- a changed dataset/filter/sort resets the local result page to 1;
- local page clicks re-slice the already-loaded filtered result set and do not fetch Etsy, change the URL, or rerun catalogue loading;
- local result count <=20 creates no local pager;
- local result count >20 creates a distinct BetterSearch pager;
- Etsy native pager state is preserved before local hiding and restored afterward;
- `[data-ebsf-native-hidden="1"]` and `nav[data-ebsf-native-pager-hidden="1"]` receive explicit `display:none!important` ownership rules so Etsy utility CSS cannot make both result owners visible simultaneously.

### `src/95a-favorites-native-page-state.js`

- Etsy WtPagination continues to define native view identity;
- native pager clicks seed only transient native page intent;
- native page clicks no longer mutate `favState.localPage`;
- native page reconciliation can continue observing/caching Etsy's current page while BetterSearch local results use their own page identity.

### `src/101-favorites-v0141-smoke-fixes.js`

The integrity check now verifies browser-visible ownership, not only attributes:

- local grid must not compute to `display:none`;
- native grid must compute to `display:none` while local mode is authoritative;
- native pager must also be visually suppressed;
- if local pagination requires multiple pages, the BetterSearch pager must describe the current page/page count;
- a soft Etsy reconciliation first reasserts visual ownership; only a genuinely stale result signature re-enters the full `favReapply()` pipeline.

## Pagination semantics

BetterSearch local pages are intentionally independent of Etsy native pages.

Example with 44 filtered matches:

```text
BetterSearch page 1 -> matches 1–20
BetterSearch page 2 -> matches 21–40
BetterSearch page 3 -> matches 41–44
```

Clicking the BetterSearch pager does not trigger Etsy's native `landing-listings?offset=...` navigation and does not redownload the complete catalogue.

Changing the active dataset/filter/sort resets BetterSearch local pagination to page 1.

## Regression coverage added/updated

Tests now assert:

- module 86 cannot force `pageSize = records.length`;
- module 95 owns a 20-item local pager without replacing the renderer chain;
- native Etsy page clicks cannot mutate BetterSearch local-page state;
- five local results have one page and no local pager;
- 44 matches divide into 20 / 20 / 4;
- local page clicks re-render only the current local slice and do not fetch/navigate;
- native grid and native pager have explicit strong hide contracts in local mode;
- returning to native mode removes the BetterSearch pager and restores Etsy pager state;
- the final integrity layer checks computed visibility and local-pagination ownership.

## Scope intentionally unchanged

This release does not change:

- the v0.14 complete-catalogue service;
- metadata requirement/freshness ownership;
- deep queue architecture;
- Etsy server-filter delegation;
- the accepted Favorites header/filter-rail visual contract;
- the broader lifecycle/MutationObserver consolidation phase.

The remaining lifecycle/patch-chain consolidation work is still valuable, but v0.15.0 is bounded to the production failure demonstrated by the browser smoke pass: result-grid exclusivity and correct local-result pagination.

## Manual acceptance test after merge

1. Open a collection with five Favorites, activate a BetterSearch sort/filter, and verify exactly five cards are visible once.
2. Clear all BetterSearch-only enhancements and verify only Etsy's native grid/pager are visible.
3. On All, choose a filter/sort yielding more than 20 results. Verify exactly 20 BetterSearch cards appear on page 1 and a BetterSearch pager appears beneath them.
4. Use BetterSearch page 2/3 and verify the next local slices appear without Etsy native page navigation becoming visible.
5. Change a filter/sort while on BetterSearch page 2/3 and verify local results reset to page 1.
6. Return to Etsy order/no local filters and verify Etsy's native pager still handles page 1 -> 2 -> 3 normally.
7. Repeat All -> collection -> All and local -> native -> local transitions.
8. Confirm the filter rail, metadata hydration, Search geometry, favorite/unfavorite, and cart delegation remain intact.
