# Etsy BetterSearch — Codex Review Handoff

## Released baseline

```text
Main before this PR: 5f935b1810ce3562f6b944fb74c74c6b96888be3
Release identity: v0.15.28
PR #86 merged-main CI: 33672185684 — SUCCESS
```

## Merged diagnostic/UI behavior gates

```text
PR #86 — All Favorites toolbar and Search clear parity
Merge commit: b97496e94cf3835f4d8f9f078000177694ad716f
PR CI: 33667143408 — SUCCESS; merged-main CI: 33672185684 — SUCCESS

PR #87 — Ships from Anywhere selection
Merge commit: 5f935b1810ce3562f6b944fb74c74c6b96888be3
PR CI after branch update: 33684095077 — SUCCESS
```

All uses the requested separate toolbar row and wrapper-safe native clear-X.
Anywhere is still neutral for filtering, but remains visibly selected after a
switch from a specific shipping origin.

## PR #88 — Diagnostics-guided Favorites correctness and fallback presentation

```text
Branch: codex/fix-fallback-card-native-presentation
Implementation head: a5532b94dec472f6e885705961379e76616caf33
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/88 — OPEN
Base before this branch sync: 7d24e95d6014500e3dea87f307a782d167bae559
Current base target: 5f935b1810ce3562f6b944fb74c74c6b96888be3
Release identity: unchanged (v0.15.28 behavior gate)
```

This branch has been updated with both merged behavior gates without rewriting
history. Its diagnostic-led repair:

- replaces synthetic cached-card markup with Etsy-shaped card structure while
  retaining only the requested BetterSearch shop/rating row;
- allows native-shaped product badges to share their natural row and keeps the
  add-to-cart control beneath it, revealed on hover or keyboard focus;
- blocks a stale collection page's props from adding IDs to a new collection;
- persists Diagnostics capture choices across a normal reload, while an active
  session remains authoritative during panel rehydration; and
- preserves a visibly actionable off-page fallback heart in the original user
  gesture rather than relying on a later browser-blocked popup.

Changed files: `src/61a-favorites-index.js`, `src/63-favorites-runtime.js`,
`src/65-favorites-style.js`, `diagnostics-extension/controls.js`, focused
regression tests, `PROJECT_STATE.md`, and this handoff.

Validation before this sync:

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 577/577
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                        PASS
Artifact inspection                                      PASS — fallback markup/scope gate in Chrome+Firefox; preference owner in Diagnostics Chrome
```

Re-run complete validation and artifact inspection after this branch sync, then
publish the branch and await the new PR CI before merge. Manual browser review
remains: cache-backed cards at desktop/mobile; badge/action layout; heart
behavior for a live versus off-page card; rapid collection navigation; and
persisted Diagnostics options after a normal refresh.

## Privacy and next work

No raw private diagnostics, page HTML, screenshots, URLs, listing details,
account identifiers, or marker notes are tracked. Once PR #88's refreshed CI
is green, merge it, wait for its exact `main` CI, then create and merge the
separate release-promotion PR with the BetterSearch and Diagnostics versions.
