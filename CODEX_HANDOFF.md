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

This behavior gate gives All the explicitly requested separate, full-width
Sort/Settings/Search row and makes native Search-clear placement tolerant of
Etsy's extra All-only wrapper. It preserves native Search, collection controls,
and release identity. Local checks, 572/572 Node 22 tests, all three delivery
builds, whitespace audit, and Chrome/Firefox artifact inspection passed.

Manual review: desktop/narrow All toolbar placement; type then clear Search and
verify the X sits immediately before Etsy's Search button. `PROJECT_STATE.md`
and the visual contract changed on this branch. It has no dependency on the
next PR.

### PR #87 — Ships from Anywhere selection

```text
Branch: codex/fix-ships-anywhere-selection
Implementation head: 440f2b6baa9ac97cbe8f1eb8e6d86a2f37becdd8
Published head: dd4b988f2a284603ea75ef1a4f2626f387406884
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/87 — OPEN
GitHub CI: pending (run 33667380614)
Base: 7d24e95d6014500e3dea87f307a782d167bae559
Release identity: unchanged (v0.15.28 behavior gate)
```

The final filter state owner now distinguishes a radio's visible selection from
a meaningful active filter. Selecting Anywhere remains neutral—no result
filtering and no auto-opened drawer—while its radio check remains visible after
switching from Europe or another origin. It also handles the selected but
incomplete country mode without misrepresenting it as active.

Changed files: `src/104-favorites-v0157-filter-state-sync.js` and its focused
regression test. `PROJECT_STATE.md` did not change on this branch.

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 572/572
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                        PASS
Artifact inspection                                      PASS — final selection owner present in Chrome/Firefox content bundles
```

Manual review: choose Europe, then Anywhere, reload, and confirm Anywhere's
radio remains visibly selected while the Ships from drawer remains neutral.

## Privacy and next work

No raw private diagnostics, page HTML, screenshots, URLs, listing details,
account identifiers, or marker notes are tracked. The supplied page snapshot
proved that the product-card issue is predominantly BetterSearch fallback-card
rendering (not merely CSS), but fallback-card/native-template compatibility is
a separate higher-risk audit before any markup change.
