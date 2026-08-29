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

The **v0.15.0 design contract** was that the BetterSearch pager would remain semantically distinct from Etsy's `Favorite Items Page Results` native pager and would never become eligible for native page-state discovery. The v0.15.1 native-presentation change currently violates that semantic boundary by copying the native aria label; see the post-v0.15.1 findings below.

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
- local result count >20 creates a distinct BetterSearch-owned pager;
- Etsy native pager state is preserved before local hiding and restored afterward;
- `[data-ebsf-native-hidden="1"]` and `nav[data-ebsf-native-pager-hidden="1"]` receive explicit `display:none!important` ownership rules so Etsy utility CSS cannot make both result owners visible simultaneously.

The current v0.15.1 implementation intentionally clones Etsy's WtPagination classes/presentation for visual parity. Visual cloning must not imply native semantic identity; the selector regression documented below is a violation of this ownership rule.

### `src/95a-favorites-native-page-state.js`

- Etsy WtPagination continues to define native view identity;
- native pager clicks seed only transient native page intent;
- native page clicks no longer intentionally mutate `favState.localPage`;
- native page reconciliation can continue observing/caching Etsy's current page while BetterSearch local results use their own page identity.

The current v0.15.1 selector implementation still needs a local-pager exclusion to make those statements true in the presence of the cloned local pager.

### `src/101-favorites-v0141-smoke-fixes.js`

The integrity check now verifies browser-visible ownership, not only attributes:

- local grid must not compute to `display:none`;
- native grid must compute to `display:none` while local mode is authoritative;
- native pager must also be visually suppressed;
- if local pagination requires multiple pages, the BetterSearch pager must describe the current page/page count;
- a soft Etsy reconciliation first reasserts visual ownership; only a genuinely stale result signature re-enters the full `favReapply()` pipeline.

The full Diagnostics audit later showed that the final point is not sufficient: semantic render generation must be validated before local visual ownership is reasserted.

## Pagination semantics

BetterSearch local pages are intentionally independent of Etsy native pages.

Example with 44 filtered matches:

```text
BetterSearch page 1 -> matches 1–20
BetterSearch page 2 -> matches 21–40
BetterSearch page 3 -> matches 41–44
```

Clicking the BetterSearch pager is intended to re-render only a local slice. It must not seed Etsy native page intent, trigger native `landing-listings?offset=...` navigation, or redownload the complete catalogue.

Changing the active dataset/filter/sort resets BetterSearch local pagination to page 1.

## Regression coverage added/updated

Tests for the v0.15.0 architecture assert:

- module 86 cannot force `pageSize = records.length`;
- module 95 owns a 20-item local pager without replacing the renderer chain;
- native Etsy page clicks cannot intentionally mutate BetterSearch local-page state;
- five local results have one page and no local pager;
- 44 matches divide into 20 / 20 / 4;
- local page clicks re-render only the current local slice and do not fetch/navigate;
- native grid and native pager have explicit strong hide contracts in local mode;
- returning to native mode removes the BetterSearch pager and restores Etsy pager state;
- the final integrity layer checks computed visibility and local-pagination ownership.

The post-v0.15.1 audit shows that selector/event interaction coverage must be stronger than source-string/isolated-state tests: a retained real native pager and a visible cloned local pager must coexist in the same fixture.

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

---

## Post-v0.15.1 browser/source evidence — 2026-08-29/30

The long Diagnostics session analyzed in `FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md` exposed two additional ownership failures. The second source audit in `FAVORITES_AUDIT_CONTINUATION_2026-08-30.md` then proved a third current-production selector/event bug.

### Local empty result can win after Etsy has already restored valid native cards

A native-search clear transition reached a state where Etsy's native grid again contained real cards, but BetterSearch subsequently kept it hidden and rendered a local grid containing only `No favorites match these filters.`

This means visual exclusivity alone is insufficient. The local renderer needs a **generation/transaction validity check** before it is allowed to take ownership.

The local takeover signature should include at least:

```text
dataset key
committed native-query generation
catalogue generation/completeness
filter/sort config hash
metadata requirement generation
result generation / ID signature
```

If any component changes while local work is in flight, the result is stale and native ownership must remain visible.

Current module 101 does not provide this full token. Its requested render signature is approximately dataset key + normalized BetterSearch config, so materially different catalogue/query/result generations can still compare equal.

The integrity repair also currently reasserts local visual ownership before it has finished proving semantic authority. The correct order is the reverse: verify generation, then atomically change visible grid+pager ownership.

### Native pager can remain visible while local grid owns an empty result

The recording also captured:

```text
local grid visible: empty result
native grid: real cards but hidden
native pager: visible
local pager: absent
```

Grid owner and pager owner must therefore transition atomically. It is an invariant failure for local results to be authoritative while the native pager is still visibly actionable.

### v0.15.1 local/native pager selector alias is source-proven

This is no longer merely a precautionary source issue.

Current module 95 constructs the BetterSearch local pager as a `<nav>` with:

```text
data-ebsf-local-pagination="1"
data-clg-id="WtPagination"
aria-label = native aria-label or "Favorite Items Page Results"
```

Module 95's own `favNativePagers0150()` correctly excludes `[data-ebsf-local-pagination]`.

Current module 95a does **not** use that exclusion. Native page discovery uses:

```text
nav[aria-label="Favorite Items Page Results"]
```

and its document capture click listener uses:

```text
nav[aria-label="Favorite Items Page Results"] button
```

without excluding BetterSearch local ownership.

The local pager listener runs on `document` capture and calls `stopPropagation()`, not `stopImmediatePropagation()`. The later module-95a listener is also on the same `document` capture target, so ordinary propagation stopping does not prevent that same-target listener from running.

Therefore a BetterSearch local page click can be interpreted by module 95a as an Etsy native pager click and seed `favState.nativePageIntent0139`, followed by native page reconciliation scheduling.

Required bounded fix:

- every native-pager discovery selector excludes `[data-ebsf-local-pagination]`;
- the click handler has the same exclusion;
- prefer one shared native-pager helper as the sole native identity source;
- consider a distinct local pager aria label while preserving Etsy visual classes;
- keep native and local semantic identity separate even when presentation is cloned.

### Required dual-pager regression fixture

Create one DOM fixture containing simultaneously:

```text
real Etsy native pager, retained/hidden, selected page 1
BetterSearch local pager, visible, selected page 2
```

Assertions:

- native current page remains 1;
- local current page remains 2;
- `favNativePager0139()` never returns the local pager;
- clicking local previous/next/numeric buttons does not set `nativePageIntent0139`;
- local clicks do not schedule native-page reconcile;
- clicking the real native pager still seeds native intent normally;
- unrelated DOM mutations do not reinterpret local pager state as native view identity;
- entering/leaving local mode changes both grid and pager ownership as one operation.

### Acceptance criteria added after the full audit

A correct next release must also prove:

1. clearing native search cannot leave a stale local empty state over a restored native grid;
2. a local render prepared for an old catalogue/query/metadata generation is discarded;
3. native pager visible + local owner is detected as an invariant violation;
4. local pager nodes are excluded from every native pager discovery path;
5. repeated ownership reconcile with unchanged state does not rewrite hidden/ARIA/style state unnecessarily;
6. visual parity with Etsy's WtPagination does not require semantic aria-label/selector identity;
7. local page clicks never affect native page intent in the real combined listener order.