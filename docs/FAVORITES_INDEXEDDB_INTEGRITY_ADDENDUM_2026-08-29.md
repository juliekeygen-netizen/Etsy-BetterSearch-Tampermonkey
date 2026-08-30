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

---

## 9. A failed replacement crawl can mutate the previous complete snapshot — PROVEN CURRENT SOURCE BUG

The continuation audit found a more serious path than ordinary later partial observations.

`src/61b-favorites-sync.js` persists every successfully fetched catalogue page as:

```text
favIndexObserveRecords(pageRecords, complete:false, syncState:'running')
```

before the crawler knows that the new full refresh will complete. Only after the short-page/completeness boundary does it write the final deduplicated records with `complete:true`.

Combined with section 1's persistence semantics, this means:

```text
old complete generation [A,B]
-> new refresh page observes [A,C]
-> partial page write unions C into old scope listingIds
-> old complete flag/timestamp remain
-> refresh fails or is cancelled
```

The database is left with no newly committed complete generation, but the previous complete row's membership has already changed.

The correct invariant is stronger than "partial observations must be distinguishable":

> In-progress pages of a replacement complete crawl must not mutate the membership of the previous authoritative complete generation at all.

Per-page writes may update listing metadata and a separate partial overlay. The authoritative membership switch must occur once, atomically, only when the replacement generation is verified complete.

### Additional regression cases

- old complete `[A,B]`; page 1 sees `[A,C]`; network error -> old complete is still exactly `[A,B]`;
- old complete `[A,B]`; pages 1-3 add several IDs; user cancels -> old complete unchanged;
- another tab reads cache during the in-progress crawl -> it sees the old immutable generation, never the partial union;
- successful replacement -> one generation commit replaces old membership and rebases/clears partial overlay.

## 10. Cache-first startup currently turns this persistence flaw into live truth

`src/61e-favorites-cache-bootstrap.js` trusts `scopeRecord.complete` and materializes the row's current `listingIds`. It then marks the live dataset complete and sets `favState.total` from the materialized record count.

No generation identifier ties those IDs to `lastCompleteSyncAt`.

Therefore the failed-refresh mutation in section 9 is not merely an internal bookkeeping inconsistency. It can be served as the next page visit's complete cache.

Cross-tab completion/freshness checks need the same immutable generation identity. `complete:true` plus a timestamp is insufficient if membership is mutable independently of that completion.

## 11. Empty owner must not mean a valid scope or global maintenance target

The exported database contains an ownerless scope. Current source still accepts an empty owner in the low-level scope-key/storage layer, and the consolidated catalogue service can be reached by interactive load paths that do not necessarily pass through the higher-level `favSyncScope()` owner guard.

Separately, the current owner-scoped deep-maintenance helper intentionally treats `owner=''` as "all active indexed listings". Manual deep-scan/update callers derive owner from current page state and can therefore broaden unexpectedly if identity is unresolved.

Required rule:

```text
production owner-scoped operation + empty owner = invalid / no-op with diagnostic reason
```

If an all-owner developer/maintenance operation is ever needed, expose it as a separate explicit API instead of overloading an empty string.

Owner validation/latching belongs at the canonical descriptor, network-service and persistence boundaries, not only in a UI/controller wrapper.

## 12. Snapshot freshness must include integrity, not just age

Auto-sync currently decides staleness primarily from `lastCompleteSyncAt`. A recent timestamp can therefore make a structurally invalid/mixed snapshot look fresh.

Freshness should be the conjunction of at least:

```text
valid owner/scope identity
valid immutable complete generation
membership/listing integrity checks pass
presentation/cache schema readable
age within configured interval
```

A mismatch between current trusted native/server count and cached complete-generation count should at minimum trigger an integrity/freshness review rather than being silently overridden by cache age.

Diagnostics should record why auto-sync did or did not start (`disabled`, `not-own-profile`, `owner-unresolved`, `throttled`, `fresh`, `integrity-invalid`, `due`, etc.) so future captures can distinguish policy decisions from bugs.

See `FAVORITES_AUDIT_CONTINUATION_2026-08-30.md` for the broader second-pass writer/lifecycle/query/pagination findings.

---

## 13. v0.15.6–v0.15.10 resolution status — 2026-08-30

The later implementation audit converted several findings above from design recommendations into enforced invariants.

### Immutable committed membership — fixed in v0.15.6 and strengthened in v0.15.9

The current persistence model separates committed membership from pending replacement membership. Partial crawler pages may update metadata/pending state but cannot edit committed `listingIds`. A verified complete generation performs the authoritative swap.

v0.15.9 additionally closes the cross-tab stale read/write window by reading the latest scope/listing/shop state, merging it and writing it inside one overlapping-store IndexedDB `readwrite` transaction. Serialized interleaving tests cover both writer orderings and prevent an older observation from regressing a newer committed generation.

### Query-scope provenance and retention — fixed in v0.15.10

Non-empty durable query scopes now require one of three explicit commit sources:

```text
route
ssr-props
favorites-search-commit
```

The current focused input value is not itself a durable dataset identity. Query strings longer than 512 characters are rejected at the persistence boundary.

Historical non-empty query scopes created before provenance existed are treated as unverifiable caches and removed together with only their exact listing-side membership keys. Listing/shop metadata is retained.

Verified query caches are bounded:

```text
normal verified query TTL: 30 days
zero-result query TTL:     24 hours
per base scope:            12 most recent query scopes
GC cadence:                at most once per 6 hours per document profile state
```

Canonical no-query scopes are excluded from query GC.

A regression fixture specifically verifies that arbitrary Diagnostics-note-like free-form text cannot become a durable query while the actual Favorites Search value remains unchanged.

### Active membership tombstones — fixed in v0.15.10

Reactivation clears stale `removedAt` only when the listing is currently globally favorite and the exact membership is active. The one-time logical migration repairs historical active+tombstone rows under that same rule.

A globally unfavorited listing with contradictory active scope state keeps its removal evidence for later reconciliation rather than having that evidence erased automatically.

### Owner-wide stats/maintenance contamination — fixed in v0.15.10

Owner-scoped statistics and active-listing maintenance now prefer the latest complete canonical no-query All scope. Retained query/collection scopes can no longer broaden the owner's current maintenance universe.

If no complete canonical All snapshot exists yet, the migration/fresh-profile fallback uses no-query scopes only; query caches are still excluded.

### Deliberately not repaired by v0.15.10

The migration does **not** reconstruct complete scope `listingIds` from listing-side membership state. Doing so would violate immutable snapshot ownership and could turn stale listing evidence into an authoritative complete generation.

The remaining scope/listing disagreements therefore need a separately specified reconciliation rule or a fresh verified complete replacement crawl.

### Next proven count-authority bug

The page-shell count helper still currently gives `favState.total` precedence over live Etsy prop totals:

```text
favState.total
-> props.totalListings
-> props.itemCount
-> records.length
```

Because cache bootstrap can populate `favState.total` from an older committed snapshot, a stale cache count can outrank newer current Etsy count evidence. This is the next bounded correctness fix; server/current-page count, committed-snapshot count, filtered shown count and global indexed-row count must remain semantically distinct.
