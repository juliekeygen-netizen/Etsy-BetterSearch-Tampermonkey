# Favorites IndexedDB atomic-write audit — 2026-08-30

**Status:** focused cross-tab source audit discovered during v3 migration design.

## Executive finding

The project correctly hardened some deep-queue transitions by reading and mutating a queue row inside one IndexedDB `readwrite` transaction. The general Favorites index does not yet follow that rule.

Several important writers use this pattern:

```text
readonly get
→ await / compute in JavaScript
→ later separate readwrite transaction
→ put whole object
```

The per-module Promise queues serialize calls only inside one JavaScript runtime/tab. Another tab can commit between the read and put.

This permits:

- lost scope membership additions;
- stale partial observations overwriting newer complete scope state;
- deep metadata writes restoring a listing that another tab just unfavorited;
- availability writes erasing newer listing metadata/membership;
- deep queue enqueue/update overwriting a newer running lease/state.

The v3 migration therefore needs an **atomic writer API for mutable rows**, not only immutable scope snapshots.

---

# 1. Scope observation stale write

Current `favIndexObserveRecordsNow()`:

```text
favIndexReadObservation(...)
  -> readonly transaction reads old listings/shops/scope

compute merged listings + scopeRecord in JS

favIndexWrite(...)
  -> separate readwrite transaction puts whole rows
```

`favIndexOperationQueue` protects ordering in one runtime only.

Two tabs can both read the same old scope and then replace one another's later result.

See `FAVORITES_AUDIT_CHUNK3_2026-08-30.md` for partial/partial and complete/stale-partial examples.

---

# 2. Deep metadata observation can resurrect an unfavorited listing across tabs — SOURCE-PROVEN RACE

`favIndexApplyDeepListingObservationNow()` currently:

1. `await favIndexGet('listings', id)` in a readonly transaction;
2. creates `next = { ...existing, deep metadata merges... }`;
3. optionally reads shop separately;
4. later `put(next)` in a readwrite transaction.

Consider two tabs.

## Timeline

Tab A deep worker:

```text
T1 read listing X
   isFavorite=true
   scope membership active
```

Tab B user action:

```text
T2 unfavorite X
   writes isFavorite=false
   writes removal tombstones/inactive memberships
```

Tab A resumes:

```text
T3 put stale next object created from T1
   + new deep metadata
   but still isFavorite=true
   and still old active membership state
```

The metadata write can therefore overwrite the newer unfavorite.

This is particularly important because module 75 intentionally leaves an already-running deep request alone after an unfavorite and states that it will not re-favorite the index record. The queue lease prevents a stale **worker job** from completing after ownership loss; it does not prevent another tab's valid user mutation from occurring between the listing read and listing put.

The final deep lease renewal occurs before parsed metadata is returned to the runner, but it is a lease on the queue row, not a CAS/version check on the listing row.

---

# 3. Direct unfavorite can itself overwrite a concurrent metadata update

`favIndexMarkUnfavoriteNow()` currently:

```text
existing = await favIndexGet(listings, id)
...
put(favIndexMarkListingUnfavorite(existing))
```

If another tab updates fresh metadata after the read but before the put, the unfavorite write replaces the whole listing object based on its older snapshot and can erase that new metadata.

Thus simply prioritizing unfavorite over deep writes by timestamp is not enough. The mutation needs to be applied to the latest row inside the write transaction.

---

# 4. Availability updates have the same whole-row race

`favDeepMarkAvailability0103()`:

```text
existing = await favIndexGet(listings, id)
next = favIndexMarkListingAvailability(existing,...)
put(next)
```

Another tab can update metadata/membership between read and put.

A terminal 404/410 availability observation should mutate only:

```text
availabilityState
availabilityObservedAt
```

against the latest listing row, not replace unrelated fields from a stale copy.

---

# 5. Deep queue claim is atomic, but enqueue/update are not uniformly atomic

The base deep queue implementation uses split transactions for operations such as:

```text
favDeepQueueEnqueue
favDeepQueueUpdate
```

Module 75 replaces the important claim/recovery/lease-renew/owned-terminal transitions with helpers that read and write in the same `readwrite` transaction.

That is the correct pattern.

But ordinary enqueue remains a source-level race.

## Stale enqueue can knock a running job back to queued

Starting row:

```text
job X status=queued
```

Tab A begins `favDeepQueueEnqueue(X)`:

```text
reads queued X in readonly transaction
computes merged queued row
```

Tab B atomically claims X:

```text
status=running
workerId=B
leaseUntil=...
```

Tab A then performs its later whole-row put based on the earlier queued copy:

```text
status may return to queued
worker/lease state from B is overwritten
```

Module 75's heartbeat/final lease verification should prevent worker B from committing stale parsed metadata after it loses ownership, so the lease hardening still protects terminal correctness. However the job is needlessly knocked backward and may be fetched again.

Under repeated concurrent enqueue triggers this can create avoidable duplicate requests/churn.

## Generic queue updates

The module-75 wrapper only routes worker-owned terminal transitions through CAS. Other generic update paths can still fall back to the old split-read writer.

Every queue row mutation should use `favDeepQueueMutateOne0105()`-style atomic readwrite semantics, not only claims/completions.

---

# 6. Required mutable-row writer API

Create storage primitives whose contract is explicit.

Example:

```text
favIndexMutateListing(listingId, mutator)
  open readwrite listings transaction
  get latest row
  apply mutator to latest row
  put returned row
  commit

favIndexMutateScopeState(scopeKey, expectedGeneration?, mutator)
  readwrite scope transaction
  get latest state
  verify generation/revision if required
  mutate overlay/status only
  put

favDeepQueueMutateOne(jobId, mutator)
  already close to module-75 pattern
```

Do not hand feature code a stale full object and later ask it to replace the row.

---

# 7. Metadata merge should happen against the latest row inside the transaction

For deep observations:

```text
fetch/parse outside IDB transaction
  ↓
observation payload is immutable:
  listingId
  observedAt
  parser version
  metadata fields
  availability evidence
  queue ownership token
  ↓
open short readwrite transaction
  ↓
read latest listing
  ↓
verify observation is still allowed
  ↓
merge fields into latest listing
  ↓
put
```

The network request must not hold an IndexedDB transaction open.

Only the final latest-row merge is transactional.

If the listing has been unfavorited since the scan started, metadata may still be worth caching, but the merge must preserve the newer favorite/membership state.

---

# 8. Use field/timestamp semantics without making whole-row last-write-wins

Current per-field metadata already carries source/observed time. Preserve that.

The atomic mutator should merge only intended fields:

```text
deep observation -> metadata + availability evidence
unfavorite -> viewer/owner membership state only
current-page observation -> positive presentation/membership evidence
scope generation commit -> active snapshot pointer only
```

This prevents one subsystem's stale copy from replacing unrelated state owned by another subsystem.

---

# 9. Listing revision can improve diagnostics/CAS

Consider a monotonic `revision` on listing rows.

Every atomic mutation increments it.

Useful for:

- Diagnostics showing races;
- tests proving a stale operation merged onto latest revision;
- optional compare-and-set when a mutation genuinely requires exact base state.

Most metadata merges should not fail simply because revision changed; they should merge onto latest.

---

# 10. Scope snapshots reduce mutable write surface

The v3 immutable-generation model deliberately moves exact membership out of a frequently rewritten `scopes.listingIds` field.

After migration:

- complete snapshot row is immutable;
- active generation pointer changes atomically only on verified completion;
- current-page observations update a separate overlay/observation structure;
- ordinary metadata writes never replace active snapshot membership.

This substantially reduces the consequences of generic listing/card observations.

---

# 11. Multi-owner membership must also be preserved by atomic mutators

The separate multi-owner audit proves a listing can have memberships for different profile owners.

An owner-A mutation must touch owner A's membership only.

Atomic listing mutation must not perform:

```text
iterate all favoriteScopes -> deactivate all
```

merely because one owner scope changed.

Global metadata fields and owner-scoped membership fields need separate mutation ownership.

---

# 12. Required concurrency regression tests

Use a controllable fake IndexedDB or browser integration fixture capable of pausing between reads/writes.

### Deep observation vs unfavorite

```text
A deep reads old favorite row
B unfavorites and commits
A metadata merge commits
expected:
  favorite remains false / owner membership removal preserved
  deep metadata retained
```

### Unfavorite vs deep first

Both orderings should preserve both legitimate changes.

### Availability vs current-page card update

Availability fields + newest card/membership fields both survive.

### Partial scope C vs D

Both positive observations survive or are represented independently in overlay.

### Complete generation vs stale partial

Stale partial cannot alter active generation pointer/timestamp.

### Queue enqueue vs claim

```text
enqueue begins
claim commits running lease
enqueue resumes
```

Expected running lease remains intact; enqueue may adjust allowed priority/metadata atomically but cannot revert state.

### Queue generic update vs claim

Same guarantee.

### Metadata write after lease lost

Existing module-75 guarantee remains: no stale worker terminal transition.

---

# 13. Existing tests currently cover only part of this contract

`favorites-phase5-multitab-lease.test.mjs` correctly checks:

- atomic claim transaction;
- lease expiration recovery;
- heartbeat;
- worker-owned compare-and-set completion/failure;
- final lease verification before parsed metadata returns.

It does not currently model:

- enqueue racing claim;
- generic update racing claim;
- listing deep write racing unfavorite;
- listing availability write racing card/current-page observation;
- scope read/modify/write races across tabs.

Those gaps explain why “multi-tab lease hardening” can be green while broader cross-tab state remains vulnerable.

---

# 14. Implementation priority

This belongs in the P0 data-integrity phase with the v3 generation migration.

Recommended sequence:

1. add generic atomic mutate helpers;
2. convert unfavorite + availability + deep observation listing writes;
3. convert all queue row writes, not only claim/terminal paths;
4. move scope membership to immutable generation + atomic overlay state;
5. add cross-tab interleaving tests;
6. then remove obsolete split-read writer helpers when no caller needs them.

The guiding invariant is:

> Network/parsing work may be asynchronous and long-running, but the final mutation must always merge the observation into the latest durable row inside one short readwrite transaction.