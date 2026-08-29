# Favorites metadata context-generation audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `966a8922f3eff3a15f91c2c7d5601f1b6358d869`.

This document audits auxiliary metadata requests whose meaning depends on destination/context rather than only Favorites dataset identity.

## 1. The coordinator captures a destination context at request start

`favMetadataFetchAux0141()` captures:

```text
datasetKey = favDatasetKey()
destination = favMetadataDestination0141()
scope = favIndexCurrentScope()
requestKey = datasetKey + destination.contextKey + requirements
```

This is good as an in-flight deduplication key: requests for different destination contexts do not intentionally share one promise.

The request sends destination-sensitive values such as country/postal information to Etsy's additional-listing-info endpoint.

## 2. The stale-response check verifies only the Favorites dataset

Before a batch request and again after the awaited response, the current code verifies:

```text
isFavoritesPage()
favDatasetKey() === captured datasetKey
```

It does not verify:

```text
favMetadataDestination0141().contextKey === captured destination.contextKey
```

So a destination/context change that does not also change the Favorites dataset can leave an old request eligible to apply.

## 3. Concrete out-of-order race

A valid sequence is:

```text
Current dataset D
Destination context A
request A starts

user changes destination to context B
request B starts and finishes
records now contain B shipping values

old request A finishes later
Favorites dataset is still D
post-await dataset check passes
A values are applied to live records
A values are persisted
```

The old response is semantically stale even though it belongs to the same Favorites dataset.

## 4. Response-time timestamps can make the old context look newer

`favMetadataApplyAux0141()` receives `observedAt = Date.now()` after the response arrives.

The field merge layer generally treats newer same-source observations as fresher.

Therefore an older request can arrive later and receive a later observation timestamp than the newer-context request.

The database then has provenance/context information that says the field belongs to context A, but its timestamp can outrank the B observation simply because A was slower.

This reinforces a broader rule:

> freshness order must be evaluated inside the semantic context/generation that produced the value; wall-clock response completion alone is not a generation token.

## 5. This can affect visible filtering/sorting, not only cache efficiency

The metadata state helpers can notice a context-key mismatch and count the field unresolved for the current destination.

However, the live filter/sort engine consumes record values such as `record.shipping`, returns/exchanges and related fields directly.

`favMetadataCoverage0141()` records both `unresolved` and `pending`, but its current `complete` value is driven by whether deep jobs were queued:

```text
pending = deepQueued
complete = !deepQueued
```

An auxiliary field may therefore be unresolved/stale while there is no deep pending job.

The reapply path does not use unresolved auxiliary values as a hard render barrier in the same way it treats pending deep work.

Consequently the late old-context response can temporarily influence:

- shipping sort;
- maximum shipping filter;
- free-shipping fallback state;
- destination-sensitive delivery presentation;
- any future destination-sensitive capability wired similarly.

This is a source-proven generation gap. Whether a particular Etsy destination control currently allows this exact in-document sequence should be confirmed with a browser fixture/Diagnostics capture before assigning frequency.

## 6. Required operation token

Every destination-sensitive auxiliary operation should carry a token at least equivalent to:

```text
catalogueGenerationId
owner/scope identity
committed query generation
destinationGenerationId or destinationContextKey
requirements generation/request ID
```

After every await and before mutating live or durable state:

```text
if token is no longer current:
    discard response for live/persistence purposes
```

The HTTP response may still be useful for metrics/diagnostics, but it is not allowed to mutate the active generation.

## 7. Prefer generation counters over repeated string comparison

A context key is useful data, but a monotonic local generation makes race handling clearer.

Example:

```text
metadataContextGeneration = 41
request captures 41

destination changes
metadataContextGeneration = 42

request 41 returns
41 !== 42
-> discard
```

The generation record can still include the normalized context key for debugging/cache lookup.

## 8. Durable metadata should keep context-specific provenance

For fields whose value changes by destination, a single mutable field slot is intrinsically lossy if BetterSearch wants to reuse metadata for multiple destinations.

Two acceptable designs are:

### Minimal current-destination cache

Store one latest context-bound value and make context mismatch unresolved. Stale generations are never allowed to overwrite the active context.

### Context-keyed metadata cache

Store bounded values by normalized destination key, for example:

```text
shippingByContext[opaqueContextKey]
```

with TTL/LRU limits.

Do not store unbounded raw postal/location strings in public coordination names or indexes.

The project does not need the second design merely to fix the race; it is an optimization decision.

## 9. Coverage semantics need clearer naming

Current metadata coverage has three concepts that should not be collapsed:

```text
all required values currently known for this context
work currently pending
terminal/unknown values that are unresolved
```

A structure like this is less ambiguous:

```text
resolvedCount
unresolvedCount
pendingCount
renderSafeForPositiveFilter
contextGeneration
```

`complete` should not mean only "no deep job was queued" if callers can interpret it as "all required metadata is current."

## 10. Required tests

Add executable races:

```text
A request starts
context changes to B
B completes
A completes late
-> A cannot mutate live records or durable B context

A request starts
route changes dataset
A completes
-> discarded

context A and B requests overlap
-> dedupe only within identical semantic token

stale auxiliary field exists with no deep pending work
-> current-context shipping filter/sort cannot consume it as authoritative
```

Also test a context change while local enhanced results are visible so the renderer does not display a stale-context sort/filter result between generations.

## 11. Priority

Treat this as P1 correctness work closely coupled to query/catalogue render generations. It does not need to block the first v3 schema migration, but the new generation architecture should leave an explicit place for metadata-context generation rather than introducing another timeout/string-only patch later.