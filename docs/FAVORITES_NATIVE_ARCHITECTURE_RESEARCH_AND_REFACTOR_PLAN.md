# Favorites native architecture research and refactor plan

Date: 2026-08-28

Status: research complete enough to guide implementation. This document is the canonical plan for the next Favorites architecture/performance refactor. It records the HAR findings, current code problems, target architecture, implementation order, experiments, and explicit non-goals so future work does not lose the reasoning behind the plan.

## Executive summary

The main reason BetterSearch Favorites can feel slower, more fragile, and less native than Etsy is **not** a fundamental browser-extension limitation. The largest problems are architectural:

- ordinary native page changes can cause BetterSearch to discard a valid full catalogue and fetch the entire scope again;
- two separate systems (`favLoadAll()` and `favSyncScope()`) both know how to crawl complete Favorites scopes;
- IndexedDB already contains the durable catalogue information needed for cache-first startup, but current loading is network-first and only hydrates from the cache afterward;
- auxiliary metadata is fetched for the whole catalogue rather than prioritized around what is visible or what the active filters actually need;
- the current runtime and late shell modules contain multiple generations of MutationObservers and function wrappers that repair one another;
- BetterSearch sometimes inserts or moves UI inside Etsy's Preact-owned hydrated component islands, which means Etsy may legitimately reconcile or replace those nodes later;
- the extension build is one concatenated content script, but it still preserves the semantic patch-on-patch module chain, and both userscript and extension currently begin at `document-idle`.

The two HAR captures, one without BetterSearch and one with the current extension, showed a particularly important concrete problem: during one All-Favorites browsing sequence, BetterSearch repeatedly downloaded the complete ~64-item catalogue and repeated the auxiliary metadata pass while Etsy itself fetched only the requested native 20-item page. Fixing this should produce a large improvement before any deeper optimization.

The target is a hybrid/native-first architecture:

- Etsy owns native page chrome, current-page cards, native routing, and native pagination whenever possible.
- BetterSearch owns one stable shell/root, the permanent filter rail, collection selector, enhanced filter state, one catalogue service, IndexedDB, and custom global filtering/sorting when Etsy cannot provide it.
- BetterSearch should not take over the product grid merely because the extension exists.
- A valid cached catalogue should be usable immediately, with stale refreshes happening in the background.
- Expensive metadata should be loaded on demand and prioritized.
- There should be one lifecycle controller and one clearly defined DOM ownership boundary.

The current UI is considered the visual contract. The refactor should preserve it while replacing the machinery underneath it.

---

## Evidence and important discoveries

### 1. Ordinary page changes can trigger a complete catalogue reload

The current dataset identity and route identity are mixed together.

`favDatasetKey()` correctly represents the actual catalogue scope using the owner, scope type, scope id, and effective query. A change from `?page=1` to `?page=2` does not represent a different catalogue.

However, the runtime also checks `favState.lastHref !== location.href`. When the URL changes, `favResetForNativeChange()` clears/invalidates most of the live catalogue state, including the load key, load-complete state, records, record map, totals, extra-info readiness, native grid capture, and local page state. It then begins loading again.

The HAR with BetterSearch showed the practical result. For an All scope of roughly 62-64 favorites, a complete catalogue is four 20-item pages:

```text
offset 0
offset 20
offset 40
offset 60
```

During one browsing sequence BetterSearch performed this complete scan multiple times, and also repeated the auxiliary metadata pass each time. Etsy's native page transition fetched only the requested page.

**Conclusion:** page number, harmless `ref` changes, and other view-only URL state must not invalidate the catalogue.

### 2. Etsy Favorites is server-rendered first and hydrated later

The captured Etsy production bundles show the current page architecture still follows Etsy's Mobius/component-island model. The page arrives with useful server-rendered HTML, including current Favorites cards and embedded `script[type="text/props"]` data. Interactive islands are then hydrated with Preact.

The island loader searches for `data-component-island-template`, reads the embedded props, and hydrates component islands as needed. Etsy therefore does not need to blank the page and rebuild the initial Favorites view after JavaScript starts.

This matters because BetterSearch should cooperate with the already-useful server-rendered page rather than treating the initial native DOM as temporary scaffolding.

### 3. The first native page is already useful before BetterSearch fetches anything

The no-extension HAR shows that the initial first page does not need a separate full `landing-listings` request just to display the first 20 cards. Those cards arrive in the HTML/embedded page state. Etsy then asks for additional information for the relevant visible listing IDs.

Native startup is therefore approximately:

```text
HTML response
  -> header / Favorites UI / first page cards / props
  -> paint useful page
  -> hydrate islands
  -> request auxiliary data for current visible listings
```

BetterSearch should preserve and use that work.

### 4. Etsy native pagination fetches one requested page, not the whole catalogue

The current Etsy Collections/Favorites production code calculates the requested offset from the page number, fetches that page, updates state, and uses History API state for navigation. The captured code stores the returned page payload in `history.state` and handles `popstate`.

This creates three concepts that BetterSearch must keep separate:

```text
SCOPE    = All / a collection / a generated group
DATASET  = scope + effective query/filter identity
VIEW     = page number / current native page state
```

A view change must not be treated as a dataset replacement.

`history.state` may also be usable as an opportunistic source for current-page payloads, but that should remain an optimization with safe fallbacks because it is Etsy-internal structure.

### 5. BetterSearch has two complete-catalogue download systems

`favLoadAll()` is an interactive/UI loader that can fetch every 20-item page of the current scope.

`favSyncScope()` is also a complete scope crawler. It already has synchronization state, progress, retry behavior, stale-time policy, complete/partial semantics, and IndexedDB writes.

This creates duplicated responsibilities:

```text
Etsy API
  -> favLoadAll() -> live UI records
  -> favSyncScope() -> durable IndexedDB records
```

These should converge into one catalogue service. A manual/automatic "sync" should become a freshness request to the same service rather than a second independent crawler.

### 6. The durable cache already exists, but startup uses it in the wrong direction

The IndexedDB foundation already stores durable `listings`, `shops`, `scopes`, and `deepScanQueue` data.

Scope records preserve ordered listing IDs, complete/partial state, timestamps, and `lastCompleteSyncAt`. Listing records preserve favorite state, scope membership, timestamps, current/card metadata, deep metadata, shipping metadata, urgency metadata, availability, and field provenance.

Current loading is essentially:

```text
network: download full catalogue
  -> build live records
  -> read IndexedDB to hydrate/enrich those records
  -> render
```

The desired flow is:

```text
IndexedDB: load previous complete scope immediately
  -> usable enhanced catalogue almost immediately
  -> keep current Etsy page visible
  -> reconcile current server-rendered/native page observations
  -> if stale, refresh asynchronously
  -> update the durable snapshot and live view incrementally
```

After one successful complete sync, many repeat visits should need no full-catalogue network scan before BetterSearch becomes usable.

### 7. Auxiliary metadata is fetched too broadly

`favEnsureExtraInfo()` processes the loaded catalogue in batches rather than prioritizing the visible page or fields needed by active filters/sorts.

The HAR showed repeated 30 + 30 + remainder auxiliary metadata calls after repeated full-catalogue loads.

The desired priority is:

1. currently visible/native page records;
2. records/fields required to evaluate an active filter or sort;
3. background enrichment for the remainder of the catalogue.

If the user is not filtering/sorting by shipping-related fields, the page should not block on shipping metadata for an off-screen listing far later in the catalogue.

### 8. Mutation/lifecycle ownership is too broad and layered

The base Favorites runtime observes the whole `document.body` subtree for child mutations and schedules route/current-page work from those mutations.

Later shell modules add or replace additional shell observers and wrappers. Modules in the late v0.12 chain contain explicit compatibility and self-healing logic for earlier layers, including cases where one module repairs another module's behavior or replaces the previous observer.

This has created the pattern:

```text
Etsy mutates DOM
  -> observer A reacts
  -> runtime schedules work
  -> observer B reacts
  -> shell repair mutates DOM
  -> guards try to ignore BetterSearch-owned mutations
  -> later wrappers repair earlier behavior
```

The refactor should replace this with one lifecycle controller, one scheduled reconcile pass, and the narrowest practical observation root.

### 9. BetterSearch must respect Etsy's hydrated Preact ownership boundary

The captured collection page is wrapped in a Preact component island such as the CollectionsLanding component island. BetterSearch has historically inserted/moved custom DOM inside areas that Preact considers part of its own reconciled tree.

That creates a legitimate conflict: Etsy's virtual DOM expects a particular child structure, while BetterSearch has inserted extra children. On a later reconciliation, Etsy may remove, replace, or reuse those nodes.

The preferred long-term structure is:

```text
stable non-hydrated parent
  -> BetterSearch-owned shell/root
  -> Etsy-owned Preact island (treated as mostly read-only)
```

The BetterSearch shell can still reuse Etsy classes, typography, sizes, and native controls while avoiding direct structural competition with Preact.

### 10. Product-grid ownership should be hybrid, not always-native and not always-BetterSearch

BetterSearch cannot leave the grid completely native in every state because some requested behavior requires global knowledge across every favorite, such as custom deep-metadata filters and custom sorts.

The correct model is:

| State | Grid owner |
| --- | --- |
| No BetterSearch global filter/sort | Etsy |
| Native Etsy search or reliably server-delegated filter | Prefer Etsy |
| Catalogue refresh is still happening | Etsy remains visible |
| BetterSearch-only global filter/sort is active and cache is ready | BetterSearch may own the grid |
| Custom mode ends | restore native Etsy grid |

BetterSearch should switch ownership intentionally and once, not blank/rebuild as part of ordinary startup.

### 11. Etsy's Favorites API exposes possible server-delegation opportunities

The captured production helper for the Favorites `landing-listings` endpoint accepts parameters including:

```text
limit
offset
query
available_only
on_sale_only
scope
favorites_title
include_additional_listing_images
should_translate_query
rearrange_sold_out
filters
listing_image_size
```

The collection endpoint supports at least:

```text
limit
offset
query
available_only
on_sale_only
```

These are undocumented/internal interfaces and must not be blindly treated as a permanent API contract. However, they justify a controlled experiment phase.

Potential split if experiments prove stable:

```text
SERVER-DELEGABLE CANDIDATES
- native query/search
- available only
- on sale only
- possibly some Etsy-native category/filter payloads

LOCAL / BETTERSEARCH
- deep metadata fields
- ships-from and other metadata not exposed reliably by the endpoint
- stock/carts signals
- strict-title rules
- multi-search rules
- BetterSearch-only custom sorts
```

Delegating reliable common cases to Etsy would preserve real Etsy cards, totals, and pagination instead of forcing local rendering.

### 12. Native pagination has an important correctness boundary

If Etsy knows there are 64 favorites, native pagination represents those 64. If a BetterSearch-only local filter reduces that to 27 matches, native Etsy pagination does not automatically know the new total.

Therefore the long-term pagination strategy must be explicit:

- if a filter can be delegated to Etsy, keep Etsy's pager and let Etsy own the count;
- if the filtered result count is <= 20, the pager can be absent;
- if a BetterSearch-only local filter yields >20 results, a correct local-pagination strategy is required. Options include an Etsy-style local pager or a carefully isolated adapter, but this should not be solved by patching native pagination nodes ad hoc.

Do not reintroduce the old custom/native pager collision while solving this.

### 13. Extension and Tampermonkey startup differ, but the architecture is shared

The extension build does **not** make the browser load every `@require` module separately. `scripts/build.mjs` concatenates the shared modules into one generated `content.js` for Chrome/Firefox.

However, concatenation preserves the semantic override chain: function A is defined, wrapped by B, replaced by C, repaired by D, and so on. One network bundle does not make that architecture clean.

The extension also waits for the platform prelude to load all `browser.storage.local`/`chrome.storage.local` values into its synchronous mirror before the shared modules continue.

Both the userscript and extension currently use `document-idle` for the main implementation.

Long-term startup should be split:

```text
DOCUMENT_START
- tiny bootstrap
- critical Favorites CSS / anti-flash styling
- optional stable root reservation/page marker

LATER (DOMContentLoaded/idle as appropriate)
- settings/state
- IndexedDB
- catalogue
- filters
- deep metadata/background work
```

The heavy app should not be moved wholesale to `document-start`.

---

## Target architecture

A clean end state should look approximately like this:

```text
                         Etsy page / API
                         /            \
                        /              \
            native page adapter      network adapter
                    |                    |
                    +---------+----------+
                              |
                              v
                    FavoritesCatalogService
                    /        |          \
                   /         |           \
            IndexedDB   live snapshot   freshness/sync policy
                   \         |           /
                    \        |          /
                     +-------+---------+
                             |
                             v
                      filter/sort engine
                             |
                  +----------+-----------+
                  |                      |
                  v                      v
          native-grid mode       BetterSearch-grid mode
                  |                      |
                  +----------+-----------+
                             |
                             v
                     single shell/lifecycle
```

Suggested source responsibilities after consolidation:

```text
favorites/
  native-adapter          # reads Etsy SSR props/current cards/native route state
  lifecycle-controller    # one route/scope/view reconciler and observer
  catalog-service         # one full-catalogue access/refresh service
  index-store             # IndexedDB reads/writes/migrations
  metadata-service        # auxiliary/deep metadata prioritization
  shell                   # stable UI root, rail, collection selector, toolbar
  filter-engine           # filtering/sorting and capability requirements
  render-controller       # native vs BetterSearch grid ownership/pagination mode
```

These names are illustrative. The important part is ownership separation, not the exact filenames.

---

# Ordered implementation plan

The refactor must be performed in bounded phases. Do not combine all of this into one giant patch. Each phase should leave `main` testable and should preserve the current UI unless the phase explicitly concerns behavior that cannot remain unchanged.

## Phase 0 - Freeze the current UI and establish measurements

**Purpose:** prevent the architecture refactor from accidentally reopening the long UI-parity debugging cycle.

Tasks:

- Treat the current All/collection layout, responsive behavior, collection-strip drag behavior, toolbar alignment, search widths, filter rail, and native-style visual measurements as the visual contract.
- Add/keep regression tests for DOM structure and class/state expectations where practical.
- Record a simple before-refactor request-count baseline from the existing HAR findings.
- If available, collect matching Chrome Performance traces with and without BetterSearch for the same navigation sequence. This is useful but not a blocker for Phase 1.
- Do **not** commit raw HAR files. HARs may contain account/session/private request data; only record sanitized findings.

Exit criteria:

- current UI contract is documented/tested enough that later refactors can be judged against it;
- network baseline is recorded;
- no functional refactor yet.

## Phase 1 - Separate dataset identity from view/route identity

**Purpose:** eliminate the repeated full-catalogue refetch bug with the smallest high-value change.

Tasks:

- Introduce explicit identities for owner/scope/dataset/view.
- Ensure native `page=` changes do not clear a valid catalogue.
- Ignore harmless `ref=` and equivalent navigation-only URL changes for catalogue invalidation.
- Only reset records when owner, actual Favorites scope, or effective dataset query changes.
- Preserve records/metadata when moving page 1 -> 2 -> 3 -> Back within the same dataset.
- Reconcile current-page native cards/props without treating them as a new full scope.
- Preserve cancellation for genuinely stale work when owner/scope changes.
- Add tests specifically proving same-dataset page navigation does not invoke another full catalogue load.

Do not yet rewrite the whole catalogue service or observer system.

Exit criteria:

- one All scope visit should not refetch offsets 0/20/40/60 merely because native page changes;
- collection page changes within the same collection should behave similarly;
- current UI remains unchanged.

## Phase 2 - Make IndexedDB cache-first for complete known scopes

**Purpose:** make repeat visits usable immediately from durable state.

Tasks:

- Add an efficient read path for a complete stored scope and its ordered listing IDs.
- Hydrate live records from IndexedDB before performing a full network refresh.
- Use the server-rendered first/current Etsy page to reconcile fresh visible records immediately.
- Preserve `known/unknown/stale/source/observedAt/parserVersion` semantics.
- Respect `lastCompleteSyncAt` and current freshness policy.
- If a cached scope is complete but stale, display/use it while a refresh happens asynchronously.
- Never mark unseen records unfavorited from a partial/current-page observation.
- Add stale-cache, missing-cache, corrupted/incomplete-cache, and refavorite tests.

Exit criteria:

- repeat Favorites visits can expose a usable enhanced catalogue before a full network scan finishes;
- stale refresh no longer blocks native page display;
- authoritative unfavorite semantics remain correct.

## Phase 3 - Unify `favLoadAll()` and `favSyncScope()` behind one catalogue service

**Purpose:** remove duplicate full-scope crawlers and make sync a freshness policy rather than a second data system.

Tasks:

- Design one `FavoritesCatalogService` (name may differ) responsible for:
  - returning current/cached scope snapshots;
  - refreshing a scope;
  - deduplicating concurrent refresh requests;
  - retry/cancellation;
  - complete vs partial observation semantics;
  - progress events;
  - writing authoritative snapshots to IndexedDB;
  - providing live records to the UI.
- Migrate UI callers away from direct `favLoadAll()` crawling.
- Migrate manual/auto sync to call the same service with a refresh reason/policy.
- Ensure entering Favorites cannot cause one UI crawl plus one auto-sync crawl.
- Keep the 12-hour stale policy as a policy layer, not a second crawler.
- Preserve manual Sync now / Cancel behavior.

Exit criteria:

- exactly one code path owns complete Favorites scope downloading;
- concurrent callers share the same in-flight refresh;
- UI and sync consume the same snapshot/state.

## Phase 4 - Make auxiliary and deep metadata demand-driven

**Purpose:** remove unnecessary blocking metadata work and make background enrichment intelligent.

Tasks:

- Define metadata capability requirements for each filter/sort.
- Prioritize metadata work:
  1. visible/current-page listings;
  2. fields needed by active filters/sorts;
  3. newly favorited/stale high-priority records;
  4. background catalogue enrichment.
- Do not block ordinary Etsy-order/native mode on metadata that is irrelevant to the active view.
- Cache successful auxiliary observations and honor freshness/TTL.
- Deduplicate requests when the same listing/field is already being fetched.
- Keep the deep-scan queue semantics and integrate its priority with the same capability model.
- Surface truthful unknown/incomplete metadata states rather than silently excluding items.

Exit criteria:

- entering Favorites without a metadata-dependent active filter does not trigger a full-catalogue auxiliary pass as a prerequisite for display;
- activating a metadata-dependent filter prioritizes exactly the needed fields.

## Phase 5 - Native-first grid ownership and rendering modes

**Purpose:** stop replacing already-rendered Etsy content unless BetterSearch actually needs to own the result set.

Tasks:

- Define explicit render modes, for example:
  - `native`;
  - `native-server-filtered`;
  - `bettersearch-local`.
- In native mode, leave Etsy's cards and pagination untouched.
- While cache/catalogue refresh happens, keep Etsy's current products visible.
- Switch to BetterSearch-local rendering only when a BetterSearch-only global filter/sort requires a complete catalogue and a usable snapshot exists.
- Restore the captured native grid when leaving local mode without destroying Etsy listeners/state.
- Avoid blank `Loading...` grid replacement; progress belongs in the established metadata/progress UI row instead.
- Keep recommendation modules outside the result set.

Exit criteria:

- plain Favorites browsing feels native because it literally remains native;
- custom global filtering still works across the complete catalogue;
- no initial grid blanking/flicker.

## Phase 6 - Build one lifecycle controller and one DOM ownership boundary

**Purpose:** eliminate observer wars and most timing/reconciliation bugs.

Tasks:

- Inventory every current Favorites MutationObserver, resize handler, route-change wrapper, shell repair scheduler, and render-after-repair hook.
- Replace body-wide mutation handling with the narrowest practical Favorites root/container observer.
- Create one scheduled reconcile operation that compares expected vs actual state and acts idempotently.
- Separate owner/scope/dataset/view changes explicitly.
- Handle `popstate`, `pageshow`/BFCache, and Etsy soft rerenders in one place.
- Ensure BetterSearch-owned DOM mutations do not retrigger expensive reconciliation.
- Move BetterSearch shell nodes outside Preact-hydrated islands wherever a stable parent exists.
- When a native Etsy node must be referenced/reused, treat it as Etsy-owned and avoid structural relocation where possible.
- Preserve the exact current UI appearance.

Exit criteria:

- one lifecycle controller owns Favorites navigation/reconciliation;
- one narrow observer (or a very small justified set) replaces generations of competing shell observers;
- Etsy Preact reconciliation no longer needs repeated self-healing of BetterSearch-owned shell DOM.

## Phase 7 - Controlled server-delegation experiments

**Purpose:** determine which common filters can be handed back to Etsy so native cards, counts, and pagination remain authoritative.

This phase is experimental first, production second.

Test these captured internal parameters individually and in combinations where sensible:

```text
query
available_only
on_sale_only
filters
scope
```

For each candidate:

- compare returned listing IDs against native UI behavior;
- compare totals / `X-Total-Count` behavior;
- test All and real collections;
- test multiple pages;
- test logged-in locale/currency behavior;
- test empty/no-result states;
- test whether returned cards/fields remain compatible across reloads;
- record the exact evidence in `docs/FAVORITES_METADATA_SOURCES.md` or a dedicated endpoint-compatibility section.

Production adoption rule:

- only delegate a filter if behavior is stable enough and there is a safe fallback to local filtering;
- never make a critical BetterSearch feature depend exclusively on an undocumented Etsy parameter without fallback.

Potential final split:

```text
SERVER-DELEGABLE
- native search/query
- available only (if verified)
- on sale only (if verified)
- selected Etsy-native filter payloads (only if verified)

LOCAL
- strict title
- multi-search
- deep metadata filters
- ships-from / advanced shipping metadata
- stock/carts signals
- custom BetterSearch sorts
- any filter whose server semantics are not proven
```

Exit criteria:

- a documented capability matrix states which filters are native/server/local;
- any delegated production path has tests/fallbacks.

## Phase 8 - Solve filtered pagination deliberately

**Purpose:** make pagination correct for both native and BetterSearch-local result sets without reviving the old pager corruption bugs.

Tasks:

- Keep native Etsy pagination untouched in native/server-delegated mode.
- Hide pagination when the effective result set has <= one page.
- For BetterSearch-local result sets >20, implement one isolated pagination strategy.
- Prefer a BetterSearch-owned pager that copies current Etsy visual language over mutating/reparenting Etsy's live Preact-owned pager, unless a clearly safe adapter is proven.
- Preserve page state across Back/Forward and filter changes appropriately.
- Do not reuse the collection strip or shell nodes as pagination containers.

Exit criteria:

- native mode uses only Etsy's native pager;
- local mode paginates the actual local match count correctly;
- no vertical/corrupted pager or React child-index collisions.

## Phase 9 - Consolidate the late Favorites module chain

**Purpose:** delete the patch-on-patch implementation rather than adding another wrapper.

Current late modules include the Favorites revamp/shell/responsive/audit chain beginning around `85/86` and continuing through the latest parity modules (currently through `98` in the userscript; include any later `99+` module if added before this refactor begins).

Tasks:

- identify the final intended behavior of every wrapper/override;
- migrate that final behavior into the clean shell/lifecycle/render modules from earlier phases;
- delete superseded wrappers once equivalent tests pass;
- remove dead compatibility state/flags/revision numbers;
- simplify CSS so one responsive model owns geometry;
- keep source modules logically separated for maintainability, but do not use module ordering as a patch mechanism;
- keep Tampermonkey, Chrome, and Firefox consuming the same source.

Explicit rule:

> Do not solve this by creating `module 100` that overrides modules 86-99 again.

Exit criteria:

- no late chain of wrappers is required for the current UI to remain correct;
- initialization order is straightforward and documented;
- tests/builds pass for all delivery targets.

## Phase 10 - Improve startup/anti-flash behavior for extension and userscript

**Purpose:** make the final architecture appear as early and stably as practical without putting heavy work on Etsy's critical path.

Tasks:

- add a tiny early bootstrap for extension builds and, where safe/possible, equivalent userscript behavior;
- inject only critical Favorites shell CSS/anti-flash rules early;
- avoid awaiting all extension storage before any visual preparation if only a small subset of preferences is required initially;
- load heavy settings/catalogue/database logic later;
- preserve the shared feature source across Tampermonkey/Chrome/Firefox;
- document any delivery-target differences explicitly rather than silently forking behavior.

Exit criteria:

- less visible flash/reflow on initial Favorites load;
- main thread/network/database work remains deferred appropriately;
- extension and userscript behavior stays functionally equivalent.

---

## Work-size rule for each implementation step

Each implementation patch should be bounded enough to answer one primary architectural question. Prefer a sequence such as:

```text
one data/lifecycle behavior change
+ tests for that behavior
+ minimal compatibility adjustments
+ CI/build verification
```

Avoid patches that simultaneously rewrite catalogue loading, observers, shell layout, deep metadata, and pagination.

For every phase:

1. inspect the exact current implementation before editing;
2. define the old behavior being replaced;
3. implement the smallest coherent replacement;
4. add targeted regression tests;
5. run the full test/build suite;
6. perform a manual Etsy smoke test for the touched lifecycle;
7. only then remove superseded code;
8. perform a second audit specifically looking for old wrappers that can still execute and conflict with the new owner.

The final architecture should get simpler after each phase, not larger.

---

## Validation checklist for the refactor as a whole

Network/lifecycle:

- page 1 -> 2 -> 3 within the same scope does not download the complete scope again;
- Back/Forward and BFCache do not clear a valid cache;
- one complete catalogue refresh is shared by all callers;
- repeat visits can use IndexedDB immediately;
- stale refresh runs in the background;
- metadata requests are capability/visibility-driven;
- no body-wide mutation storm causes repeated shell reconstruction.

UI/native behavior:

- current All and collection UI remains visually identical to the accepted v0.12.15 state unless deliberately changed later;
- collection strip click vs drag remains correct;
- desktop/tablet/mobile responsive behavior remains correct;
- native pager stays native in native mode;
- native current-page products remain visible while BetterSearch prepares enhanced state;
- no shell/header/sidebar flashing caused by repeated reconstruction;
- Etsy Preact rerenders cannot repurpose BetterSearch-owned shell nodes.

Data correctness:

- partial observations never infer global unfavorites;
- complete authoritative All sync can reconcile unfavorites;
- collection completion only affects collection membership;
- unknown metadata remains different from false/zero;
- stale metadata is refreshed according to field policy;
- custom global filters/sorts operate over the correct complete scope.

Delivery targets:

- Tampermonkey works;
- Chrome extension works;
- Firefox extension works;
- same shared feature code is used;
- extension-specific early bootstrap/storage behavior is isolated to the platform layer.

---

## Expected impact

The HAR evidence shows that a large part of the current perceived slowness is avoidable duplicate work, not Etsy being inherently too slow and not browser extensions being incapable of native-feeling integration.

The highest-value improvements should arrive early:

1. stopping same-dataset page navigation from wiping/refetching the catalogue;
2. using the existing complete IndexedDB scope as the startup snapshot;
3. unifying the two full-catalogue loaders;
4. leaving native Etsy content visible while refresh/enrichment happens.

Later lifecycle/DOM-boundary consolidation should remove a separate class of flashing, shell-repair, and Preact reconciliation bugs.

The intended end-user experience is:

> Etsy Favorites appears normally. BetterSearch's accepted UI is already present/stable. Cached enhanced state is available immediately when possible. Refresh and metadata enrichment happen in the background. Only features that truly require BetterSearch-owned global rendering switch the grid away from native Etsy behavior.

That is the standard the refactor should be judged against.
