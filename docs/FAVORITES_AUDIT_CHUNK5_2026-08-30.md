# Favorites audit chunk 5 — lifecycle feedback, rail reconcile and render-generation gaps

Date: 2026-08-30

Production baseline audited: BetterSearch v0.15.1, `main` at `56fa30c4bcf0533f1c9b695f1f0a20fbef35fcdc`.

Status: source/test audit only. This package does not change BetterSearch or Diagnostics runtime behavior.

## Executive summary

The earlier Diagnostics audit proved that the live Favorites page produced multiple BetterSearch rail generations and extremely high DOM mutation volume, including at least 149k direct same-value rewrites. Chunk 5 follows those symptoms through the final v0.15.1 source chain and identifies concrete feedback/reconcile mechanisms that remain active today.

The key findings are:

1. The dedicated shell observer was repeatedly hardened and historical shell observers are not all active at once. However, a separate base runtime observer still watches every body `childList` mutation without an ownership predicate.
2. On an unchanged route, that runtime observer still schedules `favEnsureToolbar()`, whose page-shell wrapper schedules another shell install.
3. Final All/collection header writers still perform child-list/text rewrites even when visible content is unchanged, so BetterSearch can wake its own broad runtime observer and re-enter the shell.
4. The same broad observer resets one shared current-page observation timer; low-information mutation churn can therefore displace a more urgent 0/350 ms observation with a generic 1000 ms timer.
5. The permanent rail remains mounted inside Etsy's replaceable sidebar and native Etsy sidebar children are still reparented into a hidden BetterSearch wrapper.
6. Intentional desktop rail replacement removes the old rail, while module 99 treats any removed rail as a repair event even when the same operation installed a healthy replacement.
7. Full rail reconstruction is still used in some paths even though ordinary facet availability already has an in-place reconcile implementation. Whole-root replacement can lose focus, selection and other transient DOM state.
8. Module 101's native-card hydration adapter replaces every matching visible local card clone after one relevant native mutation instead of reconciling only dirty listings or comparing presentation first.
9. A local Favorite action can therefore have its working local card replaced roughly 90 ms after the native button changes while the action handler is still waiting on its ~900 ms completion check.
10. The final local render signature is useful but represents dataset + config request identity, not a complete catalogue/query/metadata/native-view generation.
11. Existing tests mostly verify source-level contracts in isolation and do not execute the combined runtime-observer + final-shell-writer + timer state machine.

These findings do not change the P0 data-generation order from Chunks 3/4. They refine the lifecycle/render phase and provide concrete regression fixtures for the previously broad "one lifecycle controller" recommendation.

---

## 1. Exact source feedback chain behind no-op mutation churn

The final shell observer has an owned-node predicate. The base runtime observer does not.

A valid current-source cycle is:

```text
shell/header reconcile
-> BetterSearch rewrites header/count child DOM
-> broad runtime MutationObserver fires
-> schedule route sync
-> route/dataset/view are unchanged
-> favEnsureToolbar()
-> page-shell wrapper schedules another shell install
-> header/count DOM is rewritten again
-> broad runtime observer fires again
```

This is a source-proven valid feedback path and is consistent with the earlier capture's header/toolbar/count hot spots.

It is not claimed that every recorded same-value mutation came from this exact cycle.

See `FAVORITES_RUNTIME_MUTATION_FEEDBACK_AUDIT_2026-08-30.md`.

---

## 2. The dedicated shell observer is not the same problem

A useful correction to older architectural shorthand:

Modules 88, 89, 94 and 99 disconnect and replace the previous `favState.shellObserver0120`. Current production does not leave all those historical shell observers running simultaneously.

The remaining debt is instead:

- stacked function wrappers/reassert paths;
- one separate unfiltered body observer in the base runtime;
- destructive DOM ownership inside Etsy's sidebar;
- non-idempotent presentation writers;
- redundant repair classification.

This distinction should guide the refactor and performance measurements.

---

## 3. Observation debounce has a priority inversion

`favScheduleCurrentPageObservation(delay)` uses one timer and clears any existing timer before scheduling the new delay.

Urgent paths can request 0 or ~350 ms observation. The broad body observer requests the default ~1000 ms observation after any child-list mutation.

Therefore:

```text
urgent observation scheduled
-> unrelated/owned mutation occurs
-> urgent timer is cancelled
-> generic 1000 ms timer replaces it
```

Persistent churn can repeatedly postpone current-page indexing/settle work.

The fix should use dirty flags/generation-aware scheduling or a scheduler that never allows a lower-priority later request to postpone an earlier deadline.

---

## 4. Rail ownership remains structurally fragile

The permanent BetterSearch rail is a direct child of Etsy's sidebar.

If Etsy replaces the sidebar host, the rail necessarily disappears with it until BetterSearch repairs the new host.

Inside a stable host, BetterSearch also creates `.ebsf-native-favorites-source` and moves Etsy's native sidebar children into it. That hidden source is not part of the final owned-shell predicate, so capture itself can look like native sidebar churn.

The durable target remains a stable BetterSearch-owned mount boundary that does not routinely reparent Preact-owned native children.

See `FAVORITES_SHELL_RAIL_OWNERSHIP_RECONCILE_AUDIT_2026-08-30.md`.

---

## 5. Intentional rail refresh can self-trigger repair

Desktop `favRefreshRail()` constructs a new rail and replaces the old rail root.

Module 99 treats any removed rail as shell-repair evidence. It does not first check whether a valid new direct rail was installed in the same mutation/reconcile.

So a successful intentional refresh can immediately schedule a redundant shell repair frame.

This is bounded but unnecessary and contributes to extra rail generations/work.

---

## 6. Prefer in-place rail reconcile for ordinary availability changes

The filter system already contains an in-place availability updater that can:

- show/hide existing options;
- update Shop choices;
- update Ships-from choices.

A full rail root rebuild should therefore be reserved for structural layout/schema changes or host replacement.

This also reduces risk of losing:

- keyboard focus;
- text selection/caret;
- local scroll state;
- pointer capture;
- other transient control state.

---

## 7. Native hydration currently over-reconciles local cards

Module 101 watches the hidden native grid so later Etsy hydration can improve local card presentation.

The current refresh path does not retain dirty listing IDs from mutation records. After one relevant mutation it loops through visible local cards and replaces every card with a connected native counterpart.

For one page this can mean roughly twenty full card replacements for one changed native button or text field.

There is also no presentation-equality check before replacement.

The better model is:

```text
mutation records
-> dirty listing IDs
-> current render-generation check
-> presentation diff
-> patch/replace only changed listing cards
```

See `FAVORITES_LOCAL_CARD_HYDRATION_RECONCILE_AUDIT_2026-08-30.md`.

---

## 8. Hydration replacement can race Favorite action UI

The local Favorite path with a mounted native counterpart:

```text
mark local heart working
-> click native Etsy heart
-> wait ~900 ms
-> read final state
```

A native `aria-pressed` change can trigger module-101 hydration reconcile after its ~90 ms debounce.

That can replace the visible local card long before the action completion timer finishes.

Consequences can include:

- working/disabled state disappearing early;
- focus loss;
- old action handler retaining detached-node references;
- unrelated local cards also being replaced.

This should be solved with one action generation/state observation contract plus dirty-card reconcile, not another timing delay.

---

## 9. Current render signature is useful but incomplete

The final render signature is approximately:

```text
dataset key + normalized filter/sort config
```

The inner `favReapply()` does correctly recheck dataset identity after major awaits and reads current records when it renders, so this is not a generic stale-array bug.

What remains absent from the signature is first-class representation of:

- owner generation;
- immutable catalogue generation;
- committed query generation;
- metadata destination/requirements generation;
- native view generation;
- local result ID/order signature.

A post-await dataset+config signature cannot prove the exact record/metadata/native-view revision that produced the mounted DOM.

See `FAVORITES_RENDER_GENERATION_AND_TEST_GAPS_AUDIT_2026-08-30.md`.

---

## 10. Render integrity also inherits metadata-context ambiguity

The final integrity readiness gate treats `metadataCoverage.pending > 0` as the main metadata-blocking condition.

Chunk 4 proved that auxiliary metadata can be unresolved or stale for the active destination while deep pending work is zero.

Therefore the future render token should depend on metadata context/requirements generation, not merely a pending count.

---

## 11. Static tests are not enough for these bugs

Current tests use many valuable source-level assertions, for example:

- final shell observer has owned-node filtering;
- render signature helper exists;
- native hydration observer is scoped to the native grid;
- route changes are separated into dataset/view keys;
- native/local state variables are not directly assigned to one another.

These do not execute the combined runtime.

Two already-proven examples show why that matters:

```text
shell observer ignores owned nodes
BUT separate runtime observer does not

native adapter never writes localPage
BUT native selector can still match the local pager
```

Combined behavioral fixtures must become the regression standard for lifecycle ownership.

---

## 12. Recommended lifecycle/render implementation order

The existing data order remains first:

### Data foundation

- stable owner identity;
- atomic mutable writes;
- v3 immutable catalogue generations;
- owner-specific memberships;
- query/metadata context generations.

### Independent small correction

- fix module-95a local/native pager semantic alias with a real dual-pager fixture.

### Lifecycle foundation

- replace the broad mutation-as-route observer with dirty-signal classification;
- introduce deadline/priority-safe scheduling;
- make header/count/shell writers DOM-idempotent;
- stop routine native sidebar reparenting;
- establish one stable shell/rail mount contract.

### Render/presentation generation

- signed render transaction consuming the new data generations;
- atomic grid + pager + count ownership commit;
- dirty-listing native hydration reconcile;
- action generation integrated with card reconcile.

---

## 13. New regression matrix

Add these combined fixtures:

```text
unchanged shell reconcile -> quiescence, no self-sync cycle
urgent 350 ms page observation + later owned mutation -> deadline not postponed
intentional rail A -> B replacement -> no redundant repair
native-source capture -> no owned self-repair
Etsy sidebar host replacement -> exactly one new rail generation
ordinary facet availability update -> rail root identity preserved
one native card aria-pressed mutation -> only that local card reconciled
same-value native hydration mutation -> zero local replacements
favorite action in flight + native hydration -> working/focus state remains coherent
same dataset but catalogue generation advances -> old render cannot remain authoritative
metadata destination generation changes -> shipping-dependent old render loses authority
```

---

## 14. Diagnostics instrumentation to add later

Useful privacy-safe counters/revisions:

```text
runtime mutation notifications
runtime sync schedules / executions
current-page observation deadline + reason
shell reconcile generation
DOM writes performed / skipped
rail generation
local-card dirty IDs count
local-card replacements performed / skipped
owner/catalogue/query/metadata/native-view/render generation IDs
```

Use opaque generation numbers and counts; do not capture private listing/query content merely for lifecycle correlation.

---

## 15. Scope

This is a docs-only audit. It does not claim that every source-level race was individually reproduced in the private recording.

Where the recording already proved the broader symptom, this document narrows the source mechanism. Where the finding is source-only, it is described as a valid current-source race/path rather than an observed user event.

The current Favorites visual contract remains frozen.