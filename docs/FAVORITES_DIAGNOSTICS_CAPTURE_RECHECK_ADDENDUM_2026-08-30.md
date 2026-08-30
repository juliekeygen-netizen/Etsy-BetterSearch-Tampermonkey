# Favorites Diagnostics capture recheck addendum — 2026-08-30

**Status:** second-pass review of the original 2026-08-29 Diagnostics recording plus the companion IndexedDB export, reconciled against current source after audit chunks 3–7.

This file intentionally records only sanitized conclusions. The raw Diagnostics archive, HAR/CDP streams, screenshots, DOM snapshots and IndexedDB export are development evidence and must not be committed.

## Executive result

The second pass materially strengthens three earlier findings:

1. the sidebar failure is a real **DOM ownership violation**, not merely a delayed remount;
2. the recording captured a real **mixed local-grid/native-pager state**, supporting the planned render-generation/atomic-commit work;
3. the database contains a real **ownerless scope row**, even though the newer recording itself did not reproduce a malformed `/users//...` request.

It also clarifies the 107-vs-114 count discrepancy: the two UI surfaces are currently capable of counting different data universes.

---

## 1. P0/P1: Etsy reconciliation mutated the BetterSearch rail itself

The strongest rail event occurs during the reload associated with the user marker around 20:29:24 UTC.

The important sequence is:

```text
native Etsy sidebar host exists
-> BetterSearch full v2 rail is mounted inside that host
-> Etsy performs late sidebar hydration/reconciliation
-> Etsy inserts native sidebar controls into the BetterSearch rail
-> Etsy removes BetterSearch rail children from that same rail
-> BetterSearch later recaptures/reasserts native sidebar children
```

In the same reconciliation burst, the mutation stream records Etsy adding its native `View all` control to `[data-ebsf-rail]` and removing BetterSearch-owned:

```text
Filters header
Search
Category
Ships from
Price
Item qualities
Item type
Seller
Shops link
```

The rail root itself remains connected. It is not simply an old host disappearing.

This exactly matches the recorded screenshot/user observation where the filter sidebar never returns and the left rail contains essentially only `View all`.

### Source correlation

Current `src/86-favorites-page-shell.js` explains why this can happen:

- `favInstallPermanentRail0120()` appends the persistent BetterSearch rail **inside** Etsy's `[data-testid="sidebar"]`;
- `favCaptureNativeSource0120()` also creates a BetterSearch wrapper inside that Etsy host and reparents Etsy's native sidebar children into it;
- `favRefreshRail0120()` replaces the BetterSearch rail wholesale under that same hydrated component.

This leaves persistent BetterSearch identity inside a Preact-managed child list while also moving Preact-owned children away from the structure Etsy rendered.

### Correct architectural conclusion

The stable fix should not be another observer that remounts the rail faster.

The target is:

```text
Etsy-owned hydrated sidebar subtree
  observed/read, not structurally rewritten

BetterSearch-owned stable sibling/slot
  permanent filter rail
```

The native sidebar may be visually suppressed when BetterSearch owns the visible rail, but its hydrated child structure should remain intact unless a narrowly proven native action adapter requires otherwise.

This is now direct capture evidence for the existing shell/rail ownership audit and should be treated as one of the highest-priority lifecycle releases after the bounded data fixes.

---

## 2. P0/P1: the recording captured local-grid/native-pager atomicity failure

At the VNs marker around 20:33:34 UTC the visible state was internally contradictory:

```text
header: 41 favorites · 41 shown
local BetterSearch result area: No favorites match these filters.
visible pager: pages 1–3
```

The raw mutation history reconstructs the transition:

```text
local grid with 20 cards + local 3-page pager
-> local pager removed
-> local grid removed
-> new local grid inserted
-> new local grid becomes empty-state only
-> Etsy later inserts a native 3-page pager
```

The marker DOM confirms the empty grid was BetterSearch-owned/local while the visible pager did not carry the BetterSearch local-pagination ownership marker.

### Why this matters

A single synchronous `favRenderCurrent()` invocation computes:

```text
matched records
page count
clamped local page
page slice
local grid
pager count
```

from the same `matched` array. It cannot coherently produce a 41-shown/3-page result and an empty first-page slice in one transaction.

The captured DOM therefore reflects competing/stale lifecycle/render actions rather than one atomic local render commit.

A1 / v0.15.2 fixed the separate native-vs-local pager semantic-alias bug in module 95a. This older recording predates A1, so some pager confusion may now be reduced, but the capture is broader evidence for the already planned signed render-generation work:

```text
catalogue generation
metadata/context generation
native view generation
local result generation
local grid + pager + shown count committed together
```

Required regression principle:

> A committed visible state must never expose BetterSearch local grid + Etsy native pager, or Etsy native grid + BetterSearch local pager.

---

## 3. A2 evidence: new capture has no malformed request, persisted state still proves owner loss happened

The fresh Diagnostics network table contains **no** `/users//` request in this session.

That is useful negative evidence: the malformed-owner bug was intermittent and did not reproduce during this recording.

However, the companion IndexedDB export contains one real historical ownerless Favorites scope:

```text
scope key shape: |items||
owner: empty
query: empty
complete: false
last complete sync: none
listing IDs: empty
```

The older HAR also captured the malformed ownerless collection request.

Together these facts justify the bounded v0.15.3 A2 behavior:

- latch a verified owner through transient same-profile props gaps;
- reject ownerless owner-scoped persistence before IndexedDB writes;
- reject ownerless API scope construction before a URL exists;
- repair historical ownerless scope rows and their exact listing-side membership keys.

The capture does **not** justify a broad rewrite of Etsy identity discovery by itself. Multiple-props/island selection remains a separate future identity-adapter task.

---

## 4. 107 vs 114 is a count-universe/freshness problem, not just a text mismatch

The recording shows the Favorites header reporting 107 while Settings later reports 114.

The database explains how both values can arise:

- the retained no-query All scope contains 107 IDs and is marked complete from an older full synchronization;
- there are 114 active listing records in the index;
- seven active records are outside that retained All membership and are referenced by other owner scopes/observations;
- `favIndexGetStats(owner)` can build an owner universe by unioning IDs across retained owner scopes, while current/header logic can use the current/complete All scope.

Therefore these surfaces are not necessarily querying the same semantic object.

The product should explicitly distinguish or unify:

```text
current trusted native count
latest immutable complete All snapshot count
optimistic partial-overlay count
owner-wide indexed active-record count
```

Until the planned snapshot-generation migration exists, Settings must not silently present a broad historical/union count as though it were the exact current All count.

---

## 5. Category metadata was present; missing metadata does not explain the availability UI failure

The IndexedDB export has known category metadata for all exported active listing records. Only a small subset of Etsy top-level categories is actually represented in those records.

Yet the recording shows the full category catalogue remaining visible while `Hide unavailable catalogue filters` is set to `Current filtered items`.

That rules out the simple explanation that the feature could not decide because category metadata was absent.

The current-source ownership conflict responsible for this is documented separately in:

`FAVORITES_FILTER_AVAILABILITY_OWNER_CONFLICT_AUDIT_2026-08-30.md`.

---

## 6. Priority changes after the raw recheck

The bounded sequence remains preferable to one large rewrite, but the evidence changes confidence and ordering inside the lifecycle work:

1. **A2 owner boundary (v0.15.3)** — finish first; persisted invalid state is proven.
2. **Filter availability single-owner fix** — small, source-proven, directly user-visible.
3. **Stable rail mount / stop reparenting Etsy sidebar children** — highest-value lifecycle repair from the recording.
4. **Immutable catalogue snapshot generations** — prevent in-progress/partial observations mutating the meaning of a complete snapshot.
5. **Signed local render generation + grid/pager atomic commit** — capture now contains direct mixed-state evidence.
6. Continue teardown/focus/listener consolidation after the stable ownership boundaries exist.

Do not combine these into one release merely because they were found by the same capture.

---

## 7. What the recording did *not* prove

For accuracy, this audit does not claim:

- every rail refresh is caused by Etsy reconciliation; BetterSearch also performs its own full replacements/reorders;
- v0.15.2 A1 fixes the entire mixed render state; it fixes the proven pager identity alias only;
- the 114 Settings count is the authoritative current Etsy total;
- the 107 All-scope row is an immutable exact snapshot under the current v2 schema;
- the newer recording reproduced `/users//...`; it did not;
- every old query-scope row is still creatable by current committed-query logic.

These distinctions should remain in future implementation and regression docs.