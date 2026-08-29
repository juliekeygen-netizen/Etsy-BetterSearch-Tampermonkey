# Favorites runtime mutation feedback audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `56fa30c4bcf0533f1c9b695f1f0a20fbef35fcdc`.

This is a source-level continuation of the proven Diagnostics finding that BetterSearch generated very large same-value/no-op DOM mutation volume. The earlier audit identified hot writers and the need for one idempotent lifecycle controller. This document identifies an exact live feedback path that remains in current production source even though the dedicated shell observer was repeatedly hardened.

## 1. There are two different mutation observers with different contracts

The late shell modules maintain `favState.shellObserver0120`.

That observer has been replaced several times and the final predicate attempts to ignore BetterSearch-owned shell mutations.

Separately, `src/63-favorites-runtime.js::favStartRuntime()` installs `favState.observer`:

```text
new MutationObserver(() => {
    if (!favState.rendering) {
        favScheduleSync();
        favScheduleCurrentPageObservation();
    }
})

observe(document.body, { childList:true, subtree:true })
```

This runtime observer has no ownership predicate at all.

Therefore the statement "the shell observer ignores BetterSearch-owned mutations" does not imply that BetterSearch's lifecycle ignores its own DOM writes.

## 2. Unchanged route sync still enters the shell

`favScheduleSync()` classifies dataset and view identity.

When neither changed, it deliberately executes:

```text
favEnsureToolbar()
favBindNativeSearch()
```

`favEnsureToolbar()` was wrapped by `src/86-favorites-page-shell.js` so every call also does:

```text
requestAnimationFrame(favInstallPageShell0120)
```

This means a mutation does not need to represent route/scope state to schedule another shell pass.

The existing route-cache test explicitly treats this unchanged-route tail as expected behavior.

## 3. Final shell passes still perform child-list writes when visible content is unchanged

Several current writers are logically idempotent but not DOM-idempotent.

### Base scope header writer

`favUpdateScopeHeader0120()` sets All count text on every pass.

On collection pages it unconditionally uses `replaceChildren()` on Etsy's metadata container before rebuilding the privacy/divider/count content.

### Exact All-header parity writer

`src/96-favorites-exact-header-parity.js::favSetPrivateLabel0131()` removes every privacy-label child except the icon and appends a new text node every time.

`favApplyScopeMetaDensity0131()` then sets count `textContent` every time.

### Final smoke-fix wrapper

`src/101-favorites-v0141-smoke-fixes.js` wraps `favInstallPageShell0120()` and always schedules another RAF that calls:

```text
favEnsurePermanentRail0142()
favUpdateScopeHeader0120()
```

So a shell pass has more than one opportunity to rewrite the same header DOM.

## 4. Exact feedback path

Current source permits the following repeating chain:

```text
shell/header reconcile
-> BetterSearch replaces/writes header child nodes
-> favState.observer sees body subtree childList mutation
-> favScheduleSync() schedules 250 ms route pass
-> dataset/view unchanged
-> favEnsureToolbar()
-> wrapper schedules favInstallPageShell0120() in RAF
-> shell/header reconcile writes same child nodes again
-> runtime observer sees another mutation
-> repeat
```

The dedicated shell observer may correctly ignore those owned mutations while the separate runtime observer still reacts to them.

This is source-proven as a valid feedback path and is consistent with the earlier Diagnostics capture, where the All header, result/scope count, toolbar and filter label were among the largest same-value mutation hot spots.

The exact percentage of captured mutation volume attributable to this one cycle was not reconstructed from the raw private capture and should not be invented.

## 5. The 1000 ms observation timer can be displaced by lower-priority mutation churn

The same broad runtime observer also calls:

```text
favScheduleCurrentPageObservation()
```

with the default 1000 ms delay.

That function uses one shared timer and always clears the previous timer first.

Other code schedules more urgent observations, including 0 ms / 350 ms query/view-settle observations.

A later low-information body mutation can therefore replace an earlier urgent observation with a new 1000 ms timer.

If DOM churn continues faster than the observation delay, current-page observation can be postponed repeatedly.

This is a debounce-priority inversion:

```text
urgent native view observation scheduled
-> unrelated/owned mutation arrives
-> generic 1000 ms observation replaces urgent timer
```

The native-query settle layer has its own repeated timer callbacks and can recover some search cases, but ordinary page/view observation still shares this cancellation boundary.

## 6. BetterSearch-owned UI changes beyond the header also wake the runtime observer

The runtime observer sees all body child-list changes outside the very short `favState.rendering` window.

Examples include:

- rail replacements;
- collection-strip rebuilds;
- progress node mount/removal;
- select option `replaceChildren()` updates;
- local card hydration replacements;
- Settings/layout modal mount/removal;
- shell teardown/re-entry nodes.

Not every mutation produces expensive work because `favScheduleSync()` and observation are debounced, but the mutation still resets those shared timers and can cause another unchanged-route shell pass.

## 7. `favState.rendering` is too narrow to be a general self-mutation guard

`favRenderCurrent()` sets `favState.rendering=true` around the local-grid `replaceChildren()` and clears it in a queued microtask.

Most shell/header/rail mutations happen outside that window.

Using one boolean around one renderer therefore cannot serve as the lifecycle ownership filter.

Do not broaden the boolean into another fragile global suppression flag. The controller should classify mutation source/meaning instead.

## 8. Correct target architecture

The lifecycle controller should separate these signals:

```text
route/scope identity changed
native page generation changed
native host replaced
BetterSearch-owned reconcile completed
native card hydration changed
viewport/layout changed
```

One scheduled reconcile should receive dirty flags rather than treating every child-list mutation as a route event.

Example:

```text
DIRTY_ROUTE
DIRTY_NATIVE_VIEW
DIRTY_SHELL_HOST
DIRTY_NATIVE_CARD_PRESENTATION
DIRTY_GEOMETRY
```

A BetterSearch-owned text/count update should normally set none of those flags.

## 9. DOM writers must compare before writing

Even with a better observer, the earlier Diagnostics requirement remains important.

Before changing:

- `textContent` / `nodeValue`;
- `hidden` / `inert`;
- ARIA attributes;
- classes;
- CSS variables/inline styles;
- select children;
- rail/header child structure;

compare current and desired state.

A no-op reconcile should produce approximately zero DOM mutations.

## 10. Required executable regression fixture

A real fixture should model the final runtime/shell bindings, not only static source strings.

Minimum scenario:

```text
Favorites All shell is already correct
runtime observer is active
run one shell reconcile with unchanged data
flush MutationObserver / timers / RAF
```

Assertions:

```text
no repeating sync generation
no second shell reconcile caused only by owned count/header writes
no current-page observation timer pushed back by owned shell mutation
no additional rail generation
no same-value header text replacement
```

Then introduce one genuine Etsy sidebar replacement and verify exactly one bounded shell reconcile occurs.

## 11. Existing tests miss this boundary

`favorites-revamp-stability.test.mjs` verifies that the dedicated `shellObserver0120` ignores BetterSearch-owned nodes.

`favorites-route-cache.test.mjs` verifies unchanged route state avoids data reload and explicitly expects `favEnsureToolbar()`.

Neither test combines:

```text
base runtime body observer
+
unchanged-route favEnsureToolbar wrapper
+
final shell/header DOM writers
```

So both tests can be green while the feedback path remains live.

## 12. Priority

This is a P1 lifecycle/performance correctness issue with direct relevance to the captured mutation storm and rail/header instability.

It should be addressed in the planned lifecycle-controller release. A small interim patch can reduce churn with diff-before-write header/count updates and ownership filtering in the runtime observer, but avoid another layer of ad-hoc observer wrappers if the controller consolidation is imminent.