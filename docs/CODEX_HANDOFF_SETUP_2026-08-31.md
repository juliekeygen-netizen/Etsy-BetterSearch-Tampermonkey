# Codex handoff setup — 2026-08-31

This document records the transition from the previous ChatGPT-driven development loop to a local Codex Desktop workflow.

## Verified merged product baseline before handoff setup

```text
Release: v0.15.25
main: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b
Post-merge CI: 33391628427 — success
```

All completed implementation through v0.15.25 is already merged into `main`. There is no hidden pre-v0.15.25 local branch that needs to be rescued from the previous ChatGPT conversation.

During final handoff preparation, however, three **new post-v0.15.25 behavior PRs** were discovered on the remote. They are intentionally unmerged and therefore are not part of a normal `main` pull:

```text
PR #67 — focused owned-rail refresh
branch fix/favorites-v01526-focused-rail-refresh
head 8dabf195af0ca4675387e200c59e56a767bcfcd2
CI 33392531655 — failure, 529/530 tests passed

PR #68 — local Favorite action boundary
branch fix/favorites-v01526-local-card-action-boundary
head 162abc1f184c03e5c742adb45a82840f5c7d7608
CI 33392533774 — success

PR #69 — sort portal lifetime
branch fix/favorites-v01526-sort-portal-lifetime
head 5ea0907743a19423cdeea083587a9cfd9a4b8700
CI 33392763268 — success
```

These are now tracked in root `ACTIVE_WORK.md`. Codex must inspect them before starting overlapping new work.

## Persistent project-context files added

- `AGENTS.md` — stable coding-agent rules, architecture invariants, validation/release discipline, and publication policy.
- `ACTIVE_WORK.md` — current open PR/branch queue, exact known heads/CI, and release-integration collision rules.
- `PROJECT_STATE.md` — durable merged baseline, recent releases, closed findings, audit frontier, and changing roadmap.
- `CODEX_HANDOFF.md` — required review packet template that Codex rewrites on every coherent task branch.
- `docs/CODEX_NEXT_WORK_PLAN.md` — long autonomous audit/implementation sequence.
- `docs/CODEX_DESKTOP_SETUP.md` — local sync, Codex Desktop, GitHub access, and merged-vs-unmerged explanation.
- `docs/CODEX_INITIAL_PROMPT.md` — ready-to-paste long autonomous prompt that reconciles PR #67–#69 first.
- `docs/CODEX_PROJECT_FILES.md` — project-context file index/read order.

## New review workflow

Implementation work performed by Codex should normally follow:

```text
main / existing task branch
  -> inspect current final owner + overlapping PRs
  -> focused implementation/audit
  -> regression tests
  -> local checks/build
  -> commit + push
  -> GitHub PR
  -> CI + artifact audit
  -> update CODEX_HANDOFF.md
  -> STOP BEFORE MERGE
  -> independent ChatGPT/user audit
```

Codex should not merge implementation PRs by default. The user wants to bring each durable PR back to a separate ChatGPT review session before merge.

Documentation-only maintenance that establishes or updates the Codex workflow itself may be merged after its own CI is green.

## v0.15.26 coordination rule

PRs #67, #68, and #69 are parallel behavior candidates from the same production baseline.

They must not all be independently version-promoted to v0.15.26 and merged one after another without reconciliation. After independent behavior review, the preferred release path is one deliberate integration/release branch containing only approved gates, with combined tests, build-artifact/final-symbol audit, one coherent version/cache-buster promotion, another independent review, then merge and push-triggered `main` CI.

## Starting work frontier

The first Codex task is now:

1. reconcile/repair/audit the active PR queue in `ACTIVE_WORK.md`;
2. leave those PRs unmerged;
3. then continue the fresh current-runtime audit rather than blindly following historical findings.

After the active queue, high-value candidates include:

1. count authority / presentation semantics;
2. collection lifecycle / owner generation;
3. cross-tab settings/runtime coordination;
4. bounded lifecycle/ownership consolidation and no-op mutation performance;
5. filter availability evidence ownership;
6. accessibility/focus lifecycle;
7. delivery-target final-symbol/artifact parity.

These are candidates, not pre-proven bugs. Old findings already closed by v0.15.19–v0.15.25 must not be reimplemented.

## Local synchronization after this setup reaches main

```powershell
git status
git switch main
git fetch origin
git pull --ff-only origin main
git rev-parse HEAD
```

This retrieves every **merged** BetterSearch product change plus the persistent Codex context files.

The `git fetch origin` step also makes remote branch objects available. Unmerged PR #67/#68/#69 code remains outside `main` until deliberately merged; Codex should inspect those branches/PRs through normal Git/GitHub tooling rather than expecting `git pull main` to merge them locally.
