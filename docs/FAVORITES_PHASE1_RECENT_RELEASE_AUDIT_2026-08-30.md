# Favorites Phase 1 recent-release audit — 2026-08-30

## Scope

This audit starts from verified `main` HEAD `a1a838f8e1953a7242e186d82d4481d661b30d1d` and reviews the recent production boundaries requested by the project handoff:

- BetterSearch 0.15.5 stable rail ownership;
- BetterSearch 0.15.6 immutable catalogue snapshots;
- BetterSearch 0.15.7 diagnostics-driven fixes and final filter-state synchronization;
- Diagnostics 0.2.8 resumable/protected/compressed export.

Raw browser captures, IndexedDB rows, account/listing identifiers and private marker text are intentionally excluded.

## Baseline verification

At audit start:

- BetterSearch was 0.15.7;
- Diagnostics was 0.2.8;
- the userscript loaded 76 shared modules and ended `102 -> 103 -> 104`;
- Diagnostics loaded its eight `document_start` scripts in the expected order;
- the independent push-triggered workflow for the exact `main` SHA was green.

## Finding P1-01 — recommendation fallback identity was only half implemented

**Classification:** proven bug; fixed in the audit branch.

Module 103's mutation detector recognized both known Etsy identities:

```text
#favorites_similar_listings
[data-favorites-similar-listings]
```

but `favSimilarListingsModule0157()` only resolved the ID form with `getElementById()`. A data-attribute-only module could therefore trigger the observer while the offset writer still found nothing.

The existing tests encoded the same blind spot: one assertion checked that the observer selector contained both identities, while the actual offset test explicitly expected only `getElementById('favorites_similar_listings')`.

### Fix

- resolve the live module with one selector supporting both identities;
- make the owned offset marker compare-before-write;
- add regression coverage for the data-attribute identity.

## Finding P1-02 — v0.15.7 added a second body-wide subtree observer for one module

**Classification:** proven lifecycle/performance design defect; fixed in the audit branch.

After v0.15.5 established one final body-level shell observer, v0.15.7 added another `document.body` `childList + subtree` observer solely to detect the zero-result recommendation module.

That duplicated traversal of the same Etsy mutation stream and worked against the project's established rule that lifecycle work should converge on one narrow/final owner rather than accumulate repair observers.

### Fix

The existing final shell observer in module 102 now treats either known recommendation identity as an Etsy structural change. Its existing scheduled shell reconciliation flows through module 103's final `favInstallPageShell0120` wrapper, which schedules the recommendation offset. Module 103 no longer creates its own body-wide MutationObserver.

No new late module was added.

## Finding P1-03 — Diagnostics export UI lock could erase pre-existing accessibility state

**Classification:** proven bug; fixed in the audit branch.

Diagnostics 0.2.8 applied `aria-disabled="true"` to every panel control during export and unconditionally removed `aria-disabled` from every panel control after export. A control that was legitimately `aria-disabled="true"` before export could therefore be made semantically enabled afterward.

The same pattern existed for panel `aria-busy` ownership.

### Fix

Diagnostics 0.2.9 marks only accessibility state it introduces and removes only those owned attributes during unlock. A functional regression test covers:

```text
already aria-disabled control -> remains aria-disabled
previously enabled control     -> locked during export -> restored afterward
owned aria-busy                -> restored afterward
```

## Finding P1-04 — Diagnostics export UI used page-wide mutation observation plus 120 ms polling

**Classification:** proven instrumentation self-churn risk; fixed in the audit branch.

The 0.2.8 export-state UI watched `document.documentElement` with `subtree:true` for every `hidden` mutation while also running `setInterval(sync, 120)`. During an export `sync()` could repeatedly rewrite the same lock attributes.

This was especially undesirable after Diagnostics 0.2.5 had already proven that instrumentation feedback/no-op mutation work can materially interfere with Etsy startup.

### Fix

Diagnostics 0.2.9 now:

1. watches only `documentElement`'s direct child list until the resumable-export overlay is created;
2. disconnects that bootstrap observer;
3. observes only the overlay's authoritative `hidden` attribute afterward;
4. removes the 120 ms polling loop;
5. compares owned lock/frozen-state values before writing.

## Finding P1-05 — v0.15.7 semantic active-filter owner covers the current v2 registry

**Classification:** audited / no concrete bug found in this pass.

The current v2 registry was compared against module 104's `favBindingMeaningfullyActive0157()` logic. The final semantic owner covers the current binding families, including dynamic `ships-origin:XX`, categories, Search modes, price, boolean item-quality filters, item format, seller, numeric popularity/rating/delivery filters and Returns/Exchanges.

The audited neutral rules remain intentional:

- Ships from Anywhere;
- country mode without a selected country;
- empty price/shop/numeric values;
- item format All/default;
- false booleans.

Numeric string `"0"` is currently treated as active, which is consistent with the filtering implementation because specifying zero can still change unknown-metadata treatment. No change is made here without a product-semantics decision.

## Finding P1-06 — immutable-snapshot write path has a cross-tab stale-read/write window

**Classification:** source-level concurrency risk / test gap; not yet fixed in this bounded patch.

The v0.15.6 writer correctly prevents same-tab partial crawler pages from editing committed `listingIds`. However, its final observation path still performs:

```text
readonly transaction: read listings/scope
-> compute merged scope record in JavaScript
-> later readwrite transaction: write computed record
```

`favIndexEnqueue()` serializes work only within one document. The catalogue service's cross-tab lease protects complete crawler ownership, but incidental/current-page index observations are not necessarily under that lease.

A stale observation from tab A can therefore theoretically read generation N, tab B can commit generation N+1, and tab A can later write a scope record computed from generation N.

This matters because the required v0.15.6 invariant is not merely "partial pages do not edit committed membership"; committed snapshot generation must also never regress.

### Required next proof/fix

Before changing the persistence layer, add a regression model that deliberately interleaves two writers and proves whether a stale observation can regress:

- `snapshotGeneration`;
- `snapshotCommittedAt`;
- committed `listingIds`;
- pending generation state.

The preferred fix is a transaction-level compare/merge fence that re-reads the latest scope inside the same readwrite transaction used for the commit, rather than another global wrapper/lease.

## Finding P1-07 — expected total `0` remains semantically ambiguous

**Classification:** test gap / source risk; not changed yet.

The v0.15.6 expected-total guard currently treats only `expectedTotal > 0` as authoritative. That safely avoids rejecting a crawl when Etsy supplies no usable total, but it also means the code cannot distinguish:

```text
unknown / unavailable total
```

from:

```text
authoritative current Etsy total = 0
```

A future test should preserve an explicit "known total" bit rather than infer authority from a positive integer. This is lower priority than the generation-regression race but belongs in the snapshot contract.

## Finding P1-08 — ZIP DEFLATE coverage is functional but central-directory validation is still partial

**Classification:** test gap; existing implementation retained.

The existing Diagnostics tests functionally inflate a representative DEFLATE local entry and verify byte-for-byte equality, and separately verify STORE/fallback behavior. The exporter also contains ZIP64 central-directory support.

The audit has not yet found a concrete compression corruption bug. A useful additional hardening test would parse the complete synthetic central directory/EOCD (including ZIP64 when forced) and independently inflate representative entries rather than validating only a local entry header.

## Branch release identity

The bounded fixes above are being versioned as:

```text
BetterSearch 0.15.8
Diagnostics 0.2.9
```

The userscript module count/order is intentionally unchanged. This audit does not add module 105.

## Release gate

Before merge:

```text
git diff --check equivalent repository checks
npm run ci
Chrome build
Firefox build
Diagnostics build
exact-head CI
```

After merge, the independent push-triggered `main` workflow must also be green before the release is treated as complete.
