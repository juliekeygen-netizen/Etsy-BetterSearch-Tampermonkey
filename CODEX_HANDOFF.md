# Etsy BetterSearch — Codex Review Handoff

## Released baseline

```text
Released main: b97496e94cf3835f4d8f9f078000177694ad716f
Release identity: v0.15.28
Latest required main CI: 33672185684 — SUCCESS
```

## Open independent review packets

### PR #86 — All Favorites toolbar and Search clear parity

```text
Branch: codex/fix-all-toolbar-search-parity
Published head: 7e5e66dfb94c6e51c0a873044f312f754a797415
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/86 — MERGED
PR CI: 33667143408 — SUCCESS
Merge commit: b97496e94cf3835f4d8f9f078000177694ad716f
Required merged-main CI: 33672185684 — SUCCESS
```

All gets the explicitly requested separate, full-width Sort/Settings/Search row
and wrapper-safe native Search-clear placement. Local checks, 572/572 Node 22
tests, all delivery builds, whitespace audit, and Chrome/Firefox artifact
inspection passed. Manual review: desktop/narrow All placement and clear-X
position immediately before Etsy's Search button. This branch updated
`PROJECT_STATE.md` and the visual contract.

### PR #87 — Ships from Anywhere selection

```text
Branch: codex/fix-ships-anywhere-selection
Published head: 6613529438316bb7b449aa7f3fbaee495d8cc2ee
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/87 — OPEN
Last checked GitHub CI: 33667554145 — SUCCESS
Base: b97496e94cf3835f4d8f9f078000177694ad716f (needs branch update before merge)
```

The final filter-state owner distinguishes a radio's visual selection from a
meaningful active filter. Anywhere remains neutral but stays visibly checked.
Local checks, 572/572 Node 22 tests, all delivery builds, whitespace audit,
and Chrome/Firefox artifact inspection passed. Manual review: Europe → Anywhere
then reload; Anywhere stays checked without auto-opening Ships from.

### PR #88 — fallback Favorites card presentation

```text
Branch: codex/fix-fallback-card-native-presentation
Prior published head: 3902cbed2eb09a6d4d635866f58ca463fc883cf5
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/88 — OPEN
Last checked GitHub CI: 33667878658 — SUCCESS
Base: b97496e94cf3835f4d8f9f078000177694ad716f (will be merged before publication)
Release identity: unchanged (v0.15.28 behavior gate)
```

The latest diagnostic-guided repair replaces synthetic cached-card markup with
the relevant Etsy card structural contract while retaining only the requested
BetterSearch shop/rating row. Native-shaped product badges can share their
natural row and the add-to-cart control stays below it, while lower controls
remain available on hover or keyboard focus. It also fences collection partial
observations against stale collection props, preserves Diagnostics capture
preferences across a normal reload, and keeps an off-page fallback heart
visibly actionable in the original user gesture.

Changed files: `src/61a-favorites-index.js`, `src/63-favorites-runtime.js`,
`src/65-favorites-style.js`, `diagnostics-extension/controls.js`, focused
regression tests, `PROJECT_STATE.md`, and this handoff.

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 577/577
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                        PASS
Artifact inspection                                      PASS — fallback markup/scope gate in Chrome+Firefox; preference owner in Diagnostics Chrome
```

Manual review: cache-backed fallback cards at desktop/mobile; verify native
badge/action layout, hover and keyboard focus behavior, heart behavior for a
live versus off-page card, rapid collection navigation, and persisted
Diagnostics options after a normal refresh.

## Privacy and dependency status

No raw private diagnostics, page HTML, screenshots, URLs, listing details,
account identifiers, or marker notes are tracked. PR #86 is merged and its
main CI passed. PR #87 must be updated onto that main before merge. PR #88
will then be updated onto the new main; its only dependency is shared handoff
documentation, not runtime code.
