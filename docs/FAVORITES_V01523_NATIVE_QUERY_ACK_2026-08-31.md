# BetterSearch v0.15.23 — exact native Favorites query acknowledgement

**Date:** 2026-08-31  
**Status:** final behavior design; behavior gate green on `11223d37fd300cda2ef7ea577d4e87b1a7bf8b2e` / CI `33379434004`. Release promotion and exact release CI still required.

## Problem

Module 99's v0.13.1 native Favorites search state machine kept typing draft-only, but a submitted query became committed when either the native listing fingerprint changed or 850 ms elapsed.

That timer was originally a UI-settle fallback. After v0.15.10, however, the resulting committed value was classified as trusted:

```text
queryCommitSource = favorites-search-commit
queryCommitVerified = true
```

So elapsed time alone could manufacture durable query identity even if Etsy never acknowledged the submitted search.

There was a second race: module 99 committed the current `nativePendingQuery0140` value, not a snapshot of the submitted value. Therefore:

```text
submit A
then type B before A settles
A's response/grid transition arrives
```

could commit B even though B had never been submitted.

Both violate the project rule that arbitrary native query scopes become durable only after positive query-specific evidence.

## Final v0.15.23 boundary

`src/99a-favorites-native-query-ack.js` loads directly after module 99 and before module 100:

```text
99   legacy native query state machine
99a  exact v0.15.23 acknowledgement boundary
100  native All/search-clear parity
...
101  later smoke/count-generation wrapper
```

The 0.15.22 catalogue coordinator is not modified or wrapped by this release.

## Exact submitted value

Every submit now snapshots its own immutable submission identity:

- submit sequence;
- exact submitted query value;
- Favorites scope identity;
- submit wall-clock time;
- `performance.now()` boundary;
- native grid object and listing-ID fingerprint at submit time;
- explicit route/SSR query evidence at submit time.

The live draft remains independent. If the user submits A and then types B, acknowledgement for A can commit only A. B stays a dirty, unsubmitted draft.

A newer submit supersedes the older submission, disconnects its resource observer, and gets a new sequence. A late A response therefore cannot acknowledge B.

## Positive acknowledgement

A submitted query commits only after evidence tied to that exact submission.

### 1. Explicit route/SSR acknowledgement

Route `search_query`, route `q`, or SSR `props.query` can acknowledge the submit only when the evidence changed after submission and exactly equals the submitted value.

Unchanged stale SSR/query evidence is not treated as a new acknowledgement.

### 2. Exact Etsy Favorites resource acknowledgement

99a watches browser `resource` timing entries and also scans the buffered resource timeline. A resource can belong to the submission only when all of the following are true:

- it started after the submit's performance boundary;
- it is same-origin Etsy;
- it matches the exact Favorites endpoint for the submitted owner/scope;
- it is page zero (`offset=0`);
- its `query` parameter exactly matches the snapshotted submitted value.

Recognized endpoints are the native Favorites items and collection landing-listings endpoints used by the existing catalogue service.

For a non-empty query, a known successful `responseStatus` in the 2xx/3xx range is sufficient server acknowledgement.

A known 4xx/5xx response never commits the query.

### 3. Browsers without `PerformanceResourceTiming.responseStatus`

`responseStatus` is not available uniformly across all supported browsers. When it is unavailable, the exact matching resource must also show that a response actually started (`responseStart > 0`) and Etsy's native result grid must settle away from its submit-time state.

This prevents a timing entry with no confirmed response from acknowledging a changed grid.

Zero-result transitions are supported: a real `[A,B] -> []` native settlement is valid when paired with the exact completed resource.

## Clear-to-All is stricter

An empty query maps to canonical All. Misclassifying a failed Clear is therefore especially dangerous because searched membership could otherwise be written as canonical All.

Even a known successful no-query resource is not enough by itself. Clear-to-All also requires native grid settlement (or explicit changed route/SSR evidence) before committed identity becomes empty.

## Timer is no longer authority

The legacy 180/420/850 ms timers remain useful only for scheduling rechecks.

They cannot change `favState.nativeCommittedQuery0140`.

99a has a bounded 5-second acknowledgement deadline, but the deadline itself also cannot manufacture a commit.

### Unchanged grid at deadline

If no query-specific acknowledgement arrives and the native grid is still the exact submit-time grid, the submission can be abandoned safely:

- previous committed query remains authoritative;
- submitted text remains a dirty draft;
- no sync/query generation is created.

### Changed but unverified grid at deadline

If Etsy's native grid changed but 99a still cannot prove which submitted query produced it, the transition remains unresolved.

The settle function continues returning the truthy non-boolean sentinel:

```text
pending
```

Module 99's current-page observation boundary already does:

```js
if (favMaybeCommitSubmittedNativeQuery0140()) return;
```

so `pending` blocks native-page capture and IndexedDB observation. This is deliberate: temporarily refusing to index an unprovable dataset is safer than writing changed cards under the previous committed query scope.

A later exact buffered resource or changed explicit route/SSR evidence can still acknowledge that submission. A new submit may also supersede it.

## Query generation semantics

Later v0.15.11 wraps the final settle function only to advance query/count generation when committed query identity truly changes:

```text
changed === true OR before !== after
```

The `pending` sentinel therefore does not advance query generation.

## Durable provenance

v0.15.10 route/SSR provenance remains unchanged.

99a narrows only dynamic `favorites-search-commit` provenance. A non-empty client-side committed value is trusted only when:

- the exact current committed value matches the verified submission value; and
- 99a's verification flag is true.

Otherwise it reports:

```text
queryCommitSource = favorites-search-unverified
queryCommitVerified = false
```

The existing persistence boundary then fails closed.

## Regression coverage

`tests/favorites-v01523-native-query-ack.test.mjs` covers:

1. final 99 -> 99a -> 100 load order;
2. source proof of the historical 850 ms promotion bug;
3. typing/timer alone cannot commit;
4. unchanged-grid deadline safely abandons the submission;
5. changed-but-unverified grid remains blocked after deadline;
6. exact successful resource acknowledgement;
7. mismatched-query resource rejection;
8. failed exact response plus changed grid stays unresolved;
9. unknown `responseStatus` requires `responseStart` and native settlement;
10. no-`responseStart` timing entry cannot acknowledge;
11. submit A -> type B commits only A;
12. submit A -> submit B rejects late A response;
13. superseded resource observer is disconnected;
14. route/SSR evidence must change and exactly match;
15. clear-to-All requires native settlement;
16. zero-result acknowledgement;
17. identical verified re-submit does not manufacture another generation;
18. pre-submit resource entries are rejected;
19. Strict/Multi bypass native commit logic;
20. 99a remains acknowledgement-only and does not override the catalogue coordinator/storage writer.

## Post-green built-artifact audit

Behavior head:

```text
11223d37fd300cda2ef7ea577d4e87b1a7bf8b2e
```

CI:

```text
33379434004
```

Repository checks, full tests, Chrome, Firefox, Diagnostics, and all artifact uploads passed.

The exact Chrome artifact confirms:

- `favMarkNativeQuerySubmitted0140` final acknowledgement implementation is 01523;
- `favMaybeCommitSubmittedNativeQuery0140` reaches 01523 before the later 01511 generation wrapper;
- `favCommittedNativeQueryProvenance01510` ends at 01523;
- the module99 observation boundary still returns on any truthy settle result;
- `favCatalogWithCrossTabLease0141` still ends at 01522.

No unrelated production ownership boundary was moved.

## Release discipline

The behavior gate intentionally remains package/userscript **0.15.22**. Promotion must now:

1. bump package/userscript to **0.15.23**;
2. align every userscript `@require` cachebuster to 0.15.23;
3. update only stale release-identity assertions while preserving their behavioral invariants;
4. run exact release-head CI;
5. audit the exact release Chrome artifact again;
6. merge PR #64 only at that exact green head;
7. independently verify push-triggered `main` CI before calling v0.15.23 closed.
