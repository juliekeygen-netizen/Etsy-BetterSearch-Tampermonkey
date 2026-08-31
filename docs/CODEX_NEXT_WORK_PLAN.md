# Etsy BetterSearch — Codex Next Work Plan

**Prepared:** 2026-08-31
**Starting verified baseline:** v0.15.25, `main` `4d0e0317d58711a5e1603ae8d2bf608c3f285c3b`
**Post-merge baseline CI:** `33391628427` — success

This is the current long-run work plan for Codex Desktop/local Codex.

It is intentionally designed for an extended autonomous session while preserving independent review. Do **not** combine all phases into one giant branch and do **not** merge implementation PRs by default.

Read `AGENTS.md`, `PROJECT_STATE.md`, and `CODEX_HANDOFF.md` first.

---

# Mandatory startup

Before editing:

1. Inspect current local Git state.
2. Verify/remediate any user-local uncommitted changes without discarding them.
3. Fetch current remote state if network access permits.
4. Verify `main` is synchronized with `origin/main`.
5. Read recent v0.15.19–v0.15.25 release documentation.
6. Inspect the ordered userscript/module build chain.
7. Run or inspect the current baseline test/build state before attributing new failures to your work.

Historical audit files are evidence, not automatic current backlog.

The main trap in this project is fixing an old module without noticing a later final module already supersedes it.

---

# Publication/review rule for the whole run

For each coherent task:

- start a descriptive branch;
- keep the task bounded;
- implement + test + audit the diff;
- update `CODEX_HANDOFF.md` on that branch;
- update `PROJECT_STATE.md` when the project's durable interpretation changes;
- commit;
- push;
- open a PR targeting `main` if credentials allow;
- inspect CI;
- fix actual CI failures;
- leave the PR **unmerged**.

The user wants to hand completed PRs to another ChatGPT session for independent audit before merge.

Do not leave important completed work only as uncommitted local files.

If one PR is waiting for CI/review and another task is genuinely independent, start the independent task from clean current `main` in a separate branch/worktree.

If a later task depends on an unmerged PR, explicitly base it on that branch and mark the dependency in both PR description and `CODEX_HANDOFF.md`.

---

# PHASE 1 — Fresh post-v0.15.25 audit reconciliation

This is the first task and should not be skipped.

## Goal

Reconcile the large 2026-08-29/30 Favorites audit backlog against the **actual final v0.15.25 runtime** and identify the highest-value still-live correctness bug.

Do not begin with a preconceived version number or implementation.

## Read first

At minimum:

- `PROJECT_STATE.md`
- `docs/FAVORITES_AUDIT_INDEX_AND_NEXT_PHASES_2026-08-30.md`
- `docs/FAVORITES_AUDIT_CONTINUATION_2026-08-30.md`
- `docs/FAVORITES_NATIVE_ARCHITECTURE_RESEARCH_AND_REFACTOR_PLAN.md`
- recent release docs/modules for v0.15.19–v0.15.25
- tests corresponding to those boundaries.

## Reconcile important old findings

Build a working table such as:

```text
Finding
Historical source
Current final owner
Status: CLOSED / LIVE / NEEDS BROWSER / OBSOLETE
Evidence
Potential patch boundary
```

Explicitly re-check at least:

- owner/count identity separation;
- complete generation immutability;
- atomic mutable writes;
- multi-owner membership;
- catalogue fallback election/fencing;
- native query acknowledgement;
- destination-sensitive metadata;
- deep queue tab-death/BFCache liveness;
- native heart confirmation/local card actions;
- count authority/presentation;
- collection lifecycle;
- cross-tab settings/runtime ownership;
- filter availability owner;
- lifecycle wrapper stacks;
- accessibility/focus lifecycle;
- duplicate userscript+extension runtime risk.

The first eight categories contain major fixes already shipped. Use them as sanity checks against historical docs; do not reimplement them.

## Choose one live issue

Pick the highest-severity issue that is:

- still reachable in current final runtime;
- source-proven or strongly evidence-backed;
- bounded enough for one coherent PR;
- regression-testable without a speculative rewrite.

If the best candidate requires real-browser evidence before implementation, build/extend a sanitized Diagnostics experiment first instead of guessing.

## Implementation discipline

For a source-proven issue:

1. locate semantic/final owner;
2. design adversarial regressions first or alongside the fix;
3. preserve current v0.15.25 release identity during behavior gate when version churn would obscure behavior;
4. run exact behavior CI;
5. inspect actual built artifacts if load order/final assignment matters;
6. only then consider release promotion on the same PR if appropriate.

## Phase 1 publication

Open one unmerged PR for the selected live issue or one audit-only PR if no implementation is justified.

Update:

- `PROJECT_STATE.md` with closed/live reconciliation;
- `CODEX_HANDOFF.md` with exact review packet.

Then continue independent work while the PR waits for review.

---

# PHASE 2 — Count authority + collection lifecycle

Start this only after Phase 1 has a durable published boundary.

These are historical candidates and must be re-proven against current source.

Use separate PRs if both are live and not tightly coupled.

## 2A. Count authority / presentation semantics

### Audit questions

Trace final writers/readers of:

- server/native total;
- authoritative complete-catalogue count;
- current local matched/shown count;
- collection count;
- cache/bootstrap count;
- index/coverage counts;
- any `favState.total` or equivalent overloaded state.

Determine:

- can an older cache/catalogue count overwrite fresher native presentation?
- can count availability still affect identity/owner extraction?
- do local filters correctly display total-vs-shown semantics?
- does route/query/collection transition carry stale counts?
- are count writes compare-before-write and generation-safe?

Relevant old evidence:

- `docs/FAVORITES_AUDIT_CHUNK3_2026-08-30.md`
- `docs/FAVORITES_V01515_COUNT_AUTHORITY_AUDIT_2026-08-30.md`

### If live

Prefer an explicit semantic separation/view model over another priority/timestamp patch.

Regression ideas:

```text
new native total + old cached catalogue
old native page after route generation change
complete catalogue total + active local filter shown count
owner props available while total absent
collection A → B transition
partial observation cannot become authoritative total
```

Do not rewrite count UI if current model is already correct.

## 2B. Collection lifecycle / operation generation

Audit:

- collection cache keying by owner/profile;
- create/edit/delete watcher ownership;
- dialog binding;
- route/owner generation changes during async refresh;
- owner verification of fetched collection data;
- stale operation callbacks;
- persistence/hydration across profiles.

Relevant historical evidence:

- `docs/FAVORITES_AUDIT_CHUNK3_2026-08-30.md`
- identity/ownership audit files.

If a bug is live, bind async collection operations to exact owner + operation + route generation, add interleaving tests, and keep patch narrow.

Publish each coherent fix as an unmerged PR.

---

# PHASE 3 — Cross-tab runtime/settings coordination

This phase should be evidence-driven because later modules already closed some older multi-tab concerns.

## Audit areas

### Settings propagation

Map which configuration values are:

- extension storage;
- GM/Tampermonkey storage;
- tab-local cached objects;
- intentionally local UI drafts;
- global runtime policy.

Test whether an already-open peer tab sees committed settings changes correctly without unsafe stale state.

Do not make draft/modal state globally synchronized if it is intentionally local.

### Deep queue pause/challenge ownership

Determine whether:

- challenge/pause suppresses only one tab while peers continue unintentionally;
- a global/durable pause exists where required;
- worker recovery remains generation-safe;
- pagehide/BFCache paths are already sufficient.

Do not duplicate module83 recovery logic.

### Runtime singleton / duplicate delivery target

Audit accidental simultaneous Tampermonkey + extension execution:

- can both inject UI?
- can both become persistent semantic owners?
- is there an existing runtime sentinel?
- are startup timing differences safe?

Any fix must avoid breaking normal Tampermonkey-only or extension-only startup.

### Generation wakeups

Audit cross-tab notification/re-prime behavior:

- scope generation changes;
- metadata completion;
- settings changes;
- catalogue replacement;
- queue changes.

Prefer bounded semantic events over broad mutation/poll loops.

Relevant docs:

- `docs/FAVORITES_MULTITAB_AND_DELIVERY_TARGET_AUDIT_2026-08-30.md`
- `docs/FAVORITES_CONFIG_AND_WORKER_POLICY_MULTITAB_AUDIT_2026-08-30.md`
- `docs/FAVORITES_V01518_MULTITAB_SETTINGS_OWNERSHIP_2026-08-30.md`
- `docs/FAVORITES_DEEP_QUEUE_INTEREST_AND_BFCACHE_AUDIT_2026-08-30.md`

Publish live fixes separately; do not create one giant "multitab" rewrite.

---

# PHASE 4 — Lifecycle / ownership simplification and performance

Only proceed after correctness owners are understood.

The long module chain was built to safely repair production behavior, but it increases load-order risk.

The goal is **bounded simplification**, not a broad rewrite.

## Find one candidate stack

Examples to inspect:

- shell/rail ownership;
- toolbar/status ownership;
- availability/filter reconciliation;
- route teardown/re-entry;
- native/local grid takeover;
- mutation observers/no-op writers;
- final render wrappers.

Trace:

```text
original owner
→ historical wrapper A
→ wrapper B
→ current final owner
```

Identify whether one or more obsolete layers can be removed or folded into the semantic owner without behavior change.

## Performance audit

Use existing audits and current source to find:

- no-op DOM writes;
- observers reacting to their own writes;
- repeated re-render/reconcile calls with unchanged inputs;
- repeated storage writes;
- timer/wakeup multiplication;
- stale route resources/listeners;
- hidden inactive portals still driving lifecycle.

Relevant docs:

- `docs/FAVORITES_RUNTIME_MUTATION_FEEDBACK_AUDIT_2026-08-30.md`
- `docs/FAVORITES_RUNTIME_MUTATION_QUIESCENCE_2026-08-30.md`
- `docs/FAVORITES_ROUTE_TEARDOWN_RESOURCE_LIFETIME_AUDIT_2026-08-30.md`
- `docs/FAVORITES_OWNED_UI_LIFECYCLE_WAKEUP_AUDIT_2026-08-30.md`
- `docs/FAVORITES_SHELL_RAIL_OWNERSHIP_RECONCILE_AUDIT_2026-08-30.md`

Any simplification PR must:

- preserve behavior;
- strengthen final-owner/load-order tests;
- run full CI/builds;
- inspect actual artifacts;
- avoid unrelated visual changes.

---

# PHASE 5 — Accessibility, UI consistency, and delivery-target parity

If previous phases are durably published and useful time remains, perform this as a separate audit/fix phase.

## Accessibility/focus lifecycle

Re-read:

- `docs/FAVORITES_ACCESSIBILITY_FOCUS_OWNERSHIP_AUDIT_2026-08-30.md`
- `docs/FAVORITES_ACCESSIBILITY_LIFECYCLE_TEST_MATRIX_2026-08-30.md`
- `docs/FAVORITES_UI_VISUAL_CONTRACT.md`

Audit current v0.15.25+ behavior for:

- focus restoration after settings/filter overlays;
- hidden/inert native controls;
- keyboard navigation;
- accessible names;
- drawer/modal focus trapping;
- route change while overlay open;
- desktop/mobile breakpoint transitions;
- dynamic control availability without focus loss.

Do not redesign the UI.

## Visual consistency

Check:

- text hierarchy;
- consistent gaps/padding;
- controls not overlapping;
- narrow widths;
- rail/drawer behavior;
- Search field footprint while sync/deep progress is displayed;
- native-looking selected/disabled states;
- no duplicate pager/toolbar elements;
- no unnecessary flicker from DOM rewrite.

## Delivery-target parity

Strengthen semantic build-artifact checks around fragile final owners:

- owner-aware membership;
- atomic writes;
- catalogue coordinator;
- query acknowledgement;
- metadata generation;
- native-heart confirmation;
- atomic render/currentness.

Prefer asserting **final symbol owner/invariant** rather than literal "module X must be last" unless literal order is genuinely required.

Verify Chrome + Firefox + Diagnostics builds.

---

# OPTIONAL PHASE 6 — Fresh real-browser evidence plan

Only if unresolved behavior genuinely cannot be proven from source/tests.

Use the Diagnostics build to design a small, sanitized experiment rather than asking the user to manually inspect arbitrary DevTools state.

Possible experiments:

- two-tab settings propagation;
- duplicate extension + userscript runtime ownership;
- collection create + route change;
- count source transition;
- native card heart optimistic rollback/timing;
- BFCache restore during active queue work;
- native/local pager ownership transition.

Do not commit raw private Etsy capture data.

Commit only sanitized conclusions/fixture shapes needed for regression tests.

---

# Continuous audit requirements

Across every phase:

- verify final symbol/load order;
- consider owner/profile generation;
- consider route/view generation;
- consider cross-tab interleavings;
- consider IndexedDB latest-row semantics;
- distinguish known/unknown from false;
- preserve authoritative complete generation;
- preserve native/local ownership boundaries;
- preserve delivery-target parity;
- preserve diagnostics privacy;
- run full exact-head validation before publication;
- inspect diff for unrelated changes.

When CI is pending, continue independent source review, artifact analysis, documentation, or another independent branch rather than waiting idly.

---

# Stop conditions

Do not stop merely because:

- a CI run is pending;
- one browser test is unavailable;
- one candidate issue turns out already fixed;
- one PR is waiting for independent review.

If a candidate is stale, mark it closed and move to another candidate.

Stop only when:

- all safely actionable phases are durably published for review;
- genuine user input/design choice is required;
- credentials/network/tooling block all productive work;
- remaining work is speculative/high-risk and should wait for independent review/real-browser evidence.

At the end of a long run, report an index:

```text
PR # / branch / exact head
purpose
CI state
audit status
manual browser tests needed
dependency on other PRs
```

Leave implementation PRs unmerged.
