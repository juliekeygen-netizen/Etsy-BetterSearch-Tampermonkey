# Favorites shell/rail ownership and reconcile audit — 2026-08-30

**Status:** source audit completed; core ownership boundary implemented in BetterSearch v0.15.5 candidate.

This document began as a focused audit against the v0.15.1 shell. The 2026-08-29 Diagnostics recording later supplied direct runtime evidence that Etsy/Preact reconciled into the BetterSearch rail while it lived inside Etsy's hydrated sidebar. v0.15.5 implements the resulting stable-boundary design rather than adding another “repair it faster” observer.

## 1. Capture-proven failure in the old shell

The old permanent rail was mounted as a direct child of:

```text
[data-testid="sidebar"]
```

and `favCaptureNativeSource0120()` also moved Etsy's native sidebar children into a BetterSearch-owned hidden wrapper.

The Diagnostics mutation stream proved the practical consequence. During hydration/reconciliation Etsy inserted native sidebar content such as `View all` into `[data-ebsf-rail]` and removed BetterSearch-owned controls from that same rail, including the Filters header, Search, Category and other drawers.

That was not merely a sidebar-host replacement. The sidebar host could remain stable while the framework reconciled its expected child structure through the injected BetterSearch tree.

Therefore the old structural model violated the ownership boundary in both directions:

```text
BetterSearch persistent identity inside Etsy-owned child list
Etsy-owned native children moved into BetterSearch wrapper
```

No observer can make that arrangement reliably stable.

---

## 2. v0.15.5 target: body-level rail portal

A first source-design option was a sibling slot beside the native sidebar. The audit rejected that as insufficiently strong because the sidebar's parent can itself still be part of a higher Etsy-managed child list.

The v0.15.5 design instead uses:

```text
document.body
  BetterSearch rail portal
    permanent rail

Etsy component tree
  native sidebar
    native Items / Collections / View all / Shops / Create controls
```

The portal is outside the Etsy component subtree rather than merely outside the immediate sidebar node.

### Why a portal instead of hiding/removing the native column

The native sidebar remains in exactly the layout position Etsy created. BetterSearch applies visual suppression:

```text
visibility: hidden
pointer-events: none
```

rather than removing it from layout with `display:none`.

That preserves Etsy's own grid/flex column geometry. The BetterSearch portal is `position:fixed` and tracks the real `getBoundingClientRect()` of that native sidebar.

The result is:

- Etsy still owns and reconciles its native sidebar structure;
- the native sidebar continues reserving the correct column/width;
- BetterSearch owns all descendants of the rail portal;
- there is no injected rail node in Etsy's hydrated child list;
- there is no extra injected sibling in the sidebar's parent child list.

---

## 3. Native source capture is now read-only

The compatibility name `favCaptureNativeSource0120()` remains because several collection/shop helpers already call it.

Its v0.15.5 meaning is different:

```text
remember native sidebar as the source root
return it
```

It must not:

```text
append children
prepend wrappers
replace nodes
remove nodes
set native children inert
move native children into a hidden source
```

Helpers such as All/Create/Shops can query or clone from the intact native sidebar without owning its descendants.

This removes the capture/re-capture loop that previously produced BetterSearch-induced sidebar childList mutations.

---

## 4. Native layout remains authoritative

The body portal follows the sidebar's viewport rectangle:

```text
left = sidebar rect.left
top = sidebar rect.top
width = sidebar rect.width
```

Geometry is refreshed through:

- normal shell installation/repair;
- `ResizeObserver` on the native sidebar;
- a single coalesced animation-frame geometry update on scroll;
- resize updates.

Using the live native rect means BetterSearch does not need to duplicate Etsy's breakpoint widths or infer parent grid columns.

The native node remains the geometry authority even while its pixels are hidden.

---

## 5. Permanent rail root identity is preserved

The old desktop `favRefreshRail()` always performed a whole-root transition equivalent to:

```text
old.replaceWith(replacement)
```

That created a new rail generation and caused observers to see an apparent rail disappearance/reappearance.

v0.15.5 retains the stable portal rail root. When a structural rebuild is genuinely required, BetterSearch builds replacement contents and moves those children into the existing root:

```text
rail.replaceChildren(...replacement.childNodes)
```

This does not yet make every drawer/control update fully in-place, but it establishes the important shell invariant:

> ordinary BetterSearch refreshes do not create a new permanent rail root generation.

Availability-only updates continue using the in-place facet path from v0.15.4.

---

## 6. The final module-101 rail assertion required adaptation

A deeper load-order audit found that module 101 still verified permanent-rail health using:

```text
sidebar.querySelector(':scope > [data-ebsf-rail]')
```

and its failure recovery restored children from the historical hidden-source wrapper.

That final layer would have invalidated the new boundary even if the earlier shell was fixed.

v0.15.5 therefore finalizes the ownership contract after module 101:

```text
healthy permanent rail
= connected [data-ebsf-rail]
+ closest [data-ebsf-rail-slot]
+ portal parent is document.body
```

Failure recovery now only removes the BetterSearch portal/suppression state. It never restores or moves native children because BetterSearch no longer took those children in the first place.

---

## 7. Shell observer scope is narrowed

Once the rail is outside Etsy's subtree, arbitrary text/wrapper churn inside the native sidebar is no longer evidence that the BetterSearch rail needs repair.

The final v0.15.5 shell observer ignores mutations inside the BetterSearch portal and limits native-sidebar descendant triggers to controls BetterSearch actually reads, such as:

```text
All/items link
Create collection button
Shops navigation
```

It still repairs for structural host/content replacement and can recreate the body portal if an outside actor removes it while desktop Favorites is active.

`ResizeObserver`, rather than generic sidebar DOM churn, owns rail geometry updates.

This directly reduces one of the self-reconcile/no-op paths identified in the large Diagnostics recording.

---

## 8. Availability final-owner issue found during the same load-order audit

The stable-rail trace uncovered another late-wrapper conflict relevant to the earlier availability recording.

Module 101 wrapped category availability with a broad global deep-completion fail-open rule. Because the capture/index already showed different live/index universes (for example 107 versus 114 records), global deep readiness can remain false even when category metadata itself is known.

That can re-show a category after the v2 category predicate has proven it has no matching records.

The final v0.15.5 boundary therefore keeps category availability dependency-specific:

```text
Disabled -> visible
Active category -> visible so it can be cleared
Configured category + positive category match -> visible
Configured category + no category match -> unavailable
```

It does not require unrelated global deep metadata to be complete before making a category decision.

This is a final-load-order completion of the v0.15.4 availability fix, not a new broad filter architecture.

---

## 9. Teardown contract

The old teardown had to move native children back out of `.ebsf-native-favorites-source`.

v0.15.5 teardown is simpler:

```text
remove BetterSearch collection/header surfaces as appropriate
remove body-level rail portal
remove native-sidebar visual suppression class
clear BetterSearch rail state
```

There is no native-child restoration step and no native child-node mutation.

---

## 10. Required regression invariants

The v0.15.5 suite explicitly covers:

### Load order

```text
87 style
-> 87a ownership boundary
-> 88+ stability layers
...
101 historical final smoke layer
-> 102 v0.15.5 final ownership boundary
```

### Native capture

Assert the final capture function does not append/prepend/replace/remove/reparent Etsy children.

### Portal ownership

Assert desktop rail is appended under `document.body`, not under the sidebar or its parent.

### Layout preservation

Assert the native sidebar is visually suppressed with `visibility`, not removed from layout with `display:none`, and the portal follows the native rect.

### Root identity

Assert refresh updates the existing rail root rather than replacing it.

### Final smoke integration

Assert module-101's final rail-health function is overridden to validate the body portal rather than direct-sidebar ownership.

### Category final owner

Assert no global `favDeepVisibilityReady0110()` gate can make an unsupported category visible after the final module loads.

### Observer scope

Assert BetterSearch portal churn is ignored and generic native sidebar wrapper/text churn is not automatically a shell-repair trigger.

### Teardown

Assert final teardown contains no native-source child restoration/reparenting path.

---

## 11. What v0.15.5 does not yet solve

This release deliberately does not claim to solve every lifecycle problem found in Diagnostics.

Remaining work includes:

- immutable catalogue snapshot generations instead of mutable completion semantics;
- signed render generations for dataset/query/filter/sort/metadata state;
- atomic local grid + local pager + shown-count ownership commit;
- further compare-before-write/no-op DOM reduction;
- reducing full child-tree rebuilds where individual drawer/control reconciliation is safe;
- unified count authority semantics for server/current/index totals.

Those should remain separate bounded releases so regressions can be attributed accurately.

---

## 12. Priority/result

The stable rail boundary is P0/P1 lifecycle work because the raw recording directly demonstrated framework reconciliation deleting BetterSearch rail children under the old structure.

The v0.15.5 candidate changes the architecture rather than adding another remount race:

> Etsy owns the native sidebar; BetterSearch reads it and overlays its own body-level portal, but never becomes one of Etsy's hydrated sidebar children and never reparents Etsy's children into its own tree.