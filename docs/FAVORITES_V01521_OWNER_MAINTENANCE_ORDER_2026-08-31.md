# Favorites v0.15.21 — Final owner-maintenance authority

Date: 2026-08-31

This is a sanitized release/audit record. It contains no private Favorites listing identifiers, titles, account/profile identifiers, query text, or raw diagnostics payloads.

## Bug found by the post-v0.15.20 audit

v0.15.19 established an owner-aware Favorites membership model:

- committed owner/scope `listingIds` are the membership baseline;
- a verified own-profile native-heart removal newer than the committed scope is an owner-specific overlay;
- the listing-global `isFavorite` field is only a compatibility summary and is not owner authority.

That release also replaced `favIndexGetActiveListings` with an implementation that derives owner-scoped maintenance from those rules.

However, the actual userscript load order later loads `src/61h-favorites-metadata-coordinator.js`. That historical module assigns `favIndexGetActiveListings` again. Its owner path first obtains the owner's scope IDs, then filters the resulting listing rows through:

`listing.isFavorite === true`

This silently reinstated the old global compatibility flag as final authority for deep-maintenance / manual Update-all selection.

Two wrong outcomes were therefore possible:

1. a listing committed in the current owner's authoritative scope could be omitted from metadata maintenance because an unrelated/legacy global summary was false;
2. a listing with a trusted owner-specific post-snapshot removal could still be included when another owner's active membership kept the global summary true.

## Fix architecture

`src/61ha-favorites-owner-maintenance-final.js` loads immediately after module 61h.

It reasserts **only** `favIndexGetActiveListings`:

- read current `listings` and `scopes`;
- delegate membership truth to the existing v0.15.19 `favOwnerActiveListings01519` semantic helper;
- return the resulting owner-aware maintenance set.

The boundary is deliberately read-only. It does not mutate IndexedDB, reorder the larger 61eb cache/snapshot/repair wrapper chain, or introduce a new membership model.

A full relocation of module 61eb after 61h was considered and rejected as unnecessarily broad: it would change where several unrelated merge/cache/repair wrappers enter the load chain merely to correct one overwritten symbol.

## Adversarial regression

`tests/favorites-v01521-owner-maintenance-order.test.mjs` uses fictional IDs only.

The test loads real source functions from 61eb and the historical 61h override, then constructs one owner scope containing two entries:

- one committed entry has global `isFavorite:false` but no trusted owner-removal provenance, so committed membership must keep it active;
- another has global `isFavorite:true` but carries a trusted owner-heart removal newer than the committed snapshot, so it must be excluded.

The historical 61h override returns the exact inverted/wrong set.

After the new final boundary loads, the same durable state returns the correct owner-aware set.

The test also asserts real userscript order:

`61eb < 61h < 61ha < 62`

## Behavior gate history

Initial behavior head:

`df318457b4a9ad113d4d23dd78deb29af81d87db`

The initial CI failure was test-harness-only: the VM loaded `favOwnerActiveListings01519` without two helper dependencies used by the real function.

The regression was strengthened rather than mocked around the error. It now extracts from the real v0.15.19 source:

- the real trusted removal-source constant;
- `favScopeCommittedAt01519`;
- `favTrustedOwnHeartRemoval01519`;
- `favOwnerMembershipScopes01519`;
- `favOwnerScopeBaselineActive01519`;
- `favOwnerActiveListings01519`.

Corrected behavior head:

`6aa22ce1440e11408151b5bcdf0a8d425d60d53e`

Behavior CI run:

`33337202062`

Result: repository checks, complete test suite, Chrome build, Firefox build, Diagnostics build, and all artifact uploads passed.

## Built-artifact final-symbol audit

The exact Chrome artifact produced from corrected behavior head `6aa22ce1...` was downloaded and its bundled `content.js` inspected.

Assignments to `favIndexGetActiveListings` appeared in this order:

1. historical `favIndexGetActiveListings01510`;
2. v0.15.19 `favIndexGetActiveListings01519`;
3. later stale metadata-coordinator `favIndexGetActiveListings0141`;
4. final v0.15.21 `favIndexGetActiveListings01521`.

There was no later assignment after `01521` in the actual built extension.

This is stronger evidence than checking a shortlist of likely source modules because it verifies the final concatenated load product used by the extension build.

## Release identity

The release candidate uses:

- package version `0.15.21`;
- userscript `@version 0.15.21`;
- all 82 userscript `@require` cache-busters at `v=0.15.21`.

The exact release head must pass CI before merge. After merge, a separate push-triggered `main` workflow must pass before v0.15.21 is considered closed.

## Follow-up audit candidates

The broader audit found two areas that remain separate from this release:

- the localStorage fallback for complete-catalogue ownership when `navigator.locks` is unavailable is check/write/check rather than an atomic browser lock. Immutable snapshot generation guards protect committed catalogue correctness, but two tabs can briefly duplicate catalogue work and violate the single-owner intent;
- historical DOM no-op churn has been heavily reduced by later compare-before-write layers (notably 87a, 97 and 103). `favRefreshRail0155()` still deserves caller-frequency profiling before changing it because it rebuilds the rail body; it should not be patched without proving it is on a hot path.

These are deliberately not mixed into the owner-maintenance correctness fix.
