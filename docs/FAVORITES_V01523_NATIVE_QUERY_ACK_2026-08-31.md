# BetterSearch v0.15.23 — native Favorites query acknowledgement

**Date:** 2026-08-31  
**Status:** behavior-gate implementation; release promotion waits for exact-head CI and post-green audit.

## Problem

The v0.13.1 native Favorites search state machine correctly kept ordinary typing as draft-only state. A submitted query became committed when either:

1. the native listing-ID fingerprint changed; or
2. 850 ms elapsed.

The second path was a runtime settle fallback, but v0.15.10 later treated the final v0.13.1 committed value as durable `favorites-search-commit` provenance.

That collapsed two different facts into one:

```text
runtime: the UI has waited long enough to continue

durable: Etsy positively acknowledged this exact server-side query dataset
```

A timeout therefore could make submitted text eligible to become an IndexedDB query-scope identity even when URL/SSR/native-grid evidence had not changed.

The historical database evidence already showed transient and unusually long query scopes, so durable query identity must remain fail-closed.

## v0.15.23 boundary

`src/99a-favorites-native-query-ack.js` loads after module 99 and before modules 100/101:

```text
99  v0.13.1 native query state machine
99a v0.15.23 acknowledgement boundary
100 native All/search-clear parity
101 late smoke/count-generation wrapper
```

Module 101 therefore still wraps the final query-settle function. It increments query/count generation only when the wrapped function returns boolean `true`; v0.15.23 can use a truthy non-boolean `"pending"` sentinel to block observation without falsely advancing generation.

## Runtime state and durable trust are separate

A non-empty submitted query can still use the legacy 850 ms runtime fallback so the UI does not deadlock if Etsy performs a client-side search without changing URL/SSR state.

But a timeout-only query is marked:

```text
queryCommitSource = favorites-search-unverified
queryCommitVerified = false
```

The existing v0.15.10 persistence boundary therefore rejects it from durable query-scope writes.

Positive acknowledgement upgrades the exact query to the existing trusted:

```text
queryCommitSource = favorites-search-commit
queryCommitVerified = true
```

Route and SSR provenance remain independently trusted exactly as before.

## Positive acknowledgement

For the exact submitted value, acknowledgement can come from:

### 1. Route/SSR evidence that changes after submit

The module snapshots route/SSR query evidence at submission. A later route `search_query`, route `q`, or SSR `props.query` value counts only when:

- the evidence changed after submission; and
- its normalized value exactly matches the submitted query.

An unchanged old SSR value is not reclassified as a fresh acknowledgement.

### 2. Native grid response transition

The module snapshots Etsy's native grid object and listing-ID fingerprint at submission. Positive acknowledgement is recognized when:

- the native grid node is replaced; or
- its listing-ID fingerprint changes.

The comparison intentionally does **not** require the new fingerprint to be non-empty. Therefore:

```text
[A,B] -> []
```

is a valid zero-result search response rather than something that must wait for the timer.

When available, `favNativeMainGrid0141()` is used instead of BetterSearch's locally owned grid, so BetterSearch render ownership changes cannot manufacture a false Etsy acknowledgement.

## Pending observation fence

Before acknowledgement and before the timeout, the final settle function returns the truthy non-boolean sentinel:

```text
"pending"
```

The existing current-page observation caller already returns when settle is truthy. This prevents a transitioning Etsy grid from being indexed under the previous query scope.

Module 101 only increments query generation for strict boolean `true`, so `"pending"` does not create a false count/query generation.

## Canonical All clear is stricter

An empty query is the canonical no-query Favorites scope and is trusted elsewhere by definition. Allowing timer-only promotion from a searched dataset to empty query would therefore be dangerous: a failed Clear could cause searched membership to be committed as canonical All.

v0.15.23 therefore never timeout-promotes an unacknowledged empty query.

A clear-to-All stays pending until positive native-grid/route/SSR acknowledgement appears.

## Bounded late acknowledgement

A timeout-promoted non-empty query remains runtime-only/unverified, but Etsy may respond slightly later.

For up to 5 seconds after submission, a later native grid transition may upgrade that exact query to durable verified state.

After that window, unrelated grid/pagination changes cannot retroactively verify the old timeout query.

Exact changed route/SSR evidence may still prove it later because route/SSR is explicit server/query identity rather than an ambiguous grid mutation.

## Non-goals

This release does not redesign Etsy's native search UI, route format, catalogue crawler, or query-scope retention policy.

It does not make live input text durable.

It does not change Strict/Multi local-query behavior.

It does not add any IndexedDB writes itself; it only supplies stronger provenance to the existing v0.15.10 storage boundary.

## Regression coverage

`tests/favorites-v01523-native-query-ack.test.mjs` covers:

1. 99 → 99a → 100 → 101 load order;
2. typing remains draft-only;
3. unchanged submitted grid remains pending before timeout;
4. timeout-only non-empty runtime promotion is durable-unverified;
5. changed listing IDs acknowledge before timeout;
6. non-empty → zero-result grid acknowledges before timeout;
7. native grid replacement with identical IDs acknowledges;
8. unacknowledged clear-to-All cannot timeout-promote;
9. acknowledged clear-to-All commits empty query;
10. route/SSR evidence must change after submit to be fresh acknowledgement;
11. timeout query can receive bounded late native-grid acknowledgement;
12. grid changes after the late window cannot verify an old timeout query;
13. exact changed route evidence can still verify later;
14. the module itself performs no persistence writes.

## Release discipline

The behavior gate remains package/userscript **0.15.22**. After exact-head behavior CI is green and the built artifact proves the intended final symbol chain, promote package/userscript/cachebusters together to **0.15.23**, update only stale release-identity assertions, rerun exact release CI, audit the release artifact, merge only that exact head, and independently verify push-triggered `main` CI before declaring v0.15.23 closed.
