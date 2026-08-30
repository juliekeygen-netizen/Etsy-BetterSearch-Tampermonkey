# Favorites v0.15.15 count-authority audit

Date: 2026-08-30

## Scope

This pass follows the v0.15.14 persistent-writer cleanup and revisits the v0.15.11 count-authority boundary. The goal is to preserve the important distinction between a genuine Etsy zero and missing/ambiguous evidence without allowing JavaScript type coercion or missing BetterSearch dataset identity to manufacture authority.

No private listing IDs, titles, account identifiers, query text, or diagnostic notes are recorded here.

## Source-proven issues

### Coercion-only raw counts

`src/104-favorites-v0157-filter-state-sync.js` read explicit raw `totalListings` / `itemCount` fields with `Number(props[field])`.

That makes several values unsafe at an authority boundary:

- JSON `null` becomes `0`;
- an empty or whitespace-only string becomes `0`;
- `false` becomes `0` and `true` becomes `1`;
- fractional values are finite and were then truncated.

A genuine numeric zero is authoritative Etsy evidence, but a value that becomes zero only through JavaScript coercion is not.

### Missing current dataset identity

The complete BetterSearch dataset fallback used:

`!currentKey || loadKey === currentKey`

This meant a complete cache/network total could receive `committed-cache` / `bettersearch-dataset` provenance even when the current dataset key was unavailable. Currentness should fail closed when identity cannot be proven.

## v0.15.15 resolution

Count semantics remain in the existing module-104 final state-semantics owner.

A new explicit-count parser accepts only:

- a non-negative safe integer number; or
- a non-empty decimal-digit string that converts to a non-negative safe integer.

It rejects null, undefined, blank strings, booleans, negative values, fractions, non-digit strings, non-finite values, and unsafe integers.

The raw evidence loop continues from an invalid `totalListings` field to `itemCount`, so one malformed field does not suppress a second valid explicit count. Genuine numeric zero and the text form `"0"` remain distinguishable from unknown.

The complete BetterSearch dataset fallback now requires all of:

- `favState.loadComplete === true`;
- a non-empty current dataset key;
- exact equality between current dataset key and `favState.loadKey`;
- an integral non-negative dataset total.

If that currentness proof is unavailable, count display falls back to the existing non-authoritative `records` evidence instead of claiming committed-current provenance.

## Regression coverage

The existing v0.15.11 count-authority harness now additionally verifies:

- `null`, empty/blank strings, booleans, negative values, fractions, and fractional/negative strings never become authoritative Etsy evidence;
- invalid `totalListings` falls through to valid `itemCount`;
- a valid `itemCount: 0` remains authoritative zero;
- decimal digit strings remain accepted for compatibility;
- an empty current dataset identity cannot receive `committed-cache` provenance;
- a mismatched complete dataset identity falls back to records evidence;
- all previous stale-cache, known-zero, query-generation, soft-navigation, owner mismatch, crawl-provenance, and complete-snapshot tests remain intact.

The behavior-only exact head passed repository checks, the full test suite, Chrome, Firefox, Diagnostics Chrome, and all artifact uploads before release version/cache-buster promotion.

## Downstream publisher audit

The catalogue refresh path normalizes `expectedTotal` to a numeric value before calling the state publisher, and crawl progress propagates that normalized numeric value. No separate live null/blank coercion path was found at the internal `expectedTotalKnown` publisher boundary, so this release does not broaden scope into that code.

## Invariants retained

- Query-aligned current Etsy count evidence outranks BetterSearch cache/dataset size only when explicit authority is known.
- Genuine authoritative Etsy zero remains distinct from unknown.
- The crawler's historical numeric compatibility API may still return numeric zero for unknown, while the separate known bit carries authority.
- Known-zero complete-snapshot validation remains enforced before persistence.
- Native-search query generations and soft-navigation scope stamps continue to invalidate stale SSR count evidence.
- No render, grid/pager ownership, filter-state, durable membership, or cross-tab lease behavior is changed by this pass.
