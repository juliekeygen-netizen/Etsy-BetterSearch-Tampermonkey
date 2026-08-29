# Favorites audit chunk 7 — accessibility, teardown and implementation sequence

Date: 2026-08-30

Status: source-audit synthesis and implementation planning. Documentation/design only; production runtime behavior is unchanged.

This chunk follows the lifecycle/geometry analysis in Chunk 6 and closes the remaining audit areas that directly affect implementation readiness: semantic focus ownership, modal/keyboard behavior, route/resource teardown, and a bounded release plan.

## Documents

- `FAVORITES_ACCESSIBILITY_FOCUS_OWNERSHIP_AUDIT_2026-08-30.md`
- `FAVORITES_ROUTE_TEARDOWN_RESOURCE_LIFETIME_AUDIT_2026-08-30.md`
- `FAVORITES_ACCESSIBILITY_LIFECYCLE_TEST_MATRIX_2026-08-30.md`
- `FAVORITES_RELEASE_IMPLEMENTATION_SEQUENCE_2026-08-30.md`

---

## Highest-confidence new findings

### 1. Focus is not an owned part of current DOM reconciliation

Several final paths replace focused-capable DOM wholesale:

```text
rail refresh          -> rail.replaceWith(newRail)
section refresh       -> body.replaceChildren(newBody)
local render          -> localGrid.replaceChildren(newCards)
local pager render    -> pagerGroup.replaceChildren(newButtons)
native hydration      -> localCard.replaceWith(nativeClone)
```

These paths have no general semantic focus token/transfer.

A focused control can therefore disappear because of both direct user actions and asynchronous metadata/background/render work.

### 2. Local pager keyboard activation has a deterministic focus-loss path

The activated local page button is rebuilt as part of the same page transition. Scroll is updated, but focus is not moved to the newly current pager control/results target.

This should be tested/fixed alongside pager ownership work.

### 3. Mobile Filters has weaker modal behavior than Settings

Mobile Filters declares `role="dialog"` + `aria-modal="true"` and locks scroll, but the audited current path does not provide the Settings-like initial focus, Tab trap, Escape close or opener focus return.

Settings already demonstrates part of the desired behavior and should be unified under one modal/focus manager rather than used as a separate one-off implementation.

### 4. Layout editing remains substantially pointer-oriented

The layout editor uses HTML drag-and-drop and a pointer-positioned context menu. Keyboard users need explicit focusable reorder operations/menu navigation rather than drag being the only efficient path.

### 5. Route exit restores the main Favorites presentation but does not centrally dispose every Favorites-owned resource

The runtime and page-shell teardown handle grids/filter shell/progress/native sidebar restoration, but there is no single route teardown for Settings/layout/context/confirm/info/Sort portals, scroll/focus state, every route observer/timer and detached-node reference.

### 6. Sort portals have a specific orphan-DOM accumulation path

Each Sort root can create a body portal. When another portal is active, older portals are hidden and tagged orphaned, not removed. A recreated toolbar/root can therefore leave old hidden Sort portals in the document.

### 7. Existing code contains cleanup patterns worth preserving

The audit found useful positive patterns:

- module 101 has one explicit hydration-observer/timer stop helper;
- module 91 collection scroller tracks listener removers and exposes cleanup;
- collection-creation observer is bounded by success + timeout;
- filter disclosure semantics and reduced-motion handling are already good;
- Settings/rename dialogs already implement substantial focus behavior.

The target architecture should generalize these patterns rather than rewrite accessibility/cleanup from nothing.

---

# Implementation readiness conclusion

The audit is now detailed enough to begin bounded production changes.

Further research should be tied to a specific implementation uncertainty or a fresh browser validation. It should not block the known, independently testable fixes.

Recommended sequence:

```text
A1  local/native pager semantic identity
A2  owner-required persistence guard
B   atomic scope/catalogue snapshot generations
C   config + metadata context + deep-worker generations
D   signed render transaction + atomic grid/pager ownership
E   one lifecycle controller + stable shell + accessibility + teardown + idempotence
F   retire modules/wrappers 85–101 + true final fail-closed bootstrap
G   startup/anti-flash refinement
```

Server-delegation experiments remain later, after the ownership/correctness contracts are stable.

---

# Immediate first implementation candidate

The safest next runtime patch is A1:

```text
module 95a must never treat [data-ebsf-local-pagination]
as Etsy native page state or native page click intent
```

Why first:

- source-proven end-to-end;
- small surface area;
- no data migration;
- does not require new architecture first;
- can be tested with native + local pagers simultaneously;
- removes a real semantic collision before broader lifecycle work.

After A1, A2/B should establish durable identity/snapshot correctness before the larger UI/lifecycle refactor.

---

# Definition of done for the eventual lifecycle refactor

A future lifecycle/render implementation should be considered complete only when browser/tests can show:

```text
one active lifecycle controller
route-scoped native observers
one authoritative shell/rail owner
one authoritative geometry writer
stable/keyed local card and rail reconciliation
atomic local grid + pager ownership
semantic focus survives valid reconcile
modal focus/scroll ownership is centralized
route leave disposes all Favorites route resources
no orphan portal growth across repeated soft routes
no-op reconcile produces effectively zero owned DOM mutations
late runtime starts only after a true final fail-closed bootstrap
```

A fresh Diagnostics recording after that release should show materially fewer shell generations and same-value DOM mutations than the existing baseline.