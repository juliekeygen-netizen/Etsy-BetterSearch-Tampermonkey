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

At the time the Codex handoff was prepared, the latest verified **product-code** baseline was BetterSearch v0.15.25 at:

```text
4d0e0317d58711a5e1603ae8d2bf608c3f285c3b
```

The documentation/setup commits added after that may make the newest `main` SHA newer. Always trust current `origin/main`, not the historical SHA above.

---

## 2. Open the repository in Codex Desktop

In the desktop app:

1. Open/select **Codex**.
2. Add/open the local `Etsy-BetterSearch-Tampermonkey` repository folder as the project/workspace.
3. Start a new Codex thread inside that repository.
4. Allow the project/repository permissions needed for normal local editing/testing.
5. Give additional/network permissions when needed for operations such as `git fetch`, `git push`, GitHub CLI, or GitHub Actions inspection, according to your local Codex security settings.

Codex should discover root `AGENTS.md` automatically. The first task prompt should still explicitly tell it to read the project-state/handoff files.

---

## 3. Files Codex should read first

```text
AGENTS.md
PROJECT_STATE.md
CODEX_HANDOFF.md
docs/CODEX_NEXT_WORK_PLAN.md
```

Roles:

```text
AGENTS.md
  stable working rules and architecture invariants

PROJECT_STATE.md
  current completed work, release baseline, live audit frontier, roadmap

CODEX_HANDOFF.md
  review packet Codex rewrites after each coherent task

docs/CODEX_NEXT_WORK_PLAN.md
  long autonomous task sequence
```

Source/tests/Git remain the ultimate authority.

---

## 4. GitHub access

For full branch → push → PR → CI workflow, the local environment should have working GitHub authentication.

Normal checks:

```powershell
git remote -v
git fetch origin
```

If GitHub CLI is installed:

```powershell
gh auth status
```

Codex can use normal local Git/GitHub tooling when the environment grants the required permissions.

The project instructions require Codex to publish coherent finished work as a remote branch/PR when possible, but to leave implementation PRs unmerged for independent review by default.

---

## 5. Normal development loop

The intended loop is:

```text
current main
  ↓
Codex reads AGENTS + PROJECT_STATE
  ↓
focused branch
  ↓
source audit / implementation
  ↓
regression tests
  ↓
npm checks/tests/builds
  ↓
exact diff audit
  ↓
commit + push
  ↓
PR
  ↓
GitHub Actions / artifact inspection
  ↓
CODEX_HANDOFF updated
  ↓
STOP BEFORE MERGE
  ↓
independent ChatGPT/user audit
```

After the independent audit, the user can choose whether to merge, request fixes, or return the PR to Codex.

---

## 6. Recommended Codex model/reasoning

For long architecture/concurrency/browser-extension work, use a high reasoning setting when available and usage permits.

The project is well suited to long autonomous Codex turns because the repo has:

- detailed tests;
- CI;
- Chrome/Firefox/Diagnostics builds;
- durable audit documents;
- explicit branch/PR rules;
- a review handoff format.

The agent should still split unrelated tasks into separate PRs instead of using one giant long-running branch.

---

## 7. First prompt

Use the current prompt supplied by the user/reviewer, or start with a prompt that says to:

- read all four project context files;
- inspect/sync current local Git state;
- execute `docs/CODEX_NEXT_WORK_PLAN.md` autonomously;
- publish each coherent task as an unmerged PR;
- keep `CODEX_HANDOFF.md` updated;
- continue independent useful work while CI/review is pending.

The exact recommended initial prompt is also provided by the ChatGPT handoff conversation that created these files, but the repository itself contains all essential project context.
