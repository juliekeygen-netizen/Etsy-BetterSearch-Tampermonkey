# Favorites route teardown + resource lifetime audit — 2026-08-30

Status: focused source audit of Favorites-owned observers, timers, portals, modals, detached-node references and route exit/re-entry behavior.

No runtime code is changed by this document.

## Summary

The current code does not primarily suffer from "every route adds another copy of every listener." Many document/window listeners are installed once per document, and several later observers explicitly disconnect older observer generations.

The more accurate current problem is **missing centralized ownership/teardown**:

- the broad Favorites body observer remains active after leaving Favorites;
- body-level Favorites UI is not centrally closed on route exit;
- Sort portals can become hidden orphan DOM when a new toolbar/root is built;
- some route-specific observers/timers retain detached targets until a later rebind or page unload;
- modal scroll locks/focus state are owned ad hoc by each surface rather than one stack/manager.

The lifecycle refactor should therefore build a resource registry with explicit enter/leave semantics rather than merely calling more `removeEventListener()` in scattered modules.

---

# 1. The runtime has an explicit off-Favorites presentation teardown but not a complete resource teardown — SOURCE-PROVEN

`src/63-favorites-runtime.js::favScheduleSync()` eventually handles a non-Favorites route by:

```text
wasFavoritesPage = false
clear native capture view key
favRestoreNative()
favCloseFilters()
favHideSyncProgress()
return
```

This restores core grid/filter/progress presentation, but it does not represent all Favorites-owned resources.

The current route-exit path does not centrally remove/close:

- Settings modal;
- layout editor;
- layout context menu;
- rename/confirmation layers;
- help/info popover;
- Sort portal(s);
- render-integrity timers;
- every route-specific Resize/Mutation observer;
- every page-specific async callback or stored return-focus node.

Some of these clean themselves in their own normal close paths; the problem is that route exit does not invoke one authoritative close/dispose boundary.

---

# 2. The page-shell teardown is presentation-specific, not a complete Favorites teardown — SOURCE-PROVEN

`src/86-favorites-page-shell.js::favTeardownPageShell0121()`:

- releases the All header/toolbar;
- removes collection strips;
- restores Etsy native sidebar children from `.ebsf-native-favorites-source`;
- removes BetterSearch rails;
- clears shell state.

It does not own the other body-level application surfaces listed above.

This split explains why adding one more cleanup to `favTeardownPageShell0121()` is not enough. The future lifecycle controller needs both:

```text
teardownShell()
teardownFavoritesRoute()
```

with route teardown calling shell teardown plus every other owned subsystem.

---

# 3. Sort portals can accumulate as hidden/orphaned body nodes across root replacement — SOURCE-PROVEN RISK

The final Sort implementation in `src/68-favorites-ui-repair.js` creates one portal per Sort control creation:

```text
root.__ebsfSortMenu = menu
document.body.append(menu)
```

`favOpenSortMenu()` searches all Sort portals and, for every other portal:

```text
other.hidden = true
other.dataset.ebsfOrphaned = '1'
```

The older portal is deliberately ignored by `favSortMenuNode()` afterward, but it is not removed in that path.

If Etsy/BetterSearch replaces the toolbar root and `favCreateSort()` constructs another Sort control, the old body portal can remain as hidden orphan DOM while the new portal is appended.

Repeated soft-route/root replacement can therefore accumulate inert portal nodes for the lifetime of the document.

### Required invariant

One Sort controller owns at most one live portal.

When its root is disposed:

```text
remove portal
clear state references
remove positioning callbacks/listeners owned by that controller
```

A new root should adopt/rebind the existing portal when practical rather than create another body node.

---

# 4. Body-level dialogs/popovers lack a central route-exit close path — SOURCE-PROVEN MISSING CONTRACT

Favorites can mount several top-level surfaces:

```text
Settings
mobile Filters
layout editor
rename dialog
confirmation alertdialog
layout context menu
filter help popover
Sort menu
layout drag ghost
```

Most have local close functions, but there is no single audited function that means:

```text
Favorites route is ending: close/dispose every Favorites-owned top-level surface now
```

If SPA/history navigation leaves Favorites while a surface is open, exact browser behavior can depend on which surrounding Etsy DOM is replaced. The source-level issue is that BetterSearch has no deterministic route-exit ownership contract.

### Required teardown order

A route leave should conceptually do:

```text
1. mark lifecycle LEAVING / invalidate current generation
2. abort current-route async work
3. close owned transient surfaces
4. release scroll locks/focus traps
5. stop native-grid/render observers and timers
6. restore Etsy-owned presentation
7. dispose shell/rail/toolbar roots
8. detach Favorites-native observation roots
9. clear detached-node references
10. enter INACTIVE
```

---

# 5. Scroll locking needs one owner/stack

Settings, mobile Filters, layout editor and other modal surfaces call shared page-scroll locking/unlocking from individual paths.

Without a modal stack/ownership token, nested dialogs can make balancing fragile:

```text
layout editor open -> lock
confirm dialog opens on top -> may not independently own lock
confirm closes
layout editor remains
route exits unexpectedly
```

The current code often works because inner dialogs do not all call the lock helper, but that behavior is implicit.

### Target

Use one modal manager with reference/stack ownership:

```text
open modal A -> lock count/stack = 1
open modal B -> stack = 2
close B -> stack = 1; page remains locked
route teardown -> dispose all; stack = 0; restore original page state
```

Never let each dialog guess whether it should restore document scrolling.

---

# 6. Native hydration observer/timers have a good explicit stop helper — POSITIVE PATTERN

`src/101-favorites-v0141-smoke-fixes.js::favStopNativeHydrationWatch0143()` correctly:

- disconnects the MutationObserver;
- clears target references;
- clears hydration/warmup timers;
- zeros timer state.

This is exactly the kind of subsystem-owned disposal primitive the future route resource registry should call.

The issue is not this helper itself; it is ensuring route leave and ownership changes invoke all such helpers through one controller.

---

# 7. Collection scroller revision 4 also demonstrates a useful cleanup pattern — POSITIVE PATTERN

Module 91's final collection-scroller binder records listener-removal callbacks and exposes:

```text
strip.__ebsfScrollerCleanup0126()
```

The installer calls it before replacing an invalid strip.

That pattern is much safer than anonymous listeners whose ownership cannot be recovered later.

The lifecycle refactor should generalize this into explicit disposables rather than storing cleanup functions on arbitrary DOM nodes.

Example conceptual API:

```js
const scope = lifecycle.resourceScope('collection-strip');
scope.on(node, 'pointerdown', handler);
scope.timeout(...);
scope.observe(...);
scope.dispose();
```

---

# 8. The scope ResizeObserver can retain a detached route target until rebind — SOURCE-PROVEN LIFETIME GAP

Module 91's `favObserveScopeWidth0126()`:

- remembers `favState.scopeResizeTarget0126`;
- disconnects the previous ResizeObserver only when a different target is observed;
- creates a new ResizeObserver for the current header.

The audited page-shell teardown does not explicitly clear that target/observer on route leave.

If the header is detached, the observer/state can retain the old node until another rebind or document destruction.

This is likely bounded, not an unbounded per-navigation leak, but it is exactly the kind of detached-node lifetime that centralized teardown should eliminate.

---

# 9. One-time global listeners are not the same as accumulating leaks — IMPORTANT DISTINCTION

Many modules install `document`/`window` listeners at script evaluation time. They remain for the document lifetime.

This audit does **not** label every such listener a memory leak.

The questions are instead:

1. is the listener installed more than once per document?
2. does it retain route-specific DOM/state unnecessarily?
3. does it perform meaningful work off Favorites?
4. can it be replaced by one controller-level listener with explicit state?

For example, the broad runtime body observer is bound once but remains needlessly active off Favorites. That is route-lifetime work, not duplicate-listener accumulation.

Use precise terms in implementation reviews so real leaks are distinguishable from long-lived but bounded subscriptions.

---

# 10. Timers need generation ownership as well as cancellation

The current late chain includes many delayed callbacks for:

- route sync;
- current-page observation;
- native query settle;
- native page settle;
- render integrity;
- hydration refresh/warmup;
- shell repair RAFs;
- exact toolbar RAFs;
- favorite-action completion.

Some are cleared before replacement; others rely primarily on checking route/dataset when they run.

The target controller should associate delayed work with a route/render generation:

```text
schedule(generation, reason, deadline)
-> when callback fires, discard if generation is no longer current
```

Route teardown should cancel all cancellable handles owned by that generation. Generation checks remain a second safety net.

---

# 11. Detached-node references in in-flight actions must not become state authority

The local Favorite delegation audit already showed a fixed ~900 ms completion callback holding native/local button references.

Chunk 5/7 adds that hydration or grid reconcile may detach those nodes while the callback is pending.

A node may be used as a temporary event source, but the completion state should be reacquired by stable listing/action identity before mutating the current view.

This reduces both correctness races and retained detached-node lifetimes.

---

# 12. Proposed resource ownership model

The future lifecycle controller should maintain explicit scopes:

```text
DOCUMENT
  tiny route/history detector

FAVORITES_ROUTE
  native observation roots
  scope ResizeObserver
  shell controller
  transient UI manager
  route timers/RAFs

RENDER_GENERATION
  native hydration observer
  render-integrity timers
  metadata/render callbacks

TRANSIENT_SURFACE
  modal/menu/popover listeners
  focus return token
  scroll/inert ownership

USER_ACTION
  favorite/cart action token
  timeout/AbortController
```

Disposal becomes deterministic:

```text
leave Favorites -> dispose FAVORITES_ROUTE and descendants
new render -> dispose previous RENDER_GENERATION
close modal -> dispose that TRANSIENT_SURFACE
complete/cancel action -> dispose USER_ACTION
```

---

# 13. Required tests

Add lifecycle/resource tests that repeatedly perform:

```text
enter Favorites
open/close Sort + Settings + mobile Filters + layout editor
switch All <-> collection
leave Favorites through soft route
return to Favorites
repeat
```

Assert after each leave:

```text
0 visible Favorites modals/popovers/menus
0 orphan Sort portals
0 Favorites scroll lock
0 connected local grid/local pager
0 active render-hydration observer
0 scope ResizeObserver target from old route
no route-generation timers capable of mutating the next route
```

Also measure counts after ten cycles to ensure they remain constant rather than growing.

---

# 14. Priority

Centralized teardown belongs in the lifecycle-controller release. Sort orphan cleanup and modal-route cleanup can be implemented earlier only if they are small and do not create a second teardown architecture.

The main goal is **ownership symmetry**:

```text
anything we can create/attach/schedule must have one owner that can dispose it
```

That rule will remove a large class of soft-route and BFCache bugs without relying on page reloads as cleanup.