# Etsy BetterSearch — Codex Project Instructions

This file defines the stable working rules for Codex and other coding agents operating in this repository.

Read this file completely before substantial work. Also read `PROJECT_STATE.md`, `CODEX_HANDOFF.md`, and `docs/CODEX_NEXT_WORK_PLAN.md` at the start of a development task.

The source code, tests, current Git state, and verified browser evidence are authoritative. Historical audit documents are evidence, not automatically current truth.

---

## 1. Repository workflow

Before significant work:

1. Inspect `git status`, current branch, remotes, recent commits, and `origin/main`.
2. Synchronize from current `main` when network access permits.
3. Read the relevant source, tests, implementation docs, and recent release docs before editing.
4. Verify whether a reported issue still exists in the final runtime chain. Many historical findings were later fixed by higher-numbered integration modules.
5. Do not reimplement a feature just because an old audit or roadmap calls it unfinished.

For coherent feature/fix/audit work, prefer:

1. start from up-to-date `main`;
2. create a descriptive branch such as `fix/...`, `feature/...`, `audit/...`, or `docs/...`;
3. implement a coherent bounded patch;
4. add or strengthen regression tests;
5. run local validation;
6. inspect the complete diff for accidental changes;
7. commit clearly;
8. push the branch;
9. open a GitHub pull request targeting `main`;
10. inspect GitHub Actions and artifacts when available;
11. fix real failures rather than weakening tests;
12. update `PROJECT_STATE.md` and `CODEX_HANDOFF.md` on the task branch;
13. leave the implementation PR **unmerged by default** so it can receive an independent ChatGPT/user audit.

Do not force-push or rewrite `main`. Do not use destructive operations such as `git reset --hard`, broad `git clean`, or discarding local user changes without an explicit reason and approval.

### Review/publication rule

The default handoff boundary is a durable remote branch + PR, not an uncommitted local worktree.

After every coherent completed task, make sure another reviewer can inspect the exact work remotely. `CODEX_HANDOFF.md` must contain the exact branch, head SHA, PR number/URL if available, CI state, tests run, artifact checks, unresolved risks, and recommended next action.

Do **not** merge implementation PRs by default. The user wants to bring them back to another ChatGPT session for an independent audit before merge.

If GitHub credentials/network access prevent pushing or opening a PR, still commit locally, update `CODEX_HANDOFF.md`, and clearly report the blocker.

---

## 2. Current architecture principle: inspect the final owner

BetterSearch has a long historical chain of ordered modules in `src/`. Later modules may intentionally replace or wrap functions from earlier modules.

Therefore, before changing a function:

- search every assignment/reference to it;
- inspect the ordered `@require` list in `etsy-bettersearch.user.js`;
- inspect `scripts/build.mjs` / build ordering if relevant;
- determine the **final production assignment** in Chrome, Firefox, Diagnostics, and Tampermonkey delivery targets;
- do not patch an early implementation if a later module owns the real behavior;
- when adding a final integration module, place it at the narrowest safe point rather than merely appending it to the end.

Avoid making the project progressively harder to reason about through chains of late wrappers. Prefer fixing the semantic owner or introducing one explicit replacement boundary when feasible.

A change is not proven merely because the source file looks correct. For load-order-sensitive work, inspect the built artifact and final symbol/assignment order.

---

## 3. Core Favorites invariants

Treat these as product/data invariants unless current source/tests prove they were intentionally superseded.

### Identity and ownership

- Owner-required Favorites scopes must never silently broaden to an empty/unresolved owner.
- Profile/owner identity is separate from presentation counts.
- Listing metadata may be globally keyed by listing ID; Favorites membership is owner/scope-specific.
- Viewer-personal heart state is not the same thing as another profile owner's membership.
- Collection operations/caches must not leak between owner generations.

### Authoritative catalogue membership

- A previously committed complete catalogue remains authoritative until a verified replacement generation commits atomically.
- Partial/in-progress/failed observations are useful positive evidence but are not authority to infer absence.
- Failed or cancelled replacement crawls must not corrupt the previous complete generation.
- Cross-tab stale workers must not publish authoritative state after losing their lease/fence.

### IndexedDB writes

- Mutable listing/scope/queue updates that depend on current state must read and merge the latest row inside the same short `readwrite` transaction.
- Long network/parsing work belongs outside that transaction.
- Deep metadata must not restore stale membership/favorite state.
- A stale unfavorite/update must not erase unrelated newer metadata.

### Query identity

- Draft text is not committed query identity.
- Timer expiry by itself is not durable proof that Etsy committed a native Favorites search.
- Acknowledgement must stay bound to the exact submitted query/generation.
- Submit A → type/submit B → late A must never commit B from A's response or resurrect A after B/clear.
- Changed-but-unverified native grids fail closed rather than being persisted under the previous query scope.

### Metadata context

- Destination-sensitive metadata (especially shipping) must be bound to the current delivery-context generation.
- Late data from destination A must not overwrite destination B.
- IndexedDB hydration/cache materialization must respect metadata context provenance.
- Destination-independent fields such as returns/exchanges must remain independent where designed.

### Rendering and native ownership

- Etsy owns the native Preact grid/pager when BetterSearch does not have proven-current local authority.
- BetterSearch owns its local grid/pager only while the corresponding result/currentness token remains valid.
- Native page identity and local page identity must never alias semantically.
- Local rendering must not hide a newer useful Etsy native grid.
- Use established reapply/currentness pipelines rather than direct rendering from arbitrary callbacks.

### Filters and state

- Neutral/default filters are not active filters.
- Unknown metadata is not false.
- Filter availability must advertise only evidence the current dataset can satisfy.
- Persistent UI state should have one semantic owner.
- Reconciliation should compare before writing DOM/storage to avoid mutation feedback loops.

### Native heart actions

- Do not infer durable unfavorite membership from one stale/detached DOM object.
- Confirmation must be tied to listing/scope/view generation and current native evidence.
- Superseding clicks, route changes, optimistic rollback, and ambiguous timeouts fail closed.
- Public-profile viewer-heart behavior must remain isolated from profile membership.

---

## 4. Delivery targets and duplicate-runtime safety

The project ships the same ordered feature modules through:

- Tampermonkey userscript;
- Chrome extension;
- Firefox extension;
- Diagnostics Chrome build.

When validating changes, consider all targets.

Users may accidentally run the userscript and extension simultaneously. Do not introduce a second independent persistent owner for the same semantic state. Existing singleton/runtime-owner boundaries should be preserved and improved rather than bypassed.

Extension/background and userscript execution timing can differ. Do not assume a fix proven in one delivery target automatically behaves identically in the others.

---

## 5. Diagnostics/privacy rules

Diagnostics are development evidence, not permission to publish private Etsy data.

Never commit raw private diagnostics containing listing IDs/titles, profile/owner identifiers, account identifiers, private query text, session information, cookies/tokens, or diagnostic notes tied to a private account.

Sanitize forensic reports before committing them.

A Diagnostics portal/control must not masquerade as native Etsy lifecycle state or become the production ownership signal.

If browser evidence contradicts source theory, browser evidence wins and the source model must be revised.

---

## 6. Validation commands

Use the repository's existing tooling rather than inventing parallel validation.

Primary commands:

```bash
npm run check
npm test
npm run build
npm run ci
```

The CI workflow also checks patch whitespace and builds Chrome, Firefox, and Diagnostics Chrome artifacts.

For substantial changes:

- run focused tests while iterating;
- run the full test suite before publication;
- run repository checks;
- build all delivery targets;
- inspect Git diff;
- for load-order/version/release-sensitive work, inspect actual built artifacts.

Do not claim a test/build/artifact passed unless it actually ran successfully on the exact commit being discussed.

---

## 7. Release discipline

BetterSearch releases have intentionally used a two-stage gate for risky Favorites correctness work.

### Behavior gate

Prefer proving behavior first while release identity remains at the current production version. This isolates functional changes from mass cache-buster/version churn.

Behavior gate expectations:

- focused source change;
- adversarial regression tests;
- current production release identity retained;
- exact-head CI green;
- built artifact/load-order audit where relevant.

### Release promotion

Only after the behavior gate is clean:

- bump `package.json` version;
- bump userscript `@version`;
- align every userscript `@require ...?v=` cache-buster;
- update only legitimate historical release-identity assertions;
- rerun exact-head CI;
- audit built Chrome/Firefox/Diagnostics artifacts;
- update PR title/body to the real release description.

Do not confuse stale identity assertions with behavior regressions, and do not weaken behavioral assertions merely to make promotion green.

### Merge gate

For Codex tasks under this handoff workflow, stop with a green unmerged PR unless the user explicitly asks Codex to merge.

If/when a release is merged, its definition of done includes an independent push-triggered `main` CI run on the actual production merge SHA.

---

## 8. Test philosophy

Static/source assertions are useful, but concurrency/lifecycle bugs require executable interleavings.

Prefer tests that model real combinations such as:

- two tabs writing/claiming one scope or queue row;
- old complete generation + failed replacement;
- deep response in tab A + unfavorite in tab B;
- owner A + owner B sharing a listing;
- submit A → B/clear → late A;
- delivery destination A → B → late A;
- card replacement/detachment + delayed heart response;
- local/native pager coexistence;
- route changes during async work;
- BFCache/pagehide/worker lease recovery;
- duplicate delivery runtimes.

A transaction is not sufficient proof of atomicity unless the transaction includes the read of the state being mutated.

Do not delete or weaken regressions just because a new module changes load order. First determine whether the historical assertion expresses a still-valid architectural invariant or merely an obsolete literal position.

---

## 9. UI/UX expectations

The existing Favorites visual contract is intentionally close to Etsy's native UI. Preserve it unless the task explicitly requests redesign.

Audit UI changes for:

- hierarchy and spacing;
- responsive widths and wrapping;
- no overlap/clipping;
- keyboard/focus/accessibility behavior;
- mobile drawer vs desktop rail semantics;
- selected/disabled/unknown states;
- no duplicate controls or pagers;
- no flicker caused by unnecessary DOM rewrites.

Read `docs/FAVORITES_UI_VISUAL_CONTRACT.md` and relevant accessibility/lifecycle audits before changing major Favorites UI structure.

---

## 10. Performance and lifecycle

Pay special attention to:

- MutationObserver feedback loops;
- repeated no-op DOM writes;
- repeated storage writes;
- route teardown/re-entry;
- BFCache;
- `pagehide` / visibility changes;
- timers and delayed callbacks surviving route/view generation changes;
- deep queue lease renewal/recovery;
- cross-tab settings/state propagation;
- browser service-worker/background timing;
- scans continuing safely in background tabs.

If one path is temporarily blocked by CI/browser testing, continue other independent useful audit/test/documentation work rather than stopping immediately.

---

## 11. Historical documents are not current requirements by themselves

The repository contains many detailed 2026-08-29/30 audit documents. They are valuable evidence, but several findings were subsequently closed in v0.15.19–v0.15.25.

Before implementing an old finding:

1. trace the final production symbol/owner;
2. inspect release docs after the audit date;
3. inspect current tests;
4. verify the bug is still reachable;
5. only then create a fix.

`PROJECT_STATE.md` contains the current reconciliation layer and should be updated as findings are confirmed closed/live.

---

## 12. Autonomous work behavior

When the user gives a broad request such as "continue", "audit", or "work on this while I'm away":

- inspect the real repo first;
- choose the highest-value verified actionable next step;
- work autonomously through implementation/testing/publication;
- do not repeatedly ask for confirmation on ordinary engineering decisions;
- do not stop just because CI is pending if other independent work exists;
- keep separate coherent tasks in separate branches/PRs;
- do not create a giant mixed-purpose PR for convenience;
- if later work depends on an unmerged branch, document the dependency explicitly;
- if work is independent, start it from clean `main`.

Stop only when genuine user input is required, credentials/tooling hard-block further useful work, or remaining work would be speculative/high-risk without review.

---

## 13. Required handoff after every coherent task

Before calling a task finished, update `CODEX_HANDOFF.md` on that task branch with:

- date/time;
- base `main` SHA used;
- branch name;
- exact head SHA;
- PR number/URL/state;
- concise problem statement;
- files changed;
- architectural decisions;
- tests/checks/builds run and exact results;
- CI run ID/state;
- artifact inspection performed;
- known browser/manual testing still required;
- unresolved risks;
- whether `PROJECT_STATE.md` changed;
- recommended reviewer focus;
- next independent task.

This file exists so another ChatGPT session can audit the durable work without needing the original Codex conversation.

---

## 14. Communication

Progress/final reports should be concise but concrete:

- what was inspected;
- what was actually found;
- what changed;
- what tests/builds/CI passed or failed;
- exact branch/PR/head SHA;
- what remains/manual testing required.

Never report assumptions as verified facts.
