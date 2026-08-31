# Initial Codex Desktop Prompt

Use this as the first long-running development prompt after synchronizing/opening the local repository in Codex Desktop.

```text
Continue active development of Etsy BetterSearch from the current local repository state.

I am going to leave the computer for a while, so work autonomously for an extended period. Do not stop after one small fix if substantial independent useful work remains.

MANDATORY STARTUP

Before editing anything:

1. Read `AGENTS.md` completely.
2. Read `ACTIVE_WORK.md` completely. It has highest temporal priority for currently open branches/PRs.
3. Read `PROJECT_STATE.md` completely.
4. Read `CODEX_HANDOFF.md` completely.
5. Read `docs/CODEX_NEXT_WORK_PLAN.md` completely.
6. Inspect the real local and remote Git state:
   - `git status`;
   - current branch;
   - configured remotes;
   - recent commits;
   - local `main`;
   - `origin/main`;
   - relevant remote branches;
   - currently open GitHub PRs if GitHub/gh access is available.
7. Synchronize a clean local `main` with `origin/main` when safe. Never discard user-local changes to do so.
8. Inspect actual source/tests/userscript module order before trusting roadmap or historical audit statements.

Source, tests, built artifacts, current Git/PR/CI state, and verified browser evidence are authoritative.

Do not reimplement something merely because an old audit document says it was unfinished. Many 2026-08-29/30 findings were already closed by v0.15.19–v0.15.25 or later final modules.

CRITICAL REVIEW / PUBLICATION RULE

For every coherent implementation/audit task:

- use a descriptive feature/fix/audit branch;
- add/strengthen regressions;
- run appropriate local checks/tests/builds;
- inspect the exact final diff;
- commit the coherent result;
- push the branch to origin when credentials allow;
- open/update a GitHub PR targeting `main` when appropriate;
- inspect GitHub Actions and fix real failures;
- inspect built artifacts/final symbol ownership when load order matters;
- update `PROJECT_STATE.md` when durable project interpretation changes;
- rewrite `CODEX_HANDOFF.md` on that task branch with exact head/PR/CI/test/artifact/manual-test state;
- leave implementation PRs UNMERGED by default.

I want to bring completed PRs back to another ChatGPT session for independent audit before merge.

Do not combine unrelated tasks into a mega-PR simply because this is a long autonomous run.

If one PR is waiting for CI/review and another task is genuinely independent, continue the independent task from clean `main` in a separate branch/worktree.

If a later task genuinely depends on an unmerged PR, base it on that branch and record the dependency explicitly.

PHASE 0 — RECONCILE THE EXISTING IN-FLIGHT v0.15.26 QUEUE

This phase comes BEFORE starting a new historical-audit fix.

Read `ACTIVE_WORK.md` for exact current identities and re-check GitHub because heads/CI may have advanced.

At handoff time there are three unmerged behavior PRs:

- PR #67 — focused owned-rail refresh
  Branch: `fix/favorites-v01526-focused-rail-refresh`
  Known state at handoff: one failing test, 529/530 passed, builds skipped.

- PR #68 — local Favorite action boundary
  Branch: `fix/favorites-v01526-local-card-action-boundary`
  Known state at handoff: behavior CI green.

- PR #69 — sort portal lifetime
  Branch: `fix/favorites-v01526-sort-portal-lifetime`
  Known state at handoff: behavior CI green.

Do not rediscover/reimplement these issues on new branches before inspecting those PRs.

FIRST inspect PR #67's exact single failure. Determine whether it exposes a production semantic bug or a brittle source-syntax assertion. Preserve the real mutation-classification invariant; do not weaken the test just to turn CI green. If a focused correction is justified, push it to the SAME branch/PR, rerun full exact-head CI, inspect artifacts if relevant, and update `CODEX_HANDOFF.md`. Leave it unmerged.

Then audit PR #68 and PR #69 as existing completed behavior gates. Inspect their diffs, tests, final runtime ownership/load order, relationship to current `main`, and any overlap with each other/#67. Leave them unmerged and produce/update durable handoff information for independent review.

IMPORTANT RELEASE COORDINATION

Do NOT promote PR #67, #68, and #69 independently to the same v0.15.26 release and merge them one at a time without coordination.

After independent review approves the behavior gates that should ship:

- create a dedicated v0.15.26 integration/release branch from the then-current main;
- integrate only approved behavior changes;
- resolve final module order deliberately;
- run full combined regressions/builds;
- inspect Chrome/Firefox/Diagnostics artifacts and final fragile symbol owners;
- only then promote package/userscript/all cachebusters to 0.15.26;
- rerun exact release-head CI/artifact audit;
- publish the integration/release PR UNMERGED for independent review.

Do not perform that final merge unless explicitly instructed after review.

Also inspect any remote branch such as `fix/favorites-count-authority-fail-closed` before starting duplicate count-authority work. Determine whether it is current, stale, experimental, or abandoned.

PHASE 1 — FRESH CURRENT-RUNTIME AUDIT RECONCILIATION

After the active PR queue is understood/published, continue with `docs/CODEX_NEXT_WORK_PLAN.md`.

Perform a fresh audit against current final runtime ownership rather than merely reading old findings.

At minimum reconcile:

- owner/count identity separation;
- immutable authoritative membership generations;
- atomic mutable IndexedDB writes;
- multi-owner membership;
- catalogue coordinator/fencing;
- native query acknowledgement;
- destination-sensitive metadata generation;
- deep queue tab-death/BFCache recovery;
- native heart/local-card confirmation;
- count authority/presentation semantics;
- collection lifecycle/owner generation;
- cross-tab settings/runtime ownership;
- filter availability/evidence ownership;
- lifecycle/observer/wrapper stacks;
- accessibility/focus lifecycle;
- duplicate userscript + extension runtime risk;
- Chrome/Firefox/Tampermonkey/Diagnostics final-owner parity.

For important candidates, trace the actual final assignment/owner and classify:

- CLOSED by current release/final module;
- LIVE and source-proven;
- NEEDS REAL-BROWSER/DIAGNOSTICS EVIDENCE;
- OBSOLETE / NON-GOAL.

Known areas that are NOT default next fixes unless new evidence contradicts current source:

- non-atomic localStorage catalogue election — closed by v0.15.22;
- timer-only native query commit — closed by v0.15.23;
- destination A/B shipping metadata race — closed by v0.15.24;
- old fixed-900ms native-heart durable inference — closed/guarded by v0.15.25;
- suspected deep-queue tab-death liveness gap — later module83 already provides pagehide/recovery/lease-expiry retry behavior.

When you find the highest-severity still-live bounded issue:

1. identify semantic/final owner;
2. add adversarial regressions/interleavings;
3. implement the smallest architectural fix that closes the real boundary;
4. preserve production release identity for a behavior gate when useful;
5. run `npm run check`, full `npm test`, and builds/`npm run ci` as appropriate;
6. inspect actual built artifacts for fragile load-order/final assignments;
7. publish the branch/PR unmerged;
8. update `PROJECT_STATE.md` and `CODEX_HANDOFF.md`.

If the best issue requires real Etsy browser evidence first, do not guess. Use/extend the development Diagnostics approach with sanitized evidence and publish a focused diagnostics/audit task if useful.

CONTINUE AFTER THE FIRST NEW PR

Continue through independent phases in `docs/CODEX_NEXT_WORK_PLAN.md` where safe and productive:

- count authority / collection lifecycle;
- cross-tab runtime/settings coordination;
- bounded lifecycle/ownership simplification and no-op mutation performance;
- accessibility/focus/UI consistency;
- delivery-target parity/final-symbol regression coverage;
- focused Diagnostics evidence planning where source/tests cannot prove behavior.

A historical candidate being already fixed is not a blocker: document it accurately and move to another real issue.

VALIDATION / SAFETY

Follow every invariant in `AGENTS.md`, especially:

- owner/profile isolation;
- immutable committed catalogue generations;
- partial observations non-authoritative for absence;
- atomic latest-row IndexedDB semantics;
- cross-tab lease/fence ownership;
- exact native query generations;
- destination-context metadata provenance;
- native/local grid and pager ownership;
- unknown metadata != false;
- compare-before-write reconciliation;
- native-heart confirmation semantics;
- diagnostics privacy;
- delivery-target parity.

Do not publish raw private Etsy diagnostic/account data.
Do not weaken regressions simply to pass CI.
Do not use destructive Git operations against user work.
Do not report CI/build/artifact results as passed unless verified on the exact commit being handed off.

WHEN TO STOP

Do not stop because:

- one CI run is pending;
- one PR is waiting for independent review;
- one candidate turns out already fixed;
- one real-browser test cannot currently be performed;
- one subtask is blocked while independent useful work exists.

Stop only when:

- all safely actionable work in the plan has been durably published for review;
- genuine user input/design choice is required;
- credentials/tooling create a hard blocker with no other productive work;
- or only speculative/high-risk/account-specific work remains and should wait for review/evidence.

At the end, give me a concise index of every branch/PR touched or created, exact head SHA, purpose, CI state, artifact/manual-browser state, dependencies, and recommended independent-review order.

Leave implementation PRs unmerged.
```
