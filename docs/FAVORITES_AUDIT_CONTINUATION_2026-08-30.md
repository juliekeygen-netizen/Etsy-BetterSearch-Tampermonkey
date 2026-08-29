# Favorites diagnostics + source audit continuation — 2026-08-30

Status: audit chunk 2. This document extends `FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md` and `FAVORITES_INDEXEDDB_INTEGRITY_ADDENDUM_2026-08-29.md` with findings proven by reconciling the sanitized Diagnostics/IndexedDB evidence against the current v0.15.1 source on `main`.

This is an evidence document, not an implementation patch. No raw HAR, session data, account identity, listing IDs, or private native-search text is committed here.

## Executive summary

The second audit moves several earlier suspicions into source-proven root causes.

The highest-severity discovery is that a previous `complete:true` Favorites snapshot can be mutated **while a newer complete crawl is still in progress**. Each successfully fetched page is persisted as a partial observation before the crawl reaches its completeness boundary. Because a later partial write unions IDs into the old scope record while preserving `complete:true` and the old `lastCompleteSyncAt`, a failed/cancelled refresh can contaminate an older complete snapshot without ever committing a newer complete generation. Cache-first startup then trusts that same row as complete.

The second high-priority current-production bug is the v0.15.1 local/native pager alias. Module 95 deliberately clones Etsy's WtPagination presentation and copies the native `aria-label="Favorite Items Page Results"`; module 95a defines native pager identity using that same label without excluding `[data-ebsf-local-pagination]`. The local click listener uses `stopPropagation()` rather than `stopImmediatePropagation()`, so the later capture listener on the same `document` target can still interpret a BetterSearch local page click as native Etsy page intent.

The third major architectural conclusion is that many visible problems are not caused by one bad observer. Persistent UI surfaces have multiple active generations of writers. Shell, header, toolbar, Settings, filter availability, pagination and render ownership are repeatedly wrapped/repaired by later modules. Several of those writers intentionally remove and reapply equivalent DOM/style state while broad lifecycle observation remains active. The Diagnostics recording's enormous no-op mutation count therefore has concrete deterministic sources in the current code.

A fourth important discovery is that current local-render authority is under-specified. The final render signature is only `dataset key + normalized BetterSearch config`; it does not carry a catalogue generation, committed-native-query generation, result-set generation or metadata generation. The integrity repair also reasserts local visual ownership **before** determining that the local result is semantically current. That provides a direct source-level explanation for the captured state where Etsy had restored valid native cards but a stale BetterSearch empty result could hide them again.

---

# 1. Complete catalogue refreshes are not transactionally isolated — PROVEN CURRENT SOURCE BUG

Relevant code:

- `src/61b-favorites-sync.js` — catalogue refresh/crawl
- `src/61a-favorites-index.js::favIndexObserveRecordsNow()` — scope persistence
- `src/61e-favorites-cache-bootstrap.js` — complete-scope cache materialization

## Current refresh sequence

The catalogue service fetches Favorites pages sequentially. After each page is parsed it persists the page immediately as a **partial** scope observation:

```text
fetch page N
-> convert page to records
-> favIndexObserveRecords(records, complete:false, syncState:'running')
-> continue to next page
```

Only after the crawler reaches its short-page/completeness boundary does it perform the final complete write:

```text
all deduplicated records
-> favIndexObserveRecords(result.records, complete:true, syncState:'completed')
```

That page-by-page persistence is useful for preserving observations if a job fails, but it is unsafe with the current scope schema.

## Interaction with an existing complete snapshot

`favIndexObserveRecordsNow()` currently persists partial scope membership approximately as:

```text
listingIds = union(oldScope.listingIds, newlyObservedIds)
complete = oldScope.complete === true
lastCompleteSyncAt = oldScope.lastCompleteSyncAt
lastSyncState = running / partial / metadata
```

Therefore this sequence is possible:

```text
T0: old complete generation = [A, B]
    complete=true
    lastCompleteSyncAt=T0

T1: new refresh page 1 observes [A, C]
    stored listingIds becomes [A, B, C]
    complete remains true
    lastCompleteSyncAt remains T0

T2: refresh fails or is cancelled before completeness boundary

result:
    no new complete generation was committed
    but the old "complete" row no longer represents its T0 membership
```

This is more severe than the previously documented fact that ordinary later current-page/metadata observations can add IDs to a complete scope. A **failed attempt to produce a replacement complete snapshot can mutate the previous complete snapshot during the attempt**.

## Error-path amplification

The catalogue error path may additionally write the accumulated `partialRecords` as another partial observation after per-page partial observations have already been persisted. This does not by itself create a second semantic corruption type, but it reinforces that in-progress state is being written into the same scope membership container that cache startup later interprets as complete.

## Required architecture

A complete snapshot needs an immutable generation boundary. Good designs include either:

```text
scope.completeSnapshot = {
    generation,
    listingIds,
    completedAt,
    source/verification metadata
}

scope.partialOverlay = {
    additions/observations,
    observedAt
}
```

or separate versioned scope-snapshot records plus live observation records.

The key invariant is:

> No page of an in-progress refresh may mutate the membership array of the previous authoritative complete generation.

Partial page observations may still update listing/card metadata and a separate live overlay.

## Regression tests

Add at minimum:

1. complete `[A,B]` -> new refresh page observes `[A,C]` -> refresh fails -> authoritative complete remains exactly `[A,B]`;
2. complete `[A,B]` -> page observations `[A,C]`, `[D]` -> cancel -> old complete generation unchanged;
3. same setup -> newer refresh completes `[A,C,D]` -> one atomic generation switch exposes exactly `[A,C,D]`;
4. peer-tab cache reader during an in-progress refresh sees the old complete generation, never an in-between union;
5. metadata/current-page partial observations cannot rewrite complete-generation membership.

---

# 2. Cache-first startup trusts the contaminated `complete` flag — PROVEN CURRENT SOURCE BUG

`favCacheReadScope0137()` rejects a scope only when `scopeRecord.complete` is false. When true, it takes the current `scopeRecord.listingIds` as the complete scope membership.

`favPrimeDatasetFromCache0137()` then materializes those IDs and sets:

```text
favState.records = materialized records
favState.total = records.length
favState.loadComplete = true
favState.loadSource0137 = cache
```

There is no generation ID or membership fingerprint tying the current `listingIds` array to `lastCompleteSyncAt`.

This means the persistence flaw in section 1 is not merely diagnostic bookkeeping. It becomes live UI/cache truth.

The same issue weakens cross-tab completion detection. A peer can see `complete:true` and a sufficiently new completion timestamp, but there is no immutable membership generation to prove which exact ID set that completion refers to.

Required invariant:

```text
complete generation timestamp/generation ID
<-> exact immutable membership
```

must be one atomic identity.

---

# 3. Owner validation is at the wrong layer — PROVEN CURRENT SOURCE GAP

The database export already proved that an ownerless Favorites scope has existed in durable BetterSearch state. The current source explains why network/storage safety is not complete.

## Higher-level sync wrapper is guarded

The manual/auto sync wrapper rejects a scope when it cannot determine an owner.

That is good but insufficient.

## Lower-level catalogue service accepts empty owner

The consolidated v0.14 catalogue descriptor/refresh path can still create dataset identities with an empty owner and call the Favorites API URL builder. `favCatalogAcquireCurrent()` is used by interactive cache/network loading and presentation migration, not only by the guarded Sync button path.

Therefore an owner-required operation can still reach the lower-level service without passing through the higher-level sync guard.

## Storage accepts empty owner

`favIndexScopeKey()` serializes an empty owner normally, and `favIndexObserveRecordsNow()` has no owner invariant. That is consistent with the ownerless scope seen in the exported IndexedDB.

## Required fix boundary

Owner validation/latching must happen at all authoritative boundaries:

```text
native page identity adapter
-> canonical scope descriptor
-> catalogue/network service
-> IndexedDB scope persistence
-> owner-scoped maintenance/deep work
```

Do not rely on one UI/controller caller to have validated owner state earlier.

For owner-required scope types, empty owner should be an invalid state, not a valid key component.

---

# 4. Empty-owner deep-maintenance discovery broadens to all active indexed listings — SOURCE-PROVEN RISK

`favIndexGetActiveListings(owner='')` has a deliberate no-owner fallback that returns every globally active indexed listing.

The deep queue calls it with roughly:

```text
options.owner || favScope().owner || ''
```

Automatic deep work is guarded by own-Favorites checks, reducing ordinary risk. However manual actions such as Scan missing metadata / Update all, plus future callers, can reach the owner-empty fallback.

If owner identity is transiently unavailable, "no owner" therefore means **all active indexed listings**, not "cannot safely determine the requested owner".

That is the wrong default semantic for production owner-scoped operations.

Recommended API split:

```text
favIndexGetActiveListingsForOwner(owner)  // requires non-empty owner
favIndexGetAllActiveListingsForMaintenance() // explicit, separate, rarely used
```

Never encode "all owners" as the accidental meaning of an empty owner argument.

---

# 5. Native query commit still permits an unverified timeout promotion — CURRENT SOURCE WEAKNESS

The v0.13.1 query state machine is substantially safer than older live-input identity, but it still has a fallback that can create durable dataset identity without evidence that Etsy committed a corresponding result generation.

Current flow:

```text
input event -> remember pending value
submit/search -> mark awaiting settle + capture native grid fingerprint
observation timer -> compare grid fingerprint
```

The commit predicate effectively says:

```text
if grid changed:
    commit pending query
else if elapsed < ~850 ms:
    wait
else:
    commit pending query anyway
```

Thus the fallback timeout is sufficient to promote pending text even when the result grid did not change.

In addition, `favIsFavoritesSearchInput0140()` accepts any input inside `.ebsf-native-search-slot`, rather than tying query state to one exact native search input instance/generation.

The IndexedDB export contains many transient/zero-result query scopes and several anomalously long query identities. We cannot prove which historical code version created every one, so the current weakness should not be presented as the sole historical cause. It does show that the present commit contract still lacks strong provenance.

## Better contract

A durable native-query scope should record how it was committed:

```text
query
scope identity
commit generation
commit reason
native result/request evidence
timestamp
```

Prefer commit from one of:

1. verified Etsy native request/result transition for the submitted query;
2. native state/props transition that unambiguously exposes the committed query;
3. explicit clear where the resulting empty-query state is verified.

A timeout may release UI waiting, but should not by itself create a durable complete query scope.

Also add query retention:

- canonical no-query All/collections/groups: durable;
- useful verified query scopes: bounded TTL/LRU;
- zero-result/transient scopes: short TTL;
- invalid/ownerless/implausibly large query identity: reject/repair.

Do not log or commit raw private query text in public diagnostics documents.

---

# 6. Auto-sync freshness can bless structurally invalid snapshots — PROVEN CURRENT POLICY GAP

The auto-sync due check is primarily timestamp based. It considers whether the last complete sync is old enough according to the configured interval.

It does not currently invalidate freshness because of:

- snapshot membership integrity failure;
- ownerless identity;
- scope/listing membership disagreement;
- a current native/server total that contradicts cached authoritative count;
- partial-overlay contamination;
- missing/invalid generation fingerprint.

Therefore `complete:true + recent lastCompleteSyncAt` can remain "fresh" even when the stored membership structure is not trustworthy.

The audit cannot prove from the recording alone whether a particular stale interval was caused by disabled auto-sync, own-profile detection, throttling, or freshness logic. Diagnostics should therefore record **why** auto-sync decided not to run.

Suggested diagnostic decision enum:

```text
disabled
not-favorites-page
not-own-profile
owner-unresolved
throttled
fresh
integrity-invalid
due
started
completed
failed
cancelled
```

Snapshot integrity should be an independent prerequisite to freshness, not encoded into age alone.

---

# 7. v0.15.1 local pager is currently eligible to be read as the native pager — PROVEN CURRENT PRODUCTION BUG

Relevant code:

- `src/95-favorites-responsive-pagination.js`
- `src/95a-favorites-native-page-state.js`

## Module 95 deliberately gives local pager native presentation

The local pager is BetterSearch-owned but clones Etsy's WtPagination shell/classes. It sets:

```text
data-ebsf-local-pagination="1"
data-clg-id="WtPagination"
aria-label = native aria-label or "Favorite Items Page Results"
```

Module 95's **own** helper `favNativePagers0150()` correctly excludes `[data-ebsf-local-pagination]`.

## Module 95a does not exclude it

Module 95a discovers native pager state with:

```text
nav[aria-label="Favorite Items Page Results"]
```

without excluding `[data-ebsf-local-pagination]`.

Its document capture click listener likewise matches:

```text
nav[aria-label="Favorite Items Page Results"] button
```

without the BetterSearch-local exclusion.

## Event propagation does not save this

Module 95's local pager listener is registered first and calls:

```text
preventDefault()
stopPropagation()
```

Both module 95 and 95a listen on `document` in capture phase. `stopPropagation()` prevents traversal to other nodes but does **not** stop other listeners on the same current target. Therefore module 95a can still run for the same local click. `stopImmediatePropagation()` would prevent same-target listeners, but selector correctness is the more important invariant.

A local page click can therefore seed `favState.nativePageIntent0139`, scheduling native view reconciliation even though the user only changed BetterSearch local-result page.

## Required correction

Every native pager discovery/click path must explicitly exclude local ownership:

```text
nav[aria-label="Favorite Items Page Results"]:not([data-ebsf-local-pagination])
```

or, preferably, use one shared `favNativePagers...()` helper as the only native-pager authority.

Consider giving the local pager a distinct semantic aria label while preserving Etsy's visual classes. Visual parity does not require semantic identity aliasing.

## Required dual-pager regression

Fixture:

```text
hidden retained Etsy native pager: current page 1
visible BetterSearch local pager: current page 2
```

Assert:

- native selected/current page stays 1;
- BetterSearch local page stays 2;
- clicking local next/previous/numeric buttons never sets native page intent;
- native page reconcile is not scheduled by local clicks;
- unrelated DOM mutations cannot reinterpret the local pager as native view state;
- switching back to native mode restores only the real Etsy pager.

---

# 8. Final render authority does not include a data generation — PROVEN CURRENT DESIGN BUG

`src/101-favorites-v0141-smoke-fixes.js` defines the requested local-render signature from approximately:

```text
favDatasetKey()
+
JSON.stringify(normalized favCfg)
```

The signature does **not** include:

- authoritative catalogue generation;
- complete-snapshot generation/fingerprint;
- actual record/result-set generation;
- committed-native-query generation;
- native view generation;
- metadata requirement/completion generation.

Consequently two materially different data states can have the same render signature if they share dataset key and BetterSearch config.

This matches the type of failure captured during Search clear: a local empty result can have the same nominal dataset/config identity as a later corrected native/catalogue state.

## Ownership repair order is also unsafe

`favRepairLocalOwnership0142()` first reasserts local visual ownership when a local grid is connected:

```text
favApplyLocalVisualOwnership0150()
```

Only afterward does it ask whether the local grid is authoritative; if not, it starts `favReapply()`.

Thus a stale connected local grid can hide the native grid/pager **before** semantic freshness has been established.

This is the opposite of the desired transaction order.

## Correct transaction model

Render preparation should produce a token such as:

```text
{
  datasetKey,
  catalogueGeneration,
  nativeQueryGeneration,
  filterConfigHash,
  metadataGeneration,
  resultIdsHash_or_resultGeneration,
  localPage
}
```

Prepare local DOM while Etsy remains visible. Immediately before takeover, verify the token still equals current state. Only then atomically switch:

```text
native grid/pager -> hidden
local grid/pager -> visible
render token -> committed
```

If verification fails, discard the prepared local result without changing visible ownership.

No integrity repair should hide native output merely because an old local node is still connected.

---

# 9. The Settings coverage A/B flicker has an exact source-level writer race — PROVEN CAPTURE + SOURCE ROOT CAUSE

The Diagnostics recording showed the same Settings node alternate between two equivalent presentations:

```text
N / N & M / M
Favs: N / N & Shops: M / M
```

The exact current source path is now identified.

`src/68-favorites-ui-repair.js::favRefreshSettingsStatus()` asynchronously computes statistics and writes the bare value to `[data-ebsf-status="favoritesCoverage"]`.

`src/69-favorites-ui-hotfix.js` wraps that async function, waits for the previous implementation, then rewrites the same node into the prefixed form.

Multiple overlapping refresh calls can therefore interleave:

```text
call A base -> bare
call B base -> bare
call A wrapper -> prefixed
call B wrapper -> prefixed
another base completion -> bare
...
```

No underlying data change is required.

Later deep-progress/runtime wrappers also wrap the same Settings refresh function, increasing call-chain depth.

Correct fix: produce one Settings view model and one final renderer. Formatting must happen before the single DOM write, not in an async post-processing wrapper.

Regression test: launch multiple overlapping status refresh promises with deliberately reordered completion and prove the node never exposes an intermediate alternate format.

---

# 10. The no-op mutation flood has concrete live-text and style writers — PROVEN CURRENT SOURCE

The recording showed at least 149k mutations whose old/new value was provably identical. The second source pass found several deterministic mutation generators.

## Filter label is mutated merely to measure width

`src/70-favorites-phase4-polish.js::favLockFilterButtonWidth010()` measures the live button by doing roughly:

```text
label.textContent = "Show filters"
measure
label.textContent = "Hide filters"
measure
label.textContent = original
```

That creates text mutations even though the final visible label can remain unchanged.

The same helper removes and reapplies live width/min-width/max-width/flex styles for measurement/locking.

Use an off-DOM measurement element/canvas or cached text metrics instead. Never mutate visible control text to measure alternate labels.

## Toolbar snapshots remove/reapply transform/style

The same module deliberately removes transform before replaying a snapshot and may then write compensation transform again.

Later modules clear those properties again.

## Exact Search-width pass clears transform before every measurement

`src/98-favorites-exact-search-width.js::favAlignCollectionToolbarX0136()` intentionally removes its previous transform, measures the unshifted geometry, and then may write an equivalent transform again.

The exact-width pass is scheduled from:

- shell repair;
- resize;
- fonts-ready;
- input;
- search;
- change;
- initial startup;
- other historical resize/geometry hooks rebound to it.

Even an idempotent final visual result therefore produces actual style mutation traffic.

## Rule for the consolidation phase

Geometry must become model-driven:

1. compute measurements without clearing a currently correct visible state where possible;
2. cache input dimensions/generation;
3. compare desired value to existing owned value;
4. write only when changed;
5. one surface = one final geometry owner.

---

# 11. Shell lifecycle is a wrapper chain, not one lifecycle controller — PROVEN CURRENT ARCHITECTURE

The same public shell hook is rebound repeatedly through the late module chain. Important generations include modules 88, 89, 91, 96/97, 98, 100 and 101, on top of the module-86 base shell.

Representative behavior:

- module 88 wraps install and runs toolbar + drawer repair;
- module 89 wraps local render and schedules a shell install in the next frame;
- module 91 adds pagination/geometry/density work and replaces the shell observer;
- module 96/97 replace header/geometry ownership again and schedule responsive work;
- module 98 wraps shell install and schedules a two-frame exact-toolbar pass;
- module 100 wraps shell install and schedules Search-clear parity;
- module 101 pre-ensures the permanent rail, calls the complete previous chain, then schedules another frame that ensures the rail and rewrites header state again.

Several modules also attach their own resize/font/input callbacks that call into the final rebound functions.

This architecture makes it difficult to infer how much work one mutation causes because a single high-level repair call fans through many historical wrappers.

The correct cleanup is not another guard module. Replace the wrapper stack with a lifecycle controller whose reconciliation pass has explicit subphases and dirty flags, for example:

```text
reconcile(reason, generation)
  1. read native identity/hosts
  2. validate/latch scope + owner
  3. reconcile shell structure if dirty
  4. reconcile rail availability if dirty
  5. reconcile header/count if dirty
  6. reconcile toolbar geometry if dimensions changed
  7. reconcile result ownership if data generation changed
```

The current accepted UI remains the visual contract; the goal is removing layered execution, not redesigning it.

---

# 12. Filter availability currently has two generations of runtime logic active — PROVEN CURRENT ARCHITECTURE

The current rail is schema-v2, but older v0.11 availability code remains live.

## Legacy availability path

`src/78-favorites-filter-layout-runtime.js`:

- computes section availability;
- reorders DOM units;
- writes `section.hidden` and option hidden states;
- wraps `favSaveAndApply()` and `favReapply()`.

## Settings still calls legacy path directly

`src/82-favorites-layout-settings.js` changes the availability mode and calls:

```text
favApplyFilterLayoutAndAvailability0110(favState.rail)
```

It may then load/enrich data and call the legacy path again.

## v2 filter catalogue has another availability engine

`src/85-favorites-filter-revamp.js` owns schema-v2 binding availability with:

- `favRecordsForBinding0120()`;
- `favBindingAvailable0120()`;
- `favRefreshFacetAvailability0120()`;
- `favScheduleFacetAvailability0121()`.

The document-level Settings-change listener also schedules this newer refresh.

Modules 88, 91 and 101 then wrap the newer binding/facet decisions again.

Therefore changing `Current filtered items` can activate both the legacy availability application and the v2 availability pipeline.

## Current v2 mutation behavior is not idempotent enough

The refresh loop writes:

```text
root.hidden = desired
```

without checking whether the value changed.

Shop and country selects are rebuilt with `replaceChildren()` even when their option model is unchanged.

With a broad lifecycle observer, these needless writes are observable work and can feed further repair scheduling.

## Required consolidation

There should be one pure availability model:

```text
input:
  catalogue generation
  filter config
  availability mode
  per-field knowledge coverage
  layout schema

output:
  option visible/enabled state
  drawer visible state
  select option models
```

Then one renderer diffs that model against mounted rail state and writes only changes.

Legacy v0.11 DOM-order/availability mutation should be retired once schema-v2 covers the visual contract.

---

# 13. Category knowledge completeness uses scan completion rather than field knowledge — SOURCE-PROVEN SEMANTIC BUG

The final module-101 availability wrapper treats category knowledge as complete when `favDeepVisibilityReady0110()` is true.

That helper means, approximately, that the loaded records have completed deep scans. It does not prove every record has a known/nonempty category field.

The newer metadata coordinator has the stronger field-specific semantic: category is known only when the deep scan is fresh/current **and** `deepMetadata.category` is a non-empty array.

Therefore a future dataset can reach:

```text
deep scan completed
category extraction unknown/empty for one or more records
```

while the module-101 availability guard treats category absence as safe evidence for hiding options.

For the analyzed IndexedDB dump this is not the explanation for the observed category problem because category was known for all 114 records. It remains a real semantic bug for other datasets/parser outcomes.

Rule: availability completeness must be capability-specific. `scannedAt` is provenance that an attempt happened, not universal proof that every deep field became known.

---

# 14. Writer ownership map

The audit now has enough source evidence to map the most important multi-owner surfaces.

| Surface | Current generations/writers | Risk |
| --- | --- | --- |
| Settings coverage/status | modules 68 -> 69 -> 73 -> 74 and later state callbacks | async post-processing races, duplicate writes |
| Filter availability | 77/78 legacy model, 82 Settings caller, 85 v2 model, 88/91/101 wrappers | duplicate computation, no-op hidden writes, inconsistent unknown semantics |
| Toolbar geometry | 68/base repair, 70 frozen snapshot/label measurement, 88/91 cleanup, 94/96/97 responsive owners, 98 exact owner, 101 resize/shell calls | remove/reapply churn, intermediate geometry, hard-to-reason ownership |
| All/collection metadata/count | 86 base, 90/91 density, 96 exact header, 97 native mirror/progress, 101 authority wrapper | repeated text/DOM updates, stale count authority |
| Shell lifecycle | 86 base -> 88 -> 89 -> 91 -> 96/97 -> 98 -> 100 -> 101 | one trigger fans through historical repairs |
| Shell observer | replaced by multiple late modules; broad `document.body` child-list observation remains | self-generated DOM changes can schedule more work |
| Pagination | 94 native boundary/no-op legacy compatibility, 95 local WtPagination presentation, 95a native page adapter, 101 integrity | current local/native semantic alias |
| Result ownership | base renderer + 95 visual ownership + 101 integrity/signature | visual takeover can precede semantic generation validation |
| Indexed scope membership | current-page observations, metadata persistence, per-page catalogue refresh, final complete refresh | partial state mutates previous complete snapshot |

This table should guide deletion/consolidation order. Do not delete a historical wrapper merely because a later module appears to supersede it; first move the intended final behavior into one explicit owner and add regression coverage, then remove the old writers.

---

# 15. Revised implementation priority after audit chunk 2

## P0 — snapshot atomicity and identity integrity

Fix before broad UI refactoring because stale/corrupt data can make every renderer appear broken.

- immutable/versioned complete scope generation;
- separate partial overlay/current observations;
- owner-required validation in catalogue and storage layers;
- reactivation clears membership tombstone;
- deterministic scope/listing integrity migration;
- cache materialization tied to exact generation;
- freshness invalid when generation integrity fails.

## P0 — local/native pager alias

Small bounded production fix:

- exclude local pager from module-95a native discovery and click capture;
- one shared native-pager selector/helper;
- dual-pager regression.

## P0 — semantic render generation

- result token includes data/query/metadata generation;
- do not hide native grid/pager until token validates;
- stale local prepared result is discarded, not visually reasserted.

## P1 — native-query provenance + scope retention

- exact native search input binding;
- verified query commit evidence;
- fallback timeout cannot create durable authoritative query identity alone;
- bounded query cache retention/GC;
- reject/repair invalid/ownerless identities.

## P1 — one availability owner

- field-specific knowledge completeness;
- retire legacy v0.11 runtime mutation path;
- pure availability model + diff renderer;
- no same-value hidden writes;
- no unchanged select reconstruction.

## P1 — one Settings renderer

- single view model;
- one final text format;
- overlapping async refreshes generation-guarded or cancelled.

## P1 — shell/toolbar lifecycle consolidation

- one reconcile controller;
- one shell observer;
- one toolbar geometry owner;
- off-DOM/cached measurement;
- write only changed values;
- preserve accepted v0.15.1 visual contract.

## P2 — diagnostics additions

Record enough state to prove why a future transition happened:

```text
catalogue generation
complete snapshot generation + count
partial overlay count
owner-latch state
query pending/committed generation + commit reason
render requested/committed token
native/local pager identities
native page intent source
availability model generation
shell reconcile reason + dirty flags
auto-sync decision reason
DOM-write counters by BetterSearch subsystem
```

This should make the next capture substantially smaller and more causal.

---

# 16. Regression matrix to build before refactor deletion

## Data/snapshot

- failed refresh cannot mutate previous complete membership;
- cancelled refresh cannot mutate previous complete membership;
- metadata/current-page partial additions do not rewrite complete generation;
- completed new refresh atomically replaces generation;
- cross-tab reader never consumes in-progress membership as complete;
- ownerless scope cannot be networked or persisted;
- refavorite clears `removedAt`;
- scope/listing membership repair is deterministic.

## Query

- typing without submit never changes dataset identity;
- submit with no native evidence does not create durable query scope merely because timeout elapsed;
- verified result transition commits correct query generation;
- clear commits empty query only after verified native clear/result state;
- long/invalid query identities are bounded/rejected for durable cache;
- stale zero-result query scopes expire.

## Grid/render

- stale local result cannot hide a newer native result;
- render token changes when catalogue/query/metadata generation changes;
- native remains visible during local preparation;
- only a validated local generation can take ownership;
- grid and pager ownership change atomically.

## Pagination

- visible local pager is never returned by native pager helper;
- local click never seeds native intent;
- native click never changes local page;
- hidden native page 1 + local page 2 remains semantically distinct through mutations/resize;
- return to native restores exact saved native state.

## Availability

- Current filtered items evaluates against candidates with only the target binding removed;
- unknown field != unavailable;
- category completeness requires known category, not just scan completion;
- unchanged refresh causes zero DOM writes;
- select options are not reconstructed when model unchanged;
- legacy/new availability paths cannot both mutate mounted rail.

## Lifecycle/performance

- repeated shell reconcile with no native/state change causes zero structural writes;
- filter-button width measurement does not mutate live label text;
- exact toolbar reconcile with unchanged geometry performs zero style writes;
- Settings concurrent refreshes expose one stable format;
- mutation-observer callback caused by BetterSearch-owned idempotent state does not schedule another full reconcile.

---

# 17. What this audit does not claim

- It does not claim every historical polluted query scope was created by the current v0.13.1 query code; the dump spans older versions.
- It does not claim the recording reproduced the ownerless malformed collection request. The durable ownerless scope proves historical identity leakage; current source proves remaining guard gaps.
- It does not claim category metadata was incomplete in the analyzed dataset; it was complete there.
- It does not claim every one of the recorded ~149k no-op mutations came from the identified writers. It proves multiple current writers deterministically generate unnecessary mutation traffic consistent with those hot spots.
- It does not yet redesign the UI. Current visual parity remains the contract.

## Next audit chunks

Useful remaining investigation before/alongside implementation:

1. map exact observer/reconcile invocation frequency by subsystem from the Diagnostics timestamps;
2. inspect whether native-search request/response CDP events can become the canonical query-commit evidence;
3. design the IndexedDB v3/v4 migration for immutable generations and cleanup without losing known metadata;
4. trace all consumers of `favState.total`, `scope.listingIds`, `isFavorite`, and membership active state to define one count authority matrix;
5. audit cloned local-card action delegation when the matching native card is on a different native page;
6. audit collection creation/model refresh and route identity under owner-latching rules;
7. compare browser extension vs Tampermonkey storage/index behavior under simultaneous tabs.
