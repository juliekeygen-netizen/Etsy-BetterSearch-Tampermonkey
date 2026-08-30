# BetterSearch v0.15.19 — multi-owner Favorites membership boundary

Date: 2026-08-30

Status: release audit record for the v0.15.19 candidate.

This document records the sanitized source-level correctness changes in the v0.15.19 release. It does not include private listing IDs, profile/account IDs, titles, raw Diagnostics notes, or private query text.

## 1. Problem resolved

The legacy Favorites index mixed two different concepts:

```text
listing metadata/history
profile-owner Favorites membership
```

Owner-specific membership existed under `listing.favoriteScopes`, but a global `listing.isFavorite` boolean was also used as an authority gate. A complete refresh for profile owner A could therefore deactivate owner B's membership for the same listing, and cache/statistics paths could later hide owner B because the global boolean was false.

The required invariant is now:

> Listing metadata is global by listing ID. Favorites membership is owner/scope-specific. Viewer-personal heart state is separate from another profile owner's membership.

## 2. New early semantic owner

`src/61eb-favorites-multi-owner-membership.js` loads in the data chain as:

```text
61e cache bootstrap
-> 61eb owner-specific membership boundary
-> 61ea immutable snapshot writer
```

This placement is intentional. The existing immutable snapshot writer therefore calls the corrected scope-completion semantics directly rather than needing another late wrapper.

## 3. Complete scope replacement is owner/scope bounded

A verified complete replacement retires only the exact missing scope membership.

For the same listing stored under owners A and B:

```text
owner A complete replacement no longer contains listing
-> owner A exact membership becomes inactive
-> owner B membership remains unchanged
```

The compatibility `listing.isFavorite` summary stays positive while any owner membership remains active.

## 4. Global favorite timestamps no longer block another owner

The historical listing merge could suppress a positive Favorites observation when the row carried a newer global `unfavoritedAt`.

v0.15.19 re-applies incoming membership by exact scope after the historical metadata merge. Only newer removal evidence for that same exact scope can reject a stale reactivation.

Therefore:

```text
owner A removal evidence
!= owner B removal evidence
```

A later owner-B observation cannot accidentally revive owner A, and owner A cannot suppress owner B.

## 5. Immutable committed membership remains the baseline

Complete scope `listingIds` remain immutable until a verified replacement generation commits.

Cache materialization no longer lets a legacy global `isFavorite=false` or an untrusted contradictory listing-side tombstone veto an ID that is present in the committed scope baseline.

This is deliberately conservative because historical v2 listing-side membership is known to have contained mixed/contradictory state.

## 6. Verified own-profile heart removal is a bounded overlay

A confirmed native heart removal on the viewer's own Favorites profile is newer owner-specific evidence and should not wait for a full catalogue refresh before disappearing locally.

v0.15.19 records that evidence only on the viewer's owner memberships with:

```text
active: false
removedAt: <observation time>
removalSource: viewer-own-native-heart
```

The committed scope snapshot itself is not edited.

A committed cached ID is suppressed only when the exact scope has this trusted removal source and its `removedAt` is newer than the committed scope timestamp.

A newer positive exact-scope observation clears the overlay. A later committed generation also supersedes an older overlay.

Legacy inactive rows without this trusted provenance do not erase committed membership.

## 7. Pre-All fallback semantics

v0.15.10 intentionally uses the complete canonical no-query All scope as owner maintenance authority when it exists.

v0.15.19 preserves that rule.

Before a canonical All snapshot exists, maintenance falls back to retained no-query owner scopes. Each fallback scope is evaluated against its own trusted owner-heart removal overlay. A listing remains active if any retained fallback scope still supplies unsuperseded membership.

This prevents a confirmed own-profile removal from being re-queued for deep work merely because the user first entered a collection before a complete All snapshot existed.

## 8. Public-profile heart state is not profile membership

`src/63-favorites-runtime.js` now prevents viewer-personal heart toggles on another profile's Favorites page from removing that profile's BetterSearch catalogue record.

Public-profile behavior:

```text
viewer toggles their own heart
-> Etsy personal heart state may change
-> other profile's BetterSearch membership/dataset/count do not change
-> durable profile membership does not change
```

Own-profile behavior remains:

```text
confirmed native unfavorite
-> local owner catalogue removes listing
-> owner-specific durable overlay is recorded
```

Transplanted/local cards rerender only when profile membership was actually removed, avoiding a public-profile personal-heart toggle being overwritten by an unnecessary catalogue rebuild.

## 9. Direct own-profile mutation is atomic

The old direct-unfavorite path performed a readonly listing read and a later whole-row write.

v0.15.19 performs the read, owner-specific membership mutation, and write inside one IndexedDB `readwrite` transaction.

This prevents that direct action from erasing unrelated listing fields written by another tab between a stale read and later put.

## 10. Compatibility repair

A one-time logical repair:

- removes stale `removedAt`/removal provenance from memberships already marked active;
- restores the compatibility global summary to positive when any owner membership is active;
- retains listing metadata/history;
- does not reconstruct committed scope membership from listing-side state;
- does not publish or infer private account data.

## 11. Regression coverage

Executable tests cover:

- owner A removal while owner B remains active;
- cross-owner positive observation after global negative history;
- stale same-scope observation blocked by newer exact removal;
- committed cache materialization despite legacy global false;
- owner-scoped statistics/maintenance independent of global `isFavorite`;
- exact-owner direct removal preserving another owner;
- direct read/merge/write in one readwrite transaction;
- public-profile durable heart mutation fail-closed;
- public-profile live dataset/count preservation;
- trusted post-snapshot own-heart overlay;
- legacy contradictory inactive row ignored against committed baseline;
- older overlay superseded by newer committed snapshot;
- pre-All no-query fallback behavior;
- later positive fallback-scope evidence keeping owner membership active;
- exact positive observation clearing trusted removal provenance;
- module load ordering.

The final behavior-only head before release promotion was:

`c86c1c60d8248271ae590ca7becc5969be80f070`

It passed repository checks, the complete Node test suite, Chrome build, Firefox build, Diagnostics Chrome build, and all artifact uploads before the version bump.

## 12. Explicitly deferred atomic-write findings

The post-green audit reconfirmed separate stale whole-row write risks. They are not hidden by this release and should be the next bounded data-correctness work.

### Deep listing metadata

The current deep observation path still performs a readonly listing/shop read, builds a full replacement row, and later writes it. A concurrent newer membership/metadata mutation can therefore be overwritten by the stale deep row.

### Availability updates

The current availability update path still performs a readonly listing read followed by a later whole-row write, with the same stale-overwrite risk.

### Generic deep queue enqueue/update

Lease-owned claim/heartbeat/terminal transitions are already atomic/CAS-protected, but ordinary enqueue and generic update paths can still fall back to historical split read/write behavior and overwrite a newer queue lease/state.

Recommended next release invariant:

> Every mutable listing/availability/queue change reads the latest row and merges the intended field/domain change inside the same short IndexedDB readwrite transaction.

Required next interleaving tests include:

```text
deep response A + own-profile unfavorite B
availability update A + newer metadata B
enqueue A + claim B
generic update A + newer worker lease B
```

These are deliberately deferred rather than mixed into the multi-owner membership release.
