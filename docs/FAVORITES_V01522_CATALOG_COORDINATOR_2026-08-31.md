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

The older audit in `FAVORITES_CATALOG_LEASE_STORAGE_AUDIT_2026-08-30.md` recommended replacing the fallback with an IndexedDB coordinator rather than repeatedly patching the localStorage election.

## v0.15.22 architecture

Web Locks are unchanged and remain the first choice.

When Web Locks are unavailable, `src/61ec-favorites-catalog-coordinator.js` replaces the localStorage branch with a separate coordinator database:

```text
etsy-bettersearch-coordinator
└─ leases (keyPath: key)
```

This is intentionally separate from `etsy-bettersearch-favorites`, so v0.15.22 does not require a schema/version migration of the production Favorites index or risk blocking that main database upgrade across old tabs.

Acquisition/renewal/release all read and mutate one lease row inside a single IndexedDB `readwrite` transaction. Competing transactions on the same store serialize across tabs, giving the fallback the atomic ownership decision that localStorage lacked.

## Opaque dataset identity

The coordinator key is:

```text
catalog:<SHA-256(canonical dataset identity)>
```

The row stores only:

```text
key
token
workerId
leaseUntil
updatedAt
```

It does **not** persist raw owner, collection, or native-query text. This also removes the old localStorage privacy/debris problem where encoded query text could appear in an Etsy-origin key and value.

## Lost-lease fencing

A coordinator guard lives only for the active runtime crawl.

- heartbeat renews the lease atomically;
- if renewal sees another token, the guard is marked lost;
- the matching catalogue `AbortController` is aborted;
- page-boundary touch throws immediately once loss is known;
- the final `complete:true` catalogue observation performs an **awaited atomic lease assertion** before entering the immutable snapshot writer;
- release deletes the row only when the stored token still matches, so a late losing worker cannot remove the winner's lease.

The v0.15.6/v0.15.9 immutable snapshot generation ordering remains the second data-correctness fence. If an old suspended worker wakes after a newer generation has already committed, the older snapshot start time cannot replace the newer committed generation.

## Why this is a separate database

Adding a coordinator object store to the main Favorites database would require incrementing its IndexedDB version. Existing tabs with the old version open could block that upgrade. A small dedicated database gives the coordinator an atomic durable primitive without coupling lease rollout to a production-data schema migration.

## Tests

`tests/favorites-v01522-catalog-coordinator.test.mjs` covers:

1. userscript load order after immutable snapshots and before route identity;
2. separate IndexedDB `readwrite` coordinator and absence of localStorage election calls;
3. bounded opaque SHA-256 key and no raw dataset identity in the lease row;
4. lease takeover after expiry;
5. lost-token renewal failure and crawler abort;
6. losing worker release cannot delete the newer winner row;
7. Web Locks path delegates to the established v0.14 implementation;
8. partial observations remain unfenced while `complete:true` snapshot writes require an awaited coordinator assertion;
9. immutable generation ordering remains the second stale-commit fence.

## Non-goals

This release does not redesign the full Favorites index schema, native-query identity, or snapshot generation model. It does not modify the already-correct Web Locks path.

A later cleanup can fold the coordinator boundary back into the consolidated catalogue module once the broader module-consolidation phase begins.
