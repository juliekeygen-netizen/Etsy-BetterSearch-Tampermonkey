# Favorites IndexedDB integrity addendum — 2026-08-29

This is a focused follow-up to `FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md`. It records source/data-model findings discovered while reconciling the full IndexedDB dump against the current v0.15.1 persistence code.

Raw account/listing/query data is intentionally omitted.

## 1. `complete:true` does not currently mean immutable complete-snapshot membership — PROVEN SOURCE SEMANTICS

`src/61a-favorites-index.js::favIndexObserveRecordsNow()` currently writes scope membership approximately as:

```text
if complete observation:
    listingIds = observedIds
else:
    listingIds = union(oldScope.listingIds, observedIds)

complete = completeObservation || oldScope.complete
lastCompleteSyncAt = completeObservation ? now : oldScope.lastCompleteSyncAt
```

This creates a hybrid state after a completed sync:

```text
membership from last complete snapshot
+
new IDs seen by later partial observations
```

while the row remains:

```text
complete: true
lastCompleteSyncAt: timestamp of the older full sync
```

The cache reader then trusts `scopeRecord.complete` and materializes the current `listingIds` as a complete scope.

### Evidence in the export

- 49 scope rows are marked complete.
- 10 of those have `lastObservedAt > lastCompleteSyncAt`.
- those later observations span both item and collection scopes;
- the canonical All scope was last completely synchronized about 24h49m before export but was observed/modified again shortly before the end of the Diagnostics session.

The dump cannot reconstruct the exact historical `listingIds` array from the moment of the complete sync, so it cannot prove how many IDs were added by the later partial observations. The current source nevertheless proves that such additions are permitted without invalidating or versioning the complete snapshot.

### Why this is dangerous

A single `listingIds` field is serving two different purposes:

1. authoritative membership proven by a complete crawl;
2. useful recent membership evidence from partial/current-page observations.

Those have different semantics.

A cache can safely use recent partial additions for presentation, but it must not silently call the merged set the exact membership of the older complete snapshot. Counts, absence reconciliation and diagnostics need to know which generation an ID belongs to.

### Recommended model

Prefer explicit separation, for example:

```text
completeSnapshot:
    listingIds
    generation
    completedAt

partialOverlay:
    additions / observations since complete generation
    observedAt
```

or an equivalent per-membership generation/provenance model.

A cache-first view may merge them for optimistic display:

```text
usable live candidates = completeSnapshot + valid partial additions
```

but authoritative claims must continue to reference the complete generation:

```text
authoritative membership/count = completeSnapshot
```

until a newer complete crawl commits atomically.

Do not simply set `complete=false` for every partial observation if that would destroy useful cache-first startup; preserve both truths explicitly instead.

## 2. `lastSyncState` mixes full-sync state with unrelated later observation state

The canonical All row in the export is:

```text
complete: true
lastCompleteSyncAt: older full-sync timestamp
lastObservedAt: much newer timestamp
lastSyncState: metadata
```

This occurs because a later partial metadata write can replace `lastSyncState` while `complete` and `lastCompleteSyncAt` remain from the older full sync.

The field therefore cannot currently answer one clear question.

Separate concepts should be stored/diagnosed independently:

```text
lastCompleteSync.status / completedAt
lastPartialObservationAt
lastMetadataObservationAt
current in-flight runtime state
```

Do not display `lastSyncState` as though it describes the generation that produced `lastCompleteSyncAt` unless the schema guarantees that relationship.

## 3. Owner statistics use historical scope references, not canonical active membership

`favIndexGetStats(owner)` and `favIndexGetActiveListings(owner)` build the owner's ID universe by unioning `listingIds` across all retained scopes.

The dump contains stale/transient query scopes and five known scope/listing membership disagreements. Therefore a historical scope reference can continue contributing an ID to the owner universe even when the listing-side membership for that exact scope is inactive.

Global `isFavorite=true` is then used as the final active check.

This behavior is acceptable only if the APIs are explicitly documented as:

```text
all active favorite records ever associated with any retained owner scope
```

It is not equivalent to:

```text
current authoritative All membership
```

For current Favorites totals and current-scope maintenance, prefer the canonical complete All generation rather than unioning arbitrary retained query scopes.

## 4. Reactivation must clear removal metadata

The dump contains 23 memberships with contradictory state:

```text
active = true
removedAt > 0
```

The merge implementation spreads the old membership before the incoming active observation, so an incoming object without `removedAt` leaves the old removal timestamp behind.

Change merge semantics so activation explicitly clears the tombstone.

Suggested invariant test:

```text
observe active
-> remove/inactivate
-> observe active again
-> active == true
-> removedAt absent/0
-> lastSeenAt newer than the removal
```

Run a one-time migration/repair for existing rows.

## 5. Scope-row and listing-side membership must be validated together

Five exported scope rows contain IDs whose corresponding listing-side membership for the same scope is inactive.

This is not catastrophic while every consumer happens to check the right representation, but current consumers do not all do that.

Add a developer integrity function that reports at least:

```text
scope references missing listing row
scope lists ID but listing has no membership
scope lists ID but membership inactive
active membership points to missing scope
active membership missing from scope listingIds
active membership carrying removedAt
ownerless/invalid scope
```

The same logic can power a versioned repair migration once the intended canonical representation is chosen.

## 6. Query-scope retention needs a data contract

The dump contains many complete zero-result query scopes and several very long/free-form query identities. Because complete query scopes are cheap to create and never expire, `scopes` can grow indefinitely and broaden owner-wide union reads.

Define retention before adding more query caching:

```text
canonical no-query All/collections/groups -> durable
verified useful query scopes              -> bounded LRU/TTL
zero-result transient queries             -> short TTL
invalid owner/query identities             -> reject + remove
```

A durable query scope should also record how the native query was committed so diagnostics can distinguish verified Etsy search state from fallback inference.

## 7. Complete-snapshot regression matrix

Add tests for:

### Partial addition after complete snapshot

```text
complete snapshot = [A, B]
partial observation = [C]

expected:
authoritative complete generation remains [A, B]
live overlay may know C
cache/display may use C intentionally
but the old complete snapshot must not silently become [A, B, C]
```

### Later complete refresh

```text
old complete = [A, B]
partial overlay = [C]
new complete = [A, C]

expected:
new authoritative snapshot = [A, C]
B reconciled according to authoritative membership rules
partial overlay reset/rebased
```

### Partial observation with no new IDs

Must not rewrite snapshot membership or create misleading new sync state.

### Count authority

Current server total, complete-snapshot count, optimistic live-overlay count and global indexed-row count must remain distinguishable.

### Scope integrity repair

Feed contradictory active/removed and scope/listing membership pairs and verify deterministic repair.

## 8. This addendum changes the interpretation of the 107 cached All count

The 107 IDs stored in the current All scope should be described as:

> the membership array currently stored on a row whose last complete sync is older and whose membership may have been unioned with later partial observations

not necessarily:

> the exact immutable 107-item result returned by the last complete crawl.

The important correctness finding remains: this cached membership is stale relative to current Etsy state, and the live HAR contains at least one current unfiltered Favorites listing absent from it. The data model now explains why the word `complete` alone is not sufficient evidence of snapshot identity.
