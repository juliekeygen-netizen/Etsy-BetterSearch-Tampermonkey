# Favorites geometry reconcile audit — 2026-08-30

Status: focused source audit of the final v0.15.1 Favorites toolbar/search/progress geometry chain. This document extends the earlier Diagnostics finding that toolbar geometry moved through multiple intermediate states before settling.

No runtime code is changed by this document.

## Summary

The current final geometry is visually stable in many steady states, but the implementation still reaches that final state through deliberate **clear -> measure -> reapply** cycles. Therefore logical idempotence does not imply DOM/layout idempotence.

The most important current chain is:

```text
shell / route / resize repair
-> module 96 clears historical/current toolbar inline geometry
-> module 97/98 measures final dimensions
-> module 98 removes the current X transform before measuring
-> module 98 writes width/flex/search variables and X transform again
```

Even when the desired final geometry is exactly the same as the current geometry, this can temporarily move/rescale the toolbar and generate style/attribute mutations and layout work.

---

## 1. Final responsive repair deliberately clears geometry before the later exact writer restores it — SOURCE-PROVEN

`src/96-favorites-exact-header-parity.js::favClearFinalToolbarGeometry0131()` removes a broad set of inline properties from the toolbar row and descendants:

```text
width
max-width
min-width
margin-left
margin-right
transform
flex
flex-basis
```

It is called by `favRefreshFinalResponsiveState0131()` and by the final `favRepairToolbarLayout` wrapper.

The same pass then calls `favSyncNarrowSortWidth0128()`, which later modules have rebound to the exact geometry implementation.

`src/98-favorites-exact-search-width.js::favApplyExactSearchWidth0135()` then writes the final shared search width and desktop toolbar width/flex values again.

That makes a stable repair capable of doing:

```text
correct state A
-> clear A
-> layout/measure
-> write A again
```

The Diagnostics recording already showed toolbar controls traversing intermediate positions during repair. Current source provides a direct mechanism for that observation.

### Required contract

A reconcile pass should calculate desired geometry first and compare it to current owned geometry before mutating the DOM.

Do not clear a valid owned value simply to measure unless there is no other safe way to obtain the measurement.

---

## 2. Exact X alignment intentionally removes the current transform before every measurement — SOURCE-PROVEN

`src/98-favorites-exact-search-width.js::favAlignCollectionToolbarX0136()` calls `favClearCollectionToolbarX0136(right)` before reading the toolbar rectangle.

The stated purpose is correct: avoid compounding a previous correction into the next measurement.

However, the implementation means a stable toolbar can repeatedly do:

```text
transform: translateX(Npx)
-> remove transform
-> force/read geometry
-> calculate the same N
-> write translateX(Npx) again
```

This is visually and mutation-wise different from an idempotent reconcile even though the resulting final value is unchanged.

### Better measurement model

Prefer one of:

1. calculate the unshifted right edge mathematically from the current transform value rather than clearing it;
2. measure an untransformed stable ancestor/reference instead of mutating the measured node;
3. keep a geometry model containing base rect + owned transform and invalidate only when an actual dependency changes.

The exact method should be chosen with browser measurement tests; the important invariant is **measure without temporarily changing the visible state**.

---

## 3. Multiple final modules still schedule geometry work for the same lifecycle event — SOURCE-PROVEN

The current late chain contains several route/shell/resize hooks that ultimately cause geometry work, including:

- module 88 shell repair;
- module 89 responsive shell repair;
- module 90 responsive metadata/header refresh;
- module 91 final legacy-geometry cleanup;
- module 94 native-boundary resize/final shell pass;
- module 96 final responsive refresh;
- module 97 All/native header parity refresh;
- module 98 exact toolbar scheduling;
- module 100 All Search clear-button parity;
- module 101 final shell/resize reassertion.

Many of these historical functions have been rebound to later implementations, so this is **not** equivalent to ten independent geometry algorithms. But there remain multiple scheduling entry points and wrapper layers for a single semantic event such as resize or shell repair.

### Architectural consequence

The lifecycle controller should own a single geometry dirty reason, for example:

```text
DIRTY_GEOMETRY
  host changed
  viewport changed
  font metrics changed
  native Search wrapper changed
  toolbar content changed
```

Multiple signals may set the same dirty bit, but only one reconcile pass should write geometry.

---

## 4. Search input events can schedule geometry even when geometry did not change — SOURCE-PROVEN

Module 98 listens to `input`, `search`, and `change` inside the native Search slot and schedules exact toolbar geometry after Etsy updates the Search component.

This was added to solve a real native Search-wrapper movement bug, but the signal is broader than the actual invalidation condition. Typing every character can schedule a two-frame geometry pass even if the native wrapper dimensions remain identical.

### Required improvement

Keep the input/search/change signal as a compatibility trigger if needed, but make the geometry writer compare a compact measurement signature before performing writes:

```text
viewport width
header width
listing-column right edge
sort measured width
search wrapper structure/width
```

If the signature is unchanged, no DOM geometry writes should occur.

---

## 5. Progress positioning also writes layout state without equality checks — SOURCE-PROVEN

`src/97-favorites-all-native-header.js::favPositionProgress0134()` repeatedly writes:

```text
--ebsf-progress-top0134
--ebsf-progress-height0134
```

and reasserts classes/data attributes whenever positioning runs.

`favProgress0134(text)` also writes `node.textContent = text` on every call.

The work is small compared with the toolbar, but it follows the same non-idempotent pattern visible in the Diagnostics mutation data.

### Required rule

For all presentation-only writers:

```text
if current value == desired value
    skip write
```

This applies to CSS custom properties as well as text/ARIA/class state.

---

## 6. Existing tests mostly assert formulas and source structure, not zero-write steady-state behavior — SOURCE-PROVEN TEST GAP

Current responsive/pagination tests verify important static contracts such as:

- exact Search ratio and toolbar cap;
- alignment to the listing-column right edge;
- narrow-layout cleanup;
- search event hooks;
- progress location;
- load order of late modules.

They do not execute a repeated reconcile against an already-correct DOM and assert that the second pass performs no visible geometry mutations.

### Required regression test

Build a small DOM/runtime harness that:

1. mounts representative All and collection headers;
2. runs final geometry reconcile once;
3. records resulting style/class/attribute state;
4. runs the same reconcile again with unchanged measurements;
5. asserts no visible style/attribute/text mutation is required on pass two.

Also test changed-width and Search-wrapper-change cases to ensure real invalidations still update correctly.

---

## 7. Priority

This is a lifecycle/performance/UI-stability issue, not the first data-correctness patch.

Recommended order remains:

1. owner/snapshot/generation correctness and the bounded local/native pager semantic-alias fix;
2. render ownership correctness;
3. lifecycle-controller consolidation;
4. move geometry into that controller as one idempotent final writer.

Avoid adding another late geometry wrapper as a local fix. The current source already demonstrates why patch-on-patch geometry accumulates transient states.