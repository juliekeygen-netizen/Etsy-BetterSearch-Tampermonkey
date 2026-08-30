# Favorites filter-availability ownership conflict audit — 2026-08-30

**Status:** focused source audit triggered by the Diagnostics observation that `Hide unavailable catalogue filters` appears ineffective in both `Current catalogue` and `Current filtered items` modes.

This is a source-proven patch-chain ownership conflict. The raw capture/IndexedDB evidence increases confidence that it is user-visible, but the conclusion below comes from current code, not only from screenshots.

## Executive summary

Two different generations of the filter system still believe they own live option visibility:

```text
legacy v0.11 availability owner
  76-favorites-layout-state.js
  78-favorites-filter-layout-runtime.js
  82-favorites-layout-settings.js

new v2 filter-rail owner
  85-favorites-filter-revamp.js
```

The v2 rail has the more precise per-binding availability logic, especially for categories. However, old v0.11 wrappers remain installed around `favSaveAndApply()` and `favReapply()` and run a second legacy availability pass afterward.

That later legacy pass can re-show controls that the v2 owner deliberately hid.

The correct fix is to establish **one final availability writer for the live v2 rail**, not to add a third visibility pass.

---

## 1. Legacy availability layer remains active

`src/76-favorites-layout-state.js` defines:

```text
filterAvailabilityMode
favAvailabilityRecords0110(sectionKey)
favAvailabilityCaps0110(...)
favOptionAvailable0110(...)
favDeepVisibilityReady0110()
```

Its model predates the current v2 binding/drawer architecture.

`src/78-favorites-filter-layout-runtime.js` then defines:

```text
favApplyFilterLayoutAndAvailability0110(rail)
```

which walks `[data-ebsf-section]` and old option units and directly mutates `element.hidden`.

More importantly, module 78 wraps both:

```text
favSaveAndApply
favReapply
```

and schedules another call to the legacy availability writer after the underlying operation completes.

Those wrappers remain part of the final runtime even though a later filter architecture has taken over the rail.

---

## 2. The v2 rail has a separate, newer availability owner

`src/85-favorites-filter-revamp.js` introduced the current drawer/binding model:

```text
favRecordsForBinding0120(bindingKey)
favBindingAvailable0120(bindingKey)
favBuildDrawer0120(...)
favRefreshFacetAvailability0120(...)
```

This model understands the actual v2 binding identity rather than trying to infer availability from old section option units.

For `Current filtered items`, it creates a facet-like record set by evaluating filters with the current binding/section removed.

That is the behavior the UI setting promises.

---

## 3. Category behavior proves the semantic difference

The v2 category logic explicitly says:

> Unknown category metadata is not evidence that every category is available.

For a category binding, `favBindingAvailable0120()` requires a positive category match in the relevant records.

By contrast, the earlier availability path was designed around broader capability/completeness checks. It can preserve options while broad deep metadata is unresolved, even when category itself is known well enough to decide that a specific category has no matches.

The companion IndexedDB export contains known category metadata for every exported active listing and only a limited set of top-level categories are represented.

Therefore the Diagnostics observation that many unsupported categories remain visible cannot be explained merely by category metadata being absent.

---

## 4. Final writer order is the core bug

The problematic effective sequence can be:

```text
user changes filter / reapply completes
-> v2 rail computes precise per-binding availability
-> v2 hides unsupported option
-> legacy module-78 finally/RAF callback runs
-> legacy availability function walks the same live rail
-> legacy rule decides the option is allowed/unknown
-> element.hidden is cleared again
```

Even when both layers happen to agree, the duplicate writers create redundant DOM mutations and make the behavior dependent on callback/RAF ordering.

This violates the broader architectural rule established by the audit:

> one state concept should have one final runtime owner.

---

## 5. Settings currently talks to the legacy writer directly

`src/82-favorites-layout-settings.js` implements the Settings selector for:

```text
Disabled
Current catalogue
Current filtered items
```

On change it persists the preference and directly calls:

```text
favApplyFilterLayoutAndAvailability0110(favState.rail)
```

It also calls that legacy writer again after catalogue/extra-info loading.

So even if the v2 rail itself is correct, the settings UI still targets the pre-v2 mutation owner.

The setting should dispatch to the final rail availability owner, which can choose the correct implementation for the current rail revision.

---

## 6. Required bounded fix

Do not add module 102 merely to patch module 85.

Prefer a small cleanup in the existing ownership modules:

1. define one final `refresh live Favorites filter availability` entry point;
2. when the mounted rail is the v2 drawer/binding rail, only `favRefreshFacetAvailability0120()` may decide option visibility;
3. keep legacy module-78 behavior only for any genuinely still-supported pre-v2 fixture/path, or retire it if no production path needs it;
4. change Settings to call the final entry point rather than the legacy writer directly;
5. stop the old post-`favSaveAndApply` / post-`favReapply` callback from mutating v2 option visibility;
6. preserve user-custom hidden/reordered options and active controls while availability changes;
7. update in place — no full rail replacement for ordinary availability changes.

This release should not include the larger stable-sidebar mount refactor.

---

## 7. Correct semantics

### Disabled

Availability does not hide otherwise configured controls.

### Current catalogue

For each binding, visibility is determined from the complete/current catalogue record universe appropriate to that scope.

### Current filtered items

Use faceted semantics:

```text
records = current filter result with this binding/section removed
```

Then show an option if applying that option could match at least one record, subject to metadata-known rules.

An already-active option must stay visible so the user can turn it off even if the current result set would otherwise make it unavailable.

### Metadata uncertainty

Unknown for one unrelated metadata family must not automatically force every category or other independently-known binding visible.

Availability should be decided per dependency/binding, not from one global `deep complete` boolean.

---

## 8. Required regression tests

### Category with known metadata but unrelated deep fields unknown

Fixture:

```text
records have known category metadata
only Accessories + Art & Collectibles are represented
shipping/gift-wrap/etc may remain unknown
mode = Current filtered items
```

Assert:

```text
represented categories visible
unsupported categories hidden
unrelated metadata uncertainty does not unhide all categories
```

### Final-writer test

Simulate the completion sequence used by `favReapply()`.

Assert:

```text
v2 availability hides unsupported option
legacy post-reapply callback cannot unhide it
```

### Current catalogue vs current filtered items

Construct a small catalogue where an active price/seller filter removes one category.

Assert:

```text
Current catalogue -> category remains available if catalogue contains it
Current filtered items -> category hidden if no record matches other active filters
```

### Active unavailable option remains controllable

An active category/filter must remain visible until the user clears it.

### No rail replacement

Availability-only refresh must retain:

```text
rail root identity
focused control
open drawer state
scroll position
```

### Settings selector

Changing availability mode must invoke the final owner exactly once and produce the same result as an ordinary reapply.

---

## 9. Priority

This is a **small P1 correctness/UI release** and is a good candidate immediately after v0.15.3 A2.

It is lower architectural risk than moving the rail out of Etsy's hydrated sidebar, but it directly addresses a user-observed feature that currently appears nonfunctional and removes one concrete multi-writer conflict before the larger lifecycle consolidation.