# Favorites identity / API request-boundary audit — 2026-08-30

**Status:** additional source audit upstream of the owner/query/storage findings.

## Executive summary

The current Favorites network layer assumes its scope descriptor is already valid. That assumption is not consistently enforced.

Important source-proven weaknesses:

1. `favProps()` returns the first qualifying `text/props` script in document order and has no explicit current-island/route generation selection.
2. Owner extraction is rejected when a count cannot be derived, even if owner ID itself is present.
3. `favApiUrlForScope()` accepts an empty owner and constructs owner-required URLs anyway.
4. `favFetchJson()` retries all non-2xx HTTP responses, including deterministic 400/401/403/404/410 cases.
5. The historical malformed ownerless collection request therefore had both a construction path and a generic retry path.
6. `favProps()` may synthesize `totalListings` from the current `listings.length`; if only one page is embedded, this can turn a page-size count into a scope-total-looking field.

Identity validation and retry classification should move into explicit canonical boundaries rather than being scattered among callers.

---

# 1. `favProps()` chooses the first qualifying props script

Current logic iterates:

```text
document.querySelectorAll('script[type="text/props"]')
```

in document order and returns the first script that:

- contains `"profileOwnerUserId"` text;
- parses as JSON;
- has a profile owner;
- yields a finite total count after fallback derivation.

There is no explicit preference for:

- the props script nearest the current Favorites island;
- the current listing/header container;
- the current profile route generation;
- a script whose owner/query/scope agrees with other current native evidence;
- the newest/replaced island.

If Etsy ever leaves an older matching props script connected while a newer island is mounting, BetterSearch can select a stale identity/count/query source merely because it appears first.

The large Diagnostics capture proved Etsy's page is server-rendered/hydrated through component islands, but this audit does **not** claim that two conflicting owner props scripts were observed in that specific recording. It is a current source ambiguity that the future identity adapter should remove.

## Required native-props adapter

Discover candidates and score/validate them against current route/island context rather than returning the first match.

Example result:

```text
NativeFavoritesIdentityEvidence {
  ownerId
  viewerId?
  profileLogin?
  query?
  total?
  sourceNode / island identity
  routeGeneration
  observedAt
  confidence/provenance
}
```

Diagnostics should record candidate count and chosen source generation without dumping private props payloads.

---

# 2. Count fallback can turn current page length into `totalListings`

If parsed props do not expose finite `totalListings`, current `favProps()` tries:

```text
itemCount
else listings.length
```

and writes the derived number into `data.totalListings`.

`listings.length` is often a current-page payload count, not necessarily a full Favorites-scope total.

Therefore a 20-card embedded native page can potentially produce:

```text
totalListings = 20
```

in BetterSearch's normalized props object even when the full scope is much larger.

This synthesized field can then be consumed by:

- header count fallback;
- catalogue `expectedTotal` hint/progress;
- Settings count logic;
- any future code treating `props.totalListings` as server authoritative.

## Required count provenance

Never normalize unlike meanings into the same property.

Instead expose:

```text
serverTotalListings?: exact native total
itemCount?: native field with documented context
embeddedListingsCount: listings.length
```

and let the count view model decide how each may be used.

A page-length fallback may be useful as a lower bound/current-page count, but must not masquerade as an exact full total.

---

# 3. Owner identity must be returned independently from count evidence

As documented in audit chunk 3, current `favProps()` refuses the entire object unless one of those count paths yields a finite number.

Thus the count normalization bug and owner-loss bug are coupled:

```text
no usable count
-> no props object
-> no owner
```

Split identity/count/presentation adapters.

---

# 4. `favApiUrlForScope()` has no owner-required validation

Current URL builder:

```text
collection:
  /api/v3/ajax/bespoke/member/users/${encodeURIComponent(scope.owner)}/collections/${scope.id}/...

items:
  /api/v3/ajax/member/users/${encodeURIComponent(scope.owner)}/favorites/landing-listings
```

An empty string is syntactically accepted.

For collections this produces the historical shape:

```text
.../member/users//collections/...
```

The builder does not throw or return null.

The higher-level `favSyncScope()` wrapper rejects missing owner, but interactive catalogue/current-data paths can call the catalogue service below that wrapper.

## Boundary rule

The canonical descriptor/network adapter should validate before any URL exists:

```text
if type requires owner and ownerGeneration unresolved:
    return/throw typed identity-unresolved error
```

Do not construct an invalid URL and rely on the server to reject it.

This validation should also exist at storage persistence boundaries.

---

# 5. Deterministic HTTP errors are retried generically — SOURCE-PROVEN BUG

`favFetchJson()` currently treats every non-OK response as an error and then executes the same retry loop unless the request was aborted.

Therefore these are all retried up to the configured attempt count:

```text
400 bad request
401 authentication
403 forbidden
404 not found
410 gone
429 too many requests
5xx server errors
```

Only `Retry-After` changes delay behavior; it does not classify retryability.

For the historical malformed ownerless collection path, a deterministic 404 can therefore be retried several times rather than failing immediately and surfacing the identity error.

## Retry policy

Classify errors.

Likely retryable categories:

```text
network/transport failure
408 request timeout
425 too early (if encountered)
429 rate limit, honoring Retry-After
selected 5xx transient server errors
```

Likely non-retryable without a higher-level auth/identity transition:

```text
400 malformed request
401/403 current auth/permission state
404/410 missing deterministic resource
```

Exact Etsy-specific exceptions can be added only from evidence.

A typed error should expose:

```text
status
retryable
retryAfterMs
requestKind
scope identity generation
```

The retry loop then checks `error.retryable !== false`.

---

# 6. Visibility wait can unnecessarily delay deterministic failure

The retry path calls `favWaitUntilVisible(signal)` before sleeping/backoff.

This is good for avoiding background-tab retry storms for transient failures.

But for a deterministic 404/400 it means the operation can wait for tab visibility merely to retry an invalid request that should have failed immediately.

Retryability classification should happen before visibility/backoff logic.

---

# 7. Request scope should carry generation/provenance

Today URL builder receives a plain descriptor.

Future network requests should be made from a canonical validated object:

```text
ValidatedScopeRequest {
  ownerId
  ownerGeneration
  scopeType
  scopeId
  verifiedCommittedQuery
  queryGeneration
  datasetGeneration/requestId
}
```

Response application verifies that generation is still relevant before mutating live/persistent state.

The metadata coordinator already performs dataset-key checks around awaited auxiliary requests; the catalogue/network layer should use the stronger generation contract everywhere.

---

# 8. Group endpoint deserves separate identity research

The generated-group API path differs from owner-path All/collection endpoints:

```text
/api/v3/ajax/member/users/favorites/listing-groups?grouping_id=...
```

The URL itself does not carry the profile owner ID.

Do not infer from this audit whether Etsy supports generated-group browsing for arbitrary profile owners or whether it is viewer-specific. That needs controlled real-browser/API evidence.

Before making owner latching stricter, explicitly classify which scope kinds require an owner in the request URL and which still require owner identity for **cache/storage separation** even if the server endpoint omits it.

A group scope should still be keyed to canonical profile owner generation in BetterSearch so records from two profiles cannot collide simply because the server URL shape is ownerless.

---

# 9. Response JSON shape acceptance is deliberately broad

`favApiListings()` accepts:

- raw arrays;
- arrays of objects with `.listings`;
- `.listings`;
- `.results`;
- `.groups[].listings`.

This compatibility is useful, but completeness verification currently largely reasons from the resulting listing array length/IDs.

For future native-query/server-delegation experiments, preserve raw response/request classification long enough to understand server totals/boundaries rather than immediately flattening away potentially useful response metadata.

Do not change the production parser merely for diagnostics; add a typed adapter when server delegation research begins.

---

# 10. Tests required

## Props/identity

- owner-bearing props with no count still produce owner identity;
- page `listings.length=20` is exposed as page count, not exact `totalListings`;
- multiple candidate props scripts -> adapter selects the current route/island evidence, not simply first node;
- stale old profile candidate cannot override current profile generation;
- count source provenance retained.

## URL validation

- empty owner + items -> no request constructed;
- empty owner + collection -> no `users//collections` URL constructed;
- valid owner paths encoded correctly;
- group endpoint classified separately while storage scope still owner-separated.

## Retry

- 400/404/410 fail once;
- 429 honors Retry-After and retries according to policy;
- transient 5xx retries boundedly;
- network exception retries boundedly;
- deterministic error does not wait for visibility before returning;
- AbortError never retries.

## Generation

- route/owner changes during request -> stale response discarded;
- owner/query generation recorded in diagnostic request event.

---

# 11. Priority

Owner/count props split and owner-required URL validation belong in **Data Release A** before the v3 schema migration writes new authoritative state.

HTTP retry classification is a small bounded correctness/performance fix that can land in the same release.

Multiple-props current-island selection may require a short Diagnostics/browser experiment if the exact Etsy island structure cannot be proven from static DOM fixtures; still, the canonical identity adapter should make room for it rather than keeping the “first qualifying script” rule.