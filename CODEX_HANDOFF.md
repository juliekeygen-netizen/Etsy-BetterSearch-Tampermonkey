# Etsy BetterSearch — Codex Review Handoff

## Released baseline

```text
Released main: 7d24e95d6014500e3dea87f307a782d167bae559
Release identity: v0.15.28
Required release main CI: 33654527080 — SUCCESS
```

## Open independent review packets

### PR #86 — All Favorites toolbar and Search clear parity

```text
Branch: codex/fix-all-toolbar-search-parity
Published head: 7e5e66dfb94c6e51c0a873044f312f754a797415
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/86 — OPEN
GitHub CI: 33667143408 — SUCCESS
Base: 7d24e95d6014500e3dea87f307a782d167bae559
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
Base: 7d24e95d6014500e3dea87f307a782d167bae559
```

The final filter-state owner distinguishes a radio's visual selection from a
meaningful active filter. Anywhere remains neutral but stays visibly checked.
Local checks, 572/572 Node 22 tests, all delivery builds, whitespace audit,
and Chrome/Firefox artifact inspection passed. Manual review: Europe → Anywhere
then reload; Anywhere stays checked without auto-opening Ships from.

### PR #88 — fallback Favorites card presentation

```text
Branch: codex/fix-fallback-card-native-presentation
Implementation head: ba2a8c0bc60c4282f4b593550612681e52ce0629
Published head: 3902cbed2eb09a6d4d635866f58ca463fc883cf5
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/88 — OPEN
Last checked GitHub CI: 33667878658 — SUCCESS
Base: 7d24e95d6014500e3dea87f307a782d167bae559
Release identity: unchanged (v0.15.28 behavior gate)
```

Private current-page HTML confirms the reported card issue is primarily the
live fallback reconstruction path: cached records intentionally do not retain
raw Etsy card HTML. This bounded visual repair therefore does not change
native-card cloning or heart-confirmation ownership. It centers the fallback
heart in a fixed circular hit target and collapses cart/options affordances
until pointer or keyboard focus, with separate compact options versus full cart
presentation. The existing title/rating/shop row remains.

Changed files: `src/63-favorites-runtime.js`, `src/65-favorites-style.js`, and
`tests/favorites-fallback-card-presentation.test.mjs`. `PROJECT_STATE.md` did
not change on this branch.

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 574/574
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                        PASS
Artifact inspection                                      PASS — fallback heart/action rules and action-kind markup in Chrome/Firefox bundles
```

Manual review: cache-backed fallback cards at desktop/mobile; verify the heart
is centered, hover and keyboard focus reveal the action, and heart/add-to-cart
bridge actions still operate. A full native-card-template migration remains a
separate high-risk task requiring a sanitized template fixture and browser
validation.

## Privacy and dependency status

No raw private diagnostics, page HTML, screenshots, URLs, listing details,
account identifiers, or marker notes are tracked. PRs #86, #87, and this
pending card-presentation branch are independently based on the released main
baseline; none depends on another open PR.
