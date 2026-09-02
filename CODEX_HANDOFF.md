# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** BetterSearch `v0.15.28` released and verified on `main`.

```text
Date: 2026-09-02
Release merge SHA: fd63c43704f11aa4283316805f1432f4736d30fc
Release PR: #84 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/84 — MERGED
Release exact-head CI: 33654460398 — SUCCESS
Required main push CI: 33654527080 — SUCCESS
Artifacts: Chrome 0.15.28, Firefox 0.15.28, Diagnostics 0.2.9 (companion 0.15.28)
Release-record branch: codex/docs-v0.15.28-release-record
Release-record PR: #85 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/85 — OPEN
Release-record exact-head CI: queued after PR publication
```

## Released work

- PR #82 fixed the final Diagnostics control owner: an active Record & Reload
  session now rehydrates all durable capture options before the controls lock.
  This corrects the private capture's zero frame-trace/burst evidence caused by
  the opt-in rapid modes not actually being active.
- PR #83 implements the marked collection-page layout request: collection
  identity and privacy/count remain above a separate full toolbar row for Sort,
  Settings, and Search on desktop collection scopes.
- PR #84 promoted package/userscript/Chrome/Firefox identity and all 90
  userscript cache-busters to BetterSearch `v0.15.28`.

No private diagnostic archive, screenshot, network data, account/listing data,
URLs, or marker-note text is tracked.

## Validation already completed

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 571/571
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
GitHub PR CI #84                                       PASS — 33654460398
GitHub main CI on actual release merge                 PASS — 33654527080
```

## Remaining browser evidence

Reload the unpacked Diagnostics extension before recording. Enable Fast
layout/frame trace, Problem screenshot burst, and Semantic mismatch markers;
after Record & Reload, verify they remain checked and disabled. Mark a focused
problem, wait at least 1.2 seconds, then export: frame-trace windows and burst
screenshots should be present.

Manually verify desktop collection pages show identity/privacy/count above the
full Sort/Settings/Search row, while All Items and narrow responsive layouts
retain their intended existing presentation. Do not replace the source-proven
full collection navigation with a synthetic SPA route until a repaired capture
establishes a lasting post-settle problem.
