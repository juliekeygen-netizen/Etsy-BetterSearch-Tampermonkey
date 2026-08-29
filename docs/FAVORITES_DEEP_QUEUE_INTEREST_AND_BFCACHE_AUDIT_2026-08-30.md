# Favorites deep-queue interest and BFCache lifecycle audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `966a8922f3eff3a15f91c2c7d5601f1b6358d869`.

This document extends the existing deep-queue multi-tab audit with two downstream issues: who still has an interest in a listing's global metadata job, and whether `pagehide` is sufficient evidence that a worker document is permanently gone.

## 1. Queue job identity is global by listing ID

Deep metadata jobs use an ID of the form:

```text
listing:<listingId>
```

That is a reasonable default because the expensive listing-page metadata is mostly listing-global and can be reused by multiple Favorites scopes/owners.

The problem is not the global job ID by itself. The problem is that job retirement currently follows the old global favorite-state model.

## 2. Direct unfavorite retires a queued listing job globally

Module 75 wraps `favIndexMarkUnfavorite()` and, after a successful unfavorite, calls `favDeepRetireQueuedUnfavorite0106(listingId)`.

That helper finds `listing:<id>` and marks a queued job completed with:

```text
Skipped: listing is no longer favorited
```

Chunk 3 proved that the current schema incorrectly combines owner-specific memberships with one global `listing.isFavorite` state.

Once owner-specific membership is repaired, deep-job retirement must be repaired at the same time.

Example:

```text
Owner A Favorites contains listing X
Owner B Favorites also contains listing X
X has a queued global metadata job

A unfavorites X
```

Correct result:

```text
A membership inactive
B membership still active
global metadata job may still be useful for B
```

Current retirement semantics conceptually assume:

```text
A unfavorite X
-> X is no longer interesting to Favorites at all
-> retire listing:X
```

That assumption cannot survive the v3 owner-membership fix.

## 3. Separate job identity from interest identity

Recommended model:

```text
metadata job identity:
    listing ID + parser/capability generation

interest/referrer identity:
    owner/scope/generation that currently needs the result
```

The queue does not necessarily need one row per owner. A single listing fetch is preferable when the output is reusable.

But retirement should ask:

```text
Does any active verified membership/current requirement still need this job?
```

rather than:

```text
Did one owner just unfavorite the listing?
```

A compact `interestCount` is not sufficient unless it is transactionally derived; explicit bounded referrers or a recomputable eligibility query are safer.

## 4. Running job after unfavorite needs a post-fetch eligibility decision

Current code deliberately allows an already-running request to finish rather than trying to cancel every cross-tab network operation.

That is acceptable if the final metadata write is global and atomic, but it must not:

- restore favorite membership;
- make a retired owner scope active again;
- requeue work solely because stale favorite state was read before the request;
- overwrite a newer listing row from another tab.

The atomic-write audit already covers the stale whole-row merge. The interest model adds the other side: finishing useful global metadata is allowed even if one referrer disappeared, provided the result is merged without membership side effects.

## 5. Manual Cancel/pause and listing interest are different concepts

The durable manual pause key means:

```text
Do not automatically claim more deep jobs right now
```

It should not mutate the durable reason why jobs exist or delete owner/scope interest.

Similarly, disabling automatic scanning should affect worker policy, not convert queued useful jobs into false terminal completion unless product behavior explicitly chooses that.

Keep these domains distinct:

```text
queue contents / interests
worker auto-run policy
manual global pause
worker lease ownership
```

## 6. `pagehide` currently means "worker ended"

`src/83-favorites-cross-page-queue.js` registers:

```text
window.addEventListener('pagehide', favMarkDeepWorkerEnded0110, ...)
```

`favMarkDeepWorkerEnded0110()` writes a localStorage marker for the current worker ID.

A later/new Etsy document can use that marker to requeue a matching running job immediately instead of waiting for the normal lease to expire.

That is useful for actual navigation/tab teardown.

## 7. BFCache makes unconditional `pagehide` an unsafe death signal

Browsers can fire `pagehide` when a document enters the back-forward cache. In that case the document may be frozen and later restored rather than destroyed.

The event exposes whether it is being persisted (`event.persisted`), but the current handler receives no event and does not distinguish the cases.

Potential sequence:

```text
Tab A owns running job X
A receives pagehide because document enters BFCache
A writes "worker ended" marker

Tab B/new Etsy document sees marker
B atomically recovers/requeues X
B claims X

A is restored from BFCache later
A still has old in-memory worker/ownership state
```

The module-75 lease/CAS checks should prevent stale A from successfully applying a terminal queue transition after B owns the job, which limits corruption.

But the false death signal can still cause:

- duplicate listing requests;
- unnecessary retry/attempt churn;
- stale in-memory progress in restored A;
- needless lease-loss errors;
- confusing resume/cancel behavior.

This is a lifecycle correctness/performance issue even if CAS prevents final row corruption.

## 8. Required lifecycle rule

Do not use one browser lifecycle event as proof of permanent death.

At minimum:

```text
pagehide persisted=false
-> eligible to mark fast ended-worker hint

pagehide persisted=true
-> do not publish permanent-death hint
```

On `pageshow` with a persisted restore:

- discard stale local ownership assumptions;
- re-read the queue row before resuming progress UI;
- if another worker owns it, treat the restored document as an observer, not owner;
- schedule ordinary queue resume only through current policy/lease rules.

The IndexedDB lease remains the final authority. The localStorage ended-worker marker is only an optimization hint.

## 9. Ended-worker marker cleanup is secondary authority

The current marker has a bounded 24-hour cleanup path, which is good.

However, after the planned migration away from localStorage coordination where possible, this hint can also move to an opaque bounded coordinator mechanism. It should not become another source of raw dataset/user identity.

Worker IDs themselves are opaque/random and are much less sensitive than dataset keys.

## 10. Required tests

Add real interleaving/lifecycle fixtures:

```text
owner A unfavorites X while owner B still has active membership
-> global job remains eligible if B requires it

last owner/scope interest disappears while job queued
-> queued job can retire safely

job already running and last interest disappears
-> fetch may finish, metadata merge cannot restore membership

pagehide persisted=false
-> fast-ended hint allowed

pagehide persisted=true
-> no permanent-death hint

BFCache A -> B reclaims after real lease expiry -> A pageshow
-> A cannot resume stale ownership

manual pause in another tab
-> restored page performs no new automatic claim
```

## 11. Priority

The multi-owner job-interest correction belongs in Data Release B with owner-specific membership, because leaving retirement tied to global favorite state would partially reintroduce the same bug through the worker layer.

The BFCache distinction is a smaller P1 lifecycle hardening item and can be implemented independently once covered by tests.