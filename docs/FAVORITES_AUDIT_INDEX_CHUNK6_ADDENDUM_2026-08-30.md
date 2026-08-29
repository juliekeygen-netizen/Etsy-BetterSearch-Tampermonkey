# Favorites audit index — Chunk 6 addendum

Date: 2026-08-30

This addendum extends the existing Favorites audit index without rewriting the larger canonical status document.

## Chunk 6 entrypoint

Start with:

- `FAVORITES_AUDIT_CHUNK6_2026-08-30.md`

Focused evidence:

- `FAVORITES_GEOMETRY_RECONCILE_AUDIT_2026-08-30.md`
- `FAVORITES_OWNED_UI_LIFECYCLE_WAKEUP_AUDIT_2026-08-30.md`
- `FAVORITES_RUNTIME_FINAL_READY_SENTINEL_AUDIT_2026-08-30.md`
- `FAVORITES_STATUS_PROGRESS_IDEMPOTENCE_AUDIT_2026-08-30.md`

## New source-proven items

1. Final toolbar geometry still performs clear -> measure -> restore cycles on an already-valid state.
2. Exact toolbar X alignment removes the current transform before measuring and can reapply the same transform afterward.
3. BetterSearch-owned body UI can wake the separate broad runtime observer even though the final shell observer filters owned shell mutations.
4. The full Favorites runtime observer remains active after soft navigation away from Favorites and can continue scheduling delayed Favorites checks from unrelated body churn.
5. Normal deferred-runtime ordering is currently okay because module 96 marks final-ready from a RAF, but failure containment is weak because modules 97–101 are required production layers that initialize after the sentinel was scheduled.
6. Current status/progress writers still lack systematic equality-before-write semantics.
7. The exact old Settings coverage-format alternation is not reclassified as a current v0.15.1 bug without new browser evidence.

## Test gaps added by Chunk 6

- repeated identical geometry reconcile -> zero visible style/attribute mutations;
- BetterSearch portal/modal mount/remove -> no route/native dirty reason;
- later required module initialization failure -> runtime stays unreleased/native fallback remains usable;
- repeated identical status/progress state -> no DOM/live-region rewrite;
- changed state -> only the minimum expected mutation(s).

## Priority impact

Chunk 6 does not change the earlier P0 ordering. It sharpens the lifecycle/module-consolidation phases and provides concrete acceptance criteria for them.

Next audit continuation:

- accessibility and focus ownership across rail/card/pager/modal replacement;
- route teardown and resource lifetime (portals, observers, timers, detached-node references, scroll locks);
- bounded release plan mapping audit findings to implementation PRs.