# Etsy BetterSearch — Codex Review Handoff

## 1. Task identity

```text
Date/time: 2026-08-31 (Europe/Helsinki)
Task summary: Repair and reconcile live PR #67, the local Favorites card-action behavior gate.
Base product SHA: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b (v0.15.25)
Current documentation main merged: 614ec3d26caa3ce9602b2e47261a15359e24be4a
Branch: fix/favorites-v01526-local-card-action-boundary
Implementation snapshot validated locally: bb75ea7 (merge current main after restoring behavior-gate identity)
PR: #67 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/67
PR state: OPEN
Release identity: 0.15.25 behavior gate; no standalone v0.15.26 promotion
Dependencies: none. Do not combine with PRs #68/#69 until independent review selects approved behavior gates.
```

The handoff document itself is committed after the validated snapshot; use the live PR head for the exact review commit.

## 2. Evidence and decision

Live GitHub metadata superseded stale `ACTIVE_WORK.md` numbering: PR #67 is the local-card action branch, not the focused-rail branch. Its prior CI failure was caused by two accidental standalone v0.15.26 version/cache-buster promotion commits. The PR body and the release-coordination rule both require a v0.15.25 behavior gate. The promotion made several version/load-order tests disagree and, on a Windows checkout, also changed source-selection test paths.

No local-card production behavior was reverted. The two promotion commits were reverted with new commits, preserving history and restoring the actual behavior-only diff:

- module 107 captures native heart intent, fences module 63’s delayed local/index writers, and commits only after current native evidence stabilizes;
- a BetterSearch-owned off-page cloned card opens the Etsy listing visibly instead of using the generic hidden-iframe Favorite bridge;
- unrelated, non-owned bridge consumers still use their prior bridge.

The semantic ownership chain is `25-scan-favorite` (generic bridge) → `63-favorites-runtime` / `75-favorites-phase5-multitab-lease` (historical Favorite writers) → `107-favorites-v01525-native-heart-confirmation` (final wrappers). The userscript loads module 107 after module 101 and before modules 102–106; no later module reassigns the three wrapped symbols.

## 3. Files changed relative to current main

```text
src/107-favorites-v01525-native-heart-confirmation.js
  Final local-card/native-heart boundary: fail-safe owned-card bridge and false-return fence for old callbacks.

tests/favorites-v01525-native-heart-confirmation.test.mjs
  Regressions for fenced direct rendering, one confirmed removal/reapply, visible owned-card fallback,
  non-owned bridge preservation, and tombstone duplicate suppression.

CODEX_HANDOFF.md
  This review packet.
```

The branch also contains two explicit revert commits that restore `package.json`, userscript `@version`, and every `@require` cache-buster to v0.15.25. The merge from current main imports repository documentation only; it has no product-source change.

## 4. Invariants checked

- Native Favorite action confirmation stays bound to listing, dataset, scope, and view generation; timeouts, rollback, replacement, and superseding actions fail closed.
- A consumed historical callback returns `false`, preventing stale direct rendering before the final confirmation owner commits through `favReapply()`.
- Owner-specific removal remains with the captured pre-wrapper writer; viewer-personal cards still do not mutate another profile’s membership.
- Off-page BetterSearch-owned clones do not mutate durable state through a hidden iframe; Etsy owns the visible listing interaction.
- The patch introduces no new persistent owner, polling loop, or cross-tab coordinator.

## 5. Validation

```text
Node 22.23.2 (matches CI):
  node --test tests/favorites-v01525-native-heart-confirmation.test.mjs  PASS — 14/14
  node --test tests/*.test.mjs                                           PASS except one Windows CRLF-only static-marker failure
  node scripts/check.mjs                                                 PASS
  node scripts/build.mjs                                                 PASS — Chrome, Firefox, Diagnostics Chrome

Native desktop Node 26.1.0:
  npm test                                                               NOT a valid parity signal: 46 VM-fixture failures caused by Node 26 behavior.
```

The one Node 22 local failure is pre-existing checkout portability: `favorites-v01511-count-authority.test.mjs` searches an LF-only literal marker in a CRLF working-tree source file. Under the CI Linux checkout’s LF line endings, the same test suite passed before this repair and is expected to pass. It is unrelated to module 107 and is a suitable separate test-portability task.

## 6. Artifact audit

Built Chrome and Firefox `content.js` both contain the final module-107 assignments in order:

```text
bridgeFavorite01526              line 22476
favRemoveLocalFavorite01525      line 22491
favIndexMarkUnfavorite01525      line 22503
```

The build reports 86 shared modules and v0.15.25. Diagnostics Chrome also built successfully. No later module assignment was found in the ordered source chain.

## 7. GitHub CI and manual testing

The previous PR #67 run `33392531655` failed because it tested the accidental v0.15.26 promotion, not this repaired behavior-gate head. Push the current branch, then require a new green `CI and extension builds` run on the pushed head before merge.

Manual browser checks before merge:

1. On own Favorites, unfavorite a native card with delayed success, then with an optimistic rollback; ensure only confirmed removal changes local state.
2. On a BetterSearch-local cloned card without a current native counterpart, verify Favorite opens the Etsy listing visibly and does not silently remove it.
3. Verify an ordinary non-Favorites bridge caller still uses its existing path.
4. Repeat the owned-card fallback in Chrome extension, Firefox extension, and Tampermonkey; do not run extension and userscript together for this baseline check.

## 8. Risks and reviewer focus

Review the `false` result through the historical module-63 callers: it is intentional to suppress their direct render/write inference while module 107 owns confirmation. Inspect that the visible `window.open` fallback is only selected for `data-ebsf-owned-card="1"` and carries a valid listing URL. Browser-only Preact timing remains unmodeled.

The branch deliberately does not promote a release, alter module order, or change the other two v0.15.26 behavior candidates.

## 9. Recommended next action

```text
AUDIT PR BEFORE MERGE
```

After CI is green, independently audit PR #67 first, then PR #68 (focused rail drafts), then PR #69 (Sort portal lifetime). Create a single integration/release branch only after reviewers approve the selected behavior gates.
