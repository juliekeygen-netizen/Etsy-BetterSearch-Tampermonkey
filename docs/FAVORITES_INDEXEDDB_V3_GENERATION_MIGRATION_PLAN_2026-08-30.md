# Favorites IndexedDB v3 generation migration design — 2026-08-30

**Status:** implementation design derived from the 2026-08-29/30 Diagnostics + full IndexedDB audits and current v0.15.1 source. No migration is executed by this document.

## Why a database version change is required

Current database:

```text
name: etsy-bettersearch-favorites
version: 2
stores:
  listings
  shops
  scopes
  deepScanQueue
```

Current `scopes` records combine several incompatible concepts in one mutable row:

```text
identity
current listingIds
complete boolean
last complete timestamp
later partial observations
last sync/metadata state
```

The previous audits prove:

- partial observations union IDs into a row that can remain `complete:true`;
- pages of a failed replacement crawl can mutate the previous complete membership before the new crawl completes;
- cache startup trusts that mutable membership as complete;
- cross-tab observations can perform stale read/modify/write cycles because the old scope is read outside the later write transaction;
- a timestamp/complete flag cannot identify one exact immutable generation;
- ownerless and polluted query scopes exist historically;
- listing-side memberships can carry contradictory active/removal state.

A small patch to `complete=false` is not sufficient. The data model needs an explicit complete-generation object and a separate partial/live-observation path.

---

# 1. Canonical v3 membership model

Recommended new store:

```text
scopeSnapshots
```

Example row:

```text
ScopeSnapshot {
  snapshotKey               // unique
  scopeKey
  owner
  type
  id
  query

  generationId
  listingIds[]
  count
  completedAt
  createdAt

  verifiedComplete          // true only for v3+ verified crawl
  trust                     // verified | legacy-mixed | imported
  source                    // favorites-catalogue-v3 etc.
  boundaryEvidence?
  schemaVersion
}
```

`scopes` becomes a small mutable pointer/status row rather than the authoritative membership container:

```text
ScopeState {
  scopeKey
  owner
  type
  id
  query

  activeSnapshotKey?
  activeGenerationId?
  lastCompleteSyncAt

  partialListingIds[]       // optional positive overlay since active generation
  partialObservedAt

  lastObservedAt
  lastSyncState
  needsAuthoritativeRefresh

  queryRetentionClass?
  expiresAt?
  schemaVersion
}
```

Alternative implementation may use a dedicated `scopeObservations` store instead of `partialListingIds`. The invariant matters more than the exact store count:

> Partial/current-page observations must never mutate the ID array stored in an already committed complete snapshot.

---

# 2. Canonical membership authority

After v3, authoritative scope membership is:

```text
active ScopeSnapshot.listingIds
```

not:

- union of every historical query scope;
- listing `isFavorite` alone;
- listing-side `favoriteScopes` alone;
- current partial overlay;
- current native page.

The partial overlay is useful positive evidence for cache-first presentation:

```text
optimistic visible candidates
  = active verified snapshot
  + valid positive overlay additions
```

but absence/removal decisions come only from a newer verified complete generation.

---

# 3. Listing-side membership becomes secondary/denormalized

Current `listing.favoriteScopes` duplicates scope membership and can disagree with `scope.listingIds`.

Long-term options:

## Preferred

Treat snapshots as canonical and reduce listing-side membership to provenance/index acceleration:

```text
favoriteScopes[scopeKey] = {
  active
  lastSeenAt
  lastSeenGenerationId?
  removedAt?
  removalGenerationId?
}
```

Consumers asking “is this ID in current scope?” use the active snapshot/overlay model.

## More aggressive future cleanup

Remove per-scope active membership from listing rows altogether and retain only global listing metadata + favorite/removal observations.

Do not attempt that larger normalization in the first migration unless test coverage is ready.

---

# 4. Atomic complete-generation commit

A v3 complete crawl may update listing metadata page-by-page, but scope membership is prepared off to the side.

During crawl:

```text
page 1 records
-> update listing/card metadata
-> optional positive overlay
-> DO NOT mutate active complete snapshot

page 2 ...
...
```

After the crawler proves the completeness boundary:

```text
newSnapshot = immutable exact deduplicated listing ID set
```

Then one readwrite transaction should commit at least:

```text
scopeSnapshots.put(newSnapshot)
scopes.put({
  activeSnapshotKey: newSnapshot.snapshotKey,
  activeGenerationId: newSnapshot.generationId,
  lastCompleteSyncAt: completedAt,
  partialListingIds: [],
  needsAuthoritativeRefresh: false
})
```

The active pointer changes once.

A failed/cancelled crawl never changes it.

Listing-side membership reconciliation can occur in that same transaction if practical. If it is deliberately asynchronous, all authoritative consumers must already use the snapshot pointer so temporary denormalized listing-membership drift cannot affect current membership truth.

---

# 5. Cross-tab atomicity requirement

Current `favIndexObserveRecordsNow()` reads old scope state in one readonly transaction, computes in JS, and later writes in another transaction. A per-tab Promise queue does not protect another tab.

For v3 partial overlay updates, use one readwrite transaction for:

```text
read current ScopeState
verify activeGenerationId / expected version
merge positive overlay
write ScopeState
```

or store overlay observations as independently keyed rows where concurrent additions cannot overwrite each other.

A stale tab must not be capable of changing:

```text
activeSnapshotKey
activeGenerationId
lastCompleteSyncAt
```

unless it owns and commits a newer verified generation through the complete-generation transaction.

Add an optional monotonic `revision` to mutable scope state if useful for diagnostics/CAS assertions.

---

# 6. Legacy v2 data cannot be magically promoted to verified complete

This is critical.

A v2 scope row with:

```text
complete:true
lastCompleteSyncAt:T
listingIds:[...]
```

may have been contaminated by partial observations after T. The migration cannot reconstruct the exact membership that existed at T.

Therefore migrated v2 complete rows should be represented as something like:

```text
trust = "legacy-mixed"
verifiedComplete = false
needsAuthoritativeRefresh = true
```

They may still be valuable for fast optimistic presentation and metadata retention, but they must not be used to make authoritative absence/removal/count claims.

The first successful post-migration full crawl for an owner/scope creates the first true `verifiedComplete=true` v3 generation.

---

# 7. Proposed v2 -> v3 upgrade sequence

Within `onupgradeneeded`:

1. create `scopeSnapshots` store;
2. add indexes such as `scopeKey`, `completedAt` if useful;
3. cursor over existing `scopes`;
4. normalize/validate identity;
5. convert usable legacy rows into legacy snapshot/state form;
6. quarantine or remove structurally invalid owner-required rows;
7. mark migrated scopes `needsAuthoritativeRefresh=true` unless provenance is truly v3-verified (none in v2);
8. repair safe local invariants such as active membership retaining a stale `removedAt` tombstone;
9. preserve all listing/shop/deep metadata;
10. leave deep queue jobs intact unless their listing identity is invalid.

IndexedDB upgrade work must remain bounded and transaction-safe. If a huge user database makes full repair too expensive in the schema-upgrade transaction, perform only store/schema creation + minimal identity migration there and run resumable post-open repair with an explicit migration state record.

---

# 8. Ownerless legacy scopes

For an owner-required scope:

```text
owner == ""
```

must not become an active v3 scope.

Possible migration handling:

```text
quarantine / delete scope state
preserve listing metadata rows themselves
mark migration diagnostics count
```

Do not infer the missing owner from unrelated neighboring scopes unless there is deterministic evidence. It is safer to require a fresh authoritative refresh under a known owner.

No ownerless scope may be used by:

- cache materialization;
- count authority;
- deep maintenance;
- network request construction;
- query retention.

---

# 9. Legacy listing membership repair

Known historical contradiction:

```text
favoriteScopes[scopeKey].active === true
and removedAt > 0
```

Safe repair:

```text
if active === true:
  clear removedAt/removalGenerationId
```

Also validate:

```text
scope references missing listing
listing membership references missing scope
inactive listing membership still present in legacy scope listingIds
active membership absent from legacy scope row
```

Because legacy scope membership itself is mixed/unverified, do not convert these disagreements into global unfavorite decisions during migration.

Prefer preserving positive listing metadata and requiring the next verified All generation to establish authoritative current membership/removal.

---

# 10. Global `isFavorite` during migration

Current listing rows use global `isFavorite` and owner-scope memberships.

For v2 -> v3:

- preserve positive `isFavorite=true` observations unless a newer explicit unfavorite tombstone proves otherwise;
- do not mark records unfavorited merely because they are absent from a legacy-mixed snapshot;
- after the first verified authoritative All generation, reconcile global favorite state for that owner's known records according to the new generation contract.

If multi-owner/profile browsing is intentionally supported in one database, a single global `isFavorite` may itself eventually need owner semantics. Audit that separately before changing it.

---

# 11. Query-scope migration and retention

Legacy database contained numerous query scopes, including zero-result and implausibly long transient identities.

During v3 migration classify:

```text
canonical no-query scope
verified-v3 query scope
legacy query scope
invalid query scope
```

All v2 query scopes are unverified with respect to the future network-ack query-generation contract.

Recommended handling:

- preserve a small amount of recent legacy query cache only as optimistic/non-authoritative data if useful;
- assign expiry;
- prune old zero-result/transient scopes aggressively;
- reject empty-owner query scopes;
- reject malformed structural identity;
- do not bless an unusually long historical query merely because it exists in v2.

Exact retention/length limits should be chosen after real native-search evidence is collected.

---

# 12. Generation identity shape

A generation ID can be random UUID, monotonic owner-local sequence, or both.

Recommended diagnostic-friendly shape:

```text
generationId = UUID
revision = monotonic integer in ScopeState
completedAt = timestamp
```

Do not use `completedAt` alone as identity. Two operations and clock behavior should not determine correctness solely through timestamp comparison.

A snapshot may also store a deterministic ID hash/fingerprint of sorted membership for integrity/debugging, but hash is not a substitute for generation identity.

---

# 13. Peer-tab catalogue completion after v3

Current peer wait accepts:

```text
complete && lastCompleteSyncAt >= requestedAt
```

Replace with an exact handoff:

```text
peer wait begins with previousGenerationId

peer completed if:
  activeGenerationId exists
  activeGenerationId != previousGenerationId
  snapshot.verifiedComplete === true
  snapshot scope identity == requested dataset
```

Then the waiting tab materializes `activeSnapshotKey` exactly.

This prevents a mutable or unrelated scope row from satisfying a peer-completion check.

---

# 14. Database versionchange / blocked-upgrade hardening — NEW MIGRATION REQUIREMENT

Current `favIndexOpen()` rejects `request.onblocked`, but after a successful open it does not install a `db.onversionchange` handler that closes the old connection.

With multiple Etsy tabs open, a future v3 upgrade can therefore be blocked by another tab retaining its v2 database connection.

Add after `request.onsuccess`:

```text
db.onversionchange = () => {
  db.close()
  clear cached database promise/reference
  stop/refresh affected index work
}
```

The exact UI recovery can be designed later, but old tabs must cooperate with schema upgrades.

Tests should simulate:

```text
tab A v2 connection open
new v3 code opens database
A receives versionchange and closes
v3 upgrade proceeds
```

If an actually stale tab cannot cooperate, surface a clear “close/reload other Etsy tabs to upgrade BetterSearch data” status rather than silently continuing with mixed schema assumptions.

---

# 15. Store-level migration marker

Use an explicit migration state, either in a small metadata store or known scope/meta key:

```text
migration {
  fromVersion
  toVersion
  phase
  startedAt
  completedAt
  repairedCounts
  needsAuthoritativeOwners[]
}
```

This supports resumable post-open cleanup and makes Diagnostics/Settings able to distinguish:

```text
schema upgraded but legacy snapshots still need refresh
```

from an ordinary stale cache.

---

# 16. Snapshot garbage collection

Snapshots are immutable, so old generations need cleanup.

Initial safe policy per scope:

```text
keep active generation
keep previous verified generation for rollback/debugging
optionally keep one recent failed/imported diagnostic generation if useful
delete older inactive snapshots after successful commit
```

Do not delete the previous generation before the active-pointer transaction is durably complete.

Query-scope GC is separate and should be more aggressive.

---

# 17. Count authority after v3

A verified active snapshot provides:

```text
catalogueGenerationTotal = snapshot.count
```

This is different from:

```text
current Etsy server/native total
local filtered shown count
global IndexedDB active-row count
```

The count view model described in `FAVORITES_AUDIT_CHUNK3_2026-08-30.md` should expose all of these with generation/provenance instead of collapsing them into `favState.total`.

---

# 18. Rollout phases

## Phase A — schema + compatibility readers

- create v3 stores/fields;
- migrate v2 rows as legacy/unverified;
- keep current renderer working through compatibility reader;
- add versionchange handling;
- no destructive legacy removal decisions.

## Phase B — generation-safe catalogue writer

- page-by-page listing metadata updates remain allowed;
- complete membership prepared separately;
- atomic verified generation commit;
- peer-tab handoff uses generation ID.

## Phase C — partial observation overlay

- current-page/metadata observations update overlay or independent observation rows;
- one readwrite transaction / append-safe design;
- stale tabs cannot overwrite active generation.

## Phase D — consumers

- cache reads exact active snapshot;
- count model uses generation total;
- owner-wide maintenance uses active authoritative generation;
- listing-side membership becomes explicitly secondary.

## Phase E — cleanup

- prune legacy scope membership fields after confidence period;
- query retention/GC;
- old snapshot GC;
- integrity checker and repair tooling.

---

# 19. Required executable regression matrix

### Atomicity

- failed crawl never changes active snapshot pointer;
- cancelled crawl never changes active snapshot pointer;
- successful crawl changes pointer once;
- reader during crawl sees old generation until commit;
- reader after commit sees new exact generation.

### Cross-tab

- concurrent partial observations cannot lose additions;
- stale partial observation cannot restore an older complete pointer/timestamp;
- two complete crawlers for same dataset resolve through lease/generation contract;
- unrelated datasets may refresh independently;
- peer waiter materializes exact peer generation.

### Migration

- v2 complete row becomes legacy-mixed/unverified;
- ownerless scope is not activated;
- active+removedAt contradiction repaired;
- metadata/deep scan data preserved;
- legacy query scopes classified/expired;
- first fresh post-migration complete crawl creates verified generation.

### Upgrade lifecycle

- another tab's old connection closes on `versionchange`;
- blocked upgrade produces recoverable status;
- interrupted post-open repair resumes safely.

### Count

- active snapshot count remains stable while partial overlay grows;
- optimistic presentation can use positive overlay without changing authoritative generation count;
- server total and snapshot total can temporarily disagree without one silently overwriting the other.

---

# 20. What not to do

Do not:

- mutate the current active snapshot's ID array;
- use a timestamp as the only generation identity;
- mark migrated v2 `complete:true` rows as v3 verified;
- globally unfavorite listings based on absence from legacy-mixed snapshots;
- put the entire old and new membership rewrite behind only an in-tab Promise queue;
- assume a catalogue lease makes arbitrary IndexedDB observations atomic;
- attempt a schema upgrade without `versionchange` cooperation from existing tabs;
- combine this migration with the shell/lifecycle UI refactor in one giant release.

This migration should establish durable data truth first; lifecycle/render consumers can then be simplified on top of that stable boundary.