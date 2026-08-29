# Favorites audit chunk 3 — count authority, owner identity, collection lifecycle and cross-tab persistence

**Date:** 2026-08-30  
**Production baseline audited:** BetterSearch v0.15.1, `main` at `0cf7520ed87e74f6b5e520a7e974fabde8d2c719`  
**Status:** source audit / design evidence. This document does not change runtime behavior.

This continues:

- `FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md`
- `FAVORITES_INDEXEDDB_INTEGRITY_ADDENDUM_2026-08-29.md`
- `FAVORITES_AUDIT_CONTINUATION_2026-08-30.md`
- `FAVORITES_LOCAL_CARD_ACTION_AUDIT_2026-08-30.md`

Raw account/query/listing/session data is intentionally omitted.

## Executive summary

The third source pass found that several previously separate symptoms share one identity/generation problem.

1. Owner extraction is coupled to finding a usable Favorites total. `favProps()` refuses otherwise-valid owner-bearing props unless it can also derive `totalListings`. Owner identity can therefore temporarily become empty even when an owner-bearing props payload exists.
2. There is no stable owner latch. `favScope()` recomputes owner from transient DOM props every time. A temporary empty owner changes `favDatasetKey()`, can trigger a dataset reset, can suppress own-profile auto-sync, and can allow ownerless current-page persistence.
3. The collection model cache is not keyed by owner. When current props disappear, `favCollections0120()` can reuse whatever `favState.collectionModel0120` belonged to the previous profile/scope.
4. Collection-creation completion detection watches any dialog on the page for up to two minutes. It is not bound to the create-collection dialog, starting owner, route, or operation generation.
5. `favState.total` is not an authoritative Favorites total. It is a mutable runtime count sourced from cache/network and optimistically decremented. Header/count UI nevertheless gives it higher priority than Etsy's current total.
6. IndexedDB scope observations are serialized only inside one JavaScript realm. The scope read and the later scope write happen in separate transactions. Two tabs can therefore perform stale read/modify/write cycles and lose each other's membership updates even though individual readwrite transactions themselves serialize.
7. This cross-tab persistence race is independent of the v0.14 catalogue lease. The lease protects the complete catalogue crawler for the same dataset; ordinary partial current-page/metadata observations can still race in other tabs.

These findings raise owner latching and atomic scope-generation persistence to the same P0 boundary as the already documented immutable snapshot work.

---

# 1. Full count-authority writer/consumer map

The code currently has several values that can all be presented or interpreted as “Favorites count”, but they mean different things.

## 1.1 `favState.total` writers

### Initial runtime state

`src/60-favorites-state.js` initializes:

```text
favState.total = 0
```

### Cache bootstrap

`src/61e-favorites-cache-bootstrap.js::favPrimeDatasetFromCache0137()` materializes the cached scope and assigns:

```text
favState.records = materialized cache records
favState.total = records.length
favState.loadComplete = true
favState.loadSource0137 = "cache"
```

This is the source of the observed stale cached 107 becoming the live runtime total.

### Network catalogue commit

`src/61b-favorites-sync.js::favCatalogCommitLive0141()` assigns the newly crawled/hydrated record array and again sets:

```text
favState.total = favState.records.length
```

### Local favorite removal

`src/63-favorites-runtime.js::favRemoveLocalFavorite()` optimistically decrements `favState.total` before durable/index/native reconciliation completes.

### Dataset reset

The runtime dataset-reset path clears `favState.total` back to zero before the new scope/cache/network generation loads.

## 1.2 `favState.total` consumers

### All/collection header

`src/86-favorites-page-shell.js::favScopeCounts0120()` currently chooses:

```text
favState.total
→ Etsy props.totalListings
→ Etsy props.itemCount
→ favState.records.length
```

Because cache startup writes `favState.total`, a stale cached count outranks a current Etsy total.

### Local result count

The runtime result-count path uses roughly:

```text
base = favState.total || favState.records.length
shown = favState.filtered.length
```

This is acceptable only if `favState.total` is explicitly defined as “count of the currently committed BetterSearch catalogue generation”. It is not safe as a generic current-Etsy-Favorites total.

## 1.3 Other count authorities

### Etsy page props

`favProps()` exposes `totalListings` or derives it from `itemCount` / current `listings.length`.

This is the best current server/native total when the props object is known to represent the current owner/scope/query generation, but it can be stale SSR state during later React-native search transitions.

### Stored scope membership

`scope.listingIds.length` is the current persisted membership-array count. The prior audits prove that a `complete:true` row can contain partial additions after the last complete timestamp, so this is not currently an immutable complete-generation count.

### Global owner index stats

`favIndexGetStats(owner)` unions IDs across all retained scopes for that owner and then reports `isFavorite=true` rows. That produced the 114-style “indexed active favorites” value in the analyzed database. It is index coverage, not authoritative current All membership.

### Settings composite total

The module-68 Settings layer independently computes approximately:

```text
max(
  current Etsy props total,
  cached All scope listingIds count,
  owner-wide active indexed rows
)
```

and then formats coverage against that maximum. This is a fourth count semantic.

### Synchronization progress hint

The catalogue service can use Etsy props as an expected total when scope/query identity appears to match. That value is useful as a crawl verification/progress hint, not necessarily as final durable authority.

### Native grid child count

The mounted native grid normally represents one current page (commonly up to 20 cards). It is a visible-page count, never the full scope total.

### Local filtered count

`favState.filtered.length` is the BetterSearch match count for the current committed catalogue/config. This is the correct source for “shown” in local mode if its render generation is current.

## 1.4 Required count model

Replace the overloaded “total” concept with a named count view model, for example:

```text
CountModel {
  scopeKey
  ownerGeneration
  nativeQueryGeneration

  serverScopeTotal?: {
    value
    observedAt
    provenance
    generation
  }

  catalogueGenerationTotal?: {
    value
    generationId
    completedAt
    verifiedComplete
  }

  localMatchTotal?: {
    value
    renderGeneration
  }

  indexedActiveRows?: {
    value
    meaning: "index coverage"
  }
}
```

UI rules:

- native current-scope header: prefer a server/native total proven current for the active scope/query generation;
- BetterSearch local mode: base total comes from the exact committed catalogue generation; `shown` comes from the exact local render generation;
- Settings: label global index values as indexed records/coverage, not simply Favorites;
- sync progress: server total may remain a hint but must not silently overwrite generation truth;
- never use one mutable number for all of these semantics.

---

# 2. Owner extraction is incorrectly coupled to count availability — SOURCE-PROVEN BUG

`src/60-favorites-state.js::favProps()` does not simply return a props object containing `profileOwnerUserId`.

It performs this sequence:

```text
find text/props script containing profileOwnerUserId
parse JSON
require profileOwnerUserId
try to obtain totalListings
  -> totalListings
  -> itemCount
  -> listings.length
only return the props object if totalListings is finite
```

Therefore this object is currently rejected:

```text
{
  profileOwnerUserId: valid owner,
  ...useful identity fields,
  but no count field currently available
}
```

That means BetterSearch can lose **identity** merely because it temporarily cannot determine a **count**.

This is the wrong dependency direction.

## Required split

Use separate readers:

```text
favIdentityProps()
  -> owner/viewer/profile-login/scope identity
  -> does NOT require totalListings

favCountProps()
  -> totalListings/itemCount/listing-count hints

favPresentationProps()
  -> collectionsTabs/privacy/listing presentation data
```

A missing count must never make a known owner disappear.

---

# 3. There is no stable owner latch — SOURCE-PROVEN BUG

`favScope()` calls `favProps()` every time and emits:

```text
owner: String(props?.profileOwnerUserId || "")
```

There is no document/profile owner generation or last-known-valid owner latch.

The current broad runtime MutationObserver repeatedly schedules scope/dataset reconciliation. If Etsy temporarily removes/replaces the props island during a soft transition, BetterSearch can observe this sequence:

```text
owner = valid
  ↓
props temporarily unavailable / count cannot be derived
  ↓
owner = ""
  ↓
favDatasetKey changes
  ↓
dataset reset / current-page observation / UI reconciliation
  ↓
owner becomes valid again
  ↓
second dataset change/reset
```

This connects several prior symptoms:

- durable ownerless scope in IndexedDB;
- historical malformed `/users//collections/...` request;
- avoidable dataset resets during page lifecycle changes;
- auto-sync occasionally being ineligible because `favIsOwnFavoritesPage()` also depends on fragile `favProps()`;
- collection-model identity ambiguity.

## Owner-latch contract

Introduce a stable identity object:

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

Rules:

1. profile login from the pathname may establish the profile route identity immediately;
2. a non-empty owner ID observed from trusted Etsy props may latch for that profile route;
3. temporary absence does not clear the owner;
4. a different non-empty owner ID is accepted only when the profile route/generation legitimately changes;
5. owner-required network/storage APIs reject unresolved owner rather than encoding empty string;
6. scope/query/collection models are keyed to owner generation;
7. latching another user's profile must remain distinct from “own profile” status; viewer identity must not be guessed.

Do not persist a guessed owner from stale previous-profile state merely to avoid an empty string. A latch is valid only inside its matching profile-route generation.

---

# 4. Collection model cache is not owner-keyed — SOURCE-PROVEN CROSS-PROFILE RISK

`src/86-favorites-page-shell.js` stores one global:

```text
favState.collectionModel0120
```

`favCollections0120()` behaves approximately as:

```text
if current favProps().collectionsTabs exists:
    collectionModel = current tabs
else:
    use previous collectionModel
```

The fallback is not keyed by:

- owner ID;
- profile login;
- route generation;
- current All/collection scope.

Therefore this is possible:

```text
profile A -> cache A collection tabs
navigate to profile B
B props temporarily unavailable
favCollections0120() -> reuses A collection tabs
```

Even if the wrong links are corrected on a later pass, exposing another profile's stale collection model in the interim is an identity correctness failure.

## Required model

```text
collectionModelsByOwnerGeneration: Map<ownerGeneration, {
  ownerId,
  profileLogin,
  tabs,
  observedAt,
  source
}>
```

If the current owner generation is unresolved, do not fall back to an unrelated previous owner model.

---

# 5. Collection-creation completion watcher is too broad — SOURCE-PROVEN LIFECYCLE RISK

`favWatchCollectionCreation0120()`:

- observes the entire `document.body`;
- treats **any** `[role="dialog"]` as evidence that the create flow opened;
- remembers `sawDialog=true`;
- when no dialog is present anymore, calls `favRefreshCollectionModel0120()`;
- remains armed for up to 120 seconds.

It does not capture:

- the exact native create-collection dialog;
- starting owner/profile generation;
- starting route/scope;
- operation ID;
- expected collection creation result.

A different Etsy dialog opened/closed during that window can satisfy the watcher.

If navigation occurs while it is armed, the later callback fetches **current** `location.href`, not the route that started the create operation.

## Collection-create operation contract

Capture at click time:

```text
CollectionCreateOperation {
  operationId
  ownerGeneration
  profileLogin
  startingScope
  nativeCreateButtonIdentity
  startedAt
}
```

Then:

- recognize the specific create dialog / create lifecycle, not arbitrary dialogs;
- cancel on owner/profile generation change;
- after confirmed completion/close, fetch/parse the matching profile route;
- verify returned `profileOwnerUserId` matches the operation owner;
- atomically replace only that owner's collection model;
- ignore a stale result if another owner/profile generation has become current.

`favRefreshCollectionModel0120()` should also return/store owner identity from the fetched document, not only `collectionsTabs`.

---

# 6. `favIndexObserveRecordsNow()` has a cross-tab stale read/modify/write race — NEW P0 SOURCE-PROVEN RISK

The index has:

```text
favIndexOperationQueue = Promise.resolve()
```

which serializes observations **inside one JavaScript runtime/tab**.

But `favIndexObserveRecordsNow()` performs:

```text
1. readonly transaction
   -> read old listings / old scope / shops

2. compute merged scope/listing state in JS

3. separate readwrite transaction
   -> write computed listing/scope/shop rows
```

IndexedDB serializes conflicting readwrite transactions, but the critical old-scope read happened earlier in a separate transaction. Two tabs can therefore both compute from the same stale base.

## Lost partial update example

Starting scope:

```text
listingIds = [A]
```

Tab 1:

```text
reads [A]
plans partial union C -> [A,C]
```

Tab 2 before Tab 1 writes:

```text
reads [A]
plans partial union D -> [A,D]
```

Then:

```text
Tab 1 writes [A,C]
Tab 2 writes stale plan [A,D]
```

C is lost.

## More severe complete-vs-partial example

Tab 2 reads old complete generation v1.

Tab 1 completes a new authoritative generation v2 and writes:

```text
listingIds = v2 IDs
lastCompleteSyncAt = T2
complete = true
```

Tab 2 then writes a partial observation calculated from its stale v1 `oldScope`. Because the scope row is replaced, it can restore old membership/completion metadata plus its partial union, effectively overwriting the newer v2 scope row.

This is conceptually separate from the already documented “partial page contaminates a previous complete snapshot” bug. Even after the complete crawler itself becomes generation-safe, generic cross-tab observation must also become atomic/generation-aware.

## Why the catalogue lease does not solve this

The v0.14 catalogue lock protects complete-catalogue crawling for the same dataset.

It does not make every current-page observation, metadata observation, or other `favIndexObserveRecords()` caller acquire that catalogue lock.

The storage layer itself must therefore be concurrency-safe.

## Required persistence rule

The operation that reads current scope state and commits its mutation must occur under one storage-level atomic contract.

Options:

1. perform scope read + merge + scope write in one IndexedDB readwrite transaction;
2. better, stop mutating authoritative complete membership for partial observations at all, and append/update a separate overlay keyed by generation;
3. generation/CAS check before committing a scope pointer or overlay mutation.

The future immutable-generation design should make a stale observation unable to rewrite an active-generation pointer.

---

# 7. Peer-tab catalogue completion currently proves time, not generation

`favCatalogPeerCompleted0141(scope, requestedAt)` accepts peer completion based on roughly:

```text
scope.complete === true
&& scope.lastCompleteSyncAt >= requestedAt
```

The waiting tab then primes from the current scope row.

With today's mutable scope row, timestamp + `complete:true` is not proof of an exact immutable membership generation.

After the generation migration, peer completion should return/verify an exact generation identifier:

```text
expected dataset key
completedGenerationId
completedAt
verifiedComplete
```

The waiter should materialize that generation explicitly. It must not merely read whatever mutable row happens to exist when it wakes.

---

# 8. Current-page observation has no owner-validity boundary

`favIndexObserveCurrentPage()` builds current records and calls:

```text
favIndexObserveRecords(records, {
  scope: favIndexCurrentScope(),
  complete: false
})
```

`favIndexCurrentScope()` accepts the current `favScope()` including an empty owner.

The runtime invokes current-page observation during startup, route/view changes and mutation-driven settling.

Therefore owner validation must exist below the runtime caller:

```text
favIndexCurrentScope / favIndexObserveRecords
```

should reject an owner-required scope whose canonical owner generation is unresolved.

The correct response is not to drop useful card information forever. Listing/card observations may be temporarily held in memory or persisted as owner-neutral presentation observations if a future schema intentionally supports that. They must not be attached to a fabricated ownerless Favorites membership scope.

---

# 9. Own-profile detection and auto-sync inherit the owner-props fragility

`favIsOwnFavoritesPage(props=favProps())` returns false when `favProps()` returns null.

`favMaybeAutoSync()` requires `favIsOwnFavoritesPage()`.

Therefore the same temporary props/count failure that empties `favScope().owner` can also suppress a due automatic sync during that pass.

The existing capture/database cannot prove that this was why the stale All generation remained old; configuration may also have disabled auto-sync. But the current source shows that auto-sync eligibility is unnecessarily coupled to transient count-bearing props.

Future Diagnostics should record:

```text
owner generation
viewer identity state
is-own-profile decision source
autoSync configured?
interval
due?
decision/rejection reason
```

---

# 10. Additional tests required from this audit

## Owner/props

- valid owner props with no total count still produce a stable owner identity;
- count props may be unknown independently;
- temporary props removal does not change owner generation;
- actual navigation from profile A -> profile B creates a new owner generation;
- unresolved owner blocks owner-required API/storage operations;
- own-profile decision does not become false merely because total count is unavailable.

## Collections

- profile A model cannot appear on profile B while B props hydrate;
- collection model cache is keyed by owner/profile generation;
- create watcher ignores unrelated dialogs;
- navigation/owner change cancels stale collection-create operation;
- fetched collection refresh must verify returned owner before committing tabs;
- stale refresh response cannot replace the new owner's model.

## Count authority

- stale cache count cannot outrank a verified current server/native total;
- index coverage is never rendered under an ambiguous “current Favorites total” label;
- local shown count is tied to the current render generation;
- optimistic unfavorite cannot permanently change authoritative total if native mutation fails/rolls back;
- cache/network/server counts may coexist without silently overwriting one another.

## Cross-tab storage

Executable two-tab/store simulations should cover:

```text
partial C || partial D
complete v2 || stale partial from v1
metadata observation || complete generation commit
unfavorite || stale positive observation
```

and prove no stale operation can overwrite a newer generation pointer or lose another tab's partial observation.

Static tests that merely confirm a readwrite transaction exists are insufficient because the current bug is specifically the split between the earlier readonly snapshot and later readwrite commit.

---

# 11. Revised priority after audit chunk 3

## P0

1. immutable/versioned complete scope generations;
2. atomic/generation-safe cross-tab persistence;
3. stable owner identity latch independent from counts;
4. owner validation at network + persistence boundaries;
5. local/native pager semantic collision;
6. generation-safe local grid/pager takeover.

## P1

7. owner-keyed collection model + scoped create operation;
8. one named count-authority/view-model system;
9. verified native-query generations rather than timeout-created durable identity;
10. query scope retention/GC;
11. one availability owner + one lifecycle controller.

## P2

12. Diagnostics generation/decision instrumentation;
13. delivery-target/multi-tab runtime singleton and settings propagation hardening;
14. local-card action identity/state hardening.

The focused query, IndexedDB migration and multi-tab design documents created alongside this audit expand items 2, 3, 9 and 13.