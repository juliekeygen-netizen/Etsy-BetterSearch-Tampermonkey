# Favorites audit index — Chunk 5 addendum — 2026-08-30

This continues:

- `FAVORITES_AUDIT_INDEX_AND_NEXT_PHASES_2026-08-30.md`
- `FAVORITES_AUDIT_INDEX_CHUNK4_ADDENDUM_2026-08-30.md`

Production baseline audited: BetterSearch v0.15.1, `main` at `56fa30c4bcf0533f1c9b695f1f0a20fbef35fcdc`.

## New Chunk 5 documents

### `FAVORITES_AUDIT_CHUNK5_2026-08-30.md`

High-level synthesis of the exact lifecycle feedback chain, rail reconcile debt, local-card hydration churn and render-generation/test gaps.

### `FAVORITES_RUNTIME_MUTATION_FEEDBACK_AUDIT_2026-08-30.md`

Covers:

- dedicated shell observer vs separate unfiltered base runtime observer;
- unchanged-route sync still entering the shell through `favEnsureToolbar()`;
- final header/count child-list writes waking the runtime observer;
- valid self-feedback cycle consistent with earlier Diagnostics no-op mutation evidence;
- current-page observation priority inversion from one shared debounce timer;
- required dirty-signal scheduler and DOM-idempotent writers.

### `FAVORITES_SHELL_RAIL_OWNERSHIP_RECONCILE_AUDIT_2026-08-30.md`

Covers:

- rail mounted inside Etsy's replaceable sidebar host;
- native Etsy sidebar children reparented into `.ebsf-native-favorites-source`;
- hidden native-source wrapper missing from final owned-shell predicate;
- intentional rail replacement being classified as rail loss;
- full rail reconstruction vs existing in-place facet reconcile;
- transient focus/selection/scroll risks;
- correction that historical shell observers replace one another rather than all remaining active.

### `FAVORITES_LOCAL_CARD_HYDRATION_RECONCILE_AUDIT_2026-08-30.md`

Covers:

- module-101 native-grid hydration observer;
- one native mutation causing all matching local cards to be replaced;
- no presentation equality check;
- local Favorite working-state/focus race during the ~900 ms action completion window;
- local-card replacement waking the broad runtime observer;
- dirty-listing and action-generation reconcile requirements.

### `FAVORITES_RENDER_GENERATION_AND_TEST_GAPS_AUDIT_2026-08-30.md`

Covers:

- current render signature representing dataset+config rather than complete data generation;
- useful dataset rechecks already present in `favReapply()`;
- missing catalogue/query/metadata/native-view/result generations;
- render-integrity dependence on metadata `pending` rather than full context freshness;
- static source tests vs combined behavioral fixtures;
- recommended signed render transaction.

## Priority amendments

The P0 data order remains unchanged:

```text
owner identity
-> atomic mutable writes
-> v3 immutable catalogue generations
-> owner-specific membership
-> query/metadata generations
```

The local/native pager semantic alias remains a small independent correctness fix.

After those foundations, prioritize the lifecycle work as one coherent release rather than a set of late wrappers:

```text
broad runtime observer replacement
-> priority-safe dirty scheduler
-> DOM-idempotent shell/header writers
-> stable rail/shell mount boundary
-> render-generation transaction
-> dirty-card hydration reconcile
-> action-generation integration
```

## Important correction to older shorthand

Do not describe current production as having every historical shell observer running simultaneously.

The late shell modules disconnect/replace the prior `shellObserver0120`.

The current conflict is more accurately:

```text
one final shell observer
+
one separate unfiltered base runtime body observer
+
multiple stacked shell/render wrappers and writers
```

That distinction should be preserved in future implementation prompts and audits.

## Additional combined regression tests

Append:

```text
correct shell + runtime observer -> no self-reconcile loop
urgent current-page observation cannot be postponed by lower-priority owned mutation
rail root refresh does not schedule repair when valid replacement already exists
native-source capture is recognized as owned lifecycle work
host replacement creates one rail generation
facet availability update preserves rail root/focus
one dirty native listing reconciles one local card
same-value hydration performs zero local replacements
favorite action stays coherent while native aria state hydrates
catalogue generation change invalidates previous local render authority
metadata context generation invalidates destination-sensitive previous render
```

## Implementation rule

Do not patch the Diagnostics-proven mutation churn by adding one more observer whose only job is to ignore another observer.

The target remains:

> one lifecycle controller, explicit dirty reasons/generations, one stable shell ownership boundary, and DOM writes only when desired state differs from current state.

The current visual UI remains the contract.