# Favorites audit chunk 3 — count authority, owner identity, collection lifecycle and cross-tab persistence

**Date:** 2026-08-30

**Production baseline audited:** BetterSearch v0.15.1, `main` at `0cf7520ed87e74f6b5e520a7e974fabde8d2c719`

**Status:** source audit / design evidence. This document does not change runtime behavior.

This is the broad synthesis for audit chunk 3. The focused documents created beside it contain the implementation-level detail:

- `FAVORITES_NATIVE_QUERY_COMMIT_EVIDENCE_2026-08-30.md`
- `FAVORITES_INDEXEDDB_V3_GENERATION_MIGRATION_PLAN_2026-08-30.md`
- `FAVORITES_MULTITAB_AND_DELIVERY_TARGET_AUDIT_2026-08-30.md`
- `FAVORITES_MULTI_OWNER_MEMBERSHIP_AUDIT_2026-08-30.md`
- `FAVORITES_INDEXEDDB_ATOMIC_WRITE_AUDIT_2026-08-30.md`
- `FAVORITES_CATALOG_LEASE_STORAGE_AUDIT_2026-08-30.md`
- `FAVORITES_SCOPE_CREATION_AND_RETENTION_AUDIT_2026-08-30.md`
- `FAVORITES_IDENTITY_AND_API_BOUNDARY_AUDIT_2026-08-30.md`
- `FAVORITES_AUDIT_INDEX_AND_NEXT_PHASES_2026-08-30.md`

Raw account/query/listing/session data is intentionally omitted.

## Executive conclusion

The third source pass shows that the remaining Favorites correctness problems are not separate isolated bugs. They cluster around one missing architecture boundary:

> BetterSearch does not yet have a stable owner/scope/query generation that remains authoritative from native identity discovery, through network work, through IndexedDB persistence, through cross-tab coordination, and finally through rendered UI ownership.

The strongest new conclusions are:

1. owner extraction can disappear merely because a usable total count is temporarily unavailable;
2. current collection model fallback is not keyed by owner/profile generation;
3. count UI mixes server totals, cached catalogue counts, global index coverage and local shown counts;
4. generic IndexedDB writes are only serialized inside one tab and can overwrite newer state committed by another tab;
5. deep metadata can race an unfavorite in another tab and restore stale favorite/membership state;
6. queue claim/completion is hardened, but ordinary enqueue/update can still race a running lease;
7. one global listing-level `isFavorite` flag incorrectly gates owner-specific profile memberships;
8. the localStorage catalogue-lock fallback is not a true atomic lock;
9. native query commit can still become durable from an 850 ms timeout without a verified Etsy result generation;
10. auto-sync and generated-group helper crawls can amplify a mistaken query identity into durable scope pollution.

The next production phase should therefore begin with **stable identity plus atomic storage mutation primitives**, then introduce IndexedDB v3 immutable verified scope generations. UI/lifecycle consolidation should sit on top of that corrected data boundary.

---

# 1. Full count-authority map

There is no single current “Favorites total” authority in v0.15.1.

## Runtime catalogue total

`favState.total` is written by several paths:

```text
initial runtime              -> 0
cache bootstrap              -> materialized cached record count
network catalogue commit     -> crawled/hydrated record count
local favorite removal       -> optimistic decrement
dataset reset                -> 0
```

The All/collection header then gives this mutable runtime count first priority before Etsy props.

That is how a stale cached value such as 107 can outrank a newer Etsy/server value such as 108.

## Etsy/native total

`favProps()` attempts to expose `totalListings`, falling back to `itemCount` and then `listings.length`.

Those values do not necessarily have the same semantics:

- exact full scope total;
- item-count field whose scope needs verification;
- embedded/current-page listing count.

They should not be normalized into one undifferentiated `totalListings` property.

## Stored scope membership count

`scope.listingIds.length` is currently mutable even after `complete:true`; previous audits prove partial observations can be unioned into an older complete row.

It is therefore not an immutable complete-generation count.

## Global index coverage count

`favIndexGetStats(owner)` builds an owner ID universe from retained scope references and then gates rows with global `listing.isFavorite`.

This is index coverage/history, not exact current authoritative All membership.

## Settings count

Later Settings code independently derives a maximum across multiple sources, producing the 114-style coverage value seen in the database/capture analysis.

## Local shown count

`favState.filtered.length` means something different again: matches from the currently loaded BetterSearch catalogue/config.

## Required replacement

Use an explicit count model carrying provenance/generation:

```text
serverScopeTotal
catalogueGenerationTotal
localMatchTotal
indexedRecordCoverage
nativeVisiblePageCount
```

UI then chooses the correct meaning for the context instead of reusing one mutable number.

---

# 2. Owner extraction is incorrectly dependent on count availability

`favProps()` currently:

1. finds a `script[type="text/props"]` containing `profileOwnerUserId`;
2. parses it;
3. requires an owner ID;
4. attempts to derive a total count;
5. only returns the props object when that total is finite.

This means a perfectly useful owner-bearing props object can be rejected when a count is temporarily missing.

The resulting failure is not merely “unknown count”. It becomes:

```text
favProps() -> null
favScope().owner -> ""
favIsOwnFavoritesPage() -> false
```

That can affect:

- dataset identity;
- current-page persistence;
- owner-required API URLs;
- auto-sync eligibility;
- collection model selection;
- native-query scope identity.

Identity and count extraction must be split.

---

# 3. No stable owner latch exists

`favScope()` recomputes owner from current transient DOM props every time.

The runtime and shell observers can ask for scope identity repeatedly while Etsy hydrates/reconciles the page.

A transient props gap can therefore produce:

```text
valid owner
-> empty owner
-> dataset key change/reset
-> ownerless observation/storage attempt
-> valid owner again
-> another dataset change/reset
```

A durable owner/profile identity needs an explicit generation:

```text
OwnerIdentity {
  profileLogin
  ownerId
  viewerId?
  isOwnProfile?
  generation
  source
  latchedAt
}
```

Temporary absence must not clear a valid owner within the same profile-route generation.

A different profile route must create a different generation; the latch must never reuse profile A's owner for profile B merely to avoid emptiness.

---

# 4. The current props selector can also choose stale identity evidence

`favProps()` returns the first qualifying `text/props` script in document order.

There is no explicit current-island/route-generation selection rule.

If Etsy temporarily leaves multiple matching props scripts connected during soft navigation, BetterSearch has no proof the first one belongs to the current Favorites view.

This is a source ambiguity rather than a claim that the analyzed capture definitely contained conflicting owner props scripts.

The future native adapter should discover candidates and validate them against current route/island generation.

---

# 5. Collection model fallback is not owner-keyed

The page shell stores one global `favState.collectionModel0120`.

When current `collectionsTabs` props are unavailable, `favCollections0120()` falls back to that previous model without checking owner/profile generation.

Potential transition:

```text
profile A -> collection model A cached
navigate to profile B
B props temporarily unavailable
fallback -> model A reused
```

The collection model must be keyed to owner/profile generation.

---

# 6. Collection-create completion watcher is too broad

The current create watcher observes the entire body for up to two minutes.

Any `[role="dialog"]` can set its `sawDialog` flag, and disappearance of all dialogs can trigger collection-model refresh.

It does not bind the operation to:

- the exact create dialog;
- starting owner/profile generation;
- starting route/scope;
- an operation ID;
- expected native completion.

The later refresh fetches current `location.href`, not necessarily the route that started the create action.

A collection-create operation should capture owner/route generation at click time, recognize the specific native flow, cancel when that generation changes, and verify the owner of the fetched result before replacing the cached model.

---

# 7. Scope observation is not cross-tab atomic

The general index writer uses a per-tab Promise queue, but the persistence sequence is:

```text
readonly transaction -> read old scope/listing state
compute merged full objects in JavaScript
later readwrite transaction -> put whole rows
```

Another tab can commit between those two transactions.

Example lost update:

```text
scope starts [A]
Tab 1 reads [A], plans [A,C]
Tab 2 reads [A], plans [A,D]
Tab 1 writes [A,C]
Tab 2 writes [A,D]
C is lost
```

More seriously, a stale partial observation can be computed from an old complete row, then overwrite a newer complete row committed by another tab.

The catalogue crawler lease does not make generic metadata/current-page observations atomic.

---

# 8. Deep metadata can resurrect stale favorite/membership state

The deep observation path also reads a listing in one transaction, constructs a full `next` object, and later puts it in another transaction.

Two-tab example:

```text
Tab A deep scan reads X as favorited/active
Tab B unfavorites X and commits removal
Tab A finishes parsing and puts its stale full-row copy + new metadata
```

Tab A can restore stale `isFavorite:true` and old membership state.

The deep job lease protects queue ownership, not unrelated listing-row mutations from another tab.

Final metadata merge must read the latest listing and apply only metadata fields inside one short readwrite transaction.

---

# 9. Unfavorite/availability writes can erase concurrent metadata too

The inverse race exists as well.

Direct unfavorite and availability-update paths also read a whole listing first and later replace it.

A newer metadata observation committed between those steps can be erased by the later stale unfavorite/availability put.

The correct primitive is an atomic latest-row mutator, not whole-row last-writer-wins.

---

# 10. Deep queue is only partially atomic

Module 75 correctly hardened:

- job claim;
- expired recovery;
- lease renewal;
- worker-owned completion/failure;
- stale-worker final verification.

Those paths read and mutate a job inside one IndexedDB readwrite transaction.

But ordinary enqueue/update can still use the older pattern:

```text
readonly get
-> compute merged row
-> later put
```

Race:

```text
A enqueue reads queued job
B atomically claims job -> running + worker lease
A writes stale queued copy
```

The running worker will later notice lost lease, so the CAS hardening prevents stale terminal commit, but the row can still be knocked backward and fetched again.

Every queue-row mutation should use the same atomic mutation pattern.

---

# 11. One global `listing.isFavorite` corrupts multi-owner semantics

The schema stores owner-specific `favoriteScopes`, but also one global `listing.isFavorite`.

Every observed profile Favorites record can set that global flag true.

A complete no-query `items` scope for any owner is treated as an authoritative favorite scope. When an ID disappears, the current global unfavorite path can mark **all** stored scope memberships inactive.

Example:

```text
listing X belongs to owner A and owner B
A refresh no longer contains X
current global unfavorite path can also invalidate B membership
```

Cache materialization then gates owner B on the same global `isFavorite` value.

Required semantic split:

```text
listing metadata                    -> global by listing ID
profile Favorites membership        -> owner/scope generation specific
viewer personal heart state         -> separate viewer-specific concept
```

A verified All generation may retire only that owner's membership.

---

# 12. Catalogue localStorage fallback is not a true lock

The service prefers Web Locks, which is the better path.

The localStorage fallback performs:

```text
read lease
write my token
read back my token
```

This is not an atomic compare-and-set.

Valid interleaving:

```text
A reads empty
B reads empty
A writes A
A reads A -> acquired
B writes B
B reads B -> acquired
```

Both can enter the crawler.

The stale worker's heartbeat notices token loss only by returning false; that false result does not abort the crawler.

The v3 fallback should use an IndexedDB coordinator row mutated in one readwrite transaction, plus generation/CAS checks before active snapshot commit.

---

# 13. Lease identity unnecessarily contains raw dataset/query text

The fallback localStorage key and value include the full dataset key:

```text
owner | scope type | scope id | query
```

Normal completion removes the lease, but a crash can leave a stale query-bearing key until that exact dataset is touched again.

Historical query pollution makes this undesirable.

Use a bounded opaque coordinator key and keep readable identity in live diagnostics/state rather than persistent lock names.

---

# 14. Native query commit still has no authoritative acknowledgement

Current v0.13.1 query logic correctly separates draft typing from submitted intent, but final commit still occurs when either:

```text
native grid fingerprint changed
OR
850 ms elapsed
```

The timeout alone can therefore create durable dataset identity.

This is especially important for zero-result queries: the native grid fingerprint is empty, so the current DOM-fingerprint algorithm cannot acknowledge a legitimate zero-result result at all. It must eventually use the timeout.

The fix is therefore not “delete the timer”. It is “replace DOM/timer inference with a verified result generation”.

The Diagnostics extension already captures the CDP request/response timeline needed for short controlled research sessions.

---

# 15. Generated-group search can leave a byproduct items-query scope

Generated-group query resolution currently crawls:

```text
A. unqueried group
B. owner-wide items + query
result = intersection(A,B)
```

The helper items-query crawl uses the normal page crawler, which persists per-page partial scope observations.

So an internal helper can leave an owner-wide `items + query` scope even though the user's logical dataset was a group query.

Future catalogue requests need an explicit persistence purpose:

```text
authoritative durable scope
positive overlay only
ephemeral helper / metadata-only
```

Internal helper work should not create durable query caches accidentally.

---

# 16. Auto-sync can amplify a bad query identity

Auto-sync always checks canonical All and may also check/sync the current scope when it differs.

If the current scope contains a native query, auto-sync can perform a complete crawl and persist it.

With the current timeout query commit, the amplification path is:

```text
unverified query commits after timer
-> becomes current dataset
-> partial scope may be observed
-> auto-sync sees it due
-> complete query scope is crawled/persisted
-> no TTL/GC removes it
```

Verified query generation must become a prerequisite for durable query scope creation/sync.

---

# 17. API request boundary is too permissive

`favApiUrlForScope()` accepts an empty owner for owner-required items/collection paths.

A collection then becomes the historical malformed shape:

```text
.../member/users//collections/...
```

Owner validation belongs before URL construction, not only in a higher-level Sync button wrapper.

---

# 18. Deterministic HTTP errors are retried

`favFetchJson()` currently retries all non-OK HTTP responses unless aborted.

That means deterministic statuses such as 400/404/410 can be retried like transient network/429/5xx failures.

The historical malformed ownerless 404 therefore had both:

- a URL-construction gap;
- a retry-classification gap.

Use typed retryability and fail deterministic malformed/missing requests immediately.

---

# 19. IndexedDB v3 design

The focused migration plan proposes:

```text
scopeSnapshots
  immutable exact generation membership

scopes
  mutable identity/status + activeSnapshotKey/generation
  partial positive overlay
```

Core invariant:

> Page/current/metadata observations never mutate an already committed complete snapshot.

A failed/cancelled replacement crawl leaves the active generation pointer unchanged.

Migrated v2 `complete:true` rows are marked legacy-mixed/unverified because the original exact completion membership cannot be reconstructed after later partial unions.

The first successful v3 full crawl establishes the first verified generation.

---

# 20. Database upgrade itself needs multi-tab cooperation

Current DB open code handles `onblocked` by rejecting, but an already-open DB connection does not install a `versionchange` handler that closes itself.

A future v3 upgrade can therefore be blocked by another Etsy tab retaining a v2 connection.

Old tabs must close on `versionchange`, invalidate their local DB handle/work, and rejoin after reload/reopen.

---

# 21. Extension and Tampermonkey have different live persistence semantics

The browser extension prelude mirrors `storage.local` into an in-memory Map and updates that raw Map on storage changes.

But `favCfg` / `favUiPrefs` are initialized as live objects once. Updating the raw Map does not automatically re-normalize those live objects or trigger reapply.

Tampermonkey currently has no project-owned value-change-listener bridge at all.

The project needs an explicit settings propagation policy rather than accidental delivery-target differences.

---

# 22. Deep Cancel/challenge suppression is tab-local

Deep scanning's cancel/challenge suppression uses tab-local booleans/controllers.

Another Etsy tab can remain eligible to start/continue automatic deep work.

Safety policy should be durable/global:

```text
paused
pauseReason
pausedAt
resumeAfter?
revision
```

Every tab checks it before automatic queue work.

---

# 23. Running userscript + feature extension together is split-brain

There is no cross-delivery feature-runtime singleton.

If the Tampermonkey BetterSearch and BetterSearch browser extension are both enabled, two separate runtimes can each believe they own:

- the same Etsy DOM;
- lifecycle observers/listeners;
- catalogue work;
- potentially overlapping site-origin coordination storage;

while using separate persistent config stores.

Until a singleton exists, treat simultaneous feature runtimes as unsupported.

The separate Diagnostics extension is different: it is development/observational tooling and is intentionally allowed alongside one BetterSearch feature runtime.

---

# 24. Concrete implementation order

## Data Release A — stable identity + atomic mutators

Implement first:

1. split owner identity from count/presentation props;
2. stable owner/profile generation latch;
3. owner-required URL/storage validation;
4. typed HTTP retry policy;
5. `db.onversionchange` handling;
6. atomic latest-row listing/scope/queue mutation primitives;
7. convert deep observation, unfavorite, availability and queue enqueue/update;
8. executable cross-tab interleaving tests.

## Data Release B — IndexedDB v3 generations

Then:

1. schema migration;
2. legacy-mixed compatibility state;
3. immutable scope snapshots;
4. atomic active generation pointer;
5. partial positive overlay;
6. owner-specific membership semantics;
7. generation-safe catalogue completion;
8. atomic/opaque cross-tab fallback lease;
9. exact peer generation handoff.

## Data Release C — native query + scope lifecycle

Then:

1. collect short controlled CDP native submit/clear sessions;
2. implement verified query generation state machine;
3. timeout becomes UI fallback only;
4. durable-query prerequisite;
5. generated-group helper persistence cleanup;
6. scope classes + TTL/LRU/GC;
7. explicit count view model.

## UI/Lifecycle release

On top of stable data truth:

1. bounded local/native pager identity correction;
2. generation-safe local result takeover;
3. one shell/rail/toolbar lifecycle owner;
4. one availability renderer;
5. remove superseded wrappers instead of adding another patch layer.

---

# 25. Test philosophy after this audit

Several bugs survived green tests because the fixture did not model the real combined state.

Required future fixtures include:

```text
hidden native pager page 1 + visible local pager page 2
old complete generation + failed replacement crawl
partial write in tab A + partial write in tab B
deep response in A + unfavorite in B
enqueue in A + atomic claim in B
same listing in owner A + owner B
owner props present while count missing
profile A collection cache -> profile B hydration gap
submit A -> clear/B -> late A response
old v2 DB connection -> v3 versionchange
Tampermonkey + extension duplicate feature runtime
```

The crucial transaction rule is:

> A test does not prove multi-tab atomicity merely because a function contains a readwrite transaction. The read of the state being mutated must be inside the same atomic mutation contract.

---

# 26. What this audit intentionally did not change

No production code was modified during this audit phase.

The current visual contract remains frozen.

The audit does not request:

- a UI redesign;
- a giant all-at-once rewrite;
- raw private capture data in public GitHub;
- blindly trusting undocumented Etsy APIs;
- deleting historical metadata just because membership is stale;
- abandoning Tampermonkey in favor of an extension-only architecture.

The immediate goal is to establish durable identity/data truth so the later lifecycle cleanup can become simpler rather than adding another generation of repair modules.