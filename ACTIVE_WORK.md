# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-08-31

This file is the highest-priority repository document for **currently in-flight branches and pull requests**.

Read it before selecting new work. It supplements `PROJECT_STATE.md`; if an older sentence in `PROJECT_STATE.md` says there is no unpublished/in-flight implementation work, **this file supersedes that sentence**.

Source, tests, current Git state, GitHub PR state, and CI remain authoritative.

---

# Verified merged production baseline

```text
Release: v0.15.25
main SHA: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b
Post-merge push CI: 33391628427 — success
```

Everything through v0.15.25 is merged and safe to obtain from `main`.

However, there are three newer **unmerged v0.15.26 candidate behavior branches**. They are intentionally not part of `main` yet and must not be rediscovered/reimplemented independently without first reviewing them.

---

# In-flight implementation PRs

## PR #67 — focused owned-rail refresh

```text
PR: #67
Title: Behavior gate v0.15.26: narrow owned-rail mutation refreshes
Branch: fix/favorites-v01526-focused-rail-refresh
Head: 8dabf195af0ca4675387e200c59e56a767bcfcd2
State: OPEN
CI: FAILED
Run: 33392531655
Tests: 529 passed / 530 total; 1 failed
Builds: skipped because test step failed
```

### Purpose

Narrow BetterSearch's desktop owned-rail mutation refresh logic so self-owned class/style churn does not trigger destructive/redundant rail rebuilds while structural/navigation-relevant changes still do.

### Current failure

Exactly one regression is failing:

```text
owned-rail observer distinguishes self-owned class/style churn from structural subtree changes
```

The failing assertion is a source-level/static expectation around the structural mutation predicate. Most behavior tests for the branch are passing, including self-owned attribute suppression, structural child-list refresh, foreign/native mutation handling, rail removal, in-flight progress behavior, and sidebar/Diagnostics behavior.

### Codex instruction

This is the **first existing PR to inspect**, but do not assume the test is wrong.

1. Fetch/check out the exact branch.
2. Inspect the production predicate and the failing assertion.
3. Decide whether:
   - production missed an explicit semantic branch/invariant; or
   - the test is brittle and asserts syntax rather than behavior.
4. Preserve the real invariant; do not weaken coverage just to make CI green.
5. Push a focused correction to the same branch/PR if justified.
6. Run full exact-head CI and inspect artifacts if it becomes green.
7. Update `CODEX_HANDOFF.md` on that branch.
8. Leave the PR unmerged for independent review.

Do not create a second focused-rail branch unless this PR is deliberately abandoned.

---

## PR #68 — local Favorite action boundary

```text
PR: #68
Title: Behavior gate v0.15.26: harden local Favorite actions
Branch: fix/favorites-v01526-local-card-action-boundary
Head: 162abc1f184c03e5c742adb45a82840f5c7d7608
State: OPEN
CI: GREEN
Run: 33392533774
```

### Purpose

Harden reconstructed/local-grid Favorite actions against the native-card contract, including generation-safe same-view live-card bridging, clear/replay behavior, and owner-aware fallback semantics.

### Codex instruction

Treat this as a completed **behavior gate awaiting independent audit**, not a blank task.

- inspect its full diff and tests;
- verify current `main`/other in-flight PRs do not conflict with its assumptions;
- inspect final symbol/load-order ownership;
- inspect CI/artifacts as appropriate;
- update `CODEX_HANDOFF.md` if Codex becomes the maintainer of this branch;
- do not merge or independently promote it to release identity by default.

---

## PR #69 — Favorites sort portal lifetime

```text
PR: #69
Title: Behavior gate v0.15.26: repair Favorites sort portal lifetime
Branch: fix/favorites-v01526-sort-portal-lifetime
Head: 5ea0907743a19423cdeea083587a9cfd9a4b8700
State: OPEN
CI: GREEN
Run: 33392763268
```

### Purpose

Repair/finalize `favSortEl` portal lifetime/ownership so sort UI does not leave stale portal state or fight the current shell lifecycle.

### Codex instruction

Treat this as another completed behavior gate awaiting independent audit.

- inspect diff/tests/final owner;
- verify no conflict with PR #67/#68 or current `main`;
- preserve UI visual/ownership invariants;
- do not merge or independently promote by default.

---

# Important v0.15.26 release coordination rule

PRs #67, #68, and #69 were all developed as v0.15.26-era behavior candidates from the v0.15.25 baseline.

Do **not** blindly promote all three branches separately to `0.15.26` and merge them one at a time. That would create avoidable version/cache-buster/rebase conflicts and could make later PRs appear green against an outdated base.

Preferred process after independent review:

1. repair/audit each behavior PR independently;
2. decide which behavior gates are approved to ship together;
3. create one dedicated **v0.15.26 integration/release branch** from the then-current `main`;
4. bring in only the approved behavior changes, resolving final load order deliberately;
5. keep release identity unchanged until combined behavior is proven if practical;
6. run the full combined regression suite and all builds;
7. inspect actual Chrome/Firefox/Diagnostics artifact module order and final fragile symbol owners;
8. promote package/userscript/cache-buster identity to 0.15.26 once the combined behavior gate is clean;
9. rerun exact release-head CI and artifact audit;
10. publish the integration PR **unmerged** for independent ChatGPT/user audit;
11. merge only after that review;
12. verify independent push-triggered `main` CI on the actual merge SHA.

If independent review decides one PR should ship separately or be abandoned, document that in `PROJECT_STATE.md`/`CODEX_HANDOFF.md` instead of forcing all three together.

---

# Other remote branch to inspect before duplicate count work

A remote branch named approximately:

```text
fix/favorites-count-authority-fail-closed
```

has appeared in remote branch listings, but it was not present as an open PR in the handoff review.

Before starting a new count-authority implementation:

- inspect whether this branch contains useful current work;
- determine whether it is stale/abandoned/experimental;
- do not silently duplicate it;
- if it is not a valid active task, document that conclusion and then proceed from clean `main`.

---

# Work ordering for Codex

When starting from this handoff:

## Phase 0 — reconcile active queue

1. inspect PR #67 and repair/classify its single failing test;
2. audit PR #68;
3. audit PR #69;
4. record exact current heads and CI because GitHub state may have advanced;
5. do not merge them;
6. do not release-promote three competing branches independently;
7. publish/update `CODEX_HANDOFF.md` packets so the user can bring each PR to ChatGPT for review.

## Then independent new work

After the active queue is understood/published, continue with the post-v0.15.25/v0.15.26 audit program in `docs/CODEX_NEXT_WORK_PLAN.md`.

Before choosing a new task, explicitly check open PRs and remote branches for overlap.

---

# Local synchronization implications

A normal clean `main` update gets all **merged** product code and, once the Codex docs PR is merged, all repository handoff files:

```powershell
git status
git switch main
git fetch origin
git pull --ff-only origin main
```

But `git pull main` does **not** copy unmerged PR #67/#68/#69 code into `main`.

`git fetch origin` plus GitHub/`gh` access lets Codex inspect/check out those branches when needed.

That separation is intentional: `main` remains the verified production baseline while the behavior candidates remain reviewable.
