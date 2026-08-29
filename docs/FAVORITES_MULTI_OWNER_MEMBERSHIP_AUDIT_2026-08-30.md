# Favorites multi-owner membership audit — 2026-08-30

**Status:** additional source audit discovered while designing IndexedDB v3. This is a data-model correctness issue, not evidence that a specific second profile was present in the analyzed private database.

## Executive finding

The current database stores owner-specific scope membership in `favoriteScopes`, but also stores one **global** listing-level boolean:

```text
listing.isFavorite
```

Every Favorites-page observation sets that global boolean to true, regardless of which profile owner the observed Favorites scope belongs to.

A complete no-query `items` scope is marked `authoritativeFavoriteScope=true` for **any** profile owner. When a listing disappears from that scope, the current completion path can call the global unfavorite helper, which:

```text
isFavorite = false
unfavoritedAt = now
marks every favoriteScopes entry inactive
```

Therefore a membership change in profile A can invalidate profile B's stored membership for the same listing.

This is incompatible with a database that can index more than one Etsy profile's public Favorites.

---

# 1. Every observed profile Favorites record sets global `isFavorite=true`

`favIndexPatchFromRecord(record, scope, ...)` emits:

```text
isFavorite: true
favoriteScopes: {
  [scopeKey]: { active:true, lastSeenAt }
}
```

The owner is encoded in `scopeKey`, but `isFavorite` itself is not owner-keyed.

The normal page detector supports `/people/<profile>/...` generally. Auto-sync/deep scanning has own-profile guards, but current-page observation/cache/index code is not fundamentally limited to one owner.

Thus browsing another profile's Favorites can legitimately create owner-B scope memberships while also setting the shared listing row's global `isFavorite=true`.

---

# 2. Any no-query All scope becomes globally authoritative

`favIndexCurrentScope()` sets:

```text
authoritativeFavoriteScope = scope.type === "items" && !query
```

`favCatalogDescriptor0141()` uses the same rule.

There is no requirement that the scope belongs to the current viewer/own profile.

When complete reconciliation finds IDs absent from the old same-scope membership, `favIndexApplyScopeCompletion()` does:

```text
mark this scope membership inactive

if authoritativeFavoriteScope:
    favIndexMarkListingUnfavorite(...)
```

The global unfavorite helper then iterates **all** `favoriteScopes` entries and marks them inactive.

## Example

Stored row:

```text
listing X
  isFavorite = true
  favoriteScopes:
    ownerA|items|... -> active
    ownerB|items|... -> active
```

A later verified complete refresh of owner A no longer contains X.

Current result can become:

```text
listing X
  isFavorite = false
  ownerA membership = inactive
  ownerB membership = inactive   <-- incorrect collateral damage
```

Owner B has not been refreshed and may still legitimately contain X.

---

# 3. Cache materialization makes the global flag a gate for every owner

`favCacheMaterializeScope0137()` currently requires both:

```text
indexed.isFavorite === true
membership for requested scope is not inactive
```

Therefore even if a future bug/repair preserved owner-B membership active, a global `isFavorite=false` would still hide the listing from owner B's cache.

`favCachePresentationReadyForScope0137()` uses the same global gate.

The active scope snapshot/membership must be sufficient to determine whether an item belongs to that owner/scope. A global listing boolean must not veto another owner's current membership.

---

# 4. Direct unfavorite action also globally retires all scope memberships

`favIndexMarkListingUnfavorite()` marks the listing globally false and marks every stored `favoriteScopes` membership inactive.

That may have been designed around an assumption that the index represents only the current viewer's own Favorites.

The actual schema and page matching can retain multiple profile owners.

Additionally, a heart action while viewing another user's Favorites represents the current viewer's personal Etsy favorite state, **not** the other profile owner's collection membership. Those are distinct concepts.

The index must not infer:

```text
viewer clicked heart off
=> listing disappeared from every indexed profile's Favorites
```

---

# 5. Later observation from another owner can flip global state back

`favIndexMergeListing()` normally treats an incoming Favorites observation as global positive favorite state and clears `unfavoritedAt` when it accepts the observation as a refavorite.

Thus after owner A globally marks X unfavorite, visiting owner B where X is still present can set global state positive again.

This produces profile-order-dependent data semantics:

```text
visit A -> global false / all memberships inactive
visit B -> global true / B membership active again
```

The same durable database row changes meaning based on which owner's page was observed most recently.

That is not a stable membership model.

---

# 6. Global `isFavorite` also distorts owner statistics/maintenance

`favIndexGetStats(owner)`:

1. unions IDs from the owner's retained scopes;
2. selects listing rows for those IDs;
3. treats global `isFavorite` as an active-favorite gate.

A global false caused by another owner's completion can undercount this owner.

A later global true caused by another profile observation can also make stale retained owner scope IDs look active again unless exact membership state is checked.

This compounds the existing historical-scope-union problem.

---

# 7. Required v3 semantic split

There are at least three different concepts that the current `isFavorite` name can imply:

```text
A. listing is a member of profile owner's Favorites scope
B. current viewer personally has this Etsy listing favorited
C. BetterSearch has a positive historical Favorites observation somewhere
```

These must not be one boolean.

## Scope membership

Canonical in v3:

```text
ScopeSnapshot / owner-scoped membership generation
```

This answers A.

## Viewer personal favorite state

Only store this if BetterSearch has reliable viewer-specific evidence and actually needs it:

```text
viewerFavoriteState {
  viewerId / viewer generation
  favorited
  observedAt
  source
}
```

This answers B.

Do not derive it simply from “listing appeared on profile owner's Favorites page” unless the profile owner is proven to be the current viewer.

## Historical index knowledge

A listing row can exist without being currently active in any scope:

```text
indexed metadata/history present
```

No global `isFavorite` gate is required for this concept.

---

# 8. Migration implications

The v3 migration plan must not preserve `isFavorite` as authoritative cross-owner truth.

Recommended migration treatment:

1. preserve listing rows/metadata;
2. derive legacy positive owner-scope evidence from `favoriteScopes` and scope rows conservatively;
3. do not use legacy global `isFavorite=false` to deactivate a different owner's positive membership;
4. do not use legacy `isFavorite=true` to prove current membership without owner/scope evidence;
5. create verified owner-scope generations through fresh complete crawls;
6. keep any viewer-personal heart state separate if later needed.

Because v2 scope rows are already legacy-mixed, avoid aggressive negative inference during migration.

---

# 9. Authoritative All must mean authoritative **for that owner**, not globally

Rename/reframe the semantic concept.

Today:

```text
authoritativeFavoriteScope = items && !query
```

Future:

```text
authoritativeMembershipScopeForOwner =
  verified owner
  + no-query All
  + verified complete generation
```

Completion may deactivate memberships **for that owner/scope generation**.

It must never iterate through and deactivate unrelated owners' memberships.

---

# 10. Direct heart/unfavorite integration after v3

When BetterSearch observes the current viewer changing a listing heart:

- update viewer-personal favorite state if tracked;
- if the current page is proven to be the viewer's own authoritative Favorites profile, it may optimistically update that owner's active overlay/membership pending native confirmation;
- never retire other owners' profile memberships;
- on failure/rollback, reconcile the current owner's scope from native/server evidence.

The existing local-card action audit's generation checks should include owner generation and viewer-own-profile identity.

---

# 11. Regression tests

Create two-owner fixtures.

### Same listing in two owners

```text
owner A All = [X]
owner B All = [X]
```

Refresh A to empty:

```text
A X membership -> inactive
B X membership -> remains active
B cache still materializes X
```

### Revisit B after A removal

Must not perform a global “refavorite” state transition that changes A membership.

### Direct heart action in owner B page

Must not modify owner B profile membership merely because the viewer toggles their personal heart unless B is verified as the viewer's own profile and the semantics are intentional.

### Stats

`stats(ownerA)` and `stats(ownerB)` derive membership independently from their active verified generations.

### Global metadata retention

Listing X metadata remains stored even if it is inactive in every current scope.

---

# 12. Priority

This should be solved as part of the v3 membership-generation phase, not as a later cosmetic cleanup.

A generation-safe schema that leaves a global `isFavorite` gate in cache/statistics would still allow one owner's state to corrupt another's view.

The v3 invariant should be:

> Listing metadata is global-by-listing; Favorites membership is owner/scope-generation-specific; viewer-personal favorite state is separate.