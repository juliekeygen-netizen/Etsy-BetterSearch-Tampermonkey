# Etsy BetterSearch — Current Project State

**Updated:** 2026-09-02
**Purpose:** changing development brain / roadmap for Codex and human reviewers
**Repository authority:** current source, tests, Git history, CI, and verified browser evidence override this file if they disagree.

Read this together with `AGENTS.md`, `CODEX_HANDOFF.md`, and `docs/CODEX_NEXT_WORK_PLAN.md`.

---

# 1. Current durable baseline

Current verified behavior baseline before the v0.15.29 release promotion:

```text
main SHA: b99f15f32c088ef3bea5853be784817835ffabc4
behavior identity: v0.15.28
commit:   Merge pull request #88 (Diagnostics-guided Favorites correctness and fallback presentation)
```

Required independent post-merge CI was green:

```text
GitHub Actions run: 33684556447
workflow: CI and extension builds
event: push
result: success
```

The separate release-promotion branch advances the shared BetterSearch release
identity to v0.15.29 and Diagnostics to v0.2.10. It is deliberately limited to
version/cache-buster/test identity updates and release records; it does not
change the already-proven runtime behavior above.

This baseline includes all implementation work completed by the previous ChatGPT development session. There is no intentionally hidden/unpublished implementation branch that Codex must recover before continuing.

Future sessions must verify `origin/main` again because this SHA will become historical as the project advances.

The screenshots supplied after this baseline are current browser evidence for
three separate UI candidates: All-page toolbar/Search parity, visual selection
of neutral Ships from -> Anywhere, and fallback-card fidelity. Treat the card
markup as a separate native-compatibility task: private page HTML establishes
that fallback reconstruction is live, but must not be committed.

---

# 2. What BetterSearch currently is

BetterSearch is a shared-source Etsy enhancement delivered as:

- Tampermonkey userscript;
- Chrome extension;
- Firefox extension;
- Diagnostics Chrome build.

The same ordered modules under `src/` are built into the browser-extension targets and referenced by the userscript.

There are two broad product areas:

## Marketplace search

- Keep filters;
- Strict title filtering;
- rule-based Multi-search;
- scan presets/settings;
- sort coverage;
- retry/adaptive slowdown;
- background-tab scan behavior;
- merged local result grid.

## Favorites

The Favorites subsystem is the dominant correctness/architecture area and includes:

- Etsy-native-compatible shell/rail/toolbar behavior;
- local filtering/sorting;
- native Favorites search integration;
- full-scope catalogue loading;
- owner/profile identity;
- persistent IndexedDB knowledge layer;
- immutable authoritative scope generations;
- partial observations;
- owner-specific membership;
- metadata hydration;
- destination-sensitive metadata;
- persistent deep metadata queue;
- multi-tab leases/coordinator;
- local/native grid and pager ownership;
- native card reconciliation;
- local/reconstructed card actions;
- diagnostics and audit instrumentation.

The implementation has substantial historical layering. Always trace final runtime ownership before changing an early module.

---

# 3. Current architectural invariants

These are the most important conclusions accumulated from real-browser diagnostics, source audits, regression work, and the v0.15.x release series.

## 3.1 Owner/profile identity

- Owner-required persistent/network scopes never intentionally operate with unresolved empty owner identity.
- Owner identity must not depend on a presentation count being available.
- Temporary loss of page props must not silently broaden owner scope.
- Collection and membership semantics are owner/profile-specific.

## 3.2 Membership generations

- Complete catalogue membership is immutable until a verified replacement generation commits.
- In-progress pages/partial observations cannot rewrite the previous complete generation.
- Failed/cancelled replacement crawls leave the active complete generation intact.
- Partial observations provide positive evidence only; they cannot infer absence.
- A collection-page observation must prove that its page-prop collection identity
  still matches the current collection scope before it can add membership IDs.
  During soft navigation, stale props/DOM are positive evidence only for their
  own scope, never for the destination collection.

## 3.3 Multi-owner membership

- Listing metadata can be shared by listing ID.
- Favorites membership is owner/scope-specific.
- Viewer-personal heart state is separate from stored profile membership.
- A refresh/unfavorite for owner A must not invalidate owner B's membership.

## 3.4 Atomic writes

- Mutable listing/scope/queue writes that depend on existing state read and merge the latest row in one short IndexedDB `readwrite` transaction.
- Async network/parser work occurs outside those transactions.
- Deep metadata cannot restore stale favorite/membership state.
- Membership actions cannot erase unrelated newer metadata.

## 3.5 Cross-tab catalogue ownership

- Web Locks remain the preferred path when available.
- The fallback coordinator uses the canonical IndexedDB scope row rather than a non-atomic localStorage election.
- Lease/fence generation is checked in the same store/transaction boundary used to publish authoritative snapshot state.
- A stale crawler cannot commit after losing its generation/token.

## 3.6 Native Favorites query identity

- Native submitted query identity is bound to the exact submission/generation.
- The old timer-only durable commit path is no longer authoritative.
- Submit A → edit/submit B → late A is fenced.
- Changed-but-unverified grids remain blocked instead of being persisted under an old query.

## 3.7 Destination-sensitive metadata

- Shipping metadata is destination-context specific.
- Async requests are fenced by dataset + destination generation.
- Hydration/cache materialization refuses wrong-context shipping values.
- Stale A destination responses cannot overwrite B.
- Returns/exchanges remain destination-independent where designed.

## 3.8 Rendering/currentness

- Etsy owns native grid/pager in native mode.
- BetterSearch owns local grid/pager only while local result authority/currentness is proven.
- Native page identity and local page identity must not alias.
- Stale local results cannot hide a newer useful Etsy grid.
- Async completion paths should return through the established reapply/currentness pipeline.
- When a cache-backed fallback card is necessary, it keeps Etsy's structural
  card contract and adds only the explicit BetterSearch shop/rating row; it
  must not invent a separate option or action presentation.

## 3.9 Native heart confirmation

- A single stale detached card/button is not durable unfavorite truth.
- Native heart removal confirmation reacquires current evidence by listing ID and is tied to scope/view generation.
- Optimistic state is required to stabilize before durable removal.
- Stable same-view card disappearance can confirm removal only through the bounded confirmation path.
- Superseding clicks, route/view changes, rollback, or unresolved timeouts fail closed.
- Public-profile viewer-personal hearts remain isolated from profile membership.
- A local fallback card without a connected native Preact instance cannot
  promise an Etsy collection picker. Its action must remain visibly actionable
  in the originating click rather than relying on a later blocked popup.

## 3.10 Production runtime ownership

- A Favorites runtime must have one shared document owner even when the
  Tampermonkey userscript and a production browser extension are accidentally
  enabled together.
- Module `60b-favorites-runtime-owner.js` is the unmerged behavior-gate
  boundary for this rule: its document-lifetime marker makes the first
  production Favorites runtime active and later isolated-world copies inert.
- Diagnostics remains an independent observational build and must not be
  mistaken for a second production Favorites owner.

## 3.11 Diagnostics capture-option persistence

- Idle Diagnostics capture preferences persist in extension storage, so a
  normal reload does not silently revert opt-in capture modes.
- An active recording session remains authoritative over idle preferences when
  a recorder panel is rehydrated, preventing the controls from misreporting
  what that session is actually collecting.

---

# 4. Recent correctness release history

The recent release chain is important because many older audit findings are now closed.

## v0.15.19 — multi-owner membership semantics

Primary outcome:

- removed dependence on one global favorite boolean for all owners;
- owner-specific membership became authoritative;
- viewer-personal heart state was separated from profile membership semantics.

Reference:

`docs/FAVORITES_V01519_MULTI_OWNER_MEMBERSHIP_2026-08-30.md`

## v0.15.20 — atomic mutable IndexedDB rows

Primary outcome:

- stale whole-row read/modify/write races were replaced at key mutable boundaries with atomic latest-row merges;
- deep metadata/unfavorite/availability/queue interleavings received regression coverage.

Reference:

`docs/FAVORITES_V01520_ATOMIC_MUTABLE_ROWS_2026-08-31.md`

## v0.15.21 — owner-maintenance load order

Primary outcome:

- fixed a final assignment/load-order regression where an older metadata coordinator could overwrite the newer owner-aware active-listing function.

Reference:

`docs/FAVORITES_V01521_OWNER_MAINTENANCE_ORDER_2026-08-31.md`

## v0.15.22 — catalogue coordinator

Primary outcome:

- eliminated the non-atomic localStorage catalogue-election fallback from the authoritative path;
- coordinator lease/fence moved to the canonical scope row;
- takeover/renewal/release/final snapshot publication are protected by the same IndexedDB serialization boundary.

Reference:

`docs/FAVORITES_V01522_CATALOG_COORDINATOR_2026-08-31.md`

## v0.15.23 — native query acknowledgement

Primary outcome:

- removed timer-manufactured query trust;
- exact submission binding;
- A/B/late-response fencing;
- changed-but-unverified native grid block;
- release identity tests updated without weakening behavior tests.

Reference:

`docs/FAVORITES_V01523_NATIVE_QUERY_ACK_2026-08-31.md`

## v0.15.24 — metadata context generation

Primary outcome:

- destination generation fences for asynchronous auxiliary metadata;
- context-safe shipping hydration/cache materialization;
- destination-signed coverage/currentness;
- stale destination work quietly superseded.

Primary production module:

`src/106-favorites-v01524-metadata-context-generation.js`

## v0.15.25 — native Favorite-heart confirmation

Primary outcome:

- replaced stale one-shot/detached-DOM inference with bounded generation-safe native-heart confirmation;
- handles optimistic rollback, delayed success, card replacement/disappearance, route/view changes, and superseding clicks;
- preserves owner-specific atomic persistence;
- confirmed removal returns through `favReapply()`.

Primary production module:

`src/107-favorites-v01525-native-heart-confirmation.js`

Current userscript ordering intentionally places module 107 after 101 but before the final 102–106 chain because it needs module101 native-card helpers while preserving later established ownership/render/metadata boundaries.

---

# 5. Historical audit documents: how to use them

The repository contains unusually detailed audit evidence from 2026-08-29/30. Important navigation documents include:

- `docs/FAVORITES_AUDIT_INDEX_AND_NEXT_PHASES_2026-08-30.md`
- `docs/FAVORITES_AUDIT_CONTINUATION_2026-08-30.md`
- `docs/FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`
- `docs/FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md`
- `docs/FAVORITES_INDEXEDDB_INTEGRITY_ADDENDUM_2026-08-29.md`
- focused audit files for queue, lifecycle, UI, local-card actions, metadata context, cross-tab settings, etc.

These documents are **not a literal current backlog**.

The previous ChatGPT session repeatedly found that an apparently serious issue in an older module had already been closed by a later final module. Examples include deep-queue tab-death recovery and several local-card interaction paths.

Therefore the next agent should first reconcile historical findings against v0.15.25 rather than blindly implementing old recommendations.

---

# 6. Current audit frontier after v0.15.25

No new source-proven P0 bug was intentionally left half-implemented at handoff.

The next task is a **fresh current-main audit/reconciliation** to determine the highest-value remaining live issue.

The strongest remaining candidate areas from older evidence are listed below. They are candidates, not guaranteed bugs.

## Candidate A — count authority / presentation model

Historical concern:

`favState.total` and related count pathways have served several semantic roles over time:

- Etsy/native/server total;
- complete catalogue-generation total;
- current local-match/shown count;
- index/metadata coverage-related presentation.

Audit goal:

- map final writers/readers in v0.15.25;
- determine whether stale cache/catalogue totals can still outrank newer native evidence;
- confirm count presentation never changes owner identity;
- establish whether an explicit count view-model separation is still needed.

2026-09-01 reconciliation: the final module 104 → 105 chain separates native
total authority from local shown-count authority. The old
`fix/favorites-count-authority-fail-closed` remote branch is pre-v0.15.25 and
not an active implementation task. Do not duplicate it without new evidence.

Relevant historical docs:

- `docs/FAVORITES_AUDIT_CHUNK3_2026-08-30.md`
- `docs/FAVORITES_V01515_COUNT_AUTHORITY_AUDIT_2026-08-30.md`

## Candidate B — collection lifecycle / owner generation

Historical concerns:

- collection cache owner-keying;
- collection-create watcher binding to exact operation generation;
- route/owner change during create/fetch;
- fetched collection refresh owner verification.

2026-09-01 reconciliation: this is now covered by unmerged PR #71
(`fix/favorites-collection-lifecycle-generation`). Review that branch rather
than starting another collection-lifecycle patch.

Relevant historical docs:

- `docs/FAVORITES_AUDIT_CHUNK3_2026-08-30.md`
- identity/ownership audit docs.

## Candidate C — cross-tab runtime/settings coordination

Historical concerns:

- deep auto-run pause/challenge state being tab-local;
- settings/config propagation across tabs/delivery targets;
- scope-generation wakeup/broadcast behavior;
- duplicate Tampermonkey + extension runtime split-brain.

Some of this has been hardened by later modules, so the agent must trace current final behavior before changing anything.

2026-09-01 reconciliation: v0.15.18 closes the stale whole-object
configuration-write/live propagation finding, and module83 reads the durable
manual-pause value before claims. The remaining source-proven split-brain risk
is duplicate production delivery runtimes; the current unmerged runtime-owner
behavior gate addresses that narrow boundary. Generation wakeups still require
real browser/Diagnostics evidence before a broader design change.

Audit questions:

- Which settings are intentionally tab-local vs global?
- Are persistent changes reflected in already-open peer tabs without reload?
- Can two delivery targets both become feature owners?
- Does deep queue challenge/pause semantics have a correct durable owner?
- Are wakeups bounded and generation-aware?

Relevant docs:

- `docs/FAVORITES_MULTITAB_AND_DELIVERY_TARGET_AUDIT_2026-08-30.md`
- `docs/FAVORITES_CONFIG_AND_WORKER_POLICY_MULTITAB_AUDIT_2026-08-30.md`
- `docs/FAVORITES_V01518_MULTITAB_SETTINGS_OWNERSHIP_2026-08-30.md`
- `docs/FAVORITES_DEEP_QUEUE_INTEREST_AND_BFCACHE_AUDIT_2026-08-30.md`

## Candidate D — lifecycle/ownership consolidation

Historical implementation accumulated many late wrappers to safely repair production behavior.

Long-term goal:

- fewer semantic owners;
- narrower observers;
- fewer wrappers overwriting earlier behavior;
- explicit lifecycle controller boundaries;
- preserve the frozen visual contract.

This is **not permission for a giant rewrite**.

The correct next move is to identify one bounded ownership stack that can be simplified without changing behavior, prove it with tests/build artifacts, and publish separately.

Relevant docs:

- `docs/FAVORITES_OWNED_UI_LIFECYCLE_WAKEUP_AUDIT_2026-08-30.md`
- `docs/FAVORITES_SHELL_RAIL_OWNERSHIP_RECONCILE_AUDIT_2026-08-30.md`
- `docs/FAVORITES_RUNTIME_MUTATION_FEEDBACK_AUDIT_2026-08-30.md`
- `docs/FAVORITES_ROUTE_TEARDOWN_RESOURCE_LIFETIME_AUDIT_2026-08-30.md`

## Candidate E — availability/filter evidence ownership

Historical concern:

- multiple generations of availability state;
- known/unknown/available conflation;
- unnecessary DOM writes;
- wrong evidence enabling controls.

Later filter-state and metadata-context modules may already close part of this. Re-audit current final owner before changing it.

Relevant docs:

- `docs/FAVORITES_FILTER_AVAILABILITY_OWNER_CONFLICT_AUDIT_2026-08-30.md`
- `src/104-favorites-v0157-filter-state-sync.js`
- `src/106-favorites-v01524-metadata-context-generation.js`

## Candidate F — accessibility/focus lifecycle

A substantial audit already exists. Re-check final v0.15.25 against it rather than assuming every item remains live.

Relevant docs:

- `docs/FAVORITES_ACCESSIBILITY_FOCUS_OWNERSHIP_AUDIT_2026-08-30.md`
- `docs/FAVORITES_ACCESSIBILITY_LIFECYCLE_TEST_MATRIX_2026-08-30.md`
- `docs/FAVORITES_UI_VISUAL_CONTRACT.md`

## Candidate G — delivery-target parity / runtime smoke coverage

Goal:

- prove Chrome/Firefox/Tampermonkey final symbol ownership is aligned for the most fragile boundaries;
- strengthen build-artifact assertions where they can catch real load-order regressions;
- avoid literal "module X is last" assertions when the real invariant is "function Y's final assignment comes from boundary Z".

This is especially valuable after v0.15.21 and v0.15.25 demonstrated how literal module order can be subtle.

---

# 7. Recommended next development sequence

This sequence is intentionally audit-first.

## Phase 1 — post-v0.15.25 current-state reconciliation

Start from current `main`.

1. Read recent release docs v0.15.19–v0.15.25.
2. Read the audit index and focused candidate docs.
3. Trace final runtime owners in source/build order.
4. Create a table in the task branch classifying important historical findings as:
   - closed by release X;
   - still live and source-proven;
   - needs real-browser evidence;
   - obsolete/non-goal.
5. Pick the highest-severity live issue that has a bounded fix.
6. Implement/test it in that same coherent PR only if the audit provides enough proof.
7. Leave the PR unmerged for independent review.

Do not create a release merely to have a next version number.

## Phase 2 — next live correctness issue

After Phase 1 is durably published, continue to another independent live issue, preferably from Count / Collection / Cross-tab coordination.

Keep it in its own branch/PR unless it genuinely depends on Phase 1.

## Phase 3 — lifecycle/performance simplification

Only after correctness boundaries are stable, pick one narrow redundant ownership/wrapper stack and simplify it with behavior-preserving regression coverage.

Do not attempt a wholesale rewrite of Favorites.

## Phase 4 — accessibility/UI/browser parity audit

Audit the existing visual contract and focus lifecycle after structural changes. Fix source-proven regressions in separate coherent PRs.

---

# 8. Areas already audited and intentionally not next by default

## Deep queue tab-death liveness

An initial review after v0.15.25 suspected a stranded `running` job could remain idle after another tab died.

Further tracing showed later module 83 already handles this via:

- pagehide worker-end recording;
- atomic recovery;
- resume from Etsy pages;
- retry scheduling around foreign lease expiry when pagehide is missed.

Do not reimplement that path unless current source/tests/browser evidence proves a new gap.

## Old off-page hidden-iframe favorite bridge concern

The older local-card action audit documented a high-risk hidden-iframe behavior. Current production Favorites local-card behavior had already changed for key off-page paths before the v0.15.25 audit.

Do not resurrect the old fix plan without checking current callers.

## Native query timer commit

Closed by v0.15.23. Do not reintroduce timeout-as-authority semantics.

## localStorage catalogue election

Closed by v0.15.22 authoritative path. Do not create a second coordinator.

## destination A/B shipping race

Closed by v0.15.24 final metadata context generation boundary. Regressions should remain.

## fixed 900 ms native-heart durable inference

Closed by v0.15.25 confirmation boundary. The historical module63 behavior may still physically exist underneath, but module107 guards/neutralizes it at the final live boundary.

---

# 9. Release/build workflow state

Primary local validation:

```text
npm run check
npm test
npm run build
npm run ci
```

GitHub Actions workflow:

```text
.github/workflows/ci.yml
```

Expected CI responsibilities include:

- patch whitespace;
- repository checks;
- full Node regression suite;
- Chrome build;
- Firefox build;
- Diagnostics Chrome build;
- artifact uploads.

Static source-marker tests normalize CRLF transport line endings before matching
their LF fixtures. This keeps the same semantic assertion valid in Windows
autocrlf checkouts and the Linux CI checkout.

The project has repeatedly caught release/load-order issues only after building the actual extension bundle. Artifact inspection is part of release correctness for sensitive boundaries.

---

# 10. Browser evidence and manual testing

Some behaviors cannot be fully proven by Node fixtures alone because Etsy is a changing Preact SPA.

Use real-browser testing when needed for:

- native search acknowledgement request/DOM timing;
- card replacement/heart action timing;
- route transitions;
- BFCache;
- same-conversation-style multi-tab races;
- Tampermonkey vs extension duplicate-runtime behavior;
- responsive/focus behavior;
- Etsy frontend selector changes.

However, do not ask the user for manual DevTools evidence before exhausting source/tests/Diagnostics capabilities.

The development Diagnostics build exists specifically to gather controlled evidence. Keep raw private capture data out of the public repository.

---

# v0.15.26 release-candidate reconciliation — 2026-09-01

The merged release on `main` reconciles and
combines seven green, independently bounded post-v0.15.25 pull requests:

- #67 local-card heart/bridge confirmation boundary;
- #68 focused filter-rail refresh deferral;
- #69 sort portal owner/backlink lifetime cleanup;
- #71 collection owner and operation-generation fencing;
- #72 IndexedDB `versionchange` cache invalidation;
- #73 duplicate delivery-runtime first-owner boundary;
- #74 CRLF-portable static-source test normalization.

The combined v0.15.25 behavior gate passed Node 22 repository checks and all
565 tests, then built Chrome, Firefox, and Diagnostics artifacts. It preserves
the later/final owners in the production chain: runtime ownership before
Favorites state, DB upgrade handling before later cached openers, collection
lifecycle after the native boundary, the sort wrapper at module79, and rail
refresh after the heart-confirmation boundary. The candidate then promotes the
shared userscript/package/extension identity and every `@require` cache-buster
to v0.15.26. Exact-head GitHub CI run `33520794029` and the required
post-merge `main` push CI run `33520898859` both succeeded. The component PRs
were closed as superseded by the merged integration PR #75.

# 11. Versioning note

The current production release is v0.15.28. It passed exact-head CI as PR #84
run `33654460398` and its production merge SHA passed push CI run
`33654527080`. The release includes Diagnostics active-option rehydration
(PR #82) and the requested collection two-row desktop toolbar (PR #83).

For future risky correctness patches, continue the established two-gate pattern when useful:

```text
behavior branch while identity stays at the current production version
→ exact behavior CI/artifact audit
→ promote to next release identity
→ exact release CI/artifact audit
→ independent review
→ merge
→ push-triggered main CI
```

Codex should not bump the release merely because a branch exists. Promotion happens only when behavior is proven and the task is intended to ship.

## 11.1 v0.15.29 promotion candidate — 2026-09-03

PRs #86, #87, and #88 were independently reviewed, merged, and each exact
`main` SHA passed the CI/build workflow. Their combined scope is the requested
All toolbar/Search parity, neutral Anywhere selection, and diagnostic-led
Favorites correctness/fallback-card repairs. The v0.15.29 candidate therefore
only advances BetterSearch's package/userscript/cache-buster identity and the
separately shipped Diagnostics manifest identity (v0.2.10), with the release
identity assertions updated alongside them.

The candidate must still pass its own exact-head PR CI, artifact audit, merge,
and push-triggered `main` CI before it becomes the next durable production
baseline. See `docs/FAVORITES_V01529_RELEASE_PROMOTION_2026-09-03.md`.

---

# 12. Documentation ownership

Use documents as follows:

```text
README.md
  User-facing product/install/features.

AGENTS.md
  Stable HOW-Codex-works rules and invariants.

PROJECT_STATE.md
  Changing current baseline, completed releases, live audit frontier, roadmap.

CODEX_HANDOFF.md
  Latest durable review packet from a completed Codex task/PR.

docs/CODEX_NEXT_WORK_PLAN.md
  Current long-run autonomous work plan / task ordering.

Historical docs/FAVORITES_* audit files
  Evidence and architecture history; not automatically current backlog.
```

Whenever a task materially changes what is closed/live/next, update `PROJECT_STATE.md` in that PR.

---

# 13. Diagnostics-guided UI reconciliation — 2026-09-01

A private user-provided Diagnostics capture produced one source-proven
production UI finding: module 103 varied desktop toolbar width by the
route-specific title/control width. The behavior gate
`codex/fix-favorites-stable-toolbar-geometry` changed the final planner to use
one canonical desktop geometry or the existing stacked layout. It was audited,
merged, and is included in the v0.15.27 promotion.

The same capture also establishes that the Diagnostics no-grid marker produces
a false positive for valid native empty collections. This should be fixed in a
separate Diagnostics-only task. Reported startup filter-rail flicker remains
browser-evidenced but not source-proven; module 104 already owns final drawer
state reconciliation, so gather a focused capture before adding another
production wrapper. See
`docs/FAVORITES_DIAGNOSTIC_RECONCILIATION_2026-09-01.md`.

# 14. Immediate next task

If no newer user instruction supersedes this file, the next Codex task is:

> Perform a fresh post-v0.15.25 audit reconciliation against the historical Favorites audit index, identify the highest-severity **still-live** bounded correctness issue from current source/build/runtime ownership, implement and regression-test it if evidence is sufficient, publish it as an unmerged PR, and update `PROJECT_STATE.md` + `CODEX_HANDOFF.md`.

## 13.1 Diagnostics valid-empty-state behavior gate — 2026-09-01

The private Diagnostics capture also source-proved an instrumentation false
positive: a valid native empty collection satisfied the generic no-grid marker.
`codex/fix-diagnostics-valid-empty-state-marker` is an independent,
Diagnostics-only behavior gate. It recognizes Etsy's visible structural empty
card without weakening the marker for actual missing grids. See
`docs/DIAGNOSTICS_VALID_EMPTY_STATE_MARKER_2026-09-01.md`.

## 13.2 Diagnostics rapid-trace export behavior gate — 2026-09-02

Private capture reconciliation showed that the new opt-in rapid diagnostics
were only partially delivered: a replacement recorder panel did not reflect
the durable selected options after **Record & Reload**, and the final
streaming exporter dropped its retained frame-trace and marker-burst events.

`codex/feature-diagnostics-burst-trace` is the separate Diagnostics-only
behavior gate for that delivery path. It rehydrates the durable options,
exports `timeline/frame-traces.ndjson`, writes valid burst JPEGs under their
marker directories, and exposes summary counters. It does not change the
production userscript/extension runtime or release identity. After its fresh
CI passes and the branch merges, use its output to make the reported
collection/native-local handoff investigation reproducible at animation-frame
resolution before changing a production owner.

## 13.3 Final Diagnostics controls owner reconciliation — 2026-09-02

A later private focused capture contained all three manual marker snapshots and
notes, but its summary correctly reported zero `frameTraceWindows` and zero
`burstScreenshots`. The recorder panel itself showed the three opt-in rapid
capture controls unchecked while recording. This is not usable rapid-transition
evidence and must not be read as absence of a browser flicker.

The final runtime chain explained why the earlier option-rehydration repair was
incomplete: `diagnostics-extension/controls.js` loads after `content.js` and is
the final panel/action owner, but it did not restore `session.options` before
locking the replacement panel. PR #82 restored every active capture option in
that final owner and regression-tests the actual load boundary. It merged at
`9e07e4d` and its required `main` push CI run `33653744164` succeeded. Private
capture data and marker notes remain outside Git.

The same capture documents a requested collection layout adjustment (placing
sort/search below the collection identity/visibility row), but that is a
separate production UI task. First make the rapid capture controls reliable;
then use a focused capture to distinguish a lasting collection-selector issue
from the already source-proven full-navigation handoff.

## 13.4 Requested collection toolbar row layout — 2026-09-02

The same marker screenshot captured a direct product/UI request: on a desktop
collection page, keep the collection name, edit/add controls, privacy, and
count together first, then place Sort/Settings/Search on the following row as
the existing All header already does. This is a deliberate layout policy, not
an inference from an unobserved flicker.

The final owner is `favApplyExactSearchWidth0135` in module 103. The bounded
behavior gate forces its established stacked-header path for non-`items`
collection scopes on desktop; it leaves the All scope and narrow responsive
path unchanged. This uses the existing width cleanup and stack CSS rather than
reparenting native collection metadata or changing navigation/filter state.

## 13.5 Collection/native-local handoff audit — 2026-09-02

The latest private capture source-proves that collection selection currently
forces a new document through the final copied-pill handler's `location.assign`
call. This accounts for native Etsy content briefly appearing before the
BetterSearch shell returns. It is not safe to substitute synthetic
`history.pushState` or a fetched DOM swap without browser proof that Etsy's
new route, native grid, and pager are current. The repaired Diagnostics capture
must first establish whether Etsy can safely perform native soft navigation and
whether the reported missing collection selector is a lasting semantic mismatch
or only a handoff frame. See
`docs/FAVORITES_DIAGNOSTIC_HANDOFF_AUDIT_2026-09-02.md`.

The detailed autonomous sequence is in `docs/CODEX_NEXT_WORK_PLAN.md`.
