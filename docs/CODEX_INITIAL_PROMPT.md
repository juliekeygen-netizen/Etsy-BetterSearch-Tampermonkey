# Initial Codex Desktop Prompt

Use this as the first long-running development prompt after synchronizing/opening the local repository in Codex Desktop.

```text
Continue active development of Etsy BetterSearch from the current local repository state.

I am going to leave the computer for a while, so work autonomously for an extended period. Do not stop after the first small audit item or first small fix if substantial independent useful work remains.

MANDATORY STARTUP

1. Read `AGENTS.md` completely.
2. Read `PROJECT_STATE.md` completely.
3. Read `CODEX_HANDOFF.md` completely.
4. Read `docs/CODEX_NEXT_WORK_PLAN.md` completely.
5. Inspect the real local Git state:
   - `git status`;
   - current branch;
   - configured remotes;
   - recent commits;
   - current local `main`;
   - `origin/main` if network access permits.
6. Synchronize clean local `main` with `origin/main` when safe. Never discard user-local changes to do so.
7. Inspect the actual current source/tests/module order before trusting roadmap or historical audit statements.

The current source, tests, built artifacts, Git state, and verified browser evidence are authoritative.

Do not reimplement something merely because an old 2026-08-29/30 audit document says it was unfinished. Many historical findings were already closed by v0.15.19 through v0.15.25.

CRITICAL PUBLICATION / REVIEW RULE

For every coherent implementation/audit task completed during this run:

- work on a descriptive feature/fix/audit branch;
- add or strengthen regression tests;
- run the appropriate repository checks/tests/builds;
- inspect the exact final diff;
- commit the coherent result;
- push the branch to `origin` if credentials/network access permit;
- open a GitHub PR targeting `main` if possible;
- inspect GitHub Actions/CI and fix real failures;
- inspect built artifacts/final symbol ownership where load order matters;
- update `PROJECT_STATE.md` when the durable project interpretation/roadmap changes;
- rewrite `CODEX_HANDOFF.md` on that task branch with the exact review packet required by `AGENTS.md`;
- leave the implementation PR UNMERGED.

Do not merge completed implementation PRs into `main` by default.

I want to bring each completed PR back to another ChatGPT session for an independent audit before merge.

If one PR is waiting for CI/review and another task is genuinely independent, continue useful independent work from clean current `main` in a separate branch/worktree.

If a later task genuinely depends on an earlier unmerged PR, base it on the dependency branch and clearly record that dependency in the PR and `CODEX_HANDOFF.md`.

Do not combine unrelated tasks into a giant PR just because this is a long autonomous run.

PRIMARY TASK — POST-v0.15.25 RECONCILIATION AUDIT

Start with the Phase 1 plan in `docs/CODEX_NEXT_WORK_PLAN.md`.

Perform a fresh deep audit against current final runtime ownership, including the important historical findings from the Favorites audit index.

At minimum reconcile:

- owner/count identity separation;
- immutable authoritative membership generations;
- atomic mutable IndexedDB writes;
- multi-owner membership;
- catalogue coordinator/fencing;
- native query acknowledgement;
- destination-sensitive metadata generation;
- deep queue tab-death/BFCache recovery;
- native heart/local-card action confirmation;
- count authority/presentation semantics;
- collection lifecycle/owner generation;
- cross-tab settings/runtime ownership;
- filter availability owner/evidence;
- lifecycle/observer/wrapper stacks;
- accessibility/focus lifecycle;
- duplicate userscript + extension runtime risk;
- Chrome/Firefox/Tampermonkey/Diagnostics final-owner parity.

Do not merely list findings. For important historical candidates, trace the actual final assignment/owner through the ordered source/build chain and classify them as:

- CLOSED by current release;
- LIVE and source-proven;
- NEEDS REAL-BROWSER/DIAGNOSTICS EVIDENCE;
- OBSOLETE / NON-GOAL.

The previous development session already established that these are not default next fixes unless new evidence contradicts current source:

- non-atomic localStorage catalogue election: closed by v0.15.22;
- timer-only native query commit: closed by v0.15.23;
- destination A/B shipping metadata race: closed by v0.15.24;
- old fixed-900ms native heart durable inference: closed/guarded by v0.15.25;
- suspected deep-queue tab-death liveness gap: later module83 already provides pagehide/recovery/lease-expiry retry behavior.

After reconciliation, identify the highest-severity STILL-LIVE bounded correctness issue.

If the issue is source-proven and safely fixable:

1. identify the semantic/final owner;
2. design adversarial regressions/interleavings;
3. implement the smallest architectural fix that closes the real boundary;
4. preserve current release identity for a behavior gate when useful;
5. run `npm run check`, full `npm test`, and builds/`npm run ci` as appropriate;
6. inspect actual built Chrome/Firefox artifacts for fragile final assignments/load order;
7. publish the branch/PR unmerged;
8. update `PROJECT_STATE.md` and `CODEX_HANDOFF.md`.

If the best issue requires real Etsy browser evidence first, do not guess. Use/extend the development Diagnostics approach with sanitized evidence and create a focused audit/diagnostics PR if useful.

CONTINUE AFTER PHASE 1

After the first coherent PR is durably published, continue through the independent phases in `docs/CODEX_NEXT_WORK_PLAN.md` where safe and productive:

- count authority / collection lifecycle;
- cross-tab runtime/settings coordination;
- bounded lifecycle/ownership simplification + performance/no-op mutation audit;
- accessibility/focus/UI consistency;
- delivery-target parity/final-symbol regression coverage;
- focused Diagnostics browser-evidence planning when source/tests cannot prove behavior.

Do not assume every candidate requires a code change. If a historical candidate is already fixed, document that accurately and move to the next real issue.

VALIDATION / SAFETY

Follow all invariants in `AGENTS.md`.

Especially preserve:

- owner/profile isolation;
- immutable committed catalogue generations;
- partial observations non-authoritative for absence;
- atomic latest-row IndexedDB semantics;
- cross-tab lease/fence ownership;
- exact native query generations;
- destination-context metadata provenance;
- native/local grid and pager ownership;
- unknown metadata != false;
- compare-before-write UI reconciliation;
- native heart confirmation semantics;
- diagnostics privacy;
- Chrome/Firefox/Tampermonkey/Diagnostics parity.

Do not publish raw private Etsy diagnostic data.

Do not weaken regression tests just to pass CI.

Do not use destructive Git operations against user work.

Do not report CI/build/artifact results as passed unless verified on the exact commit being handed off.

WHEN TO STOP

Do not stop simply because:

- one CI run is still pending;
- one PR is waiting for independent review;
- one candidate turns out already fixed;
- one real-browser test cannot currently be performed;
- one subtask is blocked while other independent useful work exists.

Stop only when:

- all safely actionable work in the current plan has been durably published for review;
- genuine user input/design choice is required;
- credentials/tooling create a hard blocker with no other productive work;
- or the only remaining work is speculative/high-risk/device/account-specific and should wait for review/evidence.

At the end, give me a concise index of every branch/PR created, exact head SHA, purpose, CI state, artifact/manual-browser testing state, dependencies, and recommended order for independent review.

Leave implementation PRs unmerged.
```
