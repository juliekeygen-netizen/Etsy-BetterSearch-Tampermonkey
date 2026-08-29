# Favorites audit chunk 6 — geometry, owned-UI wakeups, startup boundary and status idempotence

Date: 2026-08-30

Status: source-audit synthesis. Documentation/design only; production runtime behavior is unchanged.

This chunk continues the evidence-first Favorites audit after Chunks 3–5. It finishes the lifecycle/render surfaces that sit directly around the broad runtime-observer feedback path identified in Chunk 5.

## Documents in this chunk

- `FAVORITES_GEOMETRY_RECONCILE_AUDIT_2026-08-30.md`
- `FAVORITES_OWNED_UI_LIFECYCLE_WAKEUP_AUDIT_2026-08-30.md`
- `FAVORITES_RUNTIME_FINAL_READY_SENTINEL_AUDIT_2026-08-30.md`
- `FAVORITES_STATUS_PROGRESS_IDEMPOTENCE_AUDIT_2026-08-30.md`

---

## Highest-confidence findings

### 1. Stable final toolbar geometry is still reached through destructive intermediate geometry

The final responsive/geometry chain intentionally removes valid inline geometry and then restores/recalculates it.

In particular:

```text
module 96 final repair
-> clear widths/flex/margins/transform
-> later exact geometry hook
-> measure again
-> write widths/search variables again

module 98 X alignment
-> remove current transform
-> read rect
-> write transform again
```

This provides a direct current-source explanation for the Diagnostics observation that toolbar controls traverse intermediate positions during shell/route repair.

The target lifecycle must calculate desired geometry first and write only changed values.

### 2. The dedicated shell observer is ownership-aware, but the base runtime observer still reacts to BetterSearch-owned body UI

Sort portals, Settings, the mobile filter overlay, info popovers, layout editor/confirmation/context surfaces and drag ghosts are BetterSearch-owned body-level DOM.

The base runtime `MutationObserver` still watches all body child-list mutations and schedules route/current-page work without first filtering owned UI.

This means purely local UI interactions can enter the native-route/index scheduling path.

This should be eliminated by the planned single lifecycle controller: BetterSearch state changes should emit semantic dirty reasons directly rather than being rediscovered by observing BetterSearch's own DOM.

### 3. The deferred runtime is normally ordered correctly, but its final-ready sentinel is owned by the wrong module

Module 96 schedules `favMarkFinalRuntimeReady0130()` in a RAF. Normal synchronous evaluation means modules 97–101 generally install before that callback runs.

Therefore ordinary execution is **not** currently proven to start runtime too early.

However, module 96 is no longer the final production module. If a later module throws during top-level initialization, module 96's already-queued callback can still release the runtime against a partial final chain.

Move final-ready ownership to a true final bootstrap/sentinel and fail closed when required production bindings did not initialize.

### 4. Same-value status/progress writes remain common, but one historical Settings conflict should not be overclaimed

Current progress/settings/header writers still assign text/style/hidden/ARIA state without systematic equality checks.

However, the final Settings UI has evolved since the earlier capture. The exact old `coverage` formatting ping-pong is historical evidence of ownership conflict, not source proof that the identical visible alternation remains in v0.15.1.

A fresh capture is required for that exact claim.

---

## Combined lifecycle picture after Chunks 5 + 6

The current late architecture can be summarized as:

```text
Etsy native mutation
      |
      v
broad runtime body observer -----------------------+
      |                                             |
      +-> route/current-page timers                 |
                                                    |
BetterSearch shell/header/portal/modal mutation ----+

final shell observer
      |
      +-> narrower shell repair predicate

shell repair / ensure toolbar
      |
      +-> multiple wrapper scheduling points
      +-> clear geometry
      +-> rebuild/rewrite header/rail state
      +-> exact geometry measurement
      +-> reapply geometry
      |
      +-> some writes wake broad runtime observer again
```

The dedicated shell observer has improved over time, but it cannot solve the broader ownership problem while the base runtime observer treats arbitrary body child mutations as application lifecycle signals.

---

## Revised implementation implications

The canonical architecture plan remains valid. These audits refine Phase 6/9/10 into concrete acceptance criteria.

### Lifecycle controller must

- be inactive outside Favorites except for the smallest required route detector;
- consume semantic dirty reasons rather than arbitrary owned DOM churn;
- coalesce dirty reasons without allowing low-priority work to delay urgent native observation;
- perform one reconcile per settled generation;
- own shell/rail/header/toolbar/progress presentation;
- expose one teardown path for leaving Favorites.

### Geometry controller must

- never clear a correct visible state simply to discover the same state again when avoidable;
- compare desired/current values before writing;
- use one measurement signature and one writer;
- separate measurement from mutation where practical.

### Final bootstrap must

- run after every required Favorites production module/subsystem has installed;
- validate the required contract;
- start runtime exactly once;
- fail closed to native Etsy Favorites when initialization is incomplete.

### Presentation writers must

- use equality-before-write helpers;
- avoid duplicate live-region announcements;
- allow no-op reconcile passes to produce effectively zero mutations.

---

## Priority relative to the earlier audit

The priority order remains:

```text
P0 correctness
  owner identity / atomic scope writes / generation-safe catalogue+metadata
  local/native pager semantic alias

P1 render ownership
  signed render generation
  native/local grid + pager ownership transaction

P1 lifecycle consolidation
  broad runtime observer -> semantic controller
  stable shell ownership
  route teardown
  DOM-idempotent header/rail/toolbar/progress writers

P2 startup/module-chain cleanup
  true final-ready bootstrap
  retire historical wrappers
  split critical bootstrap from heavy startup
```

Chunk 7 should now focus on accessibility/focus ownership, resource teardown/lifetime, and translating all audit findings into bounded implementation releases.