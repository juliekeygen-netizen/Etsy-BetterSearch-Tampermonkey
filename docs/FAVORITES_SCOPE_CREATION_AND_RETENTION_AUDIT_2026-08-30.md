# Favorites scope creation and retention audit — 2026-08-30

**Status:** extra source audit connecting native-query identity, generated-group crawling, auto-sync and IndexedDB scope pollution.

## Executive summary

Persisted `scopes` are not created by one explicit cache policy. They emerge whenever records are observed with a scope descriptor.

Current important writers include:

- current native page observation;
- every page of a complete catalogue crawl;
- final complete catalogue commit;
- metadata auxiliary persistence;
- generated-group helper crawls;
- auto-sync/manual sync.

Because query identity is currently allowed to commit on timeout and there is no query-scope TTL/GC, a transient wrong query can progress from:

```text
pending text
-> committed dataset key
-> partial current-page scope
-> per-page catalogue scope
-> complete auto-sync scope
-> retained indefinitely
```

Generated-group query resolution also creates an internal owner-wide `items + query` crawl as an intersection helper. Its page observations can leave a byproduct query scope even though the user's logical scope was a group.

The v3 design should make scope creation intentional and classified, rather than a side effect of any observation.

---

# 1. Current page observation creates partial scope state

`favIndexObserveCurrentPage()`:

```text
reads current favScope + favDatasetQuery
extracts mounted native cards/listings
favIndexObserveRecords(... complete:false)
```

This is called from startup and route/view-settle paths.

Therefore as soon as BetterSearch believes a scope/query identity, a partial scope row may be created even before any complete catalogue crawl.

This is useful positive evidence, but it means identity validation must precede persistence.

Owner-required scope with empty owner must be rejected; pending/unverified native query must not be used as durable scope identity.

---

# 2. Catalogue crawl writes every page before completeness is known

`favCatalogCrawlSimple0141()` persists each page as:

```text
favIndexObserveRecords(records, {
  scope,
  complete:false,
  syncState:'running'
})
```

Then the outer refresh performs the final complete write after boundary verification.

The previous audits explain why this currently contaminates old complete membership. In v3 these page observations should update listing metadata + a non-authoritative overlay, not create/mutate a complete-generation membership container.

---

# 3. Auxiliary metadata writes into the current scope

The metadata coordinator captures `favIndexCurrentScope()` and persists fetched batches as partial metadata observations after verifying dataset stability.

This is good stale-route protection, but it is another reason a `scope` row must not treat every observation type as membership-generation mutation.

Metadata provenance belongs to listing fields. A metadata refresh should not be capable of changing complete membership semantics or `lastSyncState` for the generation that established membership.

---

# 4. Generated-group query resolution creates an internal owner-wide items-query scope — SOURCE-PROVEN SIDE EFFECT

For a group + query, `favCatalogCrawlGroupQuery0141()` currently performs two complete-style crawls for intersection:

```text
A. groupScope = same generated group, query=""
B. queryScope = type="items", id="", query=<group query>

result = intersection(A IDs, B IDs)
```

Each call to `favCatalogCrawlSimple0141()` performs per-page partial IndexedDB observations under the scope passed to it.

Therefore helper B can persist/update:

```text
owner | items | no id | query=<q>
```

as a **partial byproduct scope**, even though the user's logical requested dataset was the generated group query.

The outer refresh finally commits the actual group-query scope complete, but the internal items-query helper is not merely an in-memory fetch; it leaves persistent observation state.

This is an avoidable source of query-scope growth.

## Desired behavior

Internal helper crawls should declare persistence intent explicitly:

```text
catalogue crawl mode:
  authoritative-scope
  positive-overlay-only
  ephemeral-helper-no-scope-persistence
```

For a generated-group intersection helper, owner-wide query results may still update global listing metadata/presentation, but should not create a durable user-facing query scope unless that cache is intentionally shared and governed by retention policy.

---

# 5. Auto-sync can promote current query scope into a complete durable scope

`favMaybeAutoSync()`:

1. verifies auto-sync / own profile;
2. builds canonical All descriptor;
3. also includes the **current scope** when it differs from All;
4. checks each stored row's `lastCompleteSyncAt`;
5. runs due descriptors in parallel.

If the current scope contains a native query, auto-sync may therefore perform a complete crawl and complete scope write for that query.

This is not inherently wrong for a **verified committed** native query. It becomes dangerous because current query commit can be produced by the 850 ms fallback without verified native result acknowledgement.

Thus current amplification path is:

```text
wrong/unverified query commits after timeout
-> becomes current dataset
-> current-page observation can persist it
-> auto-sync sees current descriptor due
-> complete query catalogue is crawled/persisted
-> no retention expiry
```

The query-generation fix must therefore land before query-scope persistence is considered trustworthy.

---

# 6. Manual Sync now targets canonical All, which is safer

The Settings Sync button currently calls the All-items scope helper rather than blindly syncing whatever transient query is visible.

That is an important distinction and should remain.

The broader sync compatibility API can still sync arbitrary descriptors for auto/background/current-scope use, so storage validation must live below the UI button.

---

# 7. Scope state has no retention class

Current scope rows do not clearly distinguish:

```text
canonical All
real collection
real generated group
verified native query cache
partial current-page observation
internal helper scope
legacy/transient query
invalid ownerless scope
```

They share the same store/shape and can remain indefinitely.

The database dump's many zero-result/transient/long query scopes are a predictable outcome of this missing lifecycle policy.

---

# 8. v3 scope classification

Add an explicit class/purpose to mutable scope state/snapshot metadata.

Example:

```text
scopeClass:
  canonical-all
  collection
  generated-group
  verified-native-query
  helper-ephemeral
  legacy-unverified
```

and:

```text
retentionClass:
  durable
  bounded-query
  ephemeral
  quarantine
```

A helper-ephemeral dataset may update listing metadata without receiving an active durable snapshot pointer at all.

---

# 9. Query scope persistence prerequisite

A durable `verified-native-query` scope requires:

```text
valid owner generation
valid scope generation
committed native query generation
commit evidence provenance
query generation still current at snapshot commit
```

A timer-only pending query does not qualify.

Persist query-generation evidence on the scope/snapshot metadata so Diagnostics/GC can explain why it exists.

---

# 10. Retention / GC proposal

## Durable

```text
canonical no-query All
real collections/groups that remain in owner's current model
active + previous verified snapshots
```

## Bounded query

Keep a small recent LRU/TTL per owner/scope.

Possible signals for longer retention:

- recently used multiple times;
- nonzero result cache;
- expensive metadata already hydrated.

Still bounded.

## Zero-result verified query

Short TTL. A valid no-result query is useful briefly but should not live forever by default.

## Legacy/unverified query

Do not use as authoritative. Prune aggressively after migration unless needed for short optimistic presentation.

## Internal helper

No durable scope row unless explicitly designed for shared caching.

## Invalid identity

Ownerless/malformed -> quarantine/delete; never active.

---

# 11. Scope deletion must not delete listing metadata blindly

Deleting an expired query scope should remove:

```text
scope state/snapshots/overlay references
```

but listing/shop metadata may still be used by other owner scopes.

Do not delete a listing row merely because one query scope expired.

Owner/scope reference counting or independent metadata GC should be a separate policy.

---

# 12. Current `lastSyncState` should not determine retention

Previous audit showed metadata/partial observations can overwrite `lastSyncState` while `lastCompleteSyncAt` belongs to an older generation.

Retention should use explicit scope class, generation timestamps and last-used/access metadata, not the ambiguous current `lastSyncState` string.

---

# 13. Add `lastUsedAt` separately from `lastObservedAt`

A scope can be observed due to background/internal work without being something the user actively navigated to.

For LRU retention distinguish:

```text
lastUsedAt      // user/current dataset adopted/read
lastObservedAt  // any persistence observation
lastCompletedAt // verified snapshot commit
```

An internal helper should not keep itself alive indefinitely merely because a background process touched its listings.

---

# 14. Migration implications

When converting v2 scopes:

- canonical no-query owner scopes remain useful but legacy-unverified until fresh crawl;
- collection/group classification derives structurally from type/id with valid owner;
- all historical query scopes are unverified under the future network-ack contract;
- old zero-result query scopes can receive short expiry;
- implausible/ownerless identities are never activated;
- helper-vs-user historical provenance generally cannot be reconstructed, so do not pretend it can.

A fresh post-v3 query use can create a new verified scope generation if needed.

---

# 15. Regression tests

1. current-page observation with pending unverified query cannot create durable query scope;
2. verified query may create bounded query scope;
3. timeout alone never promotes scope persistence class;
4. generated-group helper query crawl does not create a durable items-query scope;
5. helper crawl may still update listing metadata safely;
6. auto-sync cannot sync unverified current query descriptor;
7. verified current query auto-sync remains allowed if product policy wants it;
8. canonical All manual Sync remains unaffected;
9. expired query scope removal preserves shared listing/shop metadata;
10. zero-result verified scope expires under shorter TTL;
11. ownerless scope is rejected/quarantined;
12. GC never removes active/current generation.

---

# 16. Priority

This is P1 after the P0 generation/owner/atomic-write boundary, but the **persistence prerequisite** for query scopes should be introduced together with the native-query generation fix.

Otherwise v3 can still fill with perfectly immutable snapshots of incorrectly inferred query identities.