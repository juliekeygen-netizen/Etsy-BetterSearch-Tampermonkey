# Favorites bounded implementation release sequence — 2026-08-30

Status: implementation roadmap derived from the canonical architecture plan plus Favorites audit Chunks 3–7.

This document does **not** replace `FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`. It converts the accumulated findings into bounded patches/releases so implementation can begin without attempting one giant rewrite.

The visual contract remains the current v0.15.1 Favorites UI unless a release explicitly changes behavior for correctness/accessibility.

---

# Guiding rules

Every release below must:

- have one primary ownership/correctness goal;
- leave `main` releasable/testable;
- include regression tests for the new invariant;
- run the complete existing repository test/build pipeline;
- preserve Etsy native behavior wherever BetterSearch does not need to own it;
- avoid committing raw HAR/Diagnostics/account/listing/private-query data;
- avoid adding another late wrapper when the purpose is ownership consolidation;
- prefer fail-safe native Etsy presentation over an uncertain BetterSearch takeover.

Do **not** combine all releases into one PR.

---

# Release A1 — surgical local/native pager identity fix

## Purpose

Remove the proven semantic alias between BetterSearch's local Etsy-style pager and module 95a's native Etsy page-state adapter.

This is the smallest high-confidence production fix from the audit and should ship before the larger architecture work.

## Implementation

In the native page-state adapter:

- exclude `[data-ebsf-local-pagination]` from every native pager discovery path;
- exclude local pager buttons from the capture-phase native click-intent handler;
- ensure selected-native-page reads only Etsy-owned pagers;
- keep native and local page state completely independent.

Do not rename the local pager's visual/ARIA presentation merely to hide the bug. It may correctly use Etsy's `aria-label`. Fix semantic ownership in the adapter.

## Required tests

Build a DOM fixture containing **both simultaneously**:

```text
native Etsy pager
local BetterSearch pager
```

with both using:

```text
aria-label="Favorite Items Page Results"
```

Assert:

- local click changes only `favState.localPage`;
- native intent remains unchanged;
- native click records native intent;
- adapter selected-page logic ignores local `aria-current`;
- capture-phase listener ordering cannot reinterpret a local click as native.

## Scope boundary

Do not mix catalogue, rail or lifecycle refactoring into A1.

---

# Release A2 — owner-required persistence boundary + existing-invalid-state handling

## Purpose

Stop new ownerless Favorites scopes from reaching durable storage and define what happens to existing ownerless rows.

## Implementation

- introduce/strengthen one latched Favorites owner identity for owner-required scope operations;
- reject construction/persistence of owner-required scope keys with empty owner;
- keep network owner guards, but add the invariant at the storage boundary too;
- add an integrity/migration path that identifies existing ownerless scope rows and removes/quarantines them safely;
- preserve Diagnostics detection for malformed `/users//collections/` behavior until browser verification confirms the source is gone.

## Tests

- transient missing props cannot persist an ownerless `items`/collection scope;
- valid latched owner remains available through ordinary soft hydration gaps;
- switching to a genuinely different owner invalidates old owner generation rather than reusing it;
- migration is idempotent.

## Scope boundary

Do not yet redesign the entire scope/listing writer. That is Release B.

---

# Release B — atomic catalogue/scope snapshot generations

## Purpose

Make the durable index authoritative under overlapping/out-of-order observations and eliminate contradictory membership state.

This is the main P0 data-correctness release.

## Implementation

Introduce a generation/snapshot identity for complete scope reconciliation.

Required invariants:

```text
one scope refresh generation
-> one atomic commit boundary

older generation finishing later
-> cannot overwrite newer generation

scope listingIds membership
<-> listing.favoriteScopes[scopeKey].active
-> transactionally consistent

active=true
-> removedAt absent/0

active=false
-> removedAt records removal evidence
```

Consolidate complete-snapshot writes behind one authoritative function/service instead of allowing multiple independent writers to promote completeness/totals/membership.

Repair existing contradictory rows deterministically.

## Tests

Simulate:

- generation A starts, B starts later, B completes first, A completes last;
- partial observation during complete refresh;
- listing removed then rediscovered/reactivated;
- scope/listing membership drift migration;
- failed/cancelled snapshot never promotes complete state;
- owner/scope change invalidates old generation.

## Exit criteria

No stale completion can regress a newer complete snapshot or leave dual membership representations contradictory.

---

# Release C — runtime config, metadata-context and deep-worker generations

## Purpose

Make cross-tab/config and metadata/background work obey the same explicit current-context rules as catalogue snapshots.

## C1. Cross-tab configuration

- storage change for Favorites config/UI prefs must re-normalize the in-memory active config in other loaded tabs;
- apply conflict-safe field/patch semantics rather than blind whole-object overwrite where simultaneous edits are possible;
- trigger exactly the necessary UI/render/sync policy reconcile after remote config change;
- do not rely on page reload to make `favCfg` current.

Tests:

```text
tab A changes autoSync/filter/sort
-> tab B runtime config updates
-> correct UI/policy dirty reason emitted

near-simultaneous independent preference edits
-> no unrelated field lost
```

## C2. Destination-sensitive auxiliary metadata

- add a destination/context generation to shipping/returns/etc. request work;
- before applying/persisting a response, verify both dataset and destination generation;
- stale old-destination response must not become visible filter/sort truth.

Tests: old destination request resolves after new destination request; only new context applies.

## C3. Deep queue worker/interest lifetime

- make queue membership/interest explicit across owners/scopes as needed;
- distinguish worker lease ownership from "this listing is still needed/favorited" state;
- audit `pagehide`/BFCache semantics so a page entering BFCache is not treated identically to a permanently dead worker without recovery rules;
- retain durable restart-safe queue behavior.

## Scope boundary

Do not combine visual lifecycle consolidation into Release C.

---

# Release D — signed render transaction + atomic grid/pager ownership

## Purpose

Make local BetterSearch rendering a committed transaction rather than a collection of loosely related state checks.

## Render token

A local-render transaction should contain at least:

```text
owner/scope/dataset identity
committed native-query generation
catalogue snapshot revision
filter/sort config hash/revision
metadata requirement/context generation
native view generation/fingerprint
local result signature/count
local page
```

If any component changes while work is in flight, the old transaction cannot claim visible ownership.

## Atomic visual ownership

Commit together:

```text
local grid visible
native grid hidden/inert as required
local pager state/presentation
native pager hidden/inert as required
header shown count
render status/signature
```

If local transaction cannot be proven current, keep/restore useful Etsy native presentation.

## Hydration reconcile

Replace module-101 whole-page card cloning with dirty-listing keyed reconcile:

- derive listing IDs touched by native mutation where possible;
- compare presentation before replacing/writing;
- update only dirty listings;
- do not destroy an in-flight/focused card unnecessarily.

## Tests

- old async render resolves after new config/query generation;
- local empty result cannot hide a valid newer native result set;
- grid and pager ownership can never contradict each other;
- metadata update to one listing does not rebuild 20 local cards;
- unchanged render transaction produces no local-grid replacement.

---

# Release E — lifecycle controller, stable shell, accessibility and DOM idempotence

## Purpose

Remove the observer/wrapper wars and make route ownership, focus and resource lifetime explicit.

This is the largest structural release and should happen only after Releases A–D have established stable data/render contracts.

## E1. One lifecycle controller

Replace whole-body inference with semantic dirty reasons:

```text
ROUTE_CHANGED
OWNER_SCOPE_CHANGED
NATIVE_VIEW_CHANGED
NATIVE_GRID_CHANGED
NATIVE_PAGER_CHANGED
NATIVE_SEARCH_CHANGED
SIDEBAR_HOST_CHANGED
CONFIG_CHANGED
CATALOGUE_CHANGED
METADATA_CHANGED
VIEWPORT_CHANGED
```

Rules:

- one scheduled reconcile owns current dirty set;
- urgent deadlines cannot be postponed by later low-priority requests;
- every callback is generation-aware;
- Favorites-native observers attach on enter and detach on leave;
- BetterSearch-owned modal/portal mutations do not create native route dirty reasons.

## E2. Stable shell/rail

- mount BetterSearch shell/root outside Etsy-owned hydrated child structure where practical;
- stop routine reparenting of Etsy sidebar children into a hidden BetterSearch source wrapper;
- preserve one rail root through ordinary metadata/config changes;
- use existing in-place facet availability mechanics rather than full rail replacement;
- structural schema changes use keyed reconcile.

## E3. DOM-idempotent final writers

Introduce central equality-before-write helpers for:

```text
text
attributes/ARIA
hidden/inert
classes
inline styles/CSS variables
select/options where structurally unchanged
```

A no-op reconcile should produce effectively zero owned presentation mutations.

## E4. Focus/modal manager

Implement semantic focus ownership for:

```text
rail controls
local cards/actions
local pager
Settings
mobile Filters
layout editor and nested dialogs/menus
```

Provide:

- initial modal focus;
- Tab trap;
- Escape where appropriate;
- background inert/ownership policy;
- connected/semantic opener restoration;
- keyboard-operable layout actions/reordering.

## E5. Central teardown/resource scopes

One route leave disposes:

```text
transient surfaces
scroll locks/focus traps
route/render timers + RAFs
native hydration observer
scope resize observer
shell resources
orphan portals
route-specific state references
```

Reuse good existing patterns such as module-101 hydration stop and module-91 scroller cleanup.

## E6. Geometry

Move toolbar/search/progress geometry to one controller:

- measure from stable references;
- avoid clear->measure->restore of visible state;
- compare geometry signature and desired/current values;
- one writer per lifecycle pass.

## Browser proof required

This release specifically requires a fresh Diagnostics before/after comparison using sanitized aggregate metrics.

Target improvements should include major reductions in:

```text
total DOM mutations
same-value text/attribute/style writes
rail generations
shell reconcile passes
geometry intermediate states
owned-UI-triggered route work
```

---

# Release F — retire late module chain + true final bootstrap

## Purpose

After the new ownership architecture is browser-proven, delete the historical wrapper chain rather than keeping the new system beneath it.

## Implementation

Consolidate responsibilities currently spread through approximately modules 85–101 into clear source units aligned with the canonical architecture, for example:

```text
native-adapter
lifecycle-controller
catalog-service
metadata-service
shell
filter-engine
render-controller
modal/focus manager
```

Then:

- remove superseded wrappers/observers/geometry writers;
- remove compatibility names no longer needed;
- update build/test source lists;
- add one **true final runtime bootstrap** after all required Favorites subsystems;
- bootstrap validates required install markers/contracts;
- failure leaves native Etsy Favorites usable and does not start partial BetterSearch runtime;
- runtime starts exactly once.

Do this only after behavior tests cover the new implementation well enough to safely delete the old chain.

---

# Release G — startup/anti-flash refinement

## Purpose

Apply canonical Phase 10 after architecture is stable.

Do not move the complete application to document-start.

Split:

```text
document-start
  tiny page/bootstrap marker
  critical anti-flash CSS/root reservation where proven useful

later
  storage/config
  IndexedDB
  catalogue
  metadata
  render/lifecycle app
```

Extension and Tampermonkey can share semantics even though their loading mechanisms differ.

Measure first meaningful native paint and BetterSearch takeover timing; avoid hiding useful Etsy SSR content while heavy state loads.

---

# Server-delegation experiments remain later

The canonical plan's server-delegation experiments remain valuable, but they should not interrupt the correctness/lifecycle sequence above.

After the core contracts are stable, experimentally classify filters as:

```text
native Etsy
safe server-delegated
BetterSearch local
```

Every internal Etsy endpoint capability must retain a local/native fallback because it is undocumented and can change.

---

# Suggested version/PR cadence

The exact version numbers are a release decision, but a practical cadence is:

```text
PR / patch 1: A1 pager identity
PR / patch 2: A2 owner persistence guard
PR / release: B atomic snapshots
PR / release: C config/metadata/worker generations
PR / release: D render transaction
PRs / release series: E lifecycle controller (split E1-E6 into reviewable commits/PRs if needed)
PR / cleanup release: F late-chain retirement + final bootstrap
PR / polish release: G startup anti-flash
```

E should likely be implemented as a short branch/PR series behind tests rather than one enormous diff. The rule is that each merged step must still have one active authoritative owner; do not temporarily create both an old and new controller reacting to the same signals.

---

# CI + browser gate for every implementation release

Before merge:

```text
repository checks
all Node tests
Chrome build
Firefox build
Diagnostics Chrome build
artifact uploads
feature-specific regression tests
```

For source/runtime changes also perform browser smoke appropriate to the release.

Minimum common smoke:

```text
All + collection
native Search submit/clear
native pager
strict/local filter
local pager if applicable
rail/settings
soft route away/back
Back/Forward/BFCache
viewport breakpoint crossings
```

After merge verify the push-triggered workflow on the exact main merge commit.

---

# Rollback/fail-safe rule

Every release that changes native/local ownership must have a simple fail-safe:

```text
if BetterSearch cannot prove the current generation/state is valid
-> restore/leave Etsy native Favorites visible and interactive
```

A temporary loss of enhancement is preferable to a false empty grid, wrong pager, wrong owner mutation or stale metadata result.

---

# When the audit is complete enough to implement

The project now has enough source/browser/storage evidence to begin implementation. Further research should be targeted to a concrete patch question or a fresh browser validation, not used as a reason to postpone the bounded fixes above.

The recommended first production change after the documentation audit is **Release A1: the local/native pager identity fix**, because it is narrowly source-proven, independently testable and does not require the larger refactor to be safe.