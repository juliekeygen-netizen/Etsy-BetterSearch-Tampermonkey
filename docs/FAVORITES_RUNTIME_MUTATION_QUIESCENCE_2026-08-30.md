# Favorites v0.15.13 runtime mutation quiescence

Status: release implementation for the Phase 2F runtime-observer feedback and scheduling audit.

## Source-proven problems

The Favorites runtime still had one body-level `MutationObserver` whose callback treated every child-list mutation as a lifecycle signal. When BetterSearch reconciled its own grid, pager, rail, header or count presentation, those writes could feed the same runtime scheduling path that later caused more shell/reconcile work.

The same source audit found two scheduling priority inversions:

- `favScheduleSync()` always cleared/replaced its pending timer, so an explicit 0/80 ms route/search signal could be pushed back by a later generic 250 ms mutation debounce;
- `favScheduleCurrentPageObservation()` did the same, so an explicit 0/350 ms native-view observation could be pushed back by a later generic 1000 ms mutation signal.

These are controller-level problems, separate from the remaining presentation no-op writers.

## v0.15.13 runtime contract

The fix is implemented in the original runtime owner, `src/63-favorites-runtime.js`. It does not add another late patch module or a second body observer.

### Semantic mutation classification

The sole runtime body observer now delegates to `favRuntimeHandleMutations0137()`.

Mutations wholly inside clearly BetterSearch-owned presentation surfaces are ignored for generic route/current-page lifecycle scheduling. Covered surfaces include the BetterSearch local grid/pager, owned cards, rail portal, All header, toolbar row, collection strip and BetterSearch count nodes.

The classifier is deliberately conservative:

- a native/non-owned target remains lifecycle-relevant;
- a changed native wrapper remains relevant even if it contains BetterSearch descendants;
- removal of the local grid, local pager or rail portal remains relevant even though those nodes are BetterSearch-owned, so fail-safe ownership/shell repair can run;
- the native Search slot is deliberately not classified as a wholly BetterSearch-owned surface because Etsy can replace the real form inside it and BetterSearch must still rebind/search-sync that native control;
- while the atomic local render transaction has `favState.rendering` set, runtime lifecycle scheduling is suppressed as before.

### Priority-preserving debounce

Both runtime schedulers now track the delay of the pending task.

The rule is:

- same-priority calls retain the historical debounce behavior;
- a more urgent/smaller-delay request may replace a slower pending request;
- a lower-priority/larger-delay request may not postpone an already queued more urgent task;
- timer ID and delay state are cleared before callback work begins.

This protects explicit route/search/native-view work from incidental presentation churn without turning the lifecycle into a non-debounced stream.

### Small idempotence correction

The legacy result-count writer now compares the requested text with the current text before assigning `textContent`.

## Regression coverage

`tests/favorites-runtime-mutation-quiescence.test.mjs` executes or verifies:

- the single semantic runtime body observer;
- owned-presentation mutation suppression;
- native mutation preservation;
- critical owned-surface removal preservation;
- active render-transaction suppression;
- urgent route-sync protection;
- same-priority route debounce;
- urgent current-page observation protection;
- urgent pre-emption of slower observation work;
- scheduler priority-state reset before callbacks;
- native Search-slot exclusion from the owned-surface list;
- compare-before-write result-count text.

The first behavior-only CI run exposed a test-harness error (`scheduled` was not injected into the VM context), not a runtime-source failure. The harness was corrected without changing runtime source, after which the exact behavior head passed repository checks, the complete test suite, Chrome/Firefox/Diagnostics builds and all artifact uploads.

## Remaining Phase 2F work

This release fixes the runtime controller feedback path, not every presentation no-op writer.

A separate follow-up should harden the final persistent presentation writers, particularly:

- All/collection header text and metadata reconciliation;
- progress text;
- shared sort/search width CSS variables;
- progress geometry CSS variables;
- remaining final-owner class/dataset/ARIA/style writes where equality can be proven before mutation.

Keeping that work separate makes it possible to measure presentation-idempotence changes independently from runtime observer/controller behavior.
