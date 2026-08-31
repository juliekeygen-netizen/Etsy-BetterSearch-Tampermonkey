# BetterSearch v0.15.22 — atomic catalogue fallback coordinator

**Date:** 2026-08-31
**Status:** behavior-gate implementation; release promotion waits for exact-head CI and post-green audit.

## Problem

The v0.14 catalogue service correctly prefers Web Locks, but its no-Web-Locks fallback used Etsy-origin `localStorage` as a lease:

```text
read current lease
write my token
read it back
```

Individual `localStorage` calls are atomic, but the sequence is not an atomic compare-and-set. A valid cross-tab interleaving can let two tabs both return from acquisition and crawl the same complete Favorites dataset.

The fallback heartbeat and page-boundary touch also ignored a failed token refresh, so the losing worker could continue after another tab replaced its token.

The earlier audit in `FAVORITES_CATALOG_LEASE_STORAGE_AUDIT_2026-08-30.md` required an IndexedDB coordinator plus a final lease/generation fence. Network deduplication and authoritative snapshot correctness must remain separate defenses.

## v0.15.22 architecture

Web Locks are unchanged and remain the first choice.

When Web Locks are unavailable, `src/61ec-favorites-catalog-coordinator.js` coordinates on the canonical dataset's existing row in the production Favorites IndexedDB `scopes` store.

No object-store or database-version migration is required. The coordinator adds fields to the existing scope record:

```text
catalogCoordinatorGeneration
catalogCoordinatorLeaseToken
catalogCoordinatorWorkerId
catalogCoordinatorLeaseUntil
catalogCoordinatorClaimedAt
catalogCoordinatorUpdatedAt
```

Acquisition, renewal, takeover, and release all read and mutate that row inside one `scopes` `readwrite` transaction. IndexedDB serializes competing readwrite transactions on the store across tabs, providing the atomic ownership decision the localStorage sequence lacked.

This design is intentionally stronger than an earlier draft that used a second coordinator database. A separate database would make lease acquisition atomic by itself but would still leave a cross-database gap between lease validation and the final Favorites snapshot transaction. Keeping the lease/fence and snapshot on the same `scopes` store allows the final commit to verify ownership inside the same transaction that replaces committed membership.

## Identity/privacy

The old fallback duplicated raw owner/query dataset identity into Etsy-origin localStorage lease keys and values.

v0.15.22 creates no new localStorage coordination key and no second coordinator database record. It uses the existing canonical BetterSearch scope row, which already contains the dataset identity needed by the Favorites index. Therefore coordination does not add another durable copy of private native-query text.

Legacy localStorage helper functions remain physically present in the older 61b module for historical compatibility/source layering, but the final no-Web-Locks production path is replaced by 61ec and does not execute that election.

## Exact peer completion

The old waiter accepted a peer from timestamp alone:

```text
complete && lastCompleteSyncAt >= requestedAt
```

The coordinator now captures the baseline committed snapshot generation when waiting begins. A later peer completion is accepted only when:

```text
scope is complete
commit timestamp >= requestedAt
committed snapshot generation is non-empty
committed snapshot generation != baseline generation
```

This prevents a timestamp-only state from masquerading as a newly verified generation.

## Lost-lease fencing

A coordinator guard lives only for the active fallback crawl.

- heartbeat renews the exact active token atomically;
- page-boundary touch starts another atomic renewal;
- a token mismatch marks the guard lost and aborts the matching catalogue `AbortController`;
- a takeover writes a new `catalogCoordinatorGeneration` and active lease token atomically;
- release clears the active token only when it still matches, so a losing worker cannot clear a newer winner;
- the durable `catalogCoordinatorGeneration` remains after release as the latest fencing generation.

The important final fence happens inside 61ea's existing immutable snapshot transaction. 61ec wraps `favSnapshotScopeRecord0156`, which is called after the latest scope row is read and before that same readwrite transaction writes it.

For a fallback-coordinated `complete:true` observation, commit requires all of:

```text
stored catalogCoordinatorGeneration == my generation
stored catalogCoordinatorLeaseToken == my generation
stored catalogCoordinatorLeaseUntil > now
```

If any check fails, the snapshot transaction aborts with `AbortError`.

Because lease claim/takeover and snapshot commit serialize on the same `scopes` store, a browser-suspended old worker cannot wake after lease expiry/takeover and publish an authoritative completed snapshot. If its lease merely expired without takeover, the non-expired check still rejects the stale completion.

The existing v0.15.6/v0.15.9 immutable snapshot generation ordering remains an additional stale-generation defense rather than being asked to substitute for lease ownership.

## Scope-row creation

A first-ever catalogue request may not yet have a persisted scope row. Atomic acquisition seeds only the minimal canonical scope shape with:

```text
scopeKey / owner / login / type / id / query
listingIds: []
complete: false
lastSyncState: idle
```

This row is non-authoritative until the existing snapshot machinery verifies and commits a complete crawl. Ownerless coordinator claims fail closed.

## Tests

`tests/favorites-v01522-catalog-coordinator.test.mjs` covers:

1. userscript load order after immutable snapshots and before route identity;
2. coordinator uses the existing `scopes` readwrite transaction and the final module contains no executable localStorage election or second database open;
3. atomic first claim and exact generation/token fields;
4. active other-worker lease exclusion;
5. expired lease takeover with a new generation;
6. exact peer completion requires a changed committed snapshot generation;
7. newer timestamp with the same generation is not accepted as peer completion;
8. lost-token renewal failure aborts the crawler;
9. losing release cannot clear a newer winner, while owner release retains the generation fence;
10. Web Locks delegates to the established v0.14 path unchanged;
11. partial observations remain untouched while complete observations carry the active generation into the snapshot transaction;
12. the snapshot fence accepts only the exact live, non-expired generation/token;
13. complete writes without a coordinator generation remain valid for the Web Locks path.

## Non-goals

This release does not redesign the overall Favorites index schema, native-query identity, or Web Locks path. It does not remove the historical localStorage helper definitions from 61b because this release is establishing a narrow final behavior boundary; broader module consolidation remains a later architecture phase.

A later cleanup can fold 61ec's final behavior directly into the consolidated catalogue/snapshot modules and delete the superseded fallback helpers once load-order compatibility no longer matters.
