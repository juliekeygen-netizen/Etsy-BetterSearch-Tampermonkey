# Favorites filter-availability ownership and hidden-state audit — 2026-08-30

**Status:** corrected/finalized focused audit after re-checking the Diagnostics recording, the companion IndexedDB export, the final module load order, the v2 rail DOM shape, and the CSS presentation contract.

The earlier first-pass version of this note correctly identified split ownership between the legacy v0.11 availability layer and the v2 rail, but it overstated one mechanism: the legacy writer does **not** generally walk v2 option instances and re-show them, because the v2 rail no longer uses the legacy section/option identity model. The final root cause is more concrete and is recorded below.

## Executive summary

The user-visible failure had two cooperating defects:

1. **v2 correctly set unavailable option roots to `hidden`, but v2 CSS declared `.ebsf-v2-option { display:grid }` without an authoritative `[hidden] { display:none }` rule.** Author CSS therefore defeated the visual effect of the HTML `hidden` state, so options that the availability predicate had correctly marked unavailable could remain visibly rendered.
2. **Settings and older reapply wrappers still targeted the legacy v0.11 availability writer rather than one final rail-version-aware dispatcher.** On a v2 rail that path is semantically the wrong owner and is largely ineffective/no-op because v2 uses drawer-instance and binding-instance identity rather than the old section-option model.

The correct bounded release is therefore:

```text
v2 availability predicate
  -> one v2 facet refresh owner
  -> root.hidden = true/false
  -> CSS guarantees [hidden] means display:none
```

while old pre-v2 fixtures may continue to use the legacy availability writer through a dispatcher.

---

## 1. Capture and IndexedDB evidence

The Diagnostics session recorded `Hide unavailable catalogue filters` set to `Current filtered items`, yet categories with no matching Favorites remained visible. The user then compared modes and observed that the drawers/options appeared effectively unchanged.

The companion IndexedDB export materially narrows the explanation:

- exported active listings had category metadata present;
- only a subset of Etsy top-level categories was represented by those records;
- therefore the simple explanation “category is unknown, so fail open” is insufficient for the observed full category catalogue.

This motivated the source-level recheck of the final v2 visibility path.

---

## 2. The v2 predicate itself is already category-specific

`src/85-favorites-filter-revamp.js` owns the current drawer/binding model:

```text
favRecordsForBinding0120(bindingKey)
favBindingAvailable0120(bindingKey)
favBuildDrawer0120(...)
favRefreshFacetAvailability0120(...)
```

For `Current filtered items`, `favRecordsForBinding0120()` evaluates a faceted record universe with the current binding removed from the active config.

For categories, `favBindingAvailable0120()` deliberately requires positive evidence:

```text
records.some(record => favCategoryMatch(record.deepMetadata?.category, categoryKey))
```

It does not globally treat unrelated unknown deep metadata as evidence that every category is available.

An already-active binding remains available so the user can still clear it.

That is the correct semantic direction.

---

## 3. The decisive presentation bug: CSS overrode `hidden`

The v2 build/refresh path writes visibility using the HTML property:

```text
option.hidden = !favBindingAvailable0120(...)
root.hidden = found.option.hidden || !favBindingAvailable0120(...)
```

But the v2 stylesheet contained:

```css
.ebsf-v2-option { display:grid; gap:6px }
```

without an explicit v2 `[hidden]` rule.

The HTML `hidden` attribute is normally implemented by the user-agent stylesheet through `display:none`. An author stylesheet that explicitly sets `display:grid` on the same element can override that default presentation.

So the runtime could reach the logically correct state:

```text
root.hidden === true
```

while the option remained visibly laid out as a grid.

This is the strongest source-level explanation for the exact capture behavior and is the primary correctness bug fixed by v0.15.4.

Required invariant:

```css
.ebsf-v2-option[hidden] { display:none !important }
```

The same principle should be applied whenever BetterSearch uses the HTML `hidden` state on elements that also receive explicit author `display` rules.

---

## 4. Split refresh ownership is still real, but its effect is different than first assumed

The legacy v0.11 layer remains in:

```text
76-favorites-layout-state.js
78-favorites-filter-layout-runtime.js
82-favorites-layout-settings.js
```

It owns the old model:

```text
section key
legacy option units
favApplyFilterLayoutAndAvailability0110(...)
```

The current v2 rail in module 85 instead uses:

```text
drawer instance IDs
option instance IDs
binding keys
favRefreshFacetAvailability0120(...)
```

Because these identity models differ, the old writer generally does not correctly own v2 visibility. It is not accurate to describe it as reliably finding every v2 option and unhiding it after the v2 pass.

The actual defect is architectural:

- Settings directly called the legacy writer after changing availability mode;
- older save/reapply wrappers also scheduled the legacy writer;
- module 85 separately scheduled the real v2 facet refresh;
- behavior therefore depended on two different refresh APIs, one of which was the wrong semantic owner for the mounted rail.

This creates redundant work, makes Settings refresh behavior inconsistent with normal v2 reapply behavior, and obscures which function is authoritative.

---

## 5. v0.15.4 ownership boundary

The bounded fix establishes one dispatcher:

```text
favRefreshFilterAvailability0110(rail)
```

Its contract is:

```text
if mounted rail is v2
    schedule v2 facet availability owner
else
    run legacy v0.11 availability owner
```

Settings, legacy save/reapply wrappers, and the old catalogue-pruner compatibility hook call the dispatcher instead of directly mutating a v2 rail through the legacy model.

The v2 implementation remains in module 85. No new module is added solely to override module 85.

---

## 6. Correct availability semantics

### Disabled

Availability does not hide otherwise user-visible configured controls.

### Current catalogue

For each binding, availability is calculated from the current catalogue universe for the active Favorites scope.

### Current filtered items

Use faceted semantics:

```text
records = current result with this binding removed
```

Then show the option only if applying it could match at least one record, subject to that binding's metadata requirements.

### Active binding

An active binding remains visible even if the current record universe otherwise says it is unavailable, so the user can turn it off.

### Metadata uncertainty

Availability should be dependency-specific. Unknown shipping/gift-wrap/etc metadata must not automatically force all categories visible when category metadata itself is known.

---

## 7. Regression requirements implemented for v0.15.4

### Rail-version dispatch

For a v2 rail:

```text
v2 facet scheduler called
legacy availability writer not called
```

For a legacy rail:

```text
legacy writer remains available
```

### Settings/reapply ownership

Settings and legacy reapply wrappers must call the final dispatcher rather than directly calling the legacy writer on the mounted v2 rail.

### Hidden-state presentation

The source must maintain both:

```text
runtime: root.hidden = ...
CSS: .ebsf-v2-option[hidden] { display:none !important }
```

so the logical state and visible state cannot diverge.

### Category positive evidence

Fixture with known categories:

```text
Jewelry present
Art & Collectibles present
Clothing absent
```

must produce:

```text
Jewelry visible
Clothing hidden
```

while an active Clothing binding remains visible until cleared.

### In-place update

`favRefreshFacetAvailability0120()` must mutate option visibility in place and must not rebuild/replace/remove the rail merely to update availability.

This protects rail identity, focus, open drawer state, and scroll state.

---

## 8. What this release intentionally does not solve

v0.15.4 does not include:

- the stable-sidebar mount refactor;
- Etsy/Preact ownership separation for the persistent rail;
- immutable catalogue snapshot generations;
- signed render-generation transactions;
- grid/pager atomic ownership;
- global reconciliation/no-op-write consolidation.

Those remain separate releases so this fix stays low-risk and directly attributable to the recorded availability failure.

---

## 9. Priority after correction

This remains a **P1 correctness/UI release immediately after v0.15.3**.

The next higher-impact lifecycle task remains the stable rail ownership refactor because the raw Diagnostics mutation stream directly proved Etsy reconciliation entering and deleting BetterSearch rail children while the rail is mounted inside Etsy's hydrated sidebar boundary.