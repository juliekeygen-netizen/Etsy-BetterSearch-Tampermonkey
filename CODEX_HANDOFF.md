# Etsy BetterSearch — Codex Review Handoff

> **Codex:** rewrite this file on every coherent task branch before handing the task off for review. Do not merely append raw terminal logs. Keep it concise enough to review, but include exact durable identifiers and all material engineering decisions.

The purpose of this file is to let the user hand a completed Codex PR to another ChatGPT session for an independent audit without requiring access to the original Codex conversation.

---

## Current handoff status

**Status:** v0.15.26 integration release candidate; exact-head CI pending.
**Base main:** `614ec3d26caa3ce9602b2e47261a15359e24be4a`
**Branch:** `codex/release-v0.15.26-integration`
**PR:** [#75](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/75) — open, CI pending
**Release implementation head:** `f371538370e6c5a95828c7850978233ee5c2fe8a`
**Release identity:** `0.15.26` (userscript, package, cache-busters, built extension manifests)

This branch deliberately integrates the substantive work from green PRs #67,
#68, #69, #71, #72, #73, and #74. It does not merge the original behavior
branches independently, because their historical intermediate release bumps
would be both conflicting and misleading. After release CI is green, merge this
single integration PR; close the original PRs as superseded while retaining
their audit history.

Combined behavior gate before promotion, with v0.15.25 identity:

```text
npx --yes --package=node@22 node scripts/check.mjs  PASS — 125 files, 90 modules
npx --yes --package=node@22 node --test tests/*.test.mjs  PASS — 565/565
npx --yes --package=node@22 node scripts/build.mjs  PASS — Chrome, Firefox, Diagnostics
```

Built Chrome/Firefox output was inspected for final runtime-owner, DB-opener,
sort-portal, native-heart, and focused-rail assignment order. Diagnostics stays
at its separate 0.2.9 identity. No browser/manual test was performed; validate
rapid heart, focused draft, collection route change, upgrade, and duplicate
delivery runtime behavior before relying on Etsy-specific timing.

---

# Review packet

## 1. Task identity

```text
Date/time:
Task summary:
Base main SHA:
Branch:
Exact head SHA:
PR number:
PR URL:
PR state: OPEN / DRAFT / OTHER
Release identity on branch:
```

If this PR depends on another unmerged PR/branch, state that explicitly here.

---

## 2. Problem / evidence

Describe:

- what user-visible or architectural problem was investigated;
- how the issue was proven to still exist in the **current final runtime**, rather than merely an older module/audit;
- relevant historical audit/release documents;
- relevant source symbols/final owners;
- browser/Diagnostics evidence if used;
- why the chosen patch boundary is the semantic owner or narrowest safe integration point.

If the task was audit-only and no bug was confirmed, say so clearly.

---

## 3. Changes made

List every changed file and its purpose.

Example:

```text
src/...                     — production behavior
src/...                     — integration boundary
 tests/...                   — adversarial regressions
 docs/...                    — architecture/release record
 PROJECT_STATE.md            — roadmap/status update
 CODEX_HANDOFF.md            — this review packet
```

Explain any intentional load-order changes.

For wrapper/replacement functions, list the final assignment chain when relevant.

---

## 4. Architecture / invariants checked

State which invariants were specifically considered:

- owner/profile isolation;
- immutable complete membership;
- atomic IndexedDB latest-row merge;
- cross-tab lease/generation fencing;
- native query generation;
- metadata destination generation;
- local/native grid/pager ownership;
- filter known/unknown semantics;
- native heart confirmation;
- route/BFCache/lifecycle;
- duplicate delivery runtimes;
- UI/focus/accessibility;
- diagnostics privacy.

For each relevant invariant, explain briefly why the patch preserves it.

---

## 5. Tests and local validation

Report commands and exact results, for example:

```text
npm run check     PASS
npm test          PASS — X/X tests
npm run build     PASS
npm run ci        PASS
```

If only focused tests were run during iteration, list them too.

Do not say "all tests pass" unless the complete suite actually ran on the final head.

---

## 6. GitHub CI

```text
Workflow:
Run ID:
Exact head SHA tested:
Status:
Conclusion:
```

List job/step results that matter:

- whitespace;
- repository checks;
- tests;
- Chrome build;
- Firefox build;
- Diagnostics build;
- artifact uploads.

If CI is pending, say pending; do not describe it as green.

---

## 7. Artifact/build audit

For release/load-order-sensitive work, record what was inspected in actual built artifacts.

Examples:

- `BUILD_INFO.json` version;
- manifest version;
- final module order;
- final assignment to a fragile symbol;
- no later override;
- Chrome/Firefox parity;
- diagnostics packaging.

If artifact inspection was not relevant or not performed, say so.

---

## 8. Release promotion state

If this is a release candidate, report separately:

```text
Behavior gate head:
Behavior CI:
Behavior artifact audit:
Release version promoted to:
Userscript @version aligned:
All @require cachebusters aligned:
package.json aligned:
Historical identity assertions updated only where legitimate:
Release gate head:
Release CI:
Release artifact audit:
```

Do not merge merely because release CI is green. Leave it for independent review unless explicitly instructed otherwise.

---

## 9. Manual browser testing still needed

Describe precise tests the user/reviewer should perform, if any.

Examples:

- Chrome normal extension;
- Firefox extension;
- Tampermonkey;
- own Favorites All;
- collection;
- native search submit/clear;
- two tabs;
- delivery destination change;
- heart/unfavorite timing;
- route change during async operation;
- responsive/focus behavior;
- Diagnostics capture.

Keep these as actionable steps, not vague "test it in browser" notes.

---

## 10. Known limitations / unresolved risks

List anything not proven:

- browser-only timing not modeled by tests;
- selector uncertainty;
- Etsy frontend/API dependency;
- cross-tab scenario not manually reproduced;
- physical/user-account evidence needed;
- intentionally deferred architecture cleanup.

Also state what **was deliberately not changed** to preserve scope.

---

## 11. Diff audit

Record:

- number of changed files;
- whether unrelated files changed;
- whether generated/temp/private diagnostics were removed;
- whether version churn is expected;
- whether `git diff --check` / repository whitespace check is clean.

---

## 12. PROJECT_STATE update

State what changed in `PROJECT_STATE.md`:

- finding closed;
- new live finding;
- next-priority change;
- release baseline update;
- no change required.

---

## 13. Reviewer focus

Tell the independent reviewer exactly where to spend attention.

Examples:

- concurrency interleaving;
- final load order;
- stale-generation behavior;
- owner/profile isolation;
- transition between native/local grid ownership;
- no-op DOM feedback;
- release identity only vs behavior assertion changes.

---

## 14. Recommended next action

Choose one:

```text
AUDIT PR BEFORE MERGE
MANUAL BROWSER TEST BEFORE MERGE
READY FOR RELEASE PROMOTION AFTER AUDIT
AUDIT-ONLY — NO MERGEABLE CODE CHANGE
BLOCKED — USER INPUT REQUIRED
```

Then identify the next independent project task that can be started from clean `main` while this PR waits for review.

---

# Independent-review rule

A reviewer should inspect the actual remote branch/PR and current `main`, not rely solely on this file.

This file is a navigation packet, not a substitute for code review.
