# Favorites local-card hydration reconcile audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `56fa30c4bcf0533f1c9b695f1f0a20fbef35fcdc`.

This extends `FAVORITES_LOCAL_CARD_ACTION_AUDIT_2026-08-30.md`. The earlier audit covered fixed-time native/iframe action completion. This document covers the later module-101 native-hydration observer that can replace local card DOM while an action is still in flight.

## 1. Local result cards are BetterSearch-owned clones

In local mode, `favNodeForRecord()` may clone a current Etsy native card and then mark the clone as BetterSearch-owned.

Event listeners are not cloned; document-level BetterSearch delegation handles local actions. This remains the correct basic ownership model.

## 2. Module 101 watches the hidden native grid for later presentation changes

`favWatchNativeHydration0143()` observes the current native grid for:

- child-list changes;
- character-data changes;
- `class`;
- `aria-label`;
- `aria-pressed`.

It uses a 90 ms debounce and a short warmup timer.

The goal is useful: Etsy may hydrate shipping, delivery, returns or button state after BetterSearch already cloned the visible local cards.

## 3. One relevant native mutation causes all matching visible local cards to be replaced

`favRefreshOwnedCardsFromNative0143()` loops all current local owned cards.

For each card with a connected native counterpart it:

```text
clone native card
prepare clone
replaceWith(replacement)
```

There is no comparison between the current local clone and the newly prepared native clone.

Therefore a single native-grid mutation can replace many local cards even if only one card actually changed or if the resulting clone is materially identical.

## 4. This is a DOM replacement, not a field-level presentation update

Replacing the complete card destroys transient state on the old local node, including:

- keyboard focus inside the card;
- button pressed/working presentation applied only to the old clone;
- text selection;
- browser hover/focus state;
- any DOM-local state not represented in the record/config;
- references held by in-flight local action handlers.

Document-level delegation means future clicks on the replacement still work, but that does not make wholesale replacement interaction-neutral.

## 5. Concrete favorite-action race

The existing local action path with a connected native counterpart is approximately:

```text
local heart click
-> mark local button working
-> native Etsy favorite button.click()
-> wait ~900 ms
-> infer final state
```

The native button can update `aria-pressed` or related presentation much earlier.

That mutation is watched by module 101:

```text
native aria-pressed changes
-> 90 ms hydration debounce
-> replace local card clone
```

So before the 900 ms action timer finishes:

```text
old local button/card can become detached
working/disabled UI on old clone disappears
focus can be lost
replacement clone may show native optimistic state
```

The action callback can still access detached-node datasets/references, so this does not automatically cancel the underlying Etsy action. It does make the visible action lifecycle inconsistent and compounds the stale-node weakness already documented in the local-action audit.

## 6. A one-card native change can reconstruct the whole visible local page

The hydration refresh does not derive the affected listing IDs from mutation records.

Its callback simply refreshes all local cards with native counterparts.

For a 20-card visible page, one favorite-button state change can therefore create up to ~20 local-card replacements.

This is bounded by current page size but can still create substantial mutation/focus churn.

The earlier Diagnostics capture counted hundreds of thousands of mutations; this audit does not assign a numeric portion of that capture to hydration replacement without reprocessing the private raw data.

## 7. The base runtime observer sees these replacements too

`favRefreshOwnedCardsFromNative0143()` does not wrap its replacements in `favState.rendering=true`.

The broad runtime body observer therefore sees the local-card child-list replacements and schedules route sync/current-page observation.

Those timers are debounced, so this is not necessarily one expensive route pass per card. It is still another source of lifecycle wakeups produced by a presentation-only reconcile.

This connects the hydration layer to `FAVORITES_RUNTIME_MUTATION_FEEDBACK_AUDIT_2026-08-30.md`.

## 8. Use mutation records to identify dirty listing IDs

The native hydration observer already receives mutation records.

Instead of throwing away that information, map each mutation to the closest native listing card and collect affected listing IDs.

Example:

```text
dirtyNativeListingIds = Set()
for each mutation:
    card = closest native listing card
    if listing ID:
        add ID
```

Then reconcile only those local cards.

If a structural mutation cannot be associated with a listing ID, fall back to a bounded visible-page scan.

## 9. Compare presentation before replacing

For each dirty listing, compute a lightweight presentation signature from fields that the local clone actually needs to refresh, for example:

```text
listing ID
image/srcset token
price text
shipping/delivery text
favorite aria-pressed
relevant badges/urgency
cart/options label
```

If the prepared native presentation is equivalent to the current local card, skip replacement.

Better still, patch stable subregions in place where practical rather than replacing the complete card.

## 10. In-flight action ownership should block destructive clone replacement

A future action-generation contract should expose an in-flight action token by listing ID.

While an action is unresolved:

- do not destroy the focused/working local action control merely because native presentation changed;
- record the native state change as evidence;
- reconcile the card when the action reaches an authoritative completion/failure state;
- if the card must be replaced for another reason, reacquire the current local control and transfer working/focus state safely.

This should integrate with the existing recommendation to replace the fixed 900 ms success proof with authoritative native state observation.

## 11. Render generation still matters

Before applying a hydration refresh, verify that:

```text
local card belongs to current local render generation
listing is still in current visible local result page
native counterpart belongs to current native view generation
```

A route/query/filter change can make both old DOM references semantically stale even while they remain connected briefly.

The current `favLocalGridAuthoritative0142()` signature checks dataset+config but does not include an explicit catalogue/native-view/presentation generation.

## 12. Required tests

### One dirty native card

```text
20 local cards mounted
native listing X changes aria-pressed
```

Assert only X is patched/replaced.

### Same-value native mutation

```text
native mutation fires but prepared presentation is unchanged
```

Assert zero local replacements.

### In-flight favorite action

```text
local X heart working
native X aria-pressed changes at 50 ms
hydration reconcile at 90 ms
action completion at 900 ms
```

Assert:

- visible working state is not accidentally lost;
- focus remains or is intentionally restored;
- final state comes from authoritative current native/action evidence;
- no unrelated local cards are replaced.

### Route/render generation changes during hydration debounce

Assert old mutation records cannot patch the new local render.

## 13. Priority

This is P1 interaction/performance hardening. It should follow the bounded pager fix and fit naturally into the lifecycle/render-generation consolidation.

The action completion weakness itself remains documented separately and should be fixed together with this hydration interaction rather than as two independent timing patches.