# Favorites owned-UI lifecycle wakeup audit — 2026-08-30

Status: focused source audit of BetterSearch-owned body-level UI and the base Favorites runtime observer.

No runtime code is changed by this document.

## Summary

The final shell observer has increasingly specific ownership filtering, but the **base runtime observer in `src/63-favorites-runtime.js` remains broad**:

```js
new MutationObserver(() => {
    if (!favState.rendering) {
        favScheduleSync();
        favScheduleCurrentPageObservation();
    }
})
```

It observes all child-list mutations under `document.body` and does not first ask whether the mutation was caused by Etsy navigation/data or by BetterSearch itself.

That means BetterSearch-owned UI interactions can wake Favorites route/index work even when no Favorites data changed.

---

## 1. Sort portal creation is a BetterSearch body mutation — SOURCE-PROVEN

The final Sort implementation in `src/68-favorites-ui-repair.js` creates a menu portal and appends it directly to `document.body`:

```text
favCreateSort()
-> document.body.append(menu)
```

Later open/close behavior changes menu state and historical Sort implementations also moved the portal between its root and body.

The final shell observer knows about `[data-ebsf-sort-menu-portal]` and deliberately ignores it as owned shell UI. The base runtime observer does not.

Therefore Sort UI lifecycle can schedule:

```text
favScheduleSync()
favScheduleCurrentPageObservation()
```

without a scope/view/data transition.

---

## 2. Settings/layout/confirmation/info/filter surfaces are also body-owned — SOURCE-PROVEN

Current Favorites UI creates several BetterSearch-owned body-level surfaces, including:

- Settings modal (`.ebsf-settings-layer`);
- mobile filter overlay (`.ebsf-overlay`);
- filter help/info popover (`.ebsf-native-info-popover`);
- filter/layout editor modal (`.ebsf-layout-layer`);
- rename/confirmation layers;
- layout context menu;
- Sort menu portal;
- drag ghost used by the layout editor.

Opening/removing/reparenting these surfaces creates `document.body` child-list mutations.

The broad runtime observer cannot distinguish these from a meaningful Etsy structural change.

### Consequence

A purely local action such as:

```text
open Settings
close Settings
open Sort
open a help popover
open layout editor
```

can enter the same scheduling path used for native Favorites route/current-page reconciliation.

This is unnecessary work and also contributes to timer/debounce interference with genuinely important signals.

---

## 3. Off-Favorites soft routes keep the runtime observer active — SOURCE-PROVEN

The runtime observer is installed once per document and remains attached to `document.body`.

When `favScheduleSync()` eventually notices that the current route is not Favorites, it restores/tears down Favorites presentation state. However, the observer itself is not disconnected when leaving Favorites.

Therefore subsequent body mutations elsewhere in the same Etsy document can continue to schedule the Favorites timers. The delayed callback then discovers `!isFavoritesPage()` and exits/tears down again.

This is not an accumulating listener leak—the observer is bound once—but it is an **unnecessary route-lifetime subscription** and can produce continuing timer churn on Etsy pages after Favorites has been left through soft navigation.

### Required contract

The lifecycle controller should have explicit states:

```text
INACTIVE       // not on Favorites; no Favorites DOM observer work
ENTERING
ACTIVE_NATIVE
ACTIVE_LOCAL
LEAVING
```

Entering Favorites should attach/enable the narrow relevant observation roots. Leaving Favorites should detach/disable them.

A tiny route detector may remain global if needed, but the full Favorites DOM observer should not remain hot on unrelated Etsy pages.

---

## 4. Owned mutations and native dirty reasons need separate channels

The current design treats many child-list mutations as generic wakeups.

The target lifecycle should instead accept semantic dirty reasons, for example:

```text
ROUTE_CHANGED
NATIVE_GRID_CHANGED
NATIVE_PAGER_CHANGED
NATIVE_SEARCH_CHANGED
SIDEBAR_HOST_CHANGED
VIEWPORT_CHANGED
CONFIG_CHANGED
CATALOGUE_CHANGED
METADATA_CHANGED
```

BetterSearch-owned portal/modal/card/rail internal mutations should not become route dirty reasons merely because they happen under `document.body`.

If an owned interaction intentionally changes config/catalogue state, its event handler can set the correct semantic dirty reason directly.

---

## 5. This interacts with the current observation debounce priority problem

A prior audit found that `favScheduleCurrentPageObservation()` uses one replaceable timer. Generic mutation work can therefore replace a more urgent observation deadline with a later one.

Owned body-level UI mutations are another source of those generic wakeups.

Removing them from the route/native observation channel therefore has two benefits:

1. fewer unnecessary observations;
2. less chance of delaying a genuinely important native page/query observation.

---

## 6. Existing ownership tests cover the final shell observer, not the base runtime observer — SOURCE-PROVEN TEST GAP

Current stability tests verify that the dedicated shell observer ignores BetterSearch-owned shell mutations.

That is valuable but incomplete. It does not prove that the separate base runtime observer ignores:

```text
Sort portal mount/open/close
Settings modal mount/remove
mobile filter overlay
help popover
layout editor/context/confirm layers
local pager/grid internal replacements
```

### Required regression tests

Add an integration lifecycle harness that exposes a scheduling counter and asserts:

```text
owned modal/portal mutation
-> no ROUTE/NATIVE dirty reason

native sidebar/grid/pager mutation
-> exactly one appropriate dirty reason

config interaction
-> CONFIG dirty reason directly, without relying on observing our own DOM write
```

---

## 7. Priority

This belongs directly inside the planned lifecycle-controller phase.

Do not solve it by expanding another CSS selector list in one more late observer. The desired end state is:

```text
small route detector
+ narrow native observer(s)
+ explicit BetterSearch state/event signals
-> one scheduled reconcile
```

rather than a whole-body observer whose job is to infer application semantics from arbitrary DOM churn.