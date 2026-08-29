# Favorites Diagnostics + IndexedDB audit — 2026-08-29

Status: evidence report for the remaining Favorites correctness/lifecycle work after BetterSearch v0.15.1. This document supplements `FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md` with direct browser evidence from a long Diagnostics recording and a later full IndexedDB export from the same development profile.

The raw recording, HAR, screenshots, DOM snapshots, IndexedDB dump, account identifiers, listing identifiers, listing titles, URLs, and user-written diagnostic notes are deliberately **not** committed. This file contains only sanitized aggregate findings and source-level conclusions.

## Evidence set

### Full Diagnostics session

The recording covered roughly 12 minutes of real Favorites use and contained approximately:

- 317,320 stored events;
- 5,763 network requests;
- 274,145 DOM mutation records;
- 2,057 important-element snapshots;
- 239 interaction records;
- 12 manual problem markers and 6 automatic markers;
- 18 screenshots and 18 DOM snapshots;
- a generated HAR plus raw CDP/network/body event streams.

The test exercised startup/reload, All and collection navigation, native search, filter/sort transitions, settings, and native pagination.

### IndexedDB export

The later `etsy-bettersearch-favorites` database dump contained:

| Store | Rows |
| --- | ---: |
| `listings` | 114 |
| `shops` | 80 |
| `scopes` | 52 |
| `deepScanQueue` | 114 |

All conclusions below that depend on the IndexedDB dump were derived from the complete export rather than a partial DevTools view.

## Confidence labels

- **PROVEN** — directly demonstrated by the recording/database and/or current source.
- **STRONG RISK** — the stored state plus source make the failure possible, but this exact destructive outcome was not reproduced in the recording.
- **NOT REPRODUCED** — previously known problem that the recording specifically watched for but did not observe.

---

# 1. Sidebar/rail instability is primarily BetterSearch self-lifecycle conflict — PROVEN

The earlier working theory was that Etsy hydration replaced the sidebar host and caused BetterSearch to lose its rail.

The recording shows a more precise failure:

- within an individual document, Etsy's sidebar host can remain stable;
- BetterSearch creates multiple rail generations inside that stable host;
- startup can progress through native sidebar -> partial/early BetterSearch rail -> rail removal -> replacement rail -> further child reconstruction;
- some collection transitions produced several distinct BetterSearch rail generations before settling.

Current source explains why. `src/86-favorites-page-shell.js::favCaptureNativeSource0120()` creates a hidden BetterSearch source **inside Etsy's sidebar**, then moves every sidebar child that is not the BetterSearch rail into that hidden source. Later modules repeatedly repair/reinstall that shell.

`src/88-favorites-revamp-stability.js` and `src/91-favorites-triple-audit-hardening.js` explicitly replace earlier shell observers/installers and contain compatibility repairs for previous shell generations. Module 91 even contains recovery for Etsy pagination being reconciled into BetterSearch's collection navigation node, which is direct evidence that the ownership boundary has already been crossed in production.

### Architectural consequence

Do not add another late observer whose job is to repair the same arrangement.

The lifecycle phase should establish:

1. one BetterSearch shell mount outside Etsy/Preact-owned child structure where practical;
2. no routine reparenting of Etsy-owned sidebar children into a BetterSearch wrapper;
3. one lifecycle controller;
4. one narrow observer feeding one scheduled reconcile;
5. a generation/signature for the mounted rail so duplicate installers cannot independently recreate it.

---

# 2. Local-result ownership can hide a valid native result set and render a false empty state — PROVEN

One search/clear sequence reconstructed from network + DOM state was approximately:

```text
native grid visible with real cards
-> BetterSearch local mode begins
-> native search submitted
-> native results transition
-> interval with no usable result grid
-> Etsy restores a valid native grid
-> BetterSearch keeps that native grid hidden
-> local grid becomes visible with only:
   "No favorites match these filters."
```

There was a long user-visible period during which neither result owner was useful, followed by a false BetterSearch empty state while Etsy had already restored real native cards.

Current `src/63-favorites-runtime.js::favRenderCurrent()` can immediately replace the local grid with the empty message and then hide the native grid. `favReapply()` checks the dataset key before rendering, but there is no stronger transaction proving that the exact records snapshot, committed native query, metadata generation, filter config and current Etsy transition all belong to one settled generation.

### Required render contract

Local ownership should be committed only from a signed render transaction containing at least:

```text
scope/dataset key
committed native query generation
catalogue generation/completeness
filter/sort configuration hash
metadata requirement generation
expected local result signature
```

If any part becomes stale while work is in flight, Etsy remains visible and the local result must not claim ownership.

---

# 3. Pager ownership can contradict grid ownership — PROVEN

The recording captured a state with:

- BetterSearch local mode active;
- local grid showing no matches;
- Etsy's native grid containing real cards but hidden;
- Etsy's native pager still visible;
- no valid BetterSearch local pager.

That can visually present the equivalent of "0 matches" together with native pages `1 2 3`.

This is separate from the known v0.15.1 source-level pager identity issue where code that searches `nav[aria-label="Favorite Items Page Results"]` can accidentally find a BetterSearch local pager unless local nodes are explicitly excluded.

The long recording did **not** demonstrate that selector alias at the marked native page-3 test; that page transition was genuinely native. Both issues nevertheless require regression coverage.

### Required invariant

```text
native grid owner -> native pager may be visible; local pager absent
local grid owner  -> native pager strongly hidden/inert; local pager owns local page state
```

Grid and pager ownership must be switched in the same transaction.

---

# 4. More than half the captured DOM mutation stream is provable no-op churn — PROVEN

Of 274,145 recorded mutations, at least 149,172 were direct same-value rewrites:

- about 100,768 attribute mutations wrote the value already present;
- about 48,404 text replacements replaced text with identical text.

This is a lower bound. It does not count A -> B -> A fights between competing writers.

Large hot spots were BetterSearch-owned UI, including the toolbar row, sort choices, All header, Filters control, result/scope count, and filter label.

Current source contains multiple direct examples:

- `favRefreshFacetAvailability0120()` assigns `root.hidden = ...` on every pass without comparing the current value;
- the same function rebuilds Shop and Ships-from `<select>` children with `replaceChildren()` on every availability refresh;
- `favUpdateScopeHeader0120()` rewrites count text on repeated shell passes;
- sort refreshes rewrite choice text/ARIA state repeatedly;
- late toolbar geometry helpers clear and then reapply geometry during repair passes.

### Required DOM rule

Reconciliation must be DOM-idempotent, not merely logically idempotent.

Before writing:

```text
textContent / nodeValue
hidden / inert
ARIA attributes
classes
style properties / CSS variables
select option children
```

compare the desired value/tree with the current value/tree. A no-op reconcile should produce effectively no mutations.

Add development counters for:

```text
reconcile passes
DOM writes performed
DOM writes skipped as unchanged
nodes replaced
rail generations
```

---

# 5. Multiple BetterSearch layers still fight over the same UI field — PROVEN

The recording captured one Settings status/coverage node alternating within milliseconds between two different formatting conventions while the underlying numbers did not change.

This is direct evidence that historical modules still believe they own the same DOM field. The broader late-module chain therefore remains a correctness/performance issue, not only a code-style issue.

The lifecycle consolidation phase should maintain an explicit ownership table for every persistent UI surface and delete/retire superseded writers once the final owner is installed.

---

# 6. Toolbar movement is produced by multiple geometry owners — PROVEN

Across navigation and shell repair, the toolbar was measured and repositioned through multiple intermediate horizontal states before settling.

The source chain corroborates this. `src/97-favorites-all-native-header.js` can replace the All header with a native-mirror structure, clears earlier final toolbar geometry, recalculates shared toolbar geometry, and wraps page-shell installation with another RAF geometry pass. Earlier modules also clear legacy widths/transforms during shell repair.

### Required geometry contract

One geometry owner should:

- measure only after the final host is stable;
- compare before writing;
- preserve a valid transform/size instead of clearing it simply to measure again;
- invalidate only on meaningful host/viewport/content changes.

---

# 7. The 114 / 107 / 108 Favorites count disagreement now has an exact data shape — PROVEN

The database explains the previously confusing count values.

### Global index rows

All 114 listing rows currently have `isFavorite=true`.

Their stored availability flag is:

```text
108 available
6 sold-out
```

This **must not** be interpreted as Etsy's 108 server total meaning "the available rows". The live HAR shows Etsy returning at least one `isSoldOut:true` listing in its current unfiltered Favorites endpoint. The identical number 108 is therefore coincidental, not proof of equivalent set semantics.

### Cached canonical All scope

The last complete no-query All scope contains 107 listing IDs.

Listing-side membership for that scope breaks down as:

```text
103 available + active All membership
  4 sold-out + active All membership
  1 available + inactive All membership
  4 available + no All membership
  2 sold-out + no All membership
```

So the complete All cache is not the same set as all 114 indexed favorite rows.

The HAR provides a particularly useful proof of staleness: one sold-out listing returned by Etsy on a current unfiltered native Favorites page was absent from the cached All scope.

### Cache age

The All scope's last complete synchronization was about 24 hours 49 minutes before the database export. Later partial/metadata observations updated `lastObservedAt` and `lastSyncState`, but **did not** update `lastCompleteSyncAt`.

Current sync freshness correctly keys off `lastCompleteSyncAt`, so metadata activity is not masking staleness in the current source. The export does not include the user's BetterSearch configuration, therefore this evidence alone cannot tell whether auto-sync was disabled or whether a due auto-sync failed to run.

Diagnostics should capture `autoSync`, selected interval and the reason a due sync was/was not scheduled.

---

# 8. The All header currently prefers stale cache total over current Etsy total — PROVEN SOURCE BUG

`src/86-favorites-page-shell.js::favScopeCounts0120()` currently selects the total in this order:

```text
favState.total
-> props.totalListings
-> props.itemCount
-> favState.records.length
```

Cache bootstrap sets `favState.total = records.length`. Therefore a stale but complete 107-record All snapshot can outrank a current Etsy SSR/server total of 108.

This gives a direct source-level explanation for the observed 107-vs-108 header disagreement.

### Required count authority

Do not expose one ambiguous number called `Favorites` from multiple data authorities.

At minimum distinguish:

- current Etsy/server scope total;
- current complete BetterSearch scope membership count + generation/time;
- global indexed favorite rows;
- deep-metadata coverage count.

For a visible native current scope, a fresh Etsy/server total should not be overwritten by an older cache total merely because the cache loaded first.

---

# 9. Settings `114 / 114 Favorites` is not the current All-scope count — PROVEN SOURCE SEMANTICS

`favIndexGetStats(owner)` unions listing IDs across **all** stored scopes for that owner, then reports active `isFavorite=true` rows from that union.

The exported database contains collection, group and native-query scopes in addition to All. Some listings were seen through those scopes after the last complete All snapshot and therefore contribute to the global 114-row index even when they are not members of the stale 107-row All snapshot.

The Settings value can therefore be useful as **index coverage**, but it must not be presented as though it is necessarily the authoritative current All Favorites total.

Suggested UI wording:

```text
Indexed favorite records: 114
Deep metadata: 114 / 114 indexed records
Last complete All sync: ...
Current Etsy All total: 108   // when currently available
```

---

# 10. Scope and listing membership representations can disagree — PROVEN

The dump contains five cases where a scope's `listingIds` array still references a listing whose listing-side membership for that exact scope is inactive.

There are no missing listing objects for those scope IDs, and the reverse direction was clean: every active listing-side membership found in the dump belonged to a scope that also referenced the listing.

This matters because `favIndexGetStats()` and `favIndexGetActiveListings()` build owner membership from scope `listingIds` without checking the listing-side membership for each scope.

### Required storage invariant

A scope membership must have one canonical representation, or both representations must be transactionally reconciled and validated.

Add an index integrity routine/test that checks:

```text
scope listingIds <-> listing.favoriteScopes[scopeKey].active
```

and repairs or reports drift deterministically.

---

# 11. Reactivated memberships retain stale removal tombstones — PROVEN

There are 23 listing memberships in the export where:

```text
active = true
removedAt > 0
```

Most belong to one query/collection test scope; a small number occur in canonical scopes.

Current merge behavior spreads old membership data and then incoming membership data. An incoming `{ active:true, lastSeenAt:... }` does not explicitly delete the old `removedAt`, so the stale tombstone survives reactivation.

### Required invariant

When a membership becomes active:

```text
active=true
lastSeenAt=current observation
removedAt must be absent/0
```

When inactive:

```text
active=false
removedAt=current removal evidence
```

Add a migration/repair for existing contradictory rows.

---

# 12. An ownerless Favorites scope has reached durable IndexedDB — PROVEN

The scope store contains one persisted `items` scope whose owner identity is empty.

This is important because the long Diagnostics recording did **not** reproduce the old malformed `/users//collections/` request. The absence of that network request in this session therefore does not mean the identity problem never reached production state.

Current `favScope()` can produce `owner:''` whenever the transient Etsy props lookup is unavailable. Network sync has owner guards, but lower-level page observation can still build/persist `favIndexCurrentScope()` from the transient empty owner.

### Required invariant

For owner-required Favorites data:

- latch a valid profile owner identity early and durably for the document/scope;
- never construct/persist an owner-required scope with an empty owner;
- reject invalid scope identity at the storage boundary as well as the network boundary;
- migrate/delete existing ownerless rows;
- keep the Diagnostics `/users//collections/` automatic marker until the migration and identity latch have been browser-proven.

---

# 13. Dataset-query scope storage is polluted by transient/invalid queries — PROVEN

The database contains 52 scope rows:

```text
26 items scopes
20 collection scopes
6 generated-group scopes
```

Among them are many transient query scopes, many complete zero-result scopes, and a number of extremely long free-form query strings. Some of the long strings are clearly not plausible intentional product-search terms.

Private query text is intentionally omitted here.

Current query tracking in `src/99-favorites-v0131-correctness.js` improved the original stale-SSR problem, but it can still commit the pending query after the 850 ms fallback even when the native grid fingerprint has not changed. Stored scopes also have no meaningful garbage-collection policy.

### Required hardening

- bind committed-query tracking to one verified Etsy Favorites search control instance;
- record why a query became committed (`submit`, clear-X/search event, verified native result transition, fallback);
- require stronger evidence before the fallback creates a durable dataset identity;
- apply a sensible maximum query length to durable scope identity even if the UI accepts longer transient text;
- garbage-collect old zero-result/transient query scopes;
- preserve canonical no-query scopes separately from transient query history;
- add Diagnostics state for pending/committed query + source/reason.

Do not silently reuse old transient query scopes as current catalogue truth.

---

# 14. Scope-store growth needs retention/GC — PROVEN NEED

For a 114-row listing index, 52 persisted scope rows already include many old zero-result query snapshots, invalid/transient identities and the ownerless scope described above.

Because owner stats/read paths union all stored scopes, unbounded scope growth is not merely storage clutter; it affects the semantic universe used by index statistics and maintenance.

Suggested retention model:

- keep canonical no-query All/collection/group scopes;
- keep only a bounded LRU/history of verified user query scopes if caching those queries remains useful;
- aggressively remove old zero-result transient queries;
- remove ownerless/structurally invalid scopes;
- remove obsolete per-listing inactive memberships when no retained scope references them;
- run integrity repair as an explicit schema migration/maintenance step, not opportunistically during every render.

---

# 15. Deep scanner itself completed cleanly — PROVEN

All 114 queue rows were completed successfully:

- 113 `forced_update` jobs;
- 1 `missing_metadata` job;
- every row completed in one attempt;
- no queue error strings;
- no duplicate listing IDs;
- every listing row has a non-zero `lastDeepScanAt`.

This shifts several remaining metadata bugs away from "the scanner never ran" and toward field extraction, capability semantics, availability UI, freshness/context, or lifecycle application.

---

# 16. Real metadata coverage is uneven by capability — PROVEN

Coverage in the exported 114 listing rows:

| Field | Known |
| --- | ---: |
| card price | 114 / 114 |
| card rating | 114 / 114 |
| card review count | 114 / 114 |
| card sale state | 114 / 114 |
| card free-shipping signal | 114 / 114 |
| card sold-out signal | 114 / 114 |
| card digital signal | 114 / 114 |
| card personalization | 114 / 114 |
| card variations | 114 / 114 |
| deep category | **114 / 114** |
| deep seller name | 114 / 114 |
| deep gift-wrap positive/known | 6 / 114 |
| deep Etsy's Pick | 0 / 114 |
| deep vintage | 0 / 114 |
| ships-from country | 108 / 114 |
| auxiliary shipping cost | 114 / 114 |
| estimated delivery | 94 / 114 |
| returns | 113 / 114 |
| exchanges | 111 / 114 |
| processing days | 0 / 114 |
| verified ships-to | 0 / 114 |
| carts signal | 16 / 114 |
| low-stock / stock count | 31 / 114 |

All 80 shops referenced by the 114 listing rows have a shop-store row and known Star Seller state. Other reserved shop-level fields are largely unpopulated.

### Important correction to the first capture analysis

Category metadata is **not** missing in this database. It is complete for all indexed rows and for all rows in the stale cached All snapshot.

Therefore the observed "hide unavailable catalogue filters" failure cannot be explained simply as category metadata being unknown.

---

# 17. Hide-unavailable/category behavior has a lifecycle/reconciliation problem, not a category-data shortage — PROVEN DATA + STRONG SOURCE EVIDENCE

The catalogue has only a small subset of Etsy's top-level category choices represented, while every indexed row has known category metadata. Unavailable category choices should therefore be computable.

Current late availability code does perform positive category matching. However the implementation is spread across multiple generations (`76`, `78`, `85`, `88`, `91`) that override builders, availability functions and refresh behavior.

`favRefreshFacetAvailability0120()` also performs unconditional DOM writes and select reconstruction each time it runs, while rail replacement can create a new set of nodes after an earlier availability pass.

The next fix should not add another category-specific wrapper. Consolidate availability evaluation into one generation-aware model:

```text
availability input generation =
  dataset generation
  + metadata generation
  + filter config hash
  + availability mode

compute availability model once
-> reconcile current mounted rail once
-> skip unchanged DOM
```

For metadata-dependent capabilities use explicit states:

```text
available
unavailable
unknown/incomplete
```

Unknown must not silently masquerade as definitely available, but the current category failure should be debugged as lifecycle/state application because category itself is fully known here.

---

# 18. Shipping context migration is partly complete and behaving as designed

Most current shipping-cost and estimated-delivery fields carry the destination context key for the current country. A small number of older rows still have empty context keys from pre-context observations.

`src/61h-favorites-metadata-coordinator.js` treats shipping/delivery as context-sensitive and only accepts a field as fresh when its stored `contextKey` matches the current destination. Therefore old contextless values should be re-requested when shipping becomes an active requirement rather than silently treated as fresh.

Keep this invariant in the eventual index migration; do not "repair" empty legacy context by guessing the destination.

---

# 19. The live recording contained almost no conventional crash evidence — PROVEN

The long recording did not show a meaningful uncaught BetterSearch exception or a relevant HTTP error sequence that explains the visible failures. Network failures were dominated by browser/client blocking rather than failing Favorites API requests.

The dominant failure class is therefore asynchronous state/DOM ownership and stale generation commit, not one obvious thrown exception.

---

# 20. The historical malformed ownerless collection request was not reproduced — NOT REPRODUCED

No `/users//collections/` request occurred in this recording.

Do not mark the old bug closed solely from this session, because the IndexedDB ownerless scope proves empty-owner identity did exist at some earlier point. Keep the network guard/automatic marker while implementing the stronger storage + identity latch described above.

---

# 21. Performance evidence: use structural conclusions, not raw absolute timing

The recording contains many long tasks, but Diagnostics itself records a huge mutation stream and adds overhead. Do not treat the total long-task duration as a clean BetterSearch benchmark.

The robust performance evidence is structural:

- tens of thousands of BetterSearch-owned no-op DOM writes;
- repeated rail/header/toolbar reconstruction;
- repeated geometry measurement/writes;
- competing writer layers;
- broad observer/reconcile chains.

A post-consolidation benchmark should compare the same navigation script with Diagnostics' DOM mutation capture disabled or with a lightweight counter-only mode.

---

# 22. Diagnostics instrumentation improvements required by this audit

Future `important-elements` snapshots/markers should include sanitized BetterSearch internal state so a 600 MB capture does not require reconstructing every generation from DOM alone.

Recommended fields:

```text
scopeKey / datasetKey / viewKey (sanitized owner component)
dataset generation
committed native query
pending native query
query commit source/reason
catalogue source: cache/network/native
catalogue complete flag + generation
scope lastCompleteSyncAt
records length / filtered length / server total
render mode + ownership generation + takeover reason
native grid connected/visible/card count
local grid connected/visible/card count
native page / local page
native pager identity / local pager identity
rail generation / shell reconcile reason
metadata requirements + pending/unresolved counts
availability mode + availability-model generation
count authority values (server/cache/index)
autoSync enabled + interval + due/suppressed reason
DOM writes performed/skipped during reconcile
```

Add automatic markers for:

- local empty result while hidden native grid contains >0 cards;
- local ownership while native pager is visible;
- server/cache/index count disagreement;
- rail generation >1 in one document;
- excessive reconcile/no-op mutation burst;
- invalid/ownerless scope identity attempt;
- implausibly long query being committed to durable dataset identity.

---

# 23. Ranked implementation plan from the evidence

## Priority A — lifecycle/shell consolidation

Fix the primary self-conflict first:

- stop reparenting Etsy sidebar children into a BetterSearch-owned hidden source;
- establish one shell owner and narrow observer;
- retire redundant shell/install/repair wrappers;
- make DOM reconciliation compare-before-write.

## Priority B — transactional grid + pager ownership

- sign local result work to a dataset/query/config/metadata generation;
- keep Etsy visible until the local transaction is ready;
- switch grid + pager ownership atomically;
- preserve the known v0.15 dual-pager selector separation.

## Priority C — count/data authority cleanup

- stop stale `favState.total` from outranking current server total;
- rename Settings counts so index coverage is not presented as current All membership;
- expose/track source and generation for every displayed count.

## Priority D — IndexedDB integrity + migration

- reject/migrate ownerless scopes;
- clear stale `removedAt` on reactivation;
- reconcile scope `listingIds` with listing-side membership;
- add scope retention/GC;
- harden durable query identity;
- provide a developer-only integrity report/repair command.

## Priority E — availability consolidation

- compute one generation-aware availability model;
- remove duplicate builder/availability wrappers;
- retain available/unavailable/unknown semantics;
- make reconciliation DOM-idempotent.

---

# 24. Regression tests that should exist before the next major merge

### Shell/lifecycle

- stable Etsy sidebar host -> one BetterSearch rail generation;
- unrelated native mutation -> no rail rebuild;
- repeated reconcile with identical state -> zero structural DOM writes;
- Etsy soft rerender -> one bounded reconcile, not wrapper cascade.

### Query/grid ownership

- native search submit/clear generation cannot commit stale local empty result;
- local render from old dataset generation is rejected;
- local empty + native grid >0 is an invariant failure;
- native grid and local grid are never visibly authoritative together.

### Pager ownership

- hidden native pager while local mode owns results;
- local pager excluded from native pager discovery;
- native page intent cannot be set by local pager click;
- grid owner and pager owner transition together.

### Counts

- stale cache 107 + current server 108 -> visible native header uses correct current authority;
- index coverage 114 is labelled as index coverage, not current All count;
- count source/generation changes are deterministic.

### IndexedDB invariants

- ownerless scope write rejected;
- active membership has no stale removal tombstone;
- scope/listing membership representations cannot diverge silently;
- reactivation clears removal state;
- invalid/transient query scope retention is bounded;
- stale query scopes cannot inflate current authoritative scope membership.

### Availability

- 114/114 known categories with only a subset represented -> absent category options hide correctly;
- rail replacement after data hydration re-applies the same availability model;
- repeated availability refresh with unchanged state produces no hidden/text/select child mutations.

---

# 25. What this report intentionally does not claim

- It does not claim Etsy's current total of 108 equals the 108 rows whose stored availability is `available`; live evidence disproves that simple equivalence.
- It does not prove why every one of the six records outside active All membership is absent from that stale snapshot; the snapshot is old and only part of the current server set was captured page-by-page.
- It does not prove which UI event originally caused every long/invalid stored query. It proves that those durable scopes exist and that the query-commit/storage boundary needs hardening.
- It does not claim the historical `/users//collections/` malformed request is fixed; only that it was not reproduced in this session.
- It does not use the Diagnostics long-task totals as a clean benchmark because the recorder itself adds overhead.

The next code changes should be driven by the invariants above rather than another patch-on-patch repair layer.
