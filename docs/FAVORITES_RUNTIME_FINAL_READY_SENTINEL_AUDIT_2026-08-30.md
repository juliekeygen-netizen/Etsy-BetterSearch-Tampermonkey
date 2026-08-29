# Favorites runtime final-ready sentinel audit — 2026-08-30

Status: focused source audit of deferred Favorites runtime startup after the late override chain.

No runtime code is changed by this document.

## Summary

The current defer mechanism is better than a simple load-order bug: **normal execution does not currently release the Favorites runtime before modules 97–101 synchronously install their overrides.**

However, the component that marks the runtime "final ready" is stale. Module 96 still owns the ready signal even though production now has five later modules. This creates an exception/failure-containment gap: a later top-level module can fail, yet module 96's already-scheduled `requestAnimationFrame` can still release runtime with only a partially installed final chain.

---

## 1. The defer guard itself is explicit and correct in principle — SOURCE-PROVEN

`src/85a-favorites-runtime-defer.js` replaces `favStartRuntime` with a deferred marker and exposes:

```text
favReleaseRuntime0128()
favMarkFinalRuntimeReady0130()
```

`favReleaseRuntime0128()` refuses to start until `favFinalRuntimeReady0130` is true.

This is the correct general pattern: early runtime-start requests remain pending until the final production contract is installed.

---

## 2. Module 94 requests release but the guard keeps it pending — SOURCE-PROVEN / CORRECT

`src/94-favorites-native-boundary.js` calls `favReleaseRuntime0128()` after its boundary/responsive hooks are installed.

Because `favFinalRuntimeReady0130` is still false at that point, the request remains pending.

This protects modules 95+ from the original "runtime starts in the middle of the override chain" problem.

---

## 3. Module 96 marks final-ready from a RAF — NORMAL ORDER IS CURRENTLY SAFE

At the end of `src/96-favorites-exact-header-parity.js`:

```text
requestAnimationFrame(() => {
    ...
    favMarkFinalRuntimeReady0130?.();
})
```

The userscript/build order after module 96 is currently:

```text
97-favorites-all-native-header.js
98-favorites-exact-search-width.js
99-favorites-v0131-correctness.js
100-favorites-all-search-clear-parity.js
101-favorites-v0141-smoke-fixes.js
```

Those modules execute synchronously as part of normal script evaluation before the queued animation-frame callback gets a chance to run.

Therefore this audit does **not** classify the ordinary production order as "runtime definitely starts before 97–101." That would overstate the source evidence.

---

## 4. The ready owner is nevertheless stale — SOURCE-PROVEN FAILURE-CONTAINMENT GAP

Module 96 calls itself the final UI boundary and schedules the ready callback before modules 97–101 have even begun evaluating.

Consider:

```text
module 96 finishes
-> queues mark-final-ready RAF

module 97 evaluates
module 98 evaluates
module 99 throws during top-level initialization
-> modules 100/101 never install normally

next animation frame
-> module 96 callback still runs
-> favMarkFinalRuntimeReady0130()
-> pending runtime is released
```

Runtime can now run against a partially installed production chain.

This is a fail-safe/startup integrity issue rather than a normal timing race.

---

## 5. The final-ready marker should live after the actual final required module

Preferred target:

```text
load required Favorites modules
-> each module installs without uncaught top-level error
-> final bootstrap/sentinel executes last
-> validate required contract/version markers
-> mark runtime ready
```

Do not make the signal depend on "a RAF from an earlier module probably runs later."

A tiny explicit final module is preferable, for example conceptually:

```text
102-favorites-runtime-ready.js
```

or, better during module-chain consolidation, a final entrypoint/bootstrap function in the new Favorites subsystem.

---

## 6. Contract validation should be semantic, not only positional

Before releasing runtime, the final bootstrap can cheaply verify the minimum required production bindings exist, such as the final implementations/markers for:

```text
lifecycle controller
native-page adapter
local pagination owner
render controller
shell/rail reconcile
metadata coordinator
```

The exact names will change during the refactor; the point is to fail closed if a required late subsystem did not initialize.

Failure behavior should be:

```text
log one clear BetterSearch initialization error
leave Etsy native Favorites usable
avoid starting partial BetterSearch runtime
```

not "start anyway with an incomplete override chain."

---

## 7. Tests currently prove relative file order more strongly than failure containment — TEST GAP

Current tests assert late-module order and various source contracts. They do not simulate:

```text
module N throws during top-level install
-> final runtime must remain unreleased
```

### Required test

A bootstrap test should execute a minimal simulated module chain where a required late install fails and assert:

```text
runtimeStarted == false
Etsy/native fallback remains selected
one initialization failure is surfaced
```

A second test should verify all required modules -> one runtime start, never two.

---

## 8. Priority

This is a bounded hardening patch that can be implemented independently once the team is ready to touch runtime startup.

It does not outrank the data/snapshot correctness work, but it is a good prerequisite for the larger late-module consolidation because it gives that migration a fail-closed final bootstrap boundary.