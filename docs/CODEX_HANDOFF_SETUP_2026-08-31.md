# Codex handoff setup — 2026-08-31

This document records the transition from the previous ChatGPT-driven development loop to a local Codex Desktop workflow.

## Verified product baseline before handoff setup

```text
Release: v0.15.25
main: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b
Post-merge CI: 33391628427 — success
```

No unfinished product implementation branch needs to be recovered from the prior ChatGPT session. v0.15.25 and all earlier completed implementation are already in `main`.

## Persistent project-context files added

- `AGENTS.md` — stable coding-agent rules, architecture invariants, validation/release discipline, and publication policy.
- `PROJECT_STATE.md` — current durable baseline, recent releases, closed findings, current audit frontier, and changing roadmap.
- `CODEX_HANDOFF.md` — required review packet template that Codex rewrites on every coherent task branch.
- `docs/CODEX_NEXT_WORK_PLAN.md` — long autonomous task sequence for post-v0.15.25 auditing and implementation.
- `docs/CODEX_DESKTOP_SETUP.md` — local sync and Codex Desktop setup instructions.

## New review workflow

Implementation work performed by Codex should normally follow:

```text
main
  -> focused feature/fix/audit branch
  -> implementation + regression tests
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

## Starting work frontier

The next implementation run should not blindly follow historical audit findings. It should first reconcile them against the actual final v0.15.25 runtime.

Highest-value current candidate areas include:

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

Once the handoff setup is merged, this is sufficient to retrieve all completed BetterSearch product work plus the persistent Codex context files, assuming the local working tree does not contain conflicting uncommitted changes.
