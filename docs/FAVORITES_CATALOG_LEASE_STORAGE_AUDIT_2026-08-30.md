# Favorites catalogue lease / storage audit — 2026-08-30

**Status:** extra source audit of the v0.14 cross-tab catalogue lease. The primary Web Locks path remains useful; this document focuses on identity/privacy and fallback correctness.

## Executive summary

The catalogue service prefers `navigator.locks` and falls back to an Etsy-origin `localStorage` lease.

The fallback is not a true atomic lock:

```text
read current lease
write my token
read it back
```

Two tabs can both believe they acquired the lease under a valid interleaving. Heartbeat lease loss does not abort the already-running crawler, so duplicate complete crawls can continue.

The lease key/value also contain raw dataset identity, including owner and native query. Because the fallback is stored in Etsy-origin `localStorage`, private query text can be persisted into key/value material and stale crashed leases can remain until that exact dataset is touched again.

The v3 generation work should keep Web Locks where available but replace the fallback with a bounded opaque identity + durable atomic coordination primitive.

---

# 1. Current lock identities contain raw dataset identity

`favCatalogKey0141(scope)` is approximately:

```text
<owner>|<type>|<scope id>|q:<query>
```

Web Lock name:

```text
etsy-bettersearch:favorites-catalog:<datasetKey>
```

Storage fallback key:

```text
etsy-bettersearch.catalog-lease.<encodeURIComponent(datasetKey)>
```

Storage value also contains:

```text
datasetKey
workerId
token
leaseUntil
```

So query/owner identity is duplicated into a browser-origin coordination object.

This is unnecessary for exclusivity. A deterministic opaque hash/ID of canonical dataset identity is sufficient for lock keying.

## Privacy note

The fallback uses `globalThis.localStorage` while running on Etsy. Treat values stored there as Etsy-origin browser storage, not as private extension preference storage.

At minimum they are visible to the browser/devtools and should not contain unnecessary raw private native-search text. Same-origin script visibility may depend on the exact execution environment, but the design should not rely on sandbox isolation to protect raw query strings.

Web Lock names are ephemeral rather than persistent, but opaque bounded names are still preferable.

---

# 2. The localStorage acquisition algorithm is not atomic — SOURCE-PROVEN RACE

Current fallback acquisition does roughly:

```text
existing = read lease
if absent/expired:
  write my token
  if read lease token == my token:
      acquired
```

`localStorage` provides atomic individual operations, not an atomic compare-and-set transaction across this sequence.

Valid interleaving:

```text
Tab A reads: no lease
Tab B reads: no lease
Tab A writes token A
Tab A reads token A -> concludes acquired
Tab B writes token B
Tab B reads token B -> concludes acquired
```

Now both tabs have returned from acquisition and may enter the crawler.

The fallback is therefore a best-effort election, not a correctness-grade exclusive lock.

---

# 3. Losing the fallback lease during work does not cancel the crawler

The fallback heartbeat calls:

```text
favCatalogRefreshLease0141(scope, token)
```

but ignores a false result.

The crawler's page-boundary `touchLease()` is also advisory; a failed refresh does not abort the controller or throw lease-lost.

Therefore in the double-acquisition interleaving:

- tab A's later heartbeat may discover token B and fail to refresh;
- tab A nevertheless continues crawling;
- tab B continues too.

This is unlike the later deep-queue worker design, where lease ownership is revalidated and a lost lease prevents stale worker completion.

Even after v3 immutable generation commits make duplicate crawls less corrupting, duplicate network work remains undesirable and two generations can race to become active unless the commit protocol defines ordering.

---

# 4. Normal cleanup is good; crash cleanup is dataset-specific

On the ordinary `finally` path, the fallback removes the lease if the stored token still matches its token.

If the tab/browser crashes or is killed, the key remains with an expired `leaseUntil`.

A future acquisition of the **same dataset** can overwrite it, and normal completion can then remove the new lease.

There is no global stale-prefix cleanup.

Therefore crashes while using distinct native-query dataset keys can leave multiple stale query-bearing keys until those exact datasets are revisited or origin storage is cleared.

This is not likely to be a major quota issue under ordinary use, because normal completion removes keys. It is still unnecessary privacy/storage debris and becomes more relevant given the historical polluted/long query-scope evidence.

---

# 5. Long/transient query identities create unbounded coordination-key size

The historical database contains unusually long query identities.

Current lease key directly encodes query text into the localStorage key and also stores raw datasetKey in the value.

A weak native-query commit can therefore affect not only IndexedDB scope pollution but also the size/identity of a temporary cross-tab lease.

The native-query generation fix should happen before trusting arbitrary query text for any durable/persistent coordinator key.

Coordination keys should be bounded even after query correctness is fixed.

---

# 6. Peer-completion timestamp test compounds fallback ambiguity

Before acquiring and while polling, the fallback accepts another tab as completed when:

```text
stored scope.complete === true
lastCompleteSyncAt >= requestedAt
```

The earlier audits prove current scope membership is mutable independently from the complete timestamp.

Thus fallback coordination has two weak identity layers today:

```text
lock election is not atomic
peer completion is timestamp-based rather than generation-based
```

After v3, a peer wait must be satisfied by an exact newly committed verified generation ID for the requested canonical dataset.

---

# 7. Recommended fallback after v3

## Preferred hierarchy

```text
1. Web Locks if available
2. IndexedDB coordinator/lease row with atomic readwrite transaction
3. no cross-tab lock only if the platform truly lacks both, with generation commit preventing corruption
```

The IndexedDB coordinator row can be keyed by a bounded deterministic hash of canonical dataset identity:

```text
catalogLease:<datasetHash>
```

and contain:

```text
workerId
token
leaseUntil
expectedBaseGenerationId
```

Acquisition:

```text
open readwrite transaction
get current lease
if active other owner -> not acquired
else put my lease
transaction commits
```

Conflicting readwrite transactions on the same object store serialize across tabs, giving the fallback the atomicity the localStorage sequence lacks.

The crawler then periodically renews and performs a final lease/generation check before committing its active snapshot pointer.

---

# 8. Bounded opaque dataset identity

Do not use raw query/owner string as the storage/lock name.

Canonicalize:

```text
owner
type
id
verified committed native query
```

then derive an opaque bounded key with a deterministic browser-native hash or stable non-cryptographic collision-safe scheme appropriate to this local coordinator.

The mapping to readable dataset identity stays in live runtime/Diagnostics state, not persistent lock key names.

If hashing is asynchronous (e.g. SubtleCrypto), descriptor creation can retain readable identity while the lease layer computes the bounded key when needed.

Do not accidentally make correctness depend on a weak hash collision; either use a strong digest or store/verify canonical identity inside an IndexedDB coordinator record without exposing it in the key.

---

# 9. Generation commit still protects correctness if duplicate workers exist

Cross-tab network deduplication and data correctness should not be the same mechanism.

Even with a correct lock:

- a worker can stall;
- a lease can expire;
- another worker can take over;
- the old worker can wake late.

Therefore v3 final commit must also verify:

```text
I still own the allowed coordinator lease/generation transition
my base/current scope generation is compatible
my crawl boundary is verified
```

before changing `activeSnapshotKey`.

A stale crawler may leave an unreferenced immutable snapshot that GC later removes; it must not overwrite the active pointer.

This mirrors the successful deep-queue lease + CAS principle.

---

# 10. Tests required

## localStorage legacy fallback reproduction

Model the exact interleaving:

```text
A read empty
B read empty
A write/read -> acquired
B write/read -> acquired
```

This test should document why the old fallback is not exclusive.

## new IndexedDB lease

Two simultaneous readwrite acquisition transactions -> only one active lease owner.

## lost lease

Worker A loses lease to B during crawl -> A's final generation commit rejected.

## peer completion

Waiter accepts exact new verified generation ID, not only timestamp.

## identity privacy

Coordinator key does not contain raw owner/query text.

## crash cleanup

Expired coordinator leases become reclaimable and old inactive lease rows are GC'd.

## extreme query

Even a long verified query produces bounded coordinator key size.

---

# 11. Priority

This is part of the P0 data-generation/cross-tab phase, but should be implemented together with v3 rather than as another v0.15 localStorage lease patch.

Modern browsers will often take the Web Locks path, so the fallback race is not necessarily the cause of the analyzed real session. It is nevertheless a source-proven correctness gap in the promised cross-tab fallback and should not be carried into the new generation architecture.