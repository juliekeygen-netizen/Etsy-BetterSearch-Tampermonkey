# Favorites v0.15.20 — Atomic mutable-row boundary

Date: 2026-08-31

This note records the public, sanitized correctness boundary for BetterSearch v0.15.20. It intentionally contains no private Favorites listing identifiers, titles, account/profile identifiers, search text, or raw diagnostics payloads.

## Why this release exists

IndexedDB serializes conflicting `readwrite` transactions, but that protection only helps when the state being changed is read inside the same transaction that writes the replacement.

Several historical Favorites paths still used this shape:

1. open a readonly transaction / call `favIndexGet()`;
2. build a complete replacement object from that snapshot;
3. later open a separate readwrite transaction and `put()` the replacement.

Across two Etsy tabs, another writer could commit newer membership, metadata, availability, or queue lease state between steps 1 and 3. The later whole-row `put()` could then erase the newer state.

The source audit confirmed this class of race in:

- deep listing + shop metadata application;
- terminal availability observations;
- base deep-queue enqueue/update/failure fallbacks.

Worker claim/recovery and worker-owned terminal transitions were already protected by the module-75 readwrite lease/CAS layer. v0.15.20 keeps that authority rather than replacing it.

## Architecture

### `src/61ab-favorites-atomic-mutations.js`

This is the low-level mutable-row transaction primitive.

`favIndexMutateStoreRow01520(storeName, key, mutator)`:

- opens one short IndexedDB `readwrite` transaction;
- reads the current row from that same transaction;
- runs a synchronous merge/mutation function against the latest row;
- optionally writes the result before the same transaction completes.

`favIndexMutateListingAndShop01520(listingId, mutator)`:

- opens `listings` + `shops` in one readwrite transaction;
- reads the latest listing row;
- derives and reads the associated latest shop row inside that transaction;
- applies the already-fetched/parsed observation to those latest rows;
- writes both mutations atomically with respect to competing transactions.

Network requests, HTML parsing, delays and retry waits stay outside IndexedDB transactions.

### `src/74a-favorites-atomic-mutable-rows.js`

This is the integration owner. It loads after the historical deep parser/queue/hardening/runtime-guard layers and immediately before module 75.

It replaces the mutable persistence boundary for:

- `favIndexApplyDeepListingObservationNow`;
- `favDeepMarkAvailability0103`;
- base `favDeepQueueEnqueue`;
- base `favDeepQueueUpdate`;
- the base failure function captured by module 73 (`favDeepQueueFailBefore0103`).

It deliberately does **not** replace module 73's public retry/non-retryable wrapper, and it deliberately does **not** replace module 75's worker lease/CAS owner.

Module 75 therefore captures the v0.15.20 atomic queue implementations as its generic fallbacks and remains the final authority for a worker that currently owns a running job.

## Queue lease rules preserved

A generic mutation that leaves a row `running` preserves the latest row's current worker/lease fields unless the caller explicitly changes them.

Whenever a resulting queue row is not `running`, v0.15.20 normalizes stale `workerId` / `leaseUntil` fields away.

The existing runtime guard also refuses normal queue population over an already queued/running job, so this release does not invent a new cancellation or worker-preemption policy.

Cross-page resume continues through module 75's atomic claim/recovery paths.

## Adversarial regression coverage

`tests/favorites-v01520-atomic-mutable-rows.test.mjs` covers:

- a deep metadata response committing after a newer owner-specific heart removal — the newer membership evidence survives;
- an availability observation committing after newer unrelated listing metadata — the unrelated fields survive;
- enqueue after another tab has already claimed a queue row — current running worker/lease state survives;
- requeue/non-running results clearing stale lease fields;
- generic updates preserving a current running lease;
- the base retry failure path remaining underneath module 73 while becoming atomic;
- the low-level primitive performing its read and write in one `readwrite` transaction;
- userscript load order proving the 74a integration boundary is installed before module 75.

The first behavior-gate run exposed one test-harness defect: its fake row mutator routed every store through the deep-queue map, so a `listings` availability update incorrectly saw no listing. Production code was not changed for that failure. The mock was corrected to model the requested store.

Exact corrected behavior head:

`83d7a54fa38cfab413c42b757212d89db52b8efe`

Behavior CI run:

`33336430199`

Result: repository checks, complete Node test suite, Chrome build, Firefox build, Diagnostics build, and all artifact uploads passed.

## Post-green source audit

The post-green audit checked the late load chain for a later override that could bypass this boundary.

Findings:

- module 75 remains the final worker lease/CAS authority and captures the atomic queue fallback;
- module 83 wraps fail/claim/resume but delegates through module 75 and does not replace enqueue/update/deep metadata/availability;
- module 84 is progress presentation only;
- modules 91/92 are shell/UI hardening;
- module 99 contains later Favorites correctness/state work but no deep-queue mutable-row replacement;
- module 101 contains render/shell integrity work, not a deep-queue writer;
- modules 102/104/105 own shell, count/filter semantics and render transactions, not these IndexedDB rows.

The release diff before identity/docs promotion was limited to the userscript wiring, the two new atomic ownership modules, and the dedicated regression test.

## Release identity

The final release candidate uses:

- package version `0.15.20`;
- userscript `@version 0.15.20`;
- all 81 `@require` cache-busters at `v=0.15.20`.

Release CI and the independent post-merge `main` push workflow remain mandatory before the release is considered closed.

## What this release does not claim

This release closes the source-confirmed stale whole-row races listed above. It does not claim that every possible IndexedDB write in the project has been formally linearizability-proven.

Future integrity audits should continue looking for any remaining pattern where a mutable durable row is read outside the transaction that later replaces it. Separate work should also continue the existing compare-before-write / DOM churn audit; that is intentionally not mixed into this data-correctness release.
