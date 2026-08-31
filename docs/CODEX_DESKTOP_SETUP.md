# Etsy BetterSearch — Codex Desktop Setup

This repository is prepared for local development through Codex in the ChatGPT/Codex desktop app.

The persistent project context is stored in Git, so a new Codex thread does not need the old ChatGPT development conversation.

---

## 1. Synchronize the local repository

From PowerShell or another Git terminal in the existing local clone:

```powershell
git status
git switch main
git fetch origin
git pull --ff-only origin main
git rev-parse HEAD
```

If `git status` shows local changes, do not blindly reset/discard them. Preserve, commit, or stash user work intentionally first.

A plain `git pull` is only sufficient when the current local branch is already the intended branch. The explicit commands above avoid accidentally pulling an old feature branch.

At handoff time the verified merged **product-code** baseline was BetterSearch v0.15.25:

```text
4d0e0317d58711a5e1603ae8d2bf608c3f285c3b
```

The Codex documentation/setup commits added later make the newest `main` SHA newer. Always trust current `origin/main`, not that historical product SHA.

### Important: merged main vs open PRs

`git pull --ff-only origin main` gives you everything that is **merged** into production `main` plus the Codex handoff files after their setup PR is merged.

It does **not** place unmerged PR code into `main`.

At handoff time PRs #67, #68, and #69 are intentionally unmerged v0.15.26 behavior candidates. `git fetch origin` downloads their remote branch objects, and Codex/GitHub CLI can inspect/check out the relevant branches when reviewing them.

Read `ACTIVE_WORK.md` for the exact queue and current known CI state. Re-check GitHub because heads/checks can advance after this document is written.

---

## 2. Open the repository in Codex Desktop

In the desktop app:

1. Open/select **Codex**.
2. Add/open the local `Etsy-BetterSearch-Tampermonkey` repository folder as the project/workspace.
3. Start a new Codex thread inside that repository.
4. Allow the repository permissions needed for ordinary local editing/testing.
5. Grant network/GitHub operations when needed according to your local security settings.

You do not need to launch the Codex CLI for this workflow. The desktop Codex workspace can operate on the local repo directly.

Codex should discover root `AGENTS.md` as repository instructions. The startup prompt still explicitly tells it to read the changing state/queue files.

---

## 3. Files Codex should read first

Read in this order:

```text
AGENTS.md
ACTIVE_WORK.md
PROJECT_STATE.md
CODEX_HANDOFF.md
docs/CODEX_NEXT_WORK_PLAN.md
```

Roles:

```text
AGENTS.md
  stable working rules and architectural invariants

ACTIVE_WORK.md
  highest-priority currently open branch/PR queue

PROJECT_STATE.md
  merged release baseline, completed work, historical reconciliation, roadmap

CODEX_HANDOFF.md
  exact review packet Codex rewrites after each coherent task

docs/CODEX_NEXT_WORK_PLAN.md
  long autonomous task sequence after/around the active queue
```

If an older statement in `PROJECT_STATE.md` conflicts with a newer open-PR fact in `ACTIVE_WORK.md`, inspect current GitHub state and treat the current PR/Git evidence as authoritative.

---

## 4. GitHub access

For full branch → push → PR → CI workflow, the local environment should have working GitHub authentication.

Basic checks:

```powershell
git remote -v
git fetch origin
```

If GitHub CLI is installed:

```powershell
gh auth status
gh pr list
```

Useful examples for the active queue:

```powershell
gh pr view 67
gh pr checks 67
gh pr diff 67
```

Codex can use normal local Git/GitHub tooling when the environment grants the required permissions.

The repository instructions require Codex to publish coherent finished work as remote branches/PRs when possible, while leaving implementation PRs unmerged for independent review by default.

---

## 5. Normal development loop

The intended loop is:

```text
verified main
  ↓
Codex reads AGENTS + ACTIVE_WORK + PROJECT_STATE
  ↓
inspect existing overlapping PRs first
  ↓
focused branch / existing task branch
  ↓
source audit / implementation
  ↓
regression tests
  ↓
npm checks/tests/builds
  ↓
exact diff + artifact audit
  ↓
commit + push
  ↓
PR
  ↓
GitHub Actions
  ↓
CODEX_HANDOFF updated
  ↓
STOP BEFORE MERGE
  ↓
independent ChatGPT/user audit
```

After independent audit, the user can choose whether to merge, request fixes, combine approved behavior gates into a release integration branch, or return the PR to Codex.

---

## 6. Active v0.15.26 queue

At the initial handoff:

```text
#67 focused owned-rail refresh
    one failing regression / requires inspection

#68 local Favorite action boundary
    behavior CI green / awaiting audit

#69 sort portal lifetime
    behavior CI green / awaiting audit
```

Do not create duplicate fixes for those areas before reviewing them.

Do not independently version-promote all three competing behavior branches to v0.15.26. Once behavior gates are independently reviewed, use a deliberate integration/release branch for the approved set.

See `ACTIVE_WORK.md` for exact branch/head/run identities and coordination rules.

---

## 7. Recommended model/reasoning

This project benefits from a high reasoning setting because the difficult work involves:

- multi-tab concurrency;
- IndexedDB transaction boundaries;
- SPA lifecycle/load order;
- browser artifact verification;
- historical audit reconciliation;
- several delivery targets.

Use the strongest practical Codex reasoning setting available to the user when usage permits. The repo workflow is designed so long autonomous turns still produce small reviewable PRs rather than one giant unreviewable branch.

---

## 8. First prompt

The detailed ready-to-paste prompt is:

```text
docs/CODEX_INITIAL_PROMPT.md
```

It instructs Codex to:

- inspect/sync current local + remote state;
- read all repository context files;
- reconcile PR #67–#69 first;
- leave implementation PRs unmerged;
- continue independent useful work while CI/review is pending;
- then execute the broader audit roadmap.

A short bootstrap message can simply say:

```text
Read AGENTS.md, ACTIVE_WORK.md, PROJECT_STATE.md, CODEX_HANDOFF.md, and docs/CODEX_INITIAL_PROMPT.md completely. Then follow docs/CODEX_INITIAL_PROMPT.md as the task, working autonomously and leaving implementation PRs unmerged for independent review.
```
