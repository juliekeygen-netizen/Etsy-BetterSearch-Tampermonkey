# Favorites audit index and next implementation phases — 2026-08-30

This document is the navigation/status layer for the current Favorites architecture work.

The original canonical architecture research remains:

`FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`

Many of its early data/grid ownership phases have since been implemented in v0.14–v0.15. The 2026-08-29/30 Diagnostics + IndexedDB audits below now contain the strongest evidence for the next phase and should be read as evidence-backed amendments to the original plan.

Current production baseline for these audits: **BetterSearch v0.15.1**.

---

# 1. Evidence/audit document map

## Full real-browser capture + IndexedDB evidence

### `FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md`

Primary sanitized forensic report.

Covers:

- sidebar/rail generations;
- native/local grid ownership race;
- Search clear stale-empty result;
- pager contradiction;
- enormous no-op mutation stream;
- count disagreement;
- filter-availability behavior;
- metadata/index coverage;
- ownerless durable scope evidence;
- query-scope pollution;
- initial ranked fix plan.

### `FAVORITES_INDEXEDDB_INTEGRITY_ADDENDUM_2026-08-29.md`

Focused database semantics.

Covers:

- mutable `complete:true` membership;
- partial observations after complete sync;
- failed replacement crawl contaminating previous complete membership;
- cache startup trusting mixed membership;
- stale removal tombstones;
- scope/listing membership disagreements;
- ownerless storage;
- freshness needing integrity, not only age.

---

# 2. Source audit continuation

### `FAVORITES_AUDIT_CONTINUATION_2026-08-30.md`

Second broad source pass.

Major findings:

- complete-refresh page-by-page contamination;
- owner validation at wrong layer;
- empty-owner deep-maintenance broadening;
- timeout native-query commit;
- v0.15.1 local/native pager selector/event alias;
- render signature missing data generation;
- Settings writer race;
- concrete no-op mutation writers;
- shell wrapper stack;
- dual availability generations;
- category field-knowledge semantics.

### `FAVORITES_LOCAL_CARD_ACTION_AUDIT_2026-08-30.md`

Focused local-card interaction audit.

Covers:

- native action delegation;
- fixed-delay heart state inference;
- hidden-iframe off-page heart bridge;
- missing listing-identity verification before iframe heart action;
- safe listing-open fallback for off-page cart/options;
- action generation requirements.

---

# 3. Audit chunk 3 — identity, counts, collections, cross-tab

### `FAVORITES_AUDIT_CHUNK3_2026-08-30.md`

Requested third broad audit.

Covers:

- full count-authority writer/consumer map;
- stale cache count outranking Etsy count;
- `favProps()` owner extraction incorrectly depending on total-count availability;
- missing stable owner latch;
- collection model not owner-keyed;
- collection-create watcher bound to any dialog/current location rather than operation generation;
- cross-tab stale scope read/modify/write;
- timestamp-based peer completion;
- ownerless current-page persistence boundary;
- own-profile/auto-sync fragility.

### `FAVORITES_NATIVE_QUERY_COMMIT_EVIDENCE_2026-08-30.md`

Native search/query correctness plan.

Covers:

- current 850 ms timeout promotion weakness;
- current test that locks the timeout behavior in;
- Diagnostics/CDP evidence already captured by the development extension;
- controlled native submit/clear/out-of-order experiment matrix;
- generation/submission-ID state machine;
- timeout as UI fallback only, never durable commit proof;
- production acknowledgement mechanism research order;
- redacted query Diagnostics events;
- bounded query-cache retention.

### `FAVORITES_INDEXEDDB_V3_GENERATION_MIGRATION_PLAN_2026-08-30.md`

Concrete durable-data redesign.

Covers:

- immutable `scopeSnapshots` generation store;
- mutable scope state pointing to active generation;
- partial positive overlay separate from complete membership;
- v2 legacy snapshots migrated as unverified/mixed, never magically trusted;
- atomic active-generation commit;
- exact generation handoff across tabs;
- ownerless quarantine;
- listing-membership repair;
- query-scope migration/GC;
- snapshot GC;
- migration markers;
- required `db.onversionchange` cooperation for multi-tab upgrades;
- staged rollout and regression matrix.

### `FAVORITES_MULTITAB_AND_DELIVERY_TARGET_AUDIT_2026-08-30.md`

Cross-tab/runtime delivery semantics.

Covers:

- what is genuinely protected by deep-job leases/catalogue locks;
- tab-local deep Cancel/challenge suppression;
- extension raw storage mirror vs non-reactive live config objects;
- Tampermonkey lack of project-owned live value-change propagation;
- duplicate BetterSearch userscript + browser extension split-brain risk;
- need for one feature-runtime owner/singleton;
- extension/Tampermonkey startup timing differences;
- unawaited extension compatibility preference writes;
- generation broadcasts;
- schema-upgrade multi-tab behavior.

---

# 4. Additional bugs found while auditing the requested areas

### `FAVORITES_MULTI_OWNER_MEMBERSHIP_AUDIT_2026-08-30.md`

High-severity data-model issue discovered during v3 design.

Current schema combines:

```text
owner-specific favoriteScopes
+
one global listing.isFavorite boolean
```

A complete All refresh for owner A can call the global unfavorite path, which marks **all** stored owner memberships inactive. Cache materialization also gates every owner by the same global boolean.

Required invariant:

> Listing metadata may be global by listing ID; Favorites membership is owner/scope-generation-specific; viewer-personal heart state is a separate concept.

This belongs in the v3 phase, not later cleanup.

### `FAVORITES_INDEXEDDB_ATOMIC_WRITE_AUDIT_2026-08-30.md`

High-severity stale whole-row write audit.

Covers:

- scope stale read/put;
- deep metadata write racing unfavorite and restoring stale favorite/membership state;
- unfavorite erasing concurrent metadata;
- availability update erasing unrelated newer fields;
- base deep queue enqueue/update racing the atomic claim path;
- atomic mutable-row writer API;
- required cross-tab interleaving tests.

### `FAVORITES_CATALOG_LEASE_STORAGE_AUDIT_2026-08-30.md`

Catalogue-lock fallback audit.

Covers:

- raw owner/query identity in lock/localStorage names;
- localStorage fallback not being a true atomic compare-and-set;
- two tabs both being able to conclude they acquired the same fallback lease;
- lease-loss heartbeat not aborting the stale crawler;
- stale query-bearing crash keys;
- bounded opaque coordinator identity;
- IndexedDB atomic fallback + generation CAS.

### `FAVORITES_SCOPE_CREATION_AND_RETENTION_AUDIT_2026-08-30.md`

Scope lifecycle/query-pollution audit.

Covers:

- current-page partial scope creation;
- catalogue per-page observations;
- metadata observations;
- generated-group query helper producing a byproduct owner-wide `items + query` partial scope;
- auto-sync being able to promote the current query descriptor to a complete durable scope;
- missing scope class/retention policy;
- explicit durable/bounded/ephemeral/quarantine scope classes;
- query TTL/LRU and `lastUsedAt` policy.

---

# 5. Source-proven P0 issues as of this audit

The next data-integrity phase should be designed around these invariants together, not patched independently.

## P0-A — stable identity

- Owner extraction must not depend on count availability.
- One owner/profile generation must be latched from trusted evidence.
- Temporary props disappearance must not create `owner=""`.
- Owner-required network/storage APIs reject unresolved identity.
- Collection model and operations are owner-generation scoped.

## P0-B — immutable authoritative membership

- Complete Favorites membership is one immutable verified generation.
- In-progress pages cannot mutate the previous complete generation.
- Failed/cancelled crawls leave active generation untouched.
- V2 “complete” rows migrate as legacy-mixed/unverified.

## P0-C — atomic mutable writes

- Final listing/scope/queue mutations read and merge latest state in the same short IndexedDB readwrite transaction.
- Long network/parsing work happens outside the transaction.
- Deep metadata can never restore a newer unfavorite/membership state from a stale object.
- Enqueue/update can never overwrite a newer running queue lease.

## P0-D — owner-specific membership

- No global `isFavorite` may invalidate another profile owner's membership.
- Verified owner All generation may retire only that owner's membership.
- Viewer personal heart state is separate.

## P0-E — generation-safe cross-tab catalogue

- Web Locks remain the preferred dedupe path where available.
- Fallback lock must be atomic, not localStorage read/write/read.
- Peer completion uses exact verified generation ID.
- Stale crawler cannot change active pointer after lease/generation loss.

## P0-F — render/pager transaction

Already established in prior audits:

- local pager never aliases native pager;
- local/native grid+pager ownership changes atomically;
- local result authority token includes catalogue/query/metadata/result generation;
- stale local result can never hide a newer useful Etsy native grid.

---

# 6. P1 issues after the durable-data boundary

## Native query generations

- gather short CDP experiment evidence;
- replace timer-only durable commit;
- bind to exact owner/scope/search-control generation;
- reject late A response after B/clear;
- bound query caches and GC.

## Count model

- replace overloaded `favState.total` presentation semantics;
- expose server/native total vs catalogue-generation total vs local-match count vs index coverage explicitly.

## Collection lifecycle

- owner-key collection cache;
- exact create-operation tracking;
- owner-verify fetched collection refresh;
- cancel stale operation on route/owner generation change.

## One availability owner

- field-specific known/unknown/available state;
- no legacy + v2 simultaneous mutation paths;
- diff before DOM write.

## One lifecycle/UI controller

- one shell/rail/toolbar owner;
- one narrow observer;
- remove layered late wrappers instead of adding more;
- retain current visual contract.

## Cross-tab UX/runtime

- durable global deep auto-run pause/challenge state;
- scope-generation broadcast/re-prime;
- explicit settings propagation contract;
- duplicate feature-runtime singleton.

---

# 7. Recommended implementation releases

Do not implement every finding in one patch.

### Data Release A — owner + atomic primitives

- split identity props from count props;
- stable owner generation/latch;
- owner-required persistence/network validation;
- `db.onversionchange` handling;
- generic atomic listing/scope/queue mutation helpers;
- convert current stale whole-row mutation paths;
- cross-tab interleaving tests.

### Data Release B — IndexedDB v3 generations

- schema migration;
- legacy-mixed compatibility reader;
- immutable scope snapshots;
- active generation pointer;
- partial overlay;
- owner-specific membership semantics;
- generation-safe complete crawler commit;
- atomic/opaque catalogue lease fallback;
- exact peer generation handoff.

### Data Release C — query/scope lifecycle

- Diagnostics short native-search research captures;
- verified query acknowledgement state machine;
- durable-query prerequisite;
- generated-group helper persistence cleanup;
- scope classes + TTL/LRU/GC;
- count view model.

### UI/Lifecycle Release D

- bounded v0.15.1 pager identity correction may be done earlier if desired because it is small/source-proven;
- generation-safe render takeover;
- one lifecycle controller;
- one rail/availability/toolbar owner;
- delete superseded wrappers as responsibility moves.

### Runtime Release E

- global deep pause/challenge coordinator;
- generation broadcasts;
- settings propagation policy;
- feature-runtime singleton across Tampermonkey/extension;
- delivery-target parity smoke tests.

Each release should leave the repository simpler or establish a clear replacement boundary. Avoid “module 102 patches module 101” as the default implementation method.

---

# 8. Test philosophy changed by these audits

Source/static tests are useful but several current weaknesses are green because the fixture does not model the real concurrency/state combination.

Future tests need executable interleavings and combined fixtures:

```text
hidden native pager + visible local pager
old complete generation + failed replacement pages
two tabs partial-writing same scope
deep response in A + unfavorite in B
enqueue in A + claim in B
owner A + owner B same listing
props owner present but count unavailable
profile A collection cache -> profile B hydration gap
submit A -> clear/B -> late A response
old DB connection -> versionchange upgrade
Tampermonkey + extension duplicate feature runtime
```

Do not call a multi-tab area covered merely because one function contains a readwrite transaction. The transaction must include the **read of the state being mutated**.

---

# 9. Current non-goals

This audit does not request:

- a UI redesign;
- server-filter delegation in the same patch as data migration;
- raw capture data in the public repo;
- deleting historical metadata merely because membership is stale;
- moving all shared code into the browser-extension background and abandoning Tampermonkey;
- treating undocumented Etsy internals as a stable public API.

The frozen current visual contract remains the target while the ownership/data machinery underneath it is corrected.

---

# 10. Short next-step rule

If implementation starts from this audit, begin with **owner identity + atomic mutable writer primitives**, then introduce the v3 immutable-generation schema.

Do not begin by refactoring the rail UI. The real-browser UI race is important, but a renderer cannot be made fully trustworthy while its catalogue/query/owner generation truth can still be overwritten by stale cross-tab persistence.