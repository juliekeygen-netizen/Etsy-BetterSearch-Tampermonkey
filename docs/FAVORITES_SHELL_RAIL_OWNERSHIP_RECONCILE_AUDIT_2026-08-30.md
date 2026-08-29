# Favorites shell/rail ownership and reconcile audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `56fa30c4bcf0533f1c9b695f1f0a20fbef35fcdc`.

This document refines the earlier Diagnostics conclusion that rail instability is primarily a BetterSearch lifecycle/ownership problem. It identifies current source paths that make rail loss/recreation and redundant repair possible even with the latest shell observer.

## 1. The permanent rail still lives inside Etsy's sidebar host

`favInstallPermanentRail0120()` mounts `[data-ebsf-rail]` as a direct child of:

```text
[data-testid="sidebar"]
```

That sidebar remains an Etsy-owned host.

If Etsy replaces the sidebar element itself, the BetterSearch rail is removed with the old host. No observer can prevent that removal after the fact.

The final observer can only notice the replacement and install a new rail later.

Therefore a remove/recreate interval is structurally possible as long as the permanent rail is mounted inside a replaceable Etsy host.

This does not mean every observed rail generation came from host replacement; the earlier Diagnostics recording proved multiple rail generations even when a sidebar host remained stable. Both mechanisms exist.

## 2. Native sidebar children are still reparented into a BetterSearch wrapper

`favCaptureNativeSource0120()` creates:

```text
.ebsf-native-favorites-source
```

inside the Etsy sidebar, then moves every sidebar child that is neither that source nor the BetterSearch rail into it.

Conceptually:

```text
Etsy sidebar
  native Items/Collections/Shops...

becomes

Etsy sidebar
  BetterSearch hidden source
    Etsy native Items/Collections/Shops...
  BetterSearch rail
```

This is exactly the ownership-boundary pattern the canonical architecture plan intends to remove.

Etsy/Preact can still believe those native nodes belong directly to its component tree. A later reconciliation can reinsert/replace them, and BetterSearch then recaptures them.

## 3. The hidden native-source wrapper is not part of the final owned-shell predicate

The final shell ownership predicate in module 94/99 recognizes nodes such as:

- collection strip;
- All header;
- rail;
- loading/progress/sort portal surfaces.

It does not include `.ebsf-native-favorites-source`.

During first capture or capture on a new sidebar host:

```text
prepend hidden source
move native child nodes into source
```

creates sidebar child-list records whose changed nodes include the hidden source and/or native Etsy children.

The shell observer can therefore classify BetterSearch's own capture operation as shell-relevant native churn and schedule a second repair frame.

Because the second pass often finds the rail/source already correct, this is generally bounded extra work rather than an infinite loop, but it is still self-induced repair.

## 4. Intentional rail replacement is classified as accidental rail loss

Desktop `favRefreshRail()` always builds a new rail and performs:

```text
old.replaceWith(replacement)
```

when a rail already exists.

The final module-99 shell predicate begins with:

```text
if any removed node contains [data-ebsf-rail]
    return true
```

It does not ask whether the same mutation added a valid replacement rail.

So this legitimate transition:

```text
old rail removed
new valid rail added in same operation
```

is treated as:

```text
rail disappeared unexpectedly
-> schedule shell repair
```

The repair is redundant.

## 5. Full rail rebuilds are used where in-place reconcile already exists

The filter revamp has a useful in-place availability path:

`favRefreshFacetAvailability0120()` updates existing option visibility and select choices inside the current rail.

By contrast, `favRefreshRail()` reconstructs the complete rail tree.

Full rebuild is appropriate for true schema/layout changes, for example:

- drawer added/deleted/reordered;
- option instances added/deleted/reordered;
- native host destroyed;
- incompatible rail revision.

It is unnecessarily destructive for ordinary metadata/availability/config refresh when the structure is unchanged.

## 6. Whole-rail replacement loses transient DOM state

Some logical state can be reconstructed from application state, such as active filter values and some open-section state.

A complete node replacement does not automatically preserve:

- focused element;
- text cursor/selection inside an input;
- pointer capture;
- DOM-local scroll positions;
- transient browser form state;
- accessibility focus context;
- native control state not mirrored into `favState`.

There is no explicit focus/selection/scroll transfer around `old.replaceWith(replacement)`.

This makes rail replacement a user-visible stability risk even when the resulting controls look identical.

## 7. Module 101 adds another immediate + RAF rail assertion per shell pass

The final smoke-fix wrapper performs:

```text
if desktop:
    favEnsurePermanentRail0142()

call previous shell installer

requestAnimationFrame:
    favEnsurePermanentRail0142()
    favUpdateScopeHeader0120()
```

The immediate call is useful when content-column hydration lags behind sidebar hydration.

However once the shell is stable, every shell invocation still schedules a second rail assertion in another frame.

This does not necessarily mutate the rail if it is present, but it adds repeated ownership/DOM queries and participates in the broader header mutation feedback described in the runtime-mutation audit.

## 8. The final shell observer is better than the historical stack

A correction to the broad historical description is important:

The late modules do not leave every historical `shellObserver0120` active simultaneously. Modules 88, 89, 94 and 99 disconnect and replace the prior shell observer.

The final page therefore has one current shell observer under that state slot.

The architectural debt is instead:

- stacked function wrappers/reassert paths;
- one separate unfiltered base runtime observer;
- a mount inside Etsy-owned host structure;
- destructive capture/reparenting;
- redundant repair classification.

This distinction matters for the refactor plan and for performance measurement.

## 9. Stable-shell target

The preferred end state remains:

```text
stable BetterSearch-owned mount boundary
  rail
  collection selector / toolbar shell where appropriate

Etsy-owned sidebar/native nodes
  observed/read but not routinely reparented into BetterSearch wrappers
```

If the exact page layout requires visual placement beside Etsy's results, use a stable sibling/host boundary where possible rather than placing persistent BetterSearch identity inside a Preact-reconciled child list.

## 10. Interim bounded corrections

Before the full lifecycle refactor, safe reductions include:

1. Treat a rail replacement as intact when the same mutation leaves one valid direct rail in the sidebar.
2. Do not schedule a repair solely because BetterSearch created/mutated its own native-source wrapper.
3. Reserve full `favRefreshRail()` rebuilds for layout/schema changes.
4. Use in-place facet reconcile for availability/metadata updates.
5. Deduplicate shell-install RAF requests with one pending frame token.
6. Compare header/control state before writing.

These should reduce churn without changing the frozen visual contract.

## 11. Required tests

### Intentional rail replacement

```text
sidebar contains rail A
refresh builds rail B and replaceWith(B)
observer receives removed A + added B
```

Assert:

```text
no extra shell repair scheduled solely for replacement
exactly one rail remains
focus/scroll preservation strategy is exercised if rebuild is required
```

### Native source capture

```text
fresh Etsy sidebar with native children
BetterSearch captures them
```

Assert:

```text
one bounded reconcile
no second repair caused only by owned capture
```

### Etsy host replacement

```text
sidebar host A with rail
Etsy replaces host with sidebar B
```

Assert:

```text
one rail generation installed in B
no duplicate rails
native fallback remains usable until rail is valid
```

### In-place availability update

Assert ordinary availability changes do not replace the rail root.

## 12. Priority

This is P1 lifecycle/UI stability work and directly supports the existing rail-flicker/no-op-mutation evidence.

The full stable-mount refactor is preferable to accumulating more late repair wrappers, but the intentional-replacement and owned-capture false positives are bounded enough to fix earlier if browser testing confirms they materially reduce churn.